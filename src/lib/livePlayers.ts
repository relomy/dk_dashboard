import type { VipLineupRow as VipLineup, VipLineupSlot as VipLineupPlayerLive } from './generated/snapshot'
import type { LiveContest as Contest, LiveSport as SportSnapshot } from './interpretedSnapshot'
import { LOCKED_LABEL } from './lineup'
import type { GameStatus, LiveLineupPlayer, LivePoolPlayer, LiveTotalOwnership } from './liveModelTypes'
import { buildPlayerPool, numberOrNull, readValueIcon } from './playerPool'
import type { Player } from './types'

export function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null
}

/** The player pool keyed by `keyOf`; the first row wins when a key repeats. */
export function indexPool(players: Player[], keyOf: (player: Player) => string | undefined): Map<string, Player> {
  const index = new Map<string, Player>()
  for (const player of players) {
    const key = keyOf(player)
    if (key && !index.has(key)) index.set(key, player)
  }
  return index
}

export interface PoolIndex {
  byName: Map<string, Player>
  byKey: Map<string, Player>
}

/**
 * The pool player behind an unlocked `players_live` row. A row with a `player_key` matches by key alone: a key
 * the pool lacks is a miss, not a reason to guess by name. Only a keyless row matches by name.
 */
function poolPlayerOf(row: VipLineupPlayerLive, pool: PoolIndex): Player | undefined {
  if (row.player_key) return pool.byKey.get(row.player_key)
  return pool.byName.get(row.player_name)
}

/**
 * A pool player's matchup ("MIL@OKC"). Null when the feed sends the game status in its place
 * (today's producer copies `game_status` into `matchup`), so the card does not repeat it.
 */
export function matchupOf(player: Player | undefined): string | null {
  const matchup = nonEmptyString(player?.matchup)
  if (!matchup) return null
  return matchup.trim().toLowerCase() === player?.game_status?.trim().toLowerCase() ? null : matchup
}

/** A locked slot's player details: all empty, since the player is hidden and nothing comes from the pool. */
export const LOCKED_SLOT_DETAIL = {
  playerKey: null,
  gameStatus: null,
  points: null,
  projection: null,
  clock: null,
  matchup: null,
  ownershipPct: null,
  value: null,
  valueIcon: null,
  stats: null,
} as const satisfies Partial<LiveLineupPlayer>

/** A locked slot's card: its slot and the locked label, with every player detail empty. */
function lockedPlayer(key: string, slot: string): LiveLineupPlayer {
  return { key, slot, name: LOCKED_LABEL, locked: true, ...LOCKED_SLOT_DETAIL }
}

/** A slot identifies its player; the matched pool player supplies figures. Locked slots reveal no figures. */
export function buildLineupPlayers(lineup: VipLineup, pool: PoolIndex): LiveLineupPlayer[] {
  if (Array.isArray(lineup.players_live)) {
    return lineup.players_live.map((player, index) => {
      if (player.is_locked) return lockedPlayer(`${player.slot ?? 'row'}-${index}`, player.slot ?? '')
      const pooled = poolPlayerOf(player, pool)
      const gameStatus = pooled?.game_status
      return {
        key: `${player.slot ?? 'row'}-${index}`,
        slot: player.slot ?? '',
        name: player.player_name,
        playerKey: player.player_key ?? null,
        locked: false,
        gameStatus: classifyGameStatus(gameStatus),
        points: numberOrNull(pooled?.fantasy_points),
        projection: numberOrNull(pooled?.rt_projection),
        clock:
          numberOrNull(pooled?.time_remaining_minutes) !== null
            ? `${pooled?.time_remaining_minutes} min`
            : nonEmptyString(gameStatus),
        matchup: matchupOf(pooled),
        ownershipPct: numberOrNull(pooled?.ownership_pct),
        value: numberOrNull(pooled?.value),
        valueIcon: readValueIcon(pooled?.value_icon),
        stats: nonEmptyString(pooled?.stats_text),
      }
    })
  }
  return []
}

