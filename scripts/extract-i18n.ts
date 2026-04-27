#!/usr/bin/env npx tsx
/**
 * extract-i18n.ts
 *
 * 扫描 src/renderer/src/pages/*.tsx 中的硬编码中文，
 * 自动提取到 zh.ts / en.ts，并将源文件中的中文替换为 t('key')。
 *
 * 用法:
 *   npx tsx scripts/extract-i18n.ts [--dry-run] [--file=HomePage.tsx]
 *
 * --dry-run   只打印变更，不写文件
 * --file=X    只处理指定文件
 */

import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const PAGES_DIR = path.join(ROOT, 'src/renderer/src/pages')
const ZH_FILE = path.join(ROOT, 'src/renderer/src/i18n/zh.ts')
const EN_FILE = path.join(ROOT, 'src/renderer/src/i18n/en.ts')

const DRY_RUN = process.argv.includes('--dry-run')
const FILE_FILTER = process.argv.find(a => a.startsWith('--file='))?.split('=')[1]

const HAS_CJK = /[一-鿿㐀-䶿]/

// ── Key generation ────────────────────────────────────────────────────────────

const moduleCounters: Record<string, number> = {}

function nextKey(module: string): string {
  moduleCounters[module] = (moduleCounters[module] ?? 0) + 1
  return `${module}.x${String(moduleCounters[module]).padStart(3, '0')}`
}

function moduleFromFile(filename: string): string {
  const base = path.basename(filename, '.tsx').toLowerCase()
  if (base.includes('eval')) return 'eval'
  if (base.includes('evo')) return 'evo'
  if (base.includes('home')) return 'home'
  if (base.includes('studio')) return 'studio'
  if (base.includes('tasks')) return 'tasks'
  if (base.includes('trending')) return 'trending'
  if (base.includes('settings')) return 'settings'
  return 'common'
}

// ── Parse existing translations ───────────────────────────────────────────────

