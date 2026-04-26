import { zipSync, strToU8 } from 'fflate'
import type { JobEntry, EvalResult } from '../../../shared/types'

// ── constants ─────────────────────────────────────────────────────────────────
const DIM_COLORS: Record<string, string> = {
  correctness:           '#6c63ff',
  instruction_following: '#00d4aa',
  safety:                '#ef4444',
  completeness:          '#f59e0b',
  robustness:            '#8b5cf6',
  executability:         '#06b6d4',
  cost_awareness:        '#10b981',
  maintainability:       '#f97316'
}

const DIM_LABELS: Record<string, string> = {
  correctness:           'G1 正确性',
  instruction_following: 'G2 指令遵循',
  safety:                'G3 安全性',
  completeness:          'G4 完整性',
  robustness:            'G5 鲁棒性',
  executability:         'S1 可执行性',
  cost_awareness:        'S2 成本意识',
  maintainability:       'S3 可维护性'
}

const DIM_ORDER = [
  'correctness', 'instruction_following', 'safety', 'completeness',
  'robustness', 'executability', 'cost_awareness', 'maintainability'
]

const ENGINE_LABELS: Record<string, string> = {
  'evoskill': 'EvoSkill', 'coevoskill': 'CoEvoSkill', 'skillmoo': 'SkillMOO',
  'skillx': 'SkillX', 'skillclaw': 'SkillClaw',
  'skvm-evidence': 'SkVM证据', 'skvm-strategy': 'SkVM策略', 'skvm-capability': 'SkVM能力',
  'manual': '手动'
}

// ── helpers ───────────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function scoreColor(score: number): string {
  if (score >= 7) return '#4ade80'
  if (score >= 4) return '#facc15'
  return '#f87171'
}

