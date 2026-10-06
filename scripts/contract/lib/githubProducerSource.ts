import { PRODUCER_REPO, type ProducerSource } from './syncContract'

const CONTRACT_DIR = 'contract'

async function get(url: string): Promise<string> {
  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } })
  if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status}`)
  return response.text()
}

/** The producer's contract read from its public GitHub repository at a commit; no credentials. */
export const githubProducerSource: ProducerSource = {
  readSchema: (commit) => get(`https://raw.githubusercontent.com/${PRODUCER_REPO}/${commit}/${CONTRACT_DIR}/snapshot.schema.json`),
  async listGoldens(commit) {
    const entries = JSON.parse(await get(`https://api.github.com/repos/${PRODUCER_REPO}/contents/${CONTRACT_DIR}/goldens?ref=${commit}`)) as Array<{
      name: string
      type: string
    }>
    return entries.filter((entry) => entry.type === 'file' && entry.name.endsWith('.json')).map((entry) => entry.name)
  },
  readGolden: (commit, name) => get(`https://raw.githubusercontent.com/${PRODUCER_REPO}/${commit}/${CONTRACT_DIR}/goldens/${name}`),
}
