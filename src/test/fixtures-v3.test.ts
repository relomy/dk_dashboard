import { describe, expect, it } from 'vitest'

import latest from '../../public/mock/latest.json'
import manifestToday from '../../public/mock/manifest/2026-10-03.json'
// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
import snapshotV3 from '../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import { isEnvelopeSnapshot } from '../lib/snapshotContract'
import type { Snapshot } from '../lib/types'

const SNAPSHOT_PATH = 'snapshots/live-2026-10-03T20-48-31Z.json'

describe('producer v3 fixture bundle', () => {
  it('loads the producer snapshot with schema_version 3 in the envelope shape', () => {
    expect(snapshotV3.schema_version).toBe(3)
    expect(isEnvelopeSnapshot(snapshotV3)).toBe(true)
  })

  it('points latest.json and the manifest at the producer snapshot', () => {
    expect(latest.latest_snapshot_path).toBe(SNAPSHOT_PATH)
    expect(latest.manifest_today_path).toBe('manifest/2026-10-03.json')
    expect(manifestToday.snapshots.map((item) => item.path)).toContain(SNAPSHOT_PATH)
    for (const item of manifestToday.snapshots) {
      expect(item.path.startsWith('snapshots/live-')).toBe(true)
      expect(item.path.endsWith('.json')).toBe(true)
    }
  })

  it('matches the emitted v3 shape for key fields', () => {
    const typedSnapshot = snapshotV3 as unknown as Snapshot
    const sports = Object.values(typedSnapshot.sports ?? {})
    expect(sports.length).toBeGreaterThan(0)
    for (const sportPayload of sports) {
      expect(typeof sportPayload.primary_contest?.selection_reason).toBe('object')
      expect(Array.isArray(sportPayload.contests?.[0]?.standings)).toBe(true)
    }
  })

  it('emits train_clusters as a bare array of v3 train rows', () => {
    const typedSnapshot = snapshotV3 as unknown as Snapshot
    for (const sportPayload of Object.values(typedSnapshot.sports ?? {})) {
      const trains = sportPayload.contests[0]?.train_clusters
      expect(Array.isArray(trains)).toBe(true)
      expect((trains ?? []).length).toBeGreaterThan(0)
      for (const train of trains ?? []) {
        expect(typeof train.cluster_id).toBe('string')
        expect(typeof train.cluster_rule).toBe('string')
        expect(typeof train.user_count).toBe('number')
        expect(typeof train.rank).toBe('number')
        expect(typeof train.points).toBe('number')
        expect(typeof train.pmr).toBe('number')
        expect(typeof train.lineup_signature).toBe('string')
        expect(Array.isArray(train.entry_keys)).toBe(true)
      }
    }
  })
})
