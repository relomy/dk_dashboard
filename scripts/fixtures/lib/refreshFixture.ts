import { trimSnapshot, type TrimCount } from './trimSnapshot'

/** Read-only access to producer snapshots in R2. */
export interface SnapshotSource {
  isLoggedIn(): boolean
  read(key: string): string
}

export interface RefreshDeps {
  source: SnapshotSource
  writeFixture(path: string, text: string): void
  env: Record<string, string | undefined>
}

export interface RefreshResult {
  fixturePath: string
  counts: TrimCount[]
}

export const LOGIN_COMMAND = 'npx wrangler login'
export const SNAPSHOT_KEY =/^snapshots\/live-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/

export function refreshFixture(key: string, deps: RefreshDeps): RefreshResult {
  if (deps.env.CI) {
    throw new Error('The fixture refresh reads prod R2 with an operator login and never runs in CI.')
  }
  if (!SNAPSHOT_KEY.test(key)) {
    throw new Error(`Expected a snapshot key like snapshots/live-<timestamp>.json, got "${key}".`)
  }
  if (!deps.source.isLoggedIn()) {
    throw new Error(`Cloudflare login missing. Run: ${LOGIN_COMMAND}`)
  }

  const { text, counts } = trimSnapshot(deps.source.read(key))
  const fixturePath = `public/mock/${key}`
  deps.writeFixture(fixturePath, text)
  return { fixturePath, counts }
}
