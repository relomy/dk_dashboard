import type { ProfileMatchRules } from './profiles'
import type { VipLineup } from './types'

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function lineupTokens(lineup: VipLineup): string[] {
  const values = [lineup.display_name, lineup.entry_id, lineup.username]
  return values
    .map((value) => normalize(value))
    .filter((value) => value.length > 0)
}

function hasAnyRule(rules: ProfileMatchRules): boolean {
  return Boolean(normalize(rules.contains) || normalize(rules.exact) || normalize(rules.username))
}

export function lineupMatchesProfile(lineup: VipLineup, rules: ProfileMatchRules): boolean {
  if (!hasAnyRule(rules)) {
    return false
  }

  const tokens = lineupTokens(lineup)
  const contains = normalize(rules.contains)
  const exact = normalize(rules.exact)
  const username = normalize(rules.username)

  const containsMatch = contains ? tokens.some((token) => token.includes(contains)) : false
  const exactMatch = exact ? tokens.some((token) => token === exact) : false
  const usernameMatch = username ? normalize(lineup.username) === username : false

  return containsMatch || exactMatch || usernameMatch
}

export function filterVipLineups(
  lineups: VipLineup[],
  rules: ProfileMatchRules,
  mode: 'all' | 'active',
): VipLineup[] {
  if (mode === 'all') {
    return lineups
  }

  return lineups.filter((lineup) => lineupMatchesProfile(lineup, rules))
}
