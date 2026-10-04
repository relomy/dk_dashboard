// Refreshes a committed producer fixture from a prod snapshot key.
// Reads R2 read-only with the operator's Cloudflare login; never runs in CI.
// Usage: npm run fixture:refresh -- snapshots/live-2026-10-04T18-41-34Z.json
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { r2Source } from '../lib/r2Source'
import { refreshFixture } from './lib/refreshFixture'

function main(): void {
  const key = process.argv[2]
  if (!key) {
    throw new Error('Usage: npm run fixture:refresh -- snapshots/live-<timestamp>.json')
  }

  const result = refreshFixture(key, {
    source: r2Source,
    writeFixture: (fixturePath, text) => {
      mkdirSync(path.dirname(fixturePath), { recursive: true })
      writeFileSync(fixturePath, text)
    },
    env: process.env,
  })

  console.log(`Wrote ${result.fixturePath}`)
  console.log('Record the snapshot key, producer commit, pull date and these counts in')
  console.log('public/mock/PRODUCER_FIXTURE.md:')
  console.log('')
  console.log('| Array | Rows |')
  console.log('| --- | --- |')
  for (const count of result.counts) {
    console.log(`| \`${count.path}\` | ${count.before} → ${count.after} |`)
  }
}

try {
  main()
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`fixture:refresh failed: ${message}`)
  process.exit(1)
}
