/** Read-only access to producer snapshots in R2. */
export interface SnapshotSource {
  isLoggedIn(): boolean
  read(key: string): string
}

export const LOGIN_COMMAND = 'npx wrangler login'
export const SNAPSHOT_KEY = /^snapshots\/live-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/

export interface ProdReadDeps {
  source: SnapshotSource
  env: Record<string, string | undefined>
}

export interface ProdRead {
  /** The script, as the CI refusal names it ("The prod check"). */
  task: string
  /** The snapshot key the operator named, if any; it must be a live snapshot's. */
  key?: string
  /** Appended to the bad-key error, when the script has a usage line. */
  usage?: string
}

/**
 * The checks every script that reads prod R2 runs first, in order: never in CI, a live snapshot key when one
 * is named, then a Cloudflare login (nothing is read without one). Throws the operator-facing error.
 */
export function guardProdRead({ task, key, usage }: ProdRead, deps: ProdReadDeps): void {
  if (deps.env.CI) {
    throw new Error(`${task} reads prod R2 with an operator login and never runs in CI.`)
  }
  if (key !== undefined && !SNAPSHOT_KEY.test(key)) {
    const message = `Expected a snapshot key like snapshots/live-<timestamp>.json, got "${key}".`
    throw new Error(usage ? `${message}\n${usage}` : message)
  }
  if (!deps.source.isLoggedIn()) {
    throw new Error(`Cloudflare login missing. Run: ${LOGIN_COMMAND}`)
  }
}
