import { describe, expect, it } from 'vitest'

import { refreshFixture, type SnapshotSource } from '../lib/refreshFixture'

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
  it('writes the trimmed snapshot to the fixture path named by its key', () => {
    const writes = new Map<string, string>()
    const snapshots = source()

    const result = refreshFixture(KEY, {
      source: snapshots,
      writeFixture: (path, text) => writes.set(path, text),
      env: {},
    })

    expect(snapshots.reads).toEqual([KEY])
    expect(result.fixturePath).toBe(`public/mock/${KEY}`)
    expect(writes.get(`public/mock/${KEY}`)).toBe(SNAPSHOT)
  })

  it('prints the exact login command and reads nothing when the Cloudflare login is missing', () => {
    const snapshots = source({ isLoggedIn: () => false })

    expect(() =>
      refreshFixture(KEY, { source: snapshots, writeFixture: () => undefined, env: {} }),
    ).toThrow('Cloudflare login missing. Run: npx wrangler login')
    expect(snapshots.reads).toEqual([])
  })

  it('refuses to run in CI', () => {
    expect(() =>
      refreshFixture(KEY, { source: source(), writeFixture: () => undefined, env: { CI: 'true' } }),
    ).toThrow('never runs in CI')
  })

  it('rejects a key that is not a live snapshot', () => {
    expect(() =>
      refreshFixture('manifest/2026-10-04.json', { source: source(), writeFixture: () => undefined, env: {} }),
    ).toThrow('snapshots/live-<timestamp>.json')
  })
})
