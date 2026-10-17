// Runs the Live contract (shared invariants + unread-field detector) against the sports of a prod snapshot.
// Reads R2 read-only with the operator's Cloudflare login, or the bucket-scoped R2 access key and account ID (CI).
// Usage: npm run prod:check -- [<sport>...] [snapshots/live-<timestamp>.json] [--expect-commit <sha>]
//   (default: every sport, the latest snapshot)
import { appendFileSync } from 'node:fs'

import { githubCommitOrder } from '../lib/githubCommitOrder'
import { selectSource } from '../lib/selectSource'
import { describeFailure, runProdCheck } from './lib/prodCheck'

try {
  const result = runProdCheck(process.argv.slice(2), {
    source: selectSource(process.env),
    env: process.env,
    commitOrder: githubCommitOrder(),
  })
  console.log(result.output)
  // GitHub Actions: expose the outcome, and the snapshot it was reached on, as step outputs for the workflow.
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `outcome=${result.outcome}\nsnapshot=${result.key}\n`)
  process.exit(result.exitCode)
} catch (error: unknown) {
  console.error(describeFailure(error))
  process.exit(1)
}
