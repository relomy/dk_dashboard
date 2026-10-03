import { expect, test } from 'vitest'
import latest from '../../../public/mock/latest.json'
import v3Fixture from '../../../public/mock/snapshots/canonical-live-snapshot.v3.json'
import { isEnvelopeSnapshot } from '../snapshotContract'

test('mock latest has required fields', () => {
  expect(latest.latest_snapshot_path).toBeTruthy()
  expect(latest.manifest_today_path).toBeTruthy()
})

test('accepts envelope fixture shape and rejects legacy raw fixture shape', () => {
  const rawShape = {
    schema_version: 3,
    snapshot_at: '2026-02-21T00:00:00Z',
    generated_at: '2026-02-21T00:00:00Z',
    contest: {},
    selection: {},
    standings: [],
    vip_lineups: [],
  }

  expect(isEnvelopeSnapshot(rawShape)).toBe(false)
  expect(isEnvelopeSnapshot(v3Fixture)).toBe(true)
})

test('rejects malformed envelope sport payloads', () => {
  const missingPlayers = {
    schema_version: 3,
    snapshot_at: '2026-02-21T00:00:00Z',
    generated_at: '2026-02-21T00:00:00Z',
    sports: {
      nba: {
        status: 'ok',
        updated_at: '2026-02-21T00:00:00Z',
        contests: [],
      },
    },
  }
  const missingContests = {
    schema_version: 3,
    snapshot_at: '2026-02-21T00:00:00Z',
    generated_at: '2026-02-21T00:00:00Z',
    sports: {
      nba: {
        status: 'ok',
        updated_at: '2026-02-21T00:00:00Z',
        players: [],
      },
    },
  }

  expect(isEnvelopeSnapshot(missingPlayers)).toBe(false)
  expect(isEnvelopeSnapshot(missingContests)).toBe(false)
})
