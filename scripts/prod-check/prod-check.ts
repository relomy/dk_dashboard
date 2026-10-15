// Runs the Live contract (shared invariants + unread-field detector) against the sports of a prod snapshot.
// Reads R2 read-only with the operator's Cloudflare login, or in CI the Cloudflare token and account ID.
// Usage: npm run prod:check -- [<sport>...] [snapshots/live-<timestamp>.json]   (default: every sport, the latest snapshot)
import { r2Source } from '../lib/r2Source'
import { runProdCheck } from './lib/prodCheck'

try {
  const result = runProdCheck(process.argv.slice(2), { source: r2Source, env: process.env })
  console.log(result.output)
  process.exit(result.exitCode)
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`prod:check failed: ${message}`)
  process.exit(1)
}
