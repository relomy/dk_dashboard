import { describe, expect, it } from 'vitest'

import latest from '../../public/mock/latest.json'
import manifestToday from '../../public/mock/manifest/2026-02-21.json'
import snapshotV3 from '../../public/mock/snapshots/canonical-live-snapshot.v3.json'

describe('v3 fixture bundle', () => {
  it('loads canonical v3 snapshot fixture with schema_version 3', () => {
    expect(snapshotV3).toBeDefined()
    expect(snapshotV3.schema_version).toBe(3)
  })

  it('points latest.json to canonical v3 snapshot artifact', () => {
    expect(latest.latest_snapshot_path).toBe('snapshots/canonical-live-snapshot.v3.json')
  })

  it('references v3 snapshot paths from manifest rows', () => {
    expect(manifestToday).toBeDefined()
    for (const item of manifestToday.items ?? []) {
      expect(typeof item.snapshot_path).toBe('string')
      expect(item.snapshot_path.endsWith('.json')).toBe(true)
      expect(item.snapshot_path.includes('.v3') || item.snapshot_path.includes('/live-')).toBe(true)
    }
  })
})
