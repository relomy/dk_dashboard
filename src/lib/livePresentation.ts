import type { GameStatus, LiveLineupPlayer, LivePoolPlayer, LiveTrainCloseness } from './liveModel'

// How the Live views label and show what the view model holds: train closeness, the lineup
// ownership hint, lineup groups, HAVE/FADE and hidden values.

/** "identical" when every slot is shared, else "share N of M"; null when the producer gave no `min_shared_slots`. */
export function trainClosenessLabel(closeness: LiveTrainCloseness | null): string | null {
  if (!closeness) return null
  return closeness.identical ? 'identical' : `share ${closeness.minShared} of ${closeness.slotCount}`
}

export type LineupOwnershipHint = 'chalky' | 'balanced' | 'contrarian'

/**
 * How chalky a lineup is, from its summed ownership over its slot count (the prototype's thresholds):
 * an average of 50% a slot or more is chalky, 20% or less is contrarian. Null without ownership or slots.
 */
export function lineupOwnershipHint(lineupOwnershipPct: number | null, slotCount: number): LineupOwnershipHint | null {
  if (lineupOwnershipPct === null || slotCount <= 0) return null
  const average = lineupOwnershipPct / slotCount
  if (average >= 50) return 'chalky'
  if (average <= 20) return 'contrarian'
  return 'balanced'
}

export interface LineupGroup {
  gameStatus: GameStatus
  label: 'Playing now' | 'Yet to play' | 'Done'
  players: LiveLineupPlayer[]
}

/**
 * A lineup grouped for display: Playing now (in progress), Yet to play (pre-game, or no game status)
 * and Done (final), in that order and each in lineup order. Empty groups are left out.
 */
export function groupLineup(players: LiveLineupPlayer[]): LineupGroup[] {
  const groups: LineupGroup[] = [
    { gameStatus: 'in-progress', label: 'Playing now', players: [] },
    { gameStatus: 'pre-game', label: 'Yet to play', players: [] },
    { gameStatus: 'final', label: 'Done', players: [] },
  ]
  for (const player of players) {
    const status = player.gameStatus ?? 'pre-game'
    groups.find((group) => group.gameStatus === status)?.players.push(player)
  }
  return groups.filter((group) => group.players.length > 0)
}

/**
 * A swing player against the lineup in focus (a VIP, or a Train on the Trains view): HAVE when the
 * lineup rosters them, FADE when it does not, matched by name; null without a focused lineup.
 */
export function haveOrFade(lineup: LiveLineupPlayer[] | null, playerName: string): 'have' | 'fade' | null {
  if (!lineup) return null
  return lineup.some((player) => player.name === playerName) ? 'have' : 'fade'
}

/** Value is hidden for pre-game players (a zero is not a bust), so it never shows or ranks them. */
export function visibleValue(player: Pick<LivePoolPlayer, 'gameStatus' | 'value'>): number | null {
  return player.gameStatus === 'pre-game' ? null : player.value
}
