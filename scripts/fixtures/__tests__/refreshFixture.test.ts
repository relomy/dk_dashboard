import { describe, expect, it } from 'vitest'

import type { SnapshotSource } from '../../lib/snapshotSource'
import { refreshFixture } from '../lib/refreshFixture'

const KEY = 'snapshots/live-2026-10-04T18-41-34Z.json'
const SNAPSHOT = `{
  "schema_version":3,
  "sports":{
    "golf":{
      "contests":[],
      "players":[]
    }
  }
}
`

function source(overrides: Partial<SnapshotSource> = {}): SnapshotSource & { reads: string[] } {
  const reads: string[] = []
  return {
    reads,
    isLoggedIn: () => true,
    read: (key) => {
      reads.push(key)
      return SNAPSHOT
    },
    ...overrides,
  }
}

describe('refreshFixture', () => {
  it('writes the trimmed snapshot under the prod fixtures folder, outside the site build, at the path named by its key', () => {
    const writes = new Map<string, string>()
    const snapshots = source()

    const result = refreshFixture(KEY, {
      source: snapshots,
      writeFixture: (path, text) => writes.set(path, text),
      env: {},
    })

    expect(snapshots.reads).toEqual([KEY])
    expect(result.fixturePath).toBe(`contract/prod-fixtures/${KEY}`)
    expect(writes.get(`contract/prod-fixtures/${KEY}`)).toBe(SNAPSHOT)
  })

  it('prints the exact login command and reads nothing when the Cloudflare login is missing', () => {
    const snapshots = source({ isLoggedIn: () => false })

    expect(() => refreshFixture(KEY, { source: snapshots, writeFixture: () => undefined, env: {} })).toThrow(
      'Cloudflare login missing. Run: npx wrangler login',
    )
    expect(snapshots.reads).toEqual([])
  })

  it('names the missing R2 secrets in CI and reads nothing', () => {
    const snapshots = source()

    expect(() =>
      refreshFixture(KEY, { source: snapshots, writeFixture: () => undefined, env: { CI: 'true' } }),
    ).toThrow(/R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY.*CLOUDFLARE_ACCOUNT_ID/)
    expect(snapshots.reads).toEqual([])
  })

  it('rejects a key that is not a live snapshot', () => {
    expect(() =>
      refreshFixture('manifest/2026-10-04.json', { source: source(), writeFixture: () => undefined, env: {} }),
    ).toThrow('snapshots/live-<timestamp>.json')
  })
})
