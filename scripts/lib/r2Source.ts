import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { SnapshotSource } from '../fixtures/lib/refreshFixture'

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

/**
 * Read-only access to the prod R2 bucket with the operator's Cloudflare login
 * (`wrangler r2 object get --remote`). Only `whoami` and `get` are ever run.
 */
export const r2Source: SnapshotSource = {
  isLoggedIn() {
    try {
      return wrangler(['whoami']).includes('You are logged in')
    } catch {
      return false
    }
  },
  read(key) {
    const dir = mkdtempSync(path.join(tmpdir(), 'dk-r2-'))
    const file = path.join(dir, 'object.json')
    try {
      wrangler(['r2', 'object', 'get', `${BUCKET}/${key}`, '--remote', '--file', file])
      return readFileSync(file, 'utf8')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
}