function parseExistingKeys(filePath: string): Map<string, string> {
  const map = new Map<string, string>()
  const src = fs.readFileSync(filePath, 'utf8')
  const re = /['"]([^'"]+)['"]\s*:\s*['"]([^'"]*)['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) map.set(m[1], m[2])
  return map
}

function findKeyByZh(zhMap: Map<string, string>, text: string): string | undefined {
  for (const [k, v] of zhMap) if (v === text) return k
  return undefined
}

// ── English guess ─────────────────────────────────────────────────────────────

const AUTO_EN: Array<[RegExp, string]> = [
  [/^加载中.*/, 'Loading...'],
  [/^生成中.*/, 'Generating...'],
  [/^评测中.*/, 'Evaluating...'],
  [/^搜索中.*/, 'Searching...'],
  [/^提炼中.*/, 'Distilling...'],
  [/^分析中.*/, 'Analyzing...'],
  [/^运行中.*/, 'Running...'],
  [/^导入中.*/, 'Importing...'],
  [/^导出中.*/, 'Exporting...'],
  [/^安装中.*/, 'Installing...'],
  [/^优化中.*/, 'Optimizing...'],
  [/^协同进化中.*/, 'Co-evolving...'],
  [/^暂无(.*)/, (_, s: string) => `No ${s}`],
  [/^全选$/, 'Select All'],
  [/^清空$/, 'Clear'],
  [/^取消$/, 'Cancel'],
  [/^删除$/, 'Delete'],
  [/^保存$/, 'Save'],
  [/^添加$/, 'Add'],
  [/^搜索$/, 'Search'],
  [/^刷新$/, 'Refresh'],
  [/^重试$/, 'Retry'],
  [/^返回(.*)/, (_, s: string) => `Back${s ? ' ' + s : ''}`],
  [/^确认(.*)/, (_, s: string) => `Confirm${s ? ' ' + s : ''}`],
]

function guessEnglish(zh: string): string {
  for (const [re, en] of AUTO_EN) {
    const m = zh.match(re)
    if (m) return typeof en === 'function' ? (en as Function)(...m.slice(1)) : en
  }
  return zh // placeholder — human fills in
}

// ── Append new keys to translation files ──────────────────────────────────────

function appendKeysToFile(
  filePath: string,
  entries: Array<{ key: string; zh: string; en: string }>,
  lang: 'zh' | 'en'
) {
  let src = fs.readFileSync(filePath, 'utf8')
  const insertPoint = src.lastIndexOf('}')
  const lines = entries
    .map(e => {
      const val = lang === 'zh' ? e.zh : e.en
      const padded = `'${e.key}'`.padEnd(42)
      return `  ${padded} '${val.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`
    })
    .join('\n')
  src = src.slice(0, insertPoint) + `\n  // auto-extracted\n${lines}\n` + src.slice(insertPoint)
  if (!DRY_RUN) fs.writeFileSync(filePath, src, 'utf8')
  else console.log(`\n[DRY] Would append to ${path.basename(filePath)}:\n${lines}`)
}

// ── Core extraction ───────────────────────────────────────────────────────────
//
// Strategy: use a token-based approach to avoid double-replacement.
// 1. Scan the source and collect all CJK strings with their positions.
// 2. Assign keys.
// 3. Replace from right-to-left (to preserve offsets).

interface Match {
  start: number
  end: number
  zhText: string
  /** What to replace the full match with in the source */
  replacement: string
}

function extractFromSource(
  src: string,
  module: string,
  zhMap: Map<string, string>,
  newEntries: Map<string, { key: string; zh: string; en: string }>
): { newSrc: string; flagged: string[] } {
  const flagged: string[] = []
  const matches: Match[] = []

  // Track which offsets are already claimed
  const claimed = new Set<number>()
  function claim(start: number, end: number): boolean {
    for (let i = start; i < end; i++) if (claimed.has(i)) return false
    for (let i = start; i < end; i++) claimed.add(i)
    return true
  }

  function getKey(zhText: string): string {
    // Check existing zh.ts
    const existing = findKeyByZh(zhMap, zhText)
    if (existing) return existing
    // Check already-queued new entries
    for (const [, e] of newEntries) if (e.zh === zhText) return e.key
    // Create new
    const key = nextKey(module)
    newEntries.set(key, { key, zh: zhText, en: guessEnglish(zhText) })
    zhMap.set(key, zhText) // prevent duplicates in subsequent files
    return key
  }

  const lines = src.split('\n')
  // Build line-start offsets
  const lineStarts: number[] = []
  let pos = 0
  for (const line of lines) {
    lineStarts.push(pos)
    pos += line.length + 1
  }

  function lineOf(offset: number): number {
    let lo = 0, hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= offset) lo = mid; else hi = mid - 1
    }
    return lo + 1
  }

  function addMatch(start: number, end: number, zhText: string, replacement: string) {
    if (!claim(start, end)) return
    matches.push({ start, end, zhText, replacement })
  }

  // ── Pattern 1: JSX text node  >text<  (no { } inside) ──────────────────────
  // Captures text between > and < that contains CJK and no braces/newlines
  {
    const re = /(?<=>)([ \t]*[^<>{}\n]*[一-鿿㐀-䶿][^<>{}\n]*[ \t]*)(?=<)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      const text = m[1].trim()
      if (!text) continue
      // Skip if line is a comment
      const ln = lineOf(m.index)
      const lineText = lines[ln - 1].trim()
      if (lineText.startsWith('//') || lineText.startsWith('*')) continue
      const key = getKey(text)
      addMatch(m.index, m.index + m[1].length, text, `{t('${key}')}`)
    }
  }

  // ── Pattern 2: string attribute  attr="中文"  attr='中文' ───────────────────
  {
    const re = /(\b(?:placeholder|title|label|alt|aria-label|tooltip|hint)\s*=\s*)(['"])([^'"\n]*[一-鿿㐀-䶿][^'"\n]*)\2/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      const [full, prefix, , text] = m
      const key = getKey(text)
      addMatch(m.index, m.index + full.length, text, `${prefix}{t('${key}')}`)
    }
  }

  // ── Pattern 3: JSX expression string  {'中文'}  {"中文"} ───────────────────
  {
    const re = /\{(['"])([^'"\n]*[一-鿿㐀-䶿][^'"\n]*)\1\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      const text = m[2]
      const key = getKey(text)
      addMatch(m.index, m.index + m[0].length, text, `{t('${key}')}`)
    }
  }

  // ── Pattern 4: plain template literal  `中文`  (no ${}) ────────────────────
  {
    const re = /`([^`$\n]*[一-鿿㐀-䶿][^`$\n]*)`/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      const text = m[1]
      const key = getKey(text)
      addMatch(m.index, m.index + m[0].length, text, `t('${key}')`)
    }
  }

  // ── Pattern 5: JS string  '中文'  "中文" ────────────────────────────────────
  {
    const re = /(['"])([^'"\n]*[一-鿿㐀-䶿][^'"\n]*)\1/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      const text = m[2]
      const ln = lineOf(m.index)
      const lineText = lines[ln - 1].trim()
      // Skip import lines and comments
      if (lineText.startsWith('import ') || lineText.startsWith('//') || lineText.startsWith('*')) continue
      const key = getKey(text)
      addMatch(m.index, m.index + m[0].length, text, `t('${key}')`)
    }
  }

  // ── Flag template literals with interpolation ───────────────────────────────
  {
    const re = /`[^`]*[一-鿿㐀-䶿][^`]*\$\{[^`]*`/g
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      const ln = lineOf(m.index)
      flagged.push(`L${ln} (template+interpolation): ${lines[ln - 1].trim()}`)
    }
  }

  // ── Apply replacements right-to-left ────────────────────────────────────────
  matches.sort((a, b) => b.start - a.start)
  let newSrc = src
  for (const { start, end, replacement } of matches) {
    newSrc = newSrc.slice(0, start) + replacement + newSrc.slice(end)
  }

  // ── Flag any remaining CJK ──────────────────────────────────────────────────
  const newLines = newSrc.split('\n')
  for (let i = 0; i < newLines.length; i++) {
    const l = newLines[i]
    if (HAS_CJK.test(l) && !l.trim().startsWith('//') && !l.trim().startsWith('*')) {
      flagged.push(`L${i + 1} (unhandled): ${l.trim()}`)
    }
  }

  return { newSrc, flagged }
}

// ── Ensure useT import + const t ─────────────────────────────────────────────

function ensureUseT(src: string): string {
  if (/useT/.test(src)) return src
  const lastImport = src.lastIndexOf('\nimport ')
  if (lastImport === -1) return `import { useT } from '../i18n/useT'\n` + src
  const end = src.indexOf('\n', lastImport + 1)
  return src.slice(0, end + 1) + `import { useT } from '../i18n/useT'\n` + src.slice(end + 1)
}

function ensureConstT(src: string): string {
  if (/const t = useT\(\)/.test(src)) return src
  // Find first component function body opening brace
  const re = /\bfunction\s+[A-Z]\w*[^{]*\{|const\s+[A-Z]\w*\s*[=:][^{]*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const braceIdx = src.indexOf('{', m.index + m[0].length - 1)
    if (braceIdx === -1) continue
    return src.slice(0, braceIdx + 1) + '\n  const t = useT()' + src.slice(braceIdx + 1)
  }
  return src
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const zhMap = parseExistingKeys(ZH_FILE)
  const newEntries = new Map<string, { key: string; zh: string; en: string }>()
  const report: string[] = []
  const allFlagged: string[] = []

  const files = fs
    .readdirSync(PAGES_DIR)
    .filter(f => f.endsWith('.tsx'))
    .filter(f => !FILE_FILTER || f === FILE_FILTER)
    .map(f => path.join(PAGES_DIR, f))

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8')
    if (!HAS_CJK.test(src)) continue

    const module = moduleFromFile(file)
    const before = newEntries.size
    const { newSrc, flagged } = extractFromSource(src, module, zhMap, newEntries)
    const added = newEntries.size - before

    report.push(`\n── ${path.basename(file)} ──`)
    report.push(`  ${added} new keys`)
    if (flagged.length) {
      report.push(`  ${flagged.length} lines need manual review:`)
      flagged.forEach(f => report.push(`    ${f}`))
      allFlagged.push(`\n=== ${path.basename(file)} ===`, ...flagged)
    }

    if (newSrc !== src) {
      let finalSrc = ensureUseT(newSrc)
      if (/\bfunction\s+[A-Z]|\bconst\s+[A-Z]\w+\s*[=:]/.test(finalSrc)) {
        finalSrc = ensureConstT(finalSrc)
      }
      if (!DRY_RUN) {
        fs.writeFileSync(file, finalSrc, 'utf8')
        console.log(`✅ Updated: ${path.basename(file)}`)
      } else {
        console.log(`[DRY] Would update: ${path.basename(file)}`)
      }
    }
  }

  if (newEntries.size > 0) {
    const entries = [...newEntries.values()]
    appendKeysToFile(ZH_FILE, entries, 'zh')
    appendKeysToFile(EN_FILE, entries, 'en')
    if (!DRY_RUN) console.log(`\n📝 ${entries.length} new keys added to zh.ts / en.ts`)
  } else {
    console.log('\n✨ No new keys needed.')
  }

  console.log('\n' + report.join('\n'))

  if (allFlagged.length > 0) {
    const reviewPath = path.join(ROOT, 'scripts/i18n-review.txt')
    if (!DRY_RUN) {
      fs.writeFileSync(reviewPath, allFlagged.join('\n'), 'utf8')
      console.log(`\n⚠️  Manual review: scripts/i18n-review.txt`)
    } else {
      console.log('\n⚠️  Lines needing manual review:')
      allFlagged.forEach(l => console.log(l))
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
