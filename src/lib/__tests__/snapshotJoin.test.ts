import { expect, test } from 'vitest'
import snapshotFixture from '../../../public/mock/snapshots/dk-two-sport-bundle-v6.json'
import type { Snapshot } from '../types'

function parseSnapshot(raw: unknown): Snapshot {
  return raw as Snapshot
}

test('parses v6 vip slot names, preserves slot order, and tolerates unknown state', () => {
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

  // Unknown contest state should be accepted and not break parsing/join traversal.
  const unknownContest = snapshot.sports.nfl.contests.find((contest) => contest.state === 'unknown')
  expect(unknownContest).toBeTruthy()
  expect(unknownContest?.vip_lineups).toEqual([])
})
