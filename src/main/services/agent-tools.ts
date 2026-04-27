import vm from 'vm'
import fs from 'fs'
import { resolve } from 'path'
import { app } from 'electron'

export interface ToolResult {
  output: string
  error?: string
}

export interface ToolDef {
  name: string
  description: string
  input_schema: object
}

export const TOOL_DEFS: Record<string, ToolDef> = {
  web_search: {
    name: 'web_search',
    description: 'Search the web for current information. Returns top results with titles and summaries.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' }
      },
      required: ['query']
    }
  },
  code_exec: {
    name: 'code_exec',
    description: 'Execute JavaScript code in a sandboxed Node.js environment and return the output.',
    input_schema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute' }
      },
      required: ['code']
    }
  },
  file_read: {
    name: 'file_read',
    description: 'Read a text file from the local filesystem. Only allowed within user home, documents, downloads, and desktop directories.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to read' }
      },
      required: ['path']
    }
  },
  http_request: {
    name: 'http_request',
    description: 'Make an HTTPS GET request to a URL and return the response body.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The HTTPS URL to fetch' }
      },
      required: ['url']
    }
  }
}

const TAVILY_URL = 'https://api.tavily.com/search'
const MAX_RESULT_LENGTH = 2000

async function webSearch(query: string, tavilyKey?: string): Promise<ToolResult> {
  if (!tavilyKey) {
    return {
      output: `[Mock web_search] Query: "${query}"\nResult: No Tavily API key configured. This is a simulated result.\nSummary: The search for "${query}" would return relevant web results. Configure a Tavily API key in Settings → Tool API Keys to enable real search.`,
      error: 'TAVILY_KEY_NOT_SET'
    }
  }
  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: tavilyKey, query, max_results: 3 })
    })
    if (!res.ok) throw new Error(`Tavily API error: ${res.status} ${res.statusText}`)
    const data = await res.json() as { results?: Array<{ title: string; url: string; content: string }> }
    const results = (data.results ?? []).map((r, i) =>
      `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`
    ).join('\n\n')
    const output = results.length > MAX_RESULT_LENGTH ? results.slice(0, MAX_RESULT_LENGTH) + '...[truncated]' : results
    return { output: output || 'No results found.' }
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) }
  }
}

const MAX_FILE_SIZE = 100 * 1024 // 100 KB
const HTTP_RESPONSE_MAX = 4000
const HTTP_TIMEOUT_MS = 10_000

function getAllowedPrefixes(): string[] {
  return [
    resolve(app.getPath('userData')),
    resolve(app.getPath('home')),
    resolve(app.getPath('downloads')),
    resolve(app.getPath('documents')),
    resolve(app.getPath('desktop'))
  ]
}

function fileRead(filePath: string): ToolResult {
  const r = resolve(filePath)
  if (!getAllowedPrefixes().some(p => r.startsWith(p))) {
    return { output: '', error: `Access denied: ${r}` }
  }
  try {
    const stat = fs.statSync(r)
    if (stat.size > MAX_FILE_SIZE) {
      return { output: '', error: `File too large (${stat.size} bytes, max ${MAX_FILE_SIZE})` }
    }
    const content = fs.readFileSync(r, 'utf-8')
    return { output: content }
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) }
  }
}

async function httpRequest(url: string): Promise<ToolResult> {
  if (!url.startsWith('https://')) {
    return { output: '', error: 'Only HTTPS URLs are allowed' }
  }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    const text = await res.text()
    const output = text.length > HTTP_RESPONSE_MAX ? text.slice(0, HTTP_RESPONSE_MAX) + '...[truncated]' : text
    return { output }
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) }
  }
}

function codeExec(code: string): ToolResult {
  const logs: string[] = []
  const sandbox = {
    console: {
      log: (...args: unknown[]) => logs.push(args.map(a => String(a)).join(' ')),
      error: (...args: unknown[]) => logs.push('[ERROR] ' + args.map(a => String(a)).join(' ')),
      warn: (...args: unknown[]) => logs.push('[WARN] ' + args.map(a => String(a)).join(' '))
    },
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    isFinite
  }
  try {
    const result = vm.runInNewContext(code, sandbox, { timeout: 5000 })
    const output = [
      ...logs,
      result !== undefined ? `=> ${JSON.stringify(result)}` : ''
    ].filter(Boolean).join('\n')
    return { output: output || '(no output)' }
  } catch (err) {
    return { output: '', error: err instanceof Error ? err.message : String(err) }
  }
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  tavilyKey?: string
): Promise<ToolResult> {
  if (name === 'web_search') {
    return webSearch(String(input.query ?? ''), tavilyKey)
  }
  if (name === 'code_exec') {
    return codeExec(String(input.code ?? ''))
  }
  if (name === 'file_read') {
    return fileRead(String(input.path ?? ''))
  }
  if (name === 'http_request') {
    return httpRequest(String(input.url ?? ''))
  }
  return { output: '', error: `Unknown tool: ${name}` }
}
