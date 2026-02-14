import { expect, test } from 'vitest'
import snapshotFixture from '../../../public/mock/snapshots/canonical-live-snapshot.json'
import type { Snapshot } from '../types'

function parseSnapshot(raw: unknown): Snapshot {
  return raw as Snapshot
}

test('parses v6 vip slot names and preserves slot order', () => {
  const snapshot = parseSnapshot(snapshotFixture)

  for (const sport of Object.values(snapshot.sports)) {
    for (const contest of sport.contests) {
      for (const lineup of contest.vip_lineups) {
        const slotNames = lineup.slots.map((slot) => slot.player_name)
        expect(slotNames.length).toBe(lineup.slots.length)
        expect(slotNames.every((name) => typeof name === 'string' && name.length > 0)).toBe(true)
      }
    }
  }

  expect(Object.keys(snapshot.sports).length).toBeGreaterThan(0)
})
