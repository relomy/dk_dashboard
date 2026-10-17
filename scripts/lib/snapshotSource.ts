/** Read-only access to producer snapshots in R2. */
export interface SnapshotSource {
  isLoggedIn(): boolean
  read(key: string): string
}

export const LOGIN_COMMAND = 'npx wrangler login'
/** The bucket-scoped, read-only R2 credentials CI reads prod with. */
export const R2_CREDENTIALS = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_ACCOUNT_ID']
export const SNAPSHOT_KEY = /^snapshots\/live-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.json$/

export interface ProdReadDeps {
  source: SnapshotSource
  env: Record<string, string | undefined>
}

export interface ProdRead {
  /** The script, as the CI error names it ("The prod check"). */
  task: string
  /** The snapshot key the operator named, if any; it must be a live snapshot's. */
  key?: string
  /** Appended to the bad-key error, when the script has a usage line. */
  usage?: string
}

export function hasR2Credentials(env: ProdReadDeps['env']): boolean {
  return R2_CREDENTIALS.every((name) => Boolean(env[name]))
}

/**
 * The checks every script that reads prod R2 runs first, in order: a live snapshot key when one is named,
 * then credentials (nothing is read without them). The R2 access key and account ID in the environment are
 * enough, and are required in CI; otherwise it is the operator's wrangler login. Throws the operator-facing error.
 */
export function guardProdRead({ task, key, usage }: ProdRead, deps: ProdReadDeps): void {
  if (key !== undefined && !SNAPSHOT_KEY.test(key)) {
    const message = `Expected a snapshot key like snapshots/live-<timestamp>.json, got "${key}".`
    throw new Error(usage ? `${message}\n${usage}` : message)
  }
  if (hasR2Credentials(deps.env)) return
  if (deps.env.CI) {
    throw new Error(
      `${task} reads prod R2 in CI with the repository secrets ${R2_CREDENTIALS.join(', ')}; set all three.`,
    )
  }
  if (!deps.source.isLoggedIn()) {
    throw new Error(`Cloudflare login missing. Run: ${LOGIN_COMMAND}`)
  }
}
