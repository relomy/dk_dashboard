// Refreshes a committed producer fixture from a prod snapshot key.
// Reads R2 read-only with the operator's Cloudflare login; never runs in CI.
// Usage: npm run fixture:refresh -- snapshots/live-2026-10-04T18-41-34Z.json
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { refreshFixture, type SnapshotSource } from './lib/refreshFixture'

const BUCKET = 'dk-dashboard-data'
const WRANGLER_LOG_PATH = process.env.WRANGLER_LOG_PATH ?? '.wrangler/logs'

function wrangler(args: string[]): string {
  mkdirSync(WRANGLER_LOG_PATH, { recursive: true })
  return execFileSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    env: { ...process.env, WRANGLER_LOG_PATH },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

const r2: SnapshotSource = {
  isLoggedIn() {
    try {
      return wrangler(['whoami']).includes('You are logged in')
    } catch {
      return false
    }
  },
  read(key) {
    const dir = mkdtempSync(path.join(tmpdir(), 'dk-fixture-'))
    const file = path.join(dir, 'snapshot.json')
    try {
      wrangler(['r2', 'object', 'get', `${BUCKET}/${key}`, '--remote', '--file', file])
      return readFileSync(file, 'utf8')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
}

function main(): void {
  const key = process.argv[2]
  if (!key) {
    throw new Error('Usage: npm run fixture:refresh -- snapshots/live-<timestamp>.json')
  }

  const result = refreshFixture(key, {
    source: r2,
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