/**
 * Final players count their points; the rest count their real-time projection, or the points so far.
 * Null when no player carries a projection: the sum would only repeat the points already scored.
 */
export function projectLineup(players: LiveLineupPlayer[]): number | null {
  if (!players.some((player) => player.projection !== null)) return null
  return players.reduce((sum, player) => {
    const points = player.points ?? 0
    return sum + (player.gameStatus === 'final' ? points : (player.projection ?? points))
  }, 0)
}

const IN_PROGRESS_STATUSES = new Set(['in-progress', 'in progress', 'delayed', 'suspended'])
const FINAL_STATUSES = new Set(['final', 'postponed', 'cancelled', 'canceled'])

/**
 * The feed's `game_status` is DraftKings' game info: a matchup with a start time ("FSU@MIZZ 07:30PM ET")
 * before the game, then a word once it starts. A paused game (Delayed, Suspended) is still in progress;
 * a game moved off the slate or called off (Postponed, Cancelled) counts as final, alongside Final.
 * Anything else, such as golf's tournament name, has no game status.
 */
export function classifyGameStatus(raw: string | null | undefined): GameStatus | null {
  const text = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!text) return null
  if (FINAL_STATUSES.has(text)) return 'final'
  if (IN_PROGRESS_STATUSES.has(text)) return 'in-progress'
  if (text.includes('@')) return 'pre-game'
  return null
}

/** A player as two lists are matched on: the `player_key` when there is one, and the name. */
export interface PlayerRef {
  playerKey: string | null
  name: string
}

/**
 * Whether two lists name the same player: by `player_key` when both carry one, else by name with
 * surrounding whitespace ignored (the feed pads some names, such as DSTs: "Rams ").
 */
export function isSamePlayer(a: PlayerRef, b: PlayerRef): boolean {
  if (a.playerKey && b.playerKey) return a.playerKey === b.playerKey
  return a.name.trim() === b.name.trim()
}

/** The revealed players on a VIP's `players_live` lineup. */
function lineupPlayerRefs(lineup: VipLineup): PlayerRef[] {
  const live = (Array.isArray(lineup.players_live) ? lineup.players_live : [])
    .filter((player) => !player.is_locked)
    .map((player) => ({ playerKey: player.player_key ?? null, name: player.player_name }))
  return live
}

/** The trimmed player names on a VIP's lineup, for matching against a train's name-only lineup. */
export function lineupPlayerNames(lineup: VipLineup): Set<string> {
  return new Set(lineupPlayerRefs(lineup).map((player) => player.name.trim()))
}

export function buildPool(sportData: SportSnapshot, contest: Contest): LivePoolPlayer[] {
  const lineups = contest.vip_lineups.map(lineupPlayerRefs)
  const playerKeys = new Set(sportData.players.flatMap((player) => (player.player_key ? [player.player_key] : [])))
  return buildPlayerPool(sportData.players, '').map((row) => {
    const ref = { playerKey: playerKeys.has(row.key) ? row.key : null, name: row.name }
    return {
      ...row,
      gameStatus: classifyGameStatus(row.status),
      vipIndexes: lineups.flatMap((players, index) =>
        players.some((player) => isSamePlayer(player, ref)) ? [index] : [],
      ),
    }
  })
}

export function buildTotalOwnership(players: Player[]): LiveTotalOwnership {
  const sums = { total: 0, final: 0, inPlay: 0, preGame: 0 }
  for (const player of players) {
    const own = numberOrNull(player.ownership_pct) ?? 0
    sums.total += own
    const status = classifyGameStatus(player.game_status)
    if (status === 'final') sums.final += own
    else if (status === 'in-progress') sums.inPlay += own
    else if (status === 'pre-game') sums.preGame += own
  }
  const share = (part: number) => (sums.total > 0 ? (part / sums.total) * 100 : 0)
  return {
    ...sums,
    finalShare: share(sums.final),
    inPlayShare: share(sums.inPlay),
    preGameShare: share(sums.preGame),
  }
}
