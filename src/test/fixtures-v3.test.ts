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
    expect(Array.isArray(manifestToday.snapshots)).toBe(true)
    expect((manifestToday.snapshots ?? []).length).toBeGreaterThan(0)
    for (const item of manifestToday.snapshots ?? []) {
      expect(typeof item.path).toBe('string')
      expect(item.path.endsWith('.json')).toBe(true)
      expect(item.path.includes('.v3') || item.path.includes('/live-')).toBe(true)
    }
  })

  it('matches current v3 builder shape for key fields', () => {
    for (const sport of Object.keys(snapshotV3.sports ?? {})) {
      const sportPayload = snapshotV3.sports[sport]
      expect(typeof sportPayload.primary_contest?.selection_reason).toBe('object')
      expect(Array.isArray(sportPayload.contests?.[0]?.standings)).toBe(true)
    }
  })
})
