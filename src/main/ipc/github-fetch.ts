import { net } from 'electron'

const FETCH_TIMEOUT_MS = 15_000

export function withFetchTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Network request timed out')), FETCH_TIMEOUT_MS)
    )
  ])
}

export function fetchJson(url: string, token?: string): Promise<unknown> {
  return withFetchTimeout(new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET' })
    req.setHeader('Accept', 'application/vnd.github+json')
    req.setHeader('User-Agent', 'SkillNexus/1.0')
    if (token) req.setHeader('Authorization', `Bearer ${token}`)
    const chunks: Buffer[] = []
    req.on('response', (res) => {
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        try {
          const body = Buffer.concat(chunks).toString('utf-8')
          if (res.statusCode === 403) {
            reject(new Error('GitHub API rate limit reached. Add a GitHub Token in Settings to increase the limit.'))
            return
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`GitHub API error: ${res.statusCode}`))
            return
          }
          resolve(JSON.parse(body))
        } catch (e) {
          reject(e)
        }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  }))
}

export function fetchText(url: string, token?: string): Promise<string> {
  return withFetchTimeout(new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET' })
    req.setHeader('User-Agent', 'SkillNexus/1.0')
    if (token) req.setHeader('Authorization', `Bearer ${token}`)
    const chunks: Buffer[] = []
    req.on('response', (res) => {
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`Failed to fetch file: ${res.statusCode}`))
          return
        }
        resolve(Buffer.concat(chunks).toString('utf-8'))
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  }))
}
