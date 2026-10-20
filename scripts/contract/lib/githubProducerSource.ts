import { PRODUCER_REPO, type ProducerSource } from './syncContract'

const CONTRACT_DIR = 'contract'

const RETRY_STATUSES = new Set([403, 429, 500, 502, 503, 504])
const ATTEMPTS = 3

/**
 * Anonymous api.github.com calls share a rate limit per runner IP, so CI passes GITHUB_TOKEN (read-only use on a
 * public repo) to get a per-token limit; locally it falls back to anonymous. Transient failures are retried.
 */
async function fetchText(url: string): Promise<string> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  const token = url.startsWith('https://api.github.com/') ? process.env.GITHUB_TOKEN : undefined
  if (token) headers.Authorization = `Bearer ${token}`
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { headers })
    if (response.ok) return response.text()
    if (attempt >= ATTEMPTS || !RETRY_STATUSES.has(response.status)) {
      throw new Error(`GET ${url} failed: HTTP ${response.status}`)
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2000))
  }
}

/** The producer's contract read from its public GitHub repository at a commit; no credentials. */
export const githubProducerSource: ProducerSource = {
  readSchema: (commit) => fetchText(`https://raw.githubusercontent.com/${PRODUCER_REPO}/${commit}/${CONTRACT_DIR}/snapshot.schema.json`),
  async listGoldens(commit) {
    const entries = JSON.parse(await fetchText(`https://api.github.com/repos/${PRODUCER_REPO}/contents/${CONTRACT_DIR}/goldens?ref=${commit}`)) as Array<{
      name: string
      type: string
    }>
    return entries.filter((entry) => entry.type === 'file' && entry.name.endsWith('.json')).map((entry) => entry.name)
  },
  readGolden: (commit, name) => fetchText(`https://raw.githubusercontent.com/${PRODUCER_REPO}/${commit}/${CONTRACT_DIR}/goldens/${name}`),
}
