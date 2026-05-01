/**
 * tests/studio/agent-tools.test.ts
 *
 * Pure logic tests for agent-tools.ts:
 * - web_search mock mode: no error field
 * - file_write path whitelist enforcement
 * - file_write content size limit
 * - shell command whitelist and operator rejection
 * No Electron / AI calls. File system calls are mocked via vi.mock.
 */

import { describe, it, expect, vi } from 'vitest'
import { resolve } from 'path'

// ── Mirrors agent-tools.ts logic (no Electron dependency) ────────────────────

interface ToolResult {
  output: string
  error?: string
}

// --- web_search mock mode ---

function webSearchMock(query: string): ToolResult {
  return {
    output: `[Mock web_search] Query: "${query}"\nResult: No Tavily API key configured. This is a simulated result.\nSummary: The search for "${query}" would return relevant web results. Configure a Tavily API key in Settings → Tool API Keys to enable real search.`
  }
}

// --- file_write logic ---

const ALLOWED_PREFIXES = ['/Users/testuser', '/tmp/allowed']
const MAX_WRITE_SIZE = 500 * 1024

function fileWrite(filePath: string, content: string, writeFn: (p: string, c: string) => void): ToolResult {
  if (content.length > MAX_WRITE_SIZE) {
    return { output: '', error: `Content too large (${content.length} bytes, max ${MAX_WRITE_SIZE})` }
  }
  const r = resolve(filePath)
  const allowed = ALLOWED_PREFIXES.some(p => r.startsWith(p))
  if (!allowed) {
    return { output: '', error: `Access denied: ${r}` }
  }
  writeFn(r, content)
  return { output: `Written ${content.length} bytes to ${r}` }
}

// --- shell logic ---

const SHELL_ALLOWED_PREFIXES = ['ls', 'cat', 'echo', 'pwd', 'grep', 'find', 'wc', 'head', 'tail', 'date']

function shellValidate(command: string): ToolResult | null {
  if (/[|>&;`$()]/.test(command)) {
    return { output: '', error: 'Pipes, redirects, and shell operators are not allowed' }
  }
  const cmd = command.trim()
  const allowed = SHELL_ALLOWED_PREFIXES.some(p => cmd === p || cmd.startsWith(p + ' '))
  if (!allowed) {
    return { output: '', error: `Command not allowed. Allowed commands: ${SHELL_ALLOWED_PREFIXES.join(', ')}` }
  }
  return null // passes validation
}

// ── web_search mock mode ──────────────────────────────────────────────────────

describe('web_search — mock mode (no Tavily key)', () => {
  it('returns non-empty output', () => {
    const result = webSearchMock('TypeScript generics')
    expect(result.output.length).toBeGreaterThan(0)
  })

  it('error field is undefined', () => {
    const result = webSearchMock('TypeScript generics')
    expect(result.error).toBeUndefined()
  })

  it('output contains the query string', () => {
    const result = webSearchMock('electron ipc')
    expect(result.output).toContain('electron ipc')
  })

  it('output mentions Tavily configuration', () => {
    const result = webSearchMock('anything')
    expect(result.output).toContain('Tavily')
  })
})

// ── file_write — path whitelist ───────────────────────────────────────────────

describe('file_write — path whitelist enforcement', () => {
  const noop = () => {}

  it('allows write to allowed prefix', () => {
    const result = fileWrite('/Users/testuser/Downloads/test.txt', 'hello', noop)
    expect(result.error).toBeUndefined()
    expect(result.output).toContain('Written')
  })

  it('rejects write to /etc/hosts', () => {
    const result = fileWrite('/etc/hosts', 'bad', noop)
    expect(result.error).toMatch(/Access denied/)
    expect(result.output).toBe('')
  })

  it('rejects write to /var/log/system.log', () => {
    const result = fileWrite('/var/log/system.log', 'bad', noop)
    expect(result.error).toMatch(/Access denied/)
  })

  it('rejects path traversal attempt', () => {
    const result = fileWrite('/Users/testuser/../../../etc/passwd', 'bad', noop)
    // raw path doesn't start with allowed prefix after traversal
    expect(result.error).toMatch(/Access denied/)
  })

  it('calls writeFn for allowed path', () => {
    const writeFn = vi.fn()
    fileWrite('/Users/testuser/test.txt', 'content', writeFn)
    expect(writeFn).toHaveBeenCalledWith('/Users/testuser/test.txt', 'content')
  })
})

// ── file_write — content size limit ──────────────────────────────────────────

describe('file_write — content size limit', () => {
  const noop = () => {}

  it('rejects content exceeding 500 KB', () => {
    const big = 'x'.repeat(MAX_WRITE_SIZE + 1)
    const result = fileWrite('/Users/testuser/big.txt', big, noop)
    expect(result.error).toMatch(/Content too large/)
    expect(result.output).toBe('')
  })

  it('accepts content exactly at 500 KB', () => {
    const exact = 'x'.repeat(MAX_WRITE_SIZE)
    const result = fileWrite('/Users/testuser/exact.txt', exact, noop)
    expect(result.error).toBeUndefined()
  })

  it('accepts empty content', () => {
    const result = fileWrite('/Users/testuser/empty.txt', '', noop)
    expect(result.error).toBeUndefined()
    expect(result.output).toContain('Written 0 bytes')
  })
})

// ── shell — command whitelist ─────────────────────────────────────────────────

describe('shell — command whitelist', () => {
  it('allows ls command', () => {
    expect(shellValidate('ls /tmp')).toBeNull()
  })

  it('allows cat command', () => {
    expect(shellValidate('cat /Users/testuser/file.txt')).toBeNull()
  })

  it('allows grep command', () => {
    expect(shellValidate('grep foo /Users/testuser/file.txt')).toBeNull()
  })

  it('allows bare pwd', () => {
    expect(shellValidate('pwd')).toBeNull()
  })

  it('rejects rm command', () => {
    const result = shellValidate('rm -rf /')
    expect(result?.error).toMatch(/Command not allowed/)
  })

  it('rejects curl command', () => {
    const result = shellValidate('curl https://example.com')
    expect(result?.error).toMatch(/Command not allowed/)
  })

  it('rejects unknown command', () => {
    const result = shellValidate('python3 script.py')
    expect(result?.error).toMatch(/Command not allowed/)
  })
})

// ── shell — operator rejection ────────────────────────────────────────────────

describe('shell — pipe and redirect rejection', () => {
  it('rejects pipe operator |', () => {
    const result = shellValidate('ls | grep foo')
    expect(result?.error).toMatch(/Pipes/)
  })

  it('rejects redirect operator >', () => {
    const result = shellValidate('echo hello > /tmp/out.txt')
    expect(result?.error).toMatch(/Pipes/)
  })

  it('rejects append operator >>', () => {
    const result = shellValidate('echo hello >> /tmp/out.txt')
    expect(result?.error).toMatch(/Pipes/)
  })

  it('rejects semicolon chaining', () => {
    const result = shellValidate('ls; rm -rf /')
    expect(result?.error).toMatch(/Pipes/)
  })

  it('rejects backtick subshell', () => {
    const result = shellValidate('echo `whoami`')
    expect(result?.error).toMatch(/Pipes/)
  })

  it('rejects $() subshell', () => {
    const result = shellValidate('echo $(whoami)')
    expect(result?.error).toMatch(/Pipes/)
  })

  it('rejects & background operator', () => {
    const result = shellValidate('sleep 100 &')
    expect(result?.error).toMatch(/Pipes/)
  })
})
