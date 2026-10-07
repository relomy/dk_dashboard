import { describe, expect, it } from 'vitest'
import { filterVipLineups, lineupMatchesProfile } from '../vipMatcher'

describe('lineupMatchesProfile', () => {
  const lineup = {
    vip_entry_key: 'k1',
    display_name: 'Alex Core',
    entry_key: 'entry-42',
    players_live: [],
  }

  it('matches contains rule against display name', () => {
    expect(lineupMatchesProfile(lineup, { contains: 'alex' })).toBe(true)
  })

  it('matches exact rule against entry key', () => {
    expect(lineupMatchesProfile(lineup, { exact: 'entry-42' })).toBe(true)
  })

  it('matches username rule against the emitted display name', () => {
    expect(lineupMatchesProfile(lineup, { username: 'alex core' })).toBe(true)
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
    { vip_entry_key: '1', display_name: 'Alex Core', players_live: [] },
    { vip_entry_key: '2', display_name: 'Jamie SD', players_live: [] },
  ]

  it('returns all lineups in all mode', () => {
    expect(filterVipLineups(lineups, { contains: 'alex' }, 'all')).toHaveLength(2)
  })

  it('returns only matching lineups in active mode', () => {
    const filtered = filterVipLineups(lineups, { contains: 'alex' }, 'active')
    expect(filtered.map((lineup) => lineup.display_name)).toEqual(['Alex Core'])
  })
})
