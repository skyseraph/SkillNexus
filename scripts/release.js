#!/usr/bin/env node
/**
 * Release helper — bump version, generate CHANGELOG, commit, tag.
 *
 * Usage:
 *   node scripts/release.js          # auto patch bump (0.1.0 → 0.1.1)
 *   node scripts/release.js 0.2.0    # explicit version
 *   node scripts/release.js minor    # bump minor
 *   node scripts/release.js major    # bump major
 *
 * After running, push with:
 *   git push --follow-tags
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const PKG_PATH = path.join(ROOT, 'package.json')
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md')

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', ...opts }).trim()
}

function bumpVersion(current, bump) {
  const [major, minor, patch] = current.split('.').map(Number)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function resolveNextVersion(current, arg) {
  if (!arg) return bumpVersion(current, 'patch')
  if (['major', 'minor', 'patch'].includes(arg)) return bumpVersion(current, arg)
  if (/^\d+\.\d+\.\d+$/.test(arg)) return arg
  console.error(`Invalid version argument: "${arg}"`)
  process.exit(1)
}

// ── Commit categorisation ─────────────────────────────────────────────────────

const CATEGORIES = [
  { label: '✨ Features',     re: /^feat(\(.*?\))?[!:]/ },
  { label: '🐛 Bug Fixes',    re: /^fix(\(.*?\))?[!:]/ },
  { label: '⚡ Performance',  re: /^perf(\(.*?\))?[!:]/ },
  { label: '♻️  Refactor',    re: /^refactor(\(.*?\))?[!:]/ },
  { label: '🧪 Tests',        re: /^test(\(.*?\))?[!:]/ },
  { label: '📦 Build / CI',   re: /^(build|ci|chore)(\(.*?\))?[!:]/ },
  { label: '📝 Docs',         re: /^docs(\(.*?\))?[!:]/ },
]

function categorise(commits) {
  const buckets = {}
  const uncategorised = []

  for (const { hash, msg } of commits) {
    const cat = CATEGORIES.find(c => c.re.test(msg))
    if (cat) {
      if (!buckets[cat.label]) buckets[cat.label] = []
      // Strip conventional prefix for readability: "fix(windows): foo" → "foo (windows)"
      const clean = msg.replace(/^\w+\((.+?)\)!?:\s*/, (_, scope) => `${scope}: `)
                       .replace(/^\w+!?:\s*/, '')
      buckets[cat.label].push({ hash, msg: clean })
    } else {
      uncategorised.push({ hash, msg })
    }
  }

  return { buckets, uncategorised }
}

function renderSection(version, date, commits, repoUrl) {
  const { buckets, uncategorised } = categorise(commits)
  const lines = [`## [${version}] — ${date}`, '']

  for (const { label } of CATEGORIES) {
    const items = buckets[label]
    if (!items?.length) continue
    lines.push(`### ${label}`, '')
    for (const { hash, msg } of items) {
      const link = repoUrl ? ` ([${hash.slice(0, 7)}](${repoUrl}/commit/${hash}))` : ` (${hash.slice(0, 7)})`
      lines.push(`- ${msg}${link}`)
    }
    lines.push('')
  }

  if (uncategorised.length) {
    lines.push('### 🔧 Other', '')
    for (const { hash, msg } of uncategorised) {
      const link = repoUrl ? ` ([${hash.slice(0, 7)}](${repoUrl}/commit/${hash}))` : ` (${hash.slice(0, 7)})`
      lines.push(`- ${msg}${link}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ── Main ──────────────────────────────────────────────────────────────────────

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'))
const currentVersion = pkg.version
const nextVersion = resolveNextVersion(currentVersion, process.argv[2])

console.log(`\n  Current: ${currentVersion}`)
console.log(`  Next:    ${nextVersion}\n`)

// Determine range: from last tag to HEAD
let lastTag
try {
  lastTag = run('git describe --tags --abbrev=0')
} catch {
  lastTag = null
}

const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
const logOutput = run(`git log ${range} --format="%H %s"`)

const commits = logOutput
  ? logOutput.split('\n').filter(Boolean).map(line => {
      const spaceIdx = line.indexOf(' ')
      return { hash: line.slice(0, spaceIdx), msg: line.slice(spaceIdx + 1) }
    })
  : []

if (commits.length === 0) {
  console.warn('  ⚠️  No commits since last tag. Nothing to release.')
  process.exit(0)
}

console.log(`  Commits since ${lastTag ?? 'beginning'}: ${commits.length}`)

// Detect repo URL for commit links
let repoUrl = null
try {
  const remote = run('git remote get-url origin')
  const m = remote.match(/github\.com[:/](.+?)(?:\.git)?$/)
  if (m) repoUrl = `https://github.com/${m[1]}`
} catch { /* no remote */ }

// Build changelog entry
const today = new Date().toISOString().slice(0, 10)
const section = renderSection(nextVersion, today, commits, repoUrl)

// Prepend to CHANGELOG.md
const header = '# Changelog\n\nAll notable changes to this project will be documented here.\n\n'
const existing = fs.existsSync(CHANGELOG_PATH)
  ? fs.readFileSync(CHANGELOG_PATH, 'utf-8').replace(/^# Changelog\n[\s\S]*?\n\n/, '')
  : ''
fs.writeFileSync(CHANGELOG_PATH, header + section + '\n' + existing, 'utf-8')
console.log('  ✓ CHANGELOG.md updated')

// Bump package.json
pkg.version = nextVersion
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
console.log('  ✓ package.json bumped')

// Git commit + tag
run('git add package.json CHANGELOG.md')
run(`git commit -m "chore: release v${nextVersion}"`)
run(`git tag v${nextVersion}`)
console.log(`  ✓ Committed and tagged v${nextVersion}`)

console.log(`
  Done! Push with:
    git push --follow-tags
`)
