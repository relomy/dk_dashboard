import { describe, expect, it } from 'vitest'
import { liveUnreadPaths } from '../liveUnreadPaths'
import type { Snapshot } from '../types'
import { staleAllowlistEntries, unallowlistedPaths, unreadPaths } from '../unreadPaths'

describe('unreadPaths', () => {
  it('lists the leaf paths the reader never touched, each array collapsed to []', () => {
    const feed = {
      name: 'Main',
      rows: [
        { key: 'a', points: 1, salary: 5000 },
        { key: 'b', points: 2, salary: 6000 },
      ],
    }
    const unread = unreadPaths(feed, (value) => value.rows.map((row) => row.points))
    expect(unread).toEqual(['name', 'rows[].key', 'rows[].salary'])
  })

  it('does not count listing keys as reading their values', () => {
    const feed = { stats: { goals: 1, assists: 2 } }
    expect(unreadPaths(feed, (value) => Object.keys(value.stats))).toEqual(['stats.assists', 'stats.goals'])
  })

  it('refuses a reader that hands back feed objects, whose later reads it could not see', () => {
    const feed = { rows: [{ key: 'a', points: 1 }] }
    expect(() => unreadPaths(feed, (value) => ({ first: value.rows[0] }))).toThrow(/rows\[\]/)
  })
})

/** The smallest renderable feed: one NFL contest with a field the Live model has never heard of. */
function syntheticSnapshot(): Snapshot {
  const contest = { contest_key: 'c1', name: 'Main', vip_lineups: [], brand_new_figure: 7 }
  return {
    schema_version: 3,
    snapshot_at: '2026-10-04T18:41:34Z',
    sports: {
      nfl: { primary_contest: { contest_key: 'c1' }, contests: [contest], players: [] },
      golf: { primary_contest: { contest_key: 'g1' }, contests: [{ ...contest, contest_key: 'g1', golf_only: 1 }], players: [] },
    },
  } as unknown as Snapshot
}

describe('the Live unread-field check', () => {
  const unread = liveUnreadPaths(syntheticSnapshot(), 'nfl')

  it("names a field the Live model never reads, from the sport's own feed only", () => {
    expect(unread).toEqual(['sports.*.contests[].brand_new_figure'])
  })

  it('fails on that field until the allowlist carries it', () => {
    expect(unallowlistedPaths(unread, {})).toEqual(['sports.*.contests[].brand_new_figure'])
    expect(unallowlistedPaths(unread, { 'sports.*.contests[].brand_new_figure': 'No panel shows it yet' })).toEqual([])
  })

  it('names an allowlist entry that no input leaves unread', () => {
    const allowlist = { 'sports.*.contests[].brand_new_figure': 'No panel shows it yet', 'sports.*.gone': 'Removed' }
    expect(staleAllowlistEntries([unread], allowlist)).toEqual(['sports.*.gone'])
  })
})
