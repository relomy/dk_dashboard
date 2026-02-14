import { expect, test } from 'vitest'
import snapshotFixture from '../../../public/mock/snapshots/2026-02-13T18-25-00Z.json'
import type { Snapshot } from '../types'

function parseSnapshot(raw: unknown): Snapshot {
  return raw as Snapshot
}

test('joins vip slots to players, preserves slot order, and tolerates unknown state', () => {
  const snapshot = parseSnapshot(snapshotFixture)

  for (const sport of Object.values(snapshot.sports)) {
    const playersById = new Map(sport.players.map((player) => [player.player_id, player]))

    for (const contest of sport.contests) {
      for (const lineup of contest.vip_lineups) {
        const slotIds = lineup.slots.map((slot) => slot.player_id)

        const joinedPlayers = lineup.slots.map((slot) => {
          const player = playersById.get(slot.player_id)
          expect(player).toBeTruthy()
          return player!
        })

        // Join operation must preserve source slot order.
        expect(joinedPlayers.map((player) => player.player_id)).toEqual(slotIds)
      }
    }
  }

  // Unknown contest state should be accepted and not break parsing/join traversal.
  const unknownContest = snapshot.sports.nfl.contests.find((contest) => contest.state === 'unknown')
  expect(unknownContest).toBeTruthy()
  expect(unknownContest?.vip_lineups).toEqual([])
})
