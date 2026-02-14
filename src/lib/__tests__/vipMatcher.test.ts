import { describe, expect, it } from 'vitest'
import { filterVipLineups, lineupMatchesProfile } from '../vipMatcher'

describe('lineupMatchesProfile', () => {
  const lineup = {
    vip_entry_key: 'k1',
    display_name: 'Alex Core',
    entry_id: 'entry-42',
    username: 'alex_user',
    slots: [],
  }

  it('matches contains rule against display name', () => {
    expect(lineupMatchesProfile(lineup, { contains: 'alex' })).toBe(true)
  })

  it('matches exact rule against entry id', () => {
    expect(lineupMatchesProfile(lineup, { exact: 'entry-42' })).toBe(true)
  })

  it('matches username rule when username is present', () => {
    expect(lineupMatchesProfile(lineup, { username: 'alex_user' })).toBe(true)
  })

  it('returns false when no configured rules match', () => {
    expect(lineupMatchesProfile(lineup, { contains: 'jamie' })).toBe(false)
  })

  it('returns false when no rules are configured', () => {
    expect(lineupMatchesProfile(lineup, {})).toBe(false)
  })
})

describe('filterVipLineups', () => {
  const lineups = [
    { vip_entry_key: '1', display_name: 'Alex Core', slots: [] },
    { vip_entry_key: '2', display_name: 'Jamie SD', slots: [] },
  ]

  it('returns all lineups in all mode', () => {
    expect(filterVipLineups(lineups, { contains: 'alex' }, 'all')).toHaveLength(2)
  })

  it('returns only matching lineups in active mode', () => {
    const filtered = filterVipLineups(lineups, { contains: 'alex' }, 'active')
    expect(filtered.map((lineup) => lineup.display_name)).toEqual(['Alex Core'])
  })
})
