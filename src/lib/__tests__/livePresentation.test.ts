import { describe, expect, it } from 'vitest'
import type { LiveLineupPlayer } from '../liveModel'
import { groupLineup, haveOrFade, lineupOwnershipHint } from '../livePresentation'

describe('lineup ownership hint', () => {
  it('calls an average of 50% a slot or more chalky, 20% or less contrarian, otherwise balanced', () => {
    expect(lineupOwnershipHint(400, 8)).toBe('chalky')
    expect(lineupOwnershipHint(445.6, 8)).toBe('chalky')
    expect(lineupOwnershipHint(160, 8)).toBe('contrarian')
    expect(lineupOwnershipHint(100, 8)).toBe('contrarian')
    expect(lineupOwnershipHint(240, 8)).toBe('balanced')
  })

  it('has no hint without ownership or slots', () => {
    expect(lineupOwnershipHint(null, 8)).toBeNull()
    expect(lineupOwnershipHint(200, 0)).toBeNull()
  })
})

describe('lineup grouping', () => {
  const player = (name: string, gameStatus: LiveLineupPlayer['gameStatus']): LiveLineupPlayer => ({
    key: name,
    slot: 'FLEX',
    name,
    playerKey: null,
    gameStatus,
    points: null,
    projection: null,
    clock: null,
    matchup: null,
    ownershipPct: null,
    value: null,
    valueIcon: null,
    stats: null,
  })

  it('groups by game status, keeping lineup order, with no game status counting as yet to play', () => {
    const groups = groupLineup([
      player('a', 'final'),
      player('b', 'pre-game'),
      player('c', 'in-progress'),
      player('d', null),
      player('e', 'in-progress'),
    ])

    expect(groups.map((group) => [group.label, group.players.map((p) => p.name)])).toEqual([
      ['Playing now', ['c', 'e']],
      ['Yet to play', ['b', 'd']],
      ['Done', ['a']],
    ])
  })

  it('drops empty groups', () => {
    expect(groupLineup([player('a', 'final')]).map((group) => group.label)).toEqual(['Done'])
    expect(groupLineup([])).toEqual([])
  })
})

describe('HAVE or FADE', () => {
  const lineup = (...names: string[]): LiveLineupPlayer[] => keyedLineup(...names.map((name) => [name, null] as const))
  const keyedLineup = (...rows: ReadonlyArray<readonly [string, string | null]>): LiveLineupPlayer[] =>
    rows.map(([name, playerKey]) => ({
      key: name,
      slot: 'FLEX',
      name,
      playerKey,
      gameStatus: null,
      points: null,
      projection: null,
      clock: null,
      matchup: null,
      ownershipPct: null,
      value: null,
      valueIcon: null,
      stats: null,
    }))

  it('is HAVE when the focused lineup rosters the player and FADE when it does not', () => {
    const focused = lineup('Ousmane Kromah', 'Cayden Lee')

    expect(haveOrFade(focused, { name: 'Ousmane Kromah', playerKey: null })).toBe('have')
    expect(haveOrFade(focused, { name: 'Duce Robinson', playerKey: null })).toBe('fade')
  })

  it('matches by player_key when both sides carry one, whatever the names', () => {
    const focused = keyedLineup(['Rams ', 'nfl:rams'], ['Jets', 'nfl:jets'])

    expect(haveOrFade(focused, { name: 'LA Rams', playerKey: 'nfl:rams' })).toBe('have')
    expect(haveOrFade(focused, { name: 'Jets', playerKey: 'nfl:jets-2' })).toBe('fade')
  })

  it('falls back to the name with surrounding whitespace ignored', () => {
    expect(haveOrFade(lineup('Rams '), { name: 'Rams', playerKey: 'nfl:rams' })).toBe('have')
  })

  it('is neither without a focused lineup', () => {
    expect(haveOrFade(null, { name: 'Ousmane Kromah', playerKey: null })).toBeNull()
  })
})
