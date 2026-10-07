import { expect, it } from 'vitest'
import captured from '../../../public/mock/snapshots/live-2026-10-04T18-41-34Z.json'
import { buildLiveModel } from '../liveModel'
import { LIVE_UNREAD_ALLOWLIST, liveUnreadPaths } from '../liveUnreadPaths'
import { interpretSnapshot } from '../interpretedSnapshot'
import { unallowlistedPaths } from '../unreadPaths'

it('does not fall back to historical pts when current points is invalid', () => {
  const snapshot = structuredClone(captured)
  Object.assign(snapshot.sports.nfl.contests[0].vip_lineups[0], { points: 'invalid', pts: 99 })
  const result = buildLiveModel(snapshot, 'nfl')
  expect(result.kind === 'ready' && result.model.vips[0].points).toBeNull()
})

it('keeps unused raw VIP additions and shadowed aliases accountable', () => {
  const snapshot = structuredClone(captured)
  Object.assign(snapshot.sports.nfl.contests[0].vip_lineups[0], { unused_new_field: 42, points: 0 })
  const unread = unallowlistedPaths(liveUnreadPaths(interpretSnapshot(snapshot), 'nfl'), LIVE_UNREAD_ALLOWLIST)
  expect(unread).toContain('sports.*.contests[].vip_lineups[].unused_new_field')
  expect(unread).toContain('sports.*.contests[].vip_lineups[].pts')
})

it.each([
  { rank: ' 12 ', pmr: ' 0 ', points: 0, expected: { rank: 12, pmr: 0, points: 0 } },
  { rank: '', pmr: 'Infinity', points: '42', expected: { rank: null, pmr: null, points: null } },
  { rank: 'wrong', pmr: ' ', points: null, expected: { rank: null, pmr: null, points: null } },
])('normalizes only finite historical figures without losing zero ($rank / $pmr)', ({ rank, pmr, points, expected }) => {
  const snapshot = structuredClone(captured)
  Object.assign(snapshot.sports.nfl.contests[0].vip_lineups[0], { rank, pmr, points })
  const result = buildLiveModel(snapshot, 'nfl')
  expect(result.kind === 'ready' && result.model.vips[0]).toMatchObject(expected)
})

it('does not credit discarded malformed figures as consumed', () => {
  const snapshot = structuredClone(captured)
  Object.assign(snapshot.sports.nfl.contests[0].vip_lineups[0], { rank: 'invalid' })
  expect(liveUnreadPaths(snapshot, 'nfl')).toContain('sports.*.contests[].vip_lineups[].rank')
})