function downloadZip(files: Record<string, Uint8Array>, filename: string): void {
  const zipped = zipSync(files)
  const blob = new Blob([zipped], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── radar SVG ─────────────────────────────────────────────────────────────────
function radarSvg(datasets: { scores: Record<string, number>; color: string; label: string }[]): string {
  const cx = 220, cy = 220, r = 160
  const dims = DIM_ORDER.filter(d => datasets.some(ds => d in ds.scores))
  const n = dims.length
  if (n === 0) return ''

  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
  const pt = (i: number, val: number) => {
    const a = angle(i), ratio = val / 10
    return { x: cx + r * ratio * Math.cos(a), y: cy + r * ratio * Math.sin(a) }
  }

  // grid rings
  const rings = [2, 4, 6, 8, 10].map(v => {
    const pts = dims.map((_, i) => pt(i, v))
    return `<polygon points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="#2d3154" stroke-width="1"/>`
  }).join('\n')

  // axes
  const axes = dims.map((_, i) => {
    const p = pt(i, 10)
    return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#2d3154" stroke-width="1"/>`
  }).join('\n')

  // labels
  const labels = dims.map((d, i) => {
    const a = angle(i), lx = cx + (r + 28) * Math.cos(a), ly = cy + (r + 28) * Math.sin(a)
    const anchor = Math.abs(Math.cos(a)) < 0.1 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end'
    return `<text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="#8b8fa8">${esc(DIM_LABELS[d] ?? d)}</text>`
  }).join('\n')

  // polygons per dataset
  const polys = datasets.map(ds => {
    const pts = dims.map((d, i) => pt(i, ds.scores[d] ?? 0))
    const pointsStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    return `<polygon points="${pointsStr}" fill="${ds.color}30" stroke="${ds.color}" stroke-width="2" opacity="0.9"/>`
  }).join('\n')

  // legend
  const legend = datasets.length > 1 ? datasets.map((ds, i) =>
    `<g transform="translate(${10 + i * 130}, ${cy * 2 + 10})">
      <rect width="12" height="12" rx="2" fill="${ds.color}"/>
      <text x="16" y="10" font-size="11" fill="#8b8fa8">${esc(ds.label)}</text>
    </g>`
  ).join('\n') : ''

  const h = datasets.length > 1 ? cy * 2 + 36 : cy * 2 + 10
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cx * 2}" height="${h}" viewBox="0 0 ${cx * 2} ${h}">
${rings}${axes}${labels}${polys}${legend}
</svg>`
}

// ── diff lines ────────────────────────────────────────────────────────────────
function diffHtml(a: string, b: string): string {
  const aLines = a.split('\n'), bLines = b.split('\n')
  const m = aLines.length, n = bLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = aLines[i-1] === bLines[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1])
  const result: { type: 'same'|'add'|'remove'; text: string }[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i-1] === bLines[j-1]) { result.unshift({ type: 'same', text: aLines[i-1] }); i--; j-- }
    else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { result.unshift({ type: 'add', text: bLines[j-1] }); j-- }
    else { result.unshift({ type: 'remove', text: aLines[i-1] }); i-- }
  }
  return result.map(l => {
    const bg = l.type === 'add' ? '#14532d' : l.type === 'remove' ? '#450a0a' : 'transparent'
    const color = l.type === 'add' ? '#4ade80' : l.type === 'remove' ? '#f87171' : '#e8e9f3'
    const prefix = l.type === 'add' ? '+' : l.type === 'remove' ? '-' : ' '
    return `<div style="background:${bg};padding:1px 8px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;color:${color}"><span style="color:#2d3154;user-select:none;margin-right:8px">${prefix}</span>${esc(l.text)}</div>`
  }).join('')
}

// ── base HTML shell ───────────────────────────────────────────────────────────
function htmlShell(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f1117;color:#e8e9f3;padding:32px 24px}
.container{max-width:900px;margin:0 auto}
.header{background:#1a1d2e;border-radius:12px;padding:24px 28px;margin-bottom:20px;border:1px solid #2d3154;display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.header-left h1{font-size:22px;font-weight:800;color:#e8e9f3}
.header-left .sub{font-size:13px;color:#8b8fa8;margin-top:4px}
.score-badge{font-size:36px;font-weight:900;min-width:72px;text-align:center;line-height:1}
.score-label{font-size:11px;color:#8b8fa8;text-align:center;margin-top:2px}
.card{background:#1a1d2e;border-radius:12px;padding:20px 24px;margin-bottom:16px;border:1px solid #2d3154}
.card-title{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#8b8fa8;margin-bottom:14px}
.radar-wrap{display:flex;justify-content:center;padding:8px 0}
.dim-row{display:grid;grid-template-columns:130px 1fr 44px;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #252840}
.dim-row:last-child{border-bottom:none}
.dim-name{font-size:12px;font-weight:600}
.bar-track{height:8px;background:#252840;border-radius:4px;overflow:hidden}
.bar-fill{height:100%;border-radius:4px}
.dim-score{font-size:13px;font-weight:700;text-align:right}
.violations{margin-top:4px;padding-left:130px}
.violation{font-size:11px;color:#f87171;padding:1px 0}
.details-text{font-size:11px;color:#8b8fa8;font-style:italic;padding-left:130px;margin-top:2px}
.io-block{background:#0f1117;border:1px solid #2d3154;border-radius:8px;padding:12px 14px;font-family:monospace;font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:320px;overflow-y:auto;line-height:1.6;color:#e8e9f3}
.cmp-row{display:grid;grid-template-columns:130px 1fr 60px 1fr 60px 56px;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #252840}
.cmp-row:last-child{border-bottom:none}
.cmp-header{font-size:11px;font-weight:700;color:#8b8fa8;text-transform:uppercase}
.delta-pos{color:#4ade80;font-weight:700}
.delta-neg{color:#f87171;font-weight:700}
.delta-neu{color:#8b8fa8}
.engine-badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;background:#252840;color:#a78bfa}
.chain{font-size:14px;color:#8b8fa8;margin-top:6px}
.chain .arrow{color:#2d3154;margin:0 6px}
.diff-wrap{border:1px solid #2d3154;border-radius:8px;overflow:hidden;max-height:400px;overflow-y:auto}
footer{text-align:center;font-size:11px;color:#8b8fa8;margin-top:24px;padding-top:16px;border-top:1px solid #2d3154}
a{color:#a78bfa}
</style>
</head>
<body>
<div class="container">
${body}
<footer>Generated by SkillNexus · ${new Date().toLocaleString('zh-CN')}</footer>
</div>
</body>
</html>`
}

// ── eval HTML ─────────────────────────────────────────────────────────────────
function buildEvalHtml(job: JobEntry, result: EvalResult): string {
  const dims = DIM_ORDER.filter(d => d in result.scores)
  const scores: Record<string, number> = {}
  dims.forEach(d => { scores[d] = result.scores[d].score })

  const radar = radarSvg([{ scores, color: '#6c63ff', label: job.skillName }])

  const dimRows = dims.map(d => {
    const s = result.scores[d]
    const color = DIM_COLORS[d] ?? '#888'
    const viols = s.violations?.length
      ? `<div class="violations">${s.violations.map(v => `<div class="violation">⚠ ${esc(v)}</div>`).join('')}</div>`
      : ''
    const det = s.details ? `<div class="details-text">${esc(s.details)}</div>` : ''
    return `<div class="dim-row">
  <span class="dim-name" style="color:${color}">${esc(DIM_LABELS[d] ?? d)}</span>
  <div class="bar-track"><div class="bar-fill" style="width:${(s.score/10)*100}%;background:${color}"></div></div>
  <span class="dim-score" style="color:${color}">${s.score.toFixed(1)}</span>
</div>${viols}${det}`
  }).join('\n')

  const tcBadge = job.testCaseName ? `<span style="font-size:12px;color:#8b8fa8;margin-left:10px">📋 ${esc(job.testCaseName)}</span>` : ''
  const statusBadge = result.status === 'error'
    ? `<span style="font-size:11px;background:#450a0a;color:#f87171;padding:2px 8px;border-radius:8px;margin-left:8px">失败</span>` : ''

  const body = `
<div class="header">
  <div class="header-left">
    <h1>${esc(job.skillName)}${statusBadge}</h1>
    <div class="sub">评测报告 · ${new Date(job.createdAt).toLocaleString('zh-CN')}${tcBadge}</div>
    ${result.model ? `<div class="sub" style="margin-top:4px">模型: ${esc(result.model)} · ${esc(result.provider ?? '')}</div>` : ''}
  </div>
  <div>
    <div class="score-badge" style="color:${scoreColor(result.totalScore)}">${result.totalScore.toFixed(1)}</div>
    <div class="score-label">综合得分</div>
    ${result.durationMs ? `<div class="score-label" style="margin-top:4px">${(result.durationMs/1000).toFixed(1)}s</div>` : ''}
  </div>
</div>

<div class="card">
  <div class="card-title">多维雷达图</div>
  <div class="radar-wrap">${radar}</div>
</div>

<div class="card">
  <div class="card-title">维度得分详情</div>
  ${dimRows}
</div>

${result.inputPrompt ? `<div class="card">
  <div class="card-title">输入 Prompt</div>
  <pre class="io-block">${esc(result.inputPrompt)}</pre>
</div>` : ''}

${result.output ? `<div class="card">
  <div class="card-title">模型输出</div>
  <pre class="io-block">${esc(result.output)}</pre>
</div>` : ''}`

  return htmlShell(`评测报告 · ${job.skillName}`, body)
}

// ── evo HTML ──────────────────────────────────────────────────────────────────
function buildEvoHtml(
  job: JobEntry,
  content: string,
  parentContent: string | null,
  latestEval: EvalResult | null,
  parentEval: EvalResult | null
): string {
  const engineLabel = job.engine ? (ENGINE_LABELS[job.engine] ?? job.engine) : '进化'

  // radar: parent + evolved overlapping
  const datasets: { scores: Record<string, number>; color: string; label: string }[] = []
  if (latestEval) {
    const sc: Record<string, number> = {}
    DIM_ORDER.forEach(d => { if (d in latestEval.scores) sc[d] = latestEval.scores[d].score })
    datasets.push({ scores: sc, color: '#6c63ff', label: job.skillName })
  }
  if (parentEval) {
    const sc: Record<string, number> = {}
    DIM_ORDER.forEach(d => { if (d in parentEval.scores) sc[d] = parentEval.scores[d].score })
    datasets.push({ scores: sc, color: '#8b8fa8', label: job.parentSkillName ?? '父版本' })
  }
  const radar = datasets.length > 0 ? radarSvg(datasets) : ''

  // score comparison table
  const dims = latestEval ? DIM_ORDER.filter(d => d in latestEval.scores) : []
  const cmpRows = dims.map(d => {
    const evolved = latestEval!.scores[d]
    const parent = parentEval?.scores[d]
    const color = DIM_COLORS[d] ?? '#888'
    const delta = parent ? evolved.score - parent.score : null
    const deltaHtml = delta !== null
      ? `<span class="${delta > 0 ? 'delta-pos' : delta < 0 ? 'delta-neg' : 'delta-neu'}">${delta > 0 ? '+' : ''}${delta.toFixed(1)}</span>`
      : '<span class="delta-neu">—</span>'
    const parentBar = parent
      ? `<div class="bar-track"><div class="bar-fill" style="width:${(parent.score/10)*100}%;background:#8b8fa8"></div></div>`
      : '<div class="bar-track"></div>'
    return `<div class="cmp-row">
  <span class="dim-name" style="color:${color}">${esc(DIM_LABELS[d] ?? d)}</span>
  ${parentBar}
  <span class="dim-score" style="color:#8b8fa8">${parent ? parent.score.toFixed(1) : '—'}</span>
  <div class="bar-track"><div class="bar-fill" style="width:${(evolved.score/10)*100}%;background:${color}"></div></div>
  <span class="dim-score" style="color:${color}">${evolved.score.toFixed(1)}</span>
  ${deltaHtml}
</div>`
  }).join('\n')

  const avgEvolved = job.avgScore != null ? job.avgScore.toFixed(2) : (latestEval ? latestEval.totalScore.toFixed(2) : '—')
  const avgParent = job.parentAvgScore != null ? job.parentAvgScore.toFixed(2) : (parentEval ? parentEval.totalScore.toFixed(2) : '—')
  const deltaAvg = job.avgScore != null && job.parentAvgScore != null ? job.avgScore - job.parentAvgScore : null

  const body = `
<div class="header">
  <div class="header-left">
    <h1>${esc(job.skillName)}</h1>
    <div class="chain">
      ${job.parentSkillName ? `<span>${esc(job.parentSkillName)}</span><span class="arrow">→</span>` : ''}
      <span style="font-weight:700;color:#6c63ff">${esc(job.skillName)}</span>
    </div>
    <div class="sub" style="margin-top:6px">${new Date(job.createdAt).toLocaleString('zh-CN')}</div>
  </div>
  <div style="text-align:right">
    <span class="engine-badge">${esc(engineLabel)}</span>
    ${avgEvolved !== '—' ? `<div class="score-badge" style="color:${scoreColor(parseFloat(avgEvolved))};margin-top:8px">${avgEvolved}</div>
    <div class="score-label">均分</div>` : ''}
    ${deltaAvg !== null ? `<div style="font-size:13px;font-weight:700;margin-top:4px" class="${deltaAvg > 0 ? 'delta-pos' : deltaAvg < 0 ? 'delta-neg' : 'delta-neu'}">Δ ${deltaAvg > 0 ? '+' : ''}${deltaAvg.toFixed(2)}</div>` : ''}
  </div>
</div>

${radar ? `<div class="card">
  <div class="card-title">多维雷达图${parentEval ? ' (灰色=父版本 · 紫色=进化版)' : ''}</div>
  <div class="radar-wrap">${radar}</div>
</div>` : ''}

${dims.length > 0 ? `<div class="card">
  <div class="card-title">维度对比 ${parentEval ? `· 父版本均分 ${avgParent} → 进化版均分 ${avgEvolved}` : ''}</div>
  <div class="cmp-row cmp-header">
    <span>维度</span><span>父版本</span><span></span><span>进化版</span><span></span><span>Δ</span>
  </div>
  ${cmpRows}
</div>` : ''}

${parentContent && content ? `<div class="card">
  <div class="card-title">Skill 差异 (Diff)</div>
  <div class="diff-wrap">${diffHtml(parentContent, content)}</div>
</div>` : ''}

<div class="card">
  <div class="card-title">进化后 Skill 内容</div>
  <pre class="io-block">${esc(content)}</pre>
</div>`

  return htmlShell(`进化报告 · ${job.skillName}`, body)
}

// ── filename helper ───────────────────────────────────────────────────────────
function buildFilename(skillName: string, type: string, date: Date): string {
  const slug = skillName.replace(/[^a-zA-Z0-9一-龥]/g, '-').replace(/-+/g, '-').slice(0, 40)
  const ts = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`
  return `SkillNexus_${slug}_${type}_${ts}.zip`
}

// ── public API ────────────────────────────────────────────────────────────────
export async function exportEvalReport(job: JobEntry): Promise<void> {
  const results = await window.api.eval.getByJobId(job.id)
  if (!results || results.length === 0) throw new Error('找不到评测记录')

  const date = new Date(job.createdAt)

  if (results.length === 1) {
    // Single case — original single-record report
    const html = buildEvalHtml(job, results[0])
    const data = JSON.stringify({ job, result: results[0], exportedAt: new Date().toISOString() }, null, 2)
    downloadZip({ 'report.html': strToU8(html), 'data.json': strToU8(data) }, buildFilename(job.skillName, '评测', date))
    return
  }

  // Multi-case job report
  const successResults = results.filter(r => r.status === 'success')
  const avgScore = successResults.length > 0
    ? successResults.reduce((s, r) => s + r.totalScore, 0) / successResults.length
    : null

  // generate per-case filenames and HTML
  const caseFiles: { filename: string; html: string; result: EvalResult }[] = results.map((r, i) => {
    const safeName = (r.testCaseName ?? r.id).replace(/[^a-zA-Z0-9一-龥]/g, '-').slice(0, 30)
    const filename = `cases/case-${String(i + 1).padStart(3, '0')}-${safeName}.html`
    return { filename, html: buildEvalHtml(job, r), result: r }
  })

  const caseRows = results.map((r, i) => {
    const cf = caseFiles[i]
    const sc = r.status === 'error' ? '#f87171' : r.totalScore >= 7 ? '#4ade80' : r.totalScore >= 4 ? '#facc15' : '#f87171'
    return `
    <tr onclick="window.open('${cf.filename}','_blank')" style="cursor:pointer" onmouseover="this.style.background='#252840'" onmouseout="this.style.background=''">
      <td style="padding:8px"><a href="${cf.filename}" target="_blank" style="color:#a78bfa;text-decoration:none">${esc(r.testCaseName ?? r.id.slice(-8))}</a></td>
      <td style="padding:8px;color:${r.status === 'error' ? '#f87171' : '#4ade80'}">${r.status === 'error' ? '失败' : '成功'}</td>
      <td style="padding:8px;font-weight:700;color:${sc}">${r.status === 'error' ? '—' : r.totalScore.toFixed(1)}</td>
      <td style="padding:8px;font-size:11px;color:#8b8fa8">${(r.durationMs / 1000).toFixed(1)}s</td>
      <td style="padding:8px;font-size:11px;color:#6c63ff">→ 详情</td>
    </tr>`
  }).join('')

  // aggregate radar across all successful results
  const avgScores: Record<string, number> = {}
  if (successResults.length > 0) {
    DIM_ORDER.forEach(d => {
      const vals = successResults.map(r => r.scores[d]?.score).filter(v => v != null) as number[]
      if (vals.length > 0) avgScores[d] = vals.reduce((s, v) => s + v, 0) / vals.length
    })
  }
  const radar = Object.keys(avgScores).length > 0
    ? radarSvg([{ scores: avgScores, color: '#6c63ff', label: job.skillName }])
    : ''

  const html = htmlShell(`评测报告 · ${job.skillName}`, `
<div class="header">
  <div class="header-left">
    <h1>${esc(job.skillName)}</h1>
    <div class="sub">评测报告 · ${new Date(job.createdAt).toLocaleString('zh-CN')} · ${results.length} 个用例</div>
  </div>
  ${avgScore != null ? `<div><div class="score-badge" style="color:${scoreColor(avgScore)}">${avgScore.toFixed(1)}</div><div class="score-label">平均分</div></div>` : ''}
</div>

<div style="display:flex;gap:12px;margin-bottom:16px">
  <div class="card" style="flex:1;margin:0"><div class="card-title">总用例</div><div style="font-size:28px;font-weight:800;color:#6c63ff">${results.length}</div></div>
  <div class="card" style="flex:1;margin:0"><div class="card-title">成功</div><div style="font-size:28px;font-weight:800;color:#4ade80">${successResults.length}</div></div>
  ${results.filter(r => r.status === 'error').length > 0 ? `<div class="card" style="flex:1;margin:0"><div class="card-title">失败</div><div style="font-size:28px;font-weight:800;color:#f87171">${results.filter(r => r.status === 'error').length}</div></div>` : ''}
</div>

${radar ? `<div class="card"><div class="card-title">综合雷达图（均值）</div><div class="radar-wrap">${radar}</div></div>` : ''}

<div class="card">
  <div class="card-title">用例列表 · 点击查看详情</div>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="border-bottom:1px solid #2d3154">
      <th style="text-align:left;padding:8px;color:#8b8fa8;font-size:11px;text-transform:uppercase">用例</th>
      <th style="text-align:left;padding:8px;color:#8b8fa8;font-size:11px;text-transform:uppercase">状态</th>
      <th style="text-align:left;padding:8px;color:#8b8fa8;font-size:11px;text-transform:uppercase">得分</th>
      <th style="text-align:left;padding:8px;color:#8b8fa8;font-size:11px;text-transform:uppercase">耗时</th>
      <th></th>
    </tr></thead>
    <tbody>${caseRows}</tbody>
  </table>
</div>`)

  const files: Record<string, Uint8Array> = { 'report.html': strToU8(html) }
  caseFiles.forEach(cf => { files[cf.filename] = strToU8(cf.html) })
  files['data.json'] = strToU8(JSON.stringify({ job, results, exportedAt: new Date().toISOString() }, null, 2))

  downloadZip(files, buildFilename(job.skillName, '评测', date))
}

export async function exportEvoReport(job: JobEntry): Promise<void> {
  const [content, evalPage] = await Promise.all([
    window.api.skills.getContent(job.skillId),
    window.api.eval.history(job.skillId, 1)
  ])
  const latestEval = evalPage.items[0] ?? null

  let parentContent: string | null = null
  let parentEval: EvalResult | null = null
  if (job.parentSkillId) {
    const [pc, pe] = await Promise.all([
      window.api.skills.getContent(job.parentSkillId).catch(() => null),
      window.api.eval.history(job.parentSkillId, 1).then(p => p.items[0] ?? null).catch(() => null)
    ])
    parentContent = pc
    parentEval = pe
  }

  const html = buildEvoHtml(job, content, parentContent, latestEval, parentEval)
  const data = JSON.stringify({ job, content, parentContent, latestEval, parentEval, exportedAt: new Date().toISOString() }, null, 2)
  const engineLabel = job.engine ? (ENGINE_LABELS[job.engine] ?? job.engine) : '进化'

  downloadZip({
    'report.html': strToU8(html),
    'data.json': strToU8(data)
  }, buildFilename(job.skillName, `进化-${engineLabel}`, new Date(job.createdAt)))
}
