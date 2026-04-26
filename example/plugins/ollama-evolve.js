/**
 * ollama-evolve.js — 示例插件 3：调用本地 Ollama 模型进化
 *
 * 功能：通过 HTTP 调用本地 Ollama，使用开源模型重写 Skill
 * 用途：不消耗云端 API token，使用本地 GPU 进行 Skill 进化
 *
 * 安装：
 *   1. 安装 Ollama：https://ollama.ai
 *   2. 拉取模型：ollama pull llama3
 *   3. 复制到 {userData}/plugins/ollama-evolve.js
 *
 * 配置：修改下方 MODEL 常量切换模型（llama3 / qwen2.5 / mistral / gemma3 等）
 */

const http = require('http')

// ── 可配置项 ──────────────────────────────────────────────────────────────────
const OLLAMA_HOST = 'localhost'
const OLLAMA_PORT = 11434
const MODEL = 'llama3'          // 修改此处切换模型
const TIMEOUT_MS = 60000        // 60 秒超时（本地模型较慢）
const MAX_TOKENS = 2048
// ─────────────────────────────────────────────────────────────────────────────

function ollamaGenerate(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: MAX_TOKENS
      }
    })

    const req = http.request(
      {
        hostname: OLLAMA_HOST,
        port: OLLAMA_PORT,
        path: '/api/generate',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.error) reject(new Error(`Ollama 错误: ${json.error}`))
            else resolve(json.response || '')
          } catch {
            reject(new Error(`Ollama 返回非 JSON 格式: ${data.slice(0, 100)}`))
          }
        })
      }
    )

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error(`无法连接 Ollama（${OLLAMA_HOST}:${OLLAMA_PORT}）。请确认 Ollama 正在运行：ollama serve`))
      } else {
        reject(err)
      }
    })

    req.setTimeout(TIMEOUT_MS, () => {
      req.destroy(new Error(`Ollama 请求超时（${TIMEOUT_MS / 1000}s）。模型可能尚未加载，请运行：ollama run ${MODEL}`))
    })

    req.write(body)
    req.end()
  })
}

module.exports = {
  id: 'ollama-evolve',
  name: `Ollama · ${MODEL}`,
  description: `使用本地 Ollama ${MODEL} 模型重写 Skill（需本地运行 Ollama）`,
  version: '1.0.0',

  evolve: async ({ skillContent, skillName, evalHistory }) => {
    // 构建 eval 摘要（最近 3 条）
    let evalSummary = ''
    if (evalHistory.length > 0) {
      const summaryLines = evalHistory.slice(0, 3).map((record, i) => {
        const scores = Object.entries(record.scores)
        const avg = scores.reduce((s, [, v]) => s + v.score, 0) / scores.length
        const weakDims = scores
          .filter(([, v]) => v.score < 6)
          .map(([dim]) => dim)
          .join(', ')
        return `  记录 ${i + 1}: 均分 ${avg.toFixed(1)}/10${weakDims ? `，弱项: ${weakDims}` : ''}`
      })
      evalSummary = `\n\nRecent evaluation results:\n${summaryLines.join('\n')}`
    }

    const prompt = `You are an expert at writing AI Skill prompts. Your task is to improve the following AI Skill to make it clearer, more effective, and more robust.

Skill name: "${skillName}"

Current Skill content:
\`\`\`
${skillContent}
\`\`\`
${evalSummary}

Improvement guidelines:
1. Keep the YAML frontmatter section (between --- markers) completely intact
2. Make instructions more specific and actionable
3. Add examples or clarifications where the current instructions are vague
4. Improve structure and readability
5. Address any weak dimensions mentioned in eval results

Return ONLY the complete improved Skill content (including frontmatter), with no additional explanation or commentary.`

    const response = await ollamaGenerate(prompt)

    if (!response.trim()) {
      throw new Error(`${MODEL} 返回空内容。请确认模型已完整加载：ollama run ${MODEL}`)
    }

    // 提取 Skill 内容（移除模型可能添加的前缀说明）
    const fmStart = response.indexOf('---')
    const evolvedContent = fmStart !== -1 ? response.slice(fmStart).trim() : response.trim()

    // 基本校验：进化内容不应与原内容完全相同
    if (evolvedContent === skillContent.trim()) {
      throw new Error(`${MODEL} 未产生任何改动。请尝试更换模型或调整温度参数。`)
    }

    return { evolvedContent }
  }
}
