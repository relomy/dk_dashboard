// Runs the Live contract (shared invariants + unread-field detector) against the sports of a prod snapshot.
// Reads R2 read-only with the operator's Cloudflare login, or in CI the Cloudflare token and account ID.
// Usage: npm run prod:check -- [<sport>...] [snapshots/live-<timestamp>.json]   (default: every sport, the latest snapshot)
import { appendFileSync } from 'node:fs'

import { r2Source } from '../lib/r2Source'
import { describeFailure, runProdCheck } from './lib/prodCheck'

try {
  const result = runProdCheck(process.argv.slice(2), { source: r2Source, env: process.env })
  console.log(result.output)
  // GitHub Actions: expose the outcome as a step output for the workflow to branch on.
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `outcome=${result.outcome}\n`)
  process.exit(result.exitCode)
} catch (error: unknown) {
  console.error(describeFailure(error))
  process.exit(1)
}
