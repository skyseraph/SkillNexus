import vm from 'vm'

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
  return { output: '', error: `Unknown tool: ${name}` }
}
