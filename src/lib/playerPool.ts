import { DASH } from './format'
import { isRelevantPlayerRow } from './playerPresentation'
import type { Player, ValueIcon } from './types'

/** One player-pool row as shown on both Live and Sport, read from the v3 player fields. */
export interface PlayerPoolRow {
  key: string
  name: string
  team: string
  position: string
  matchup: string
  salary: number
  ownershipPct: number | null
  /** Actual fantasy points (v3 `fantasy_points`). */
  points: number | null
  value: number | null
  status: string
  /** DraftKings' hot/cold marker; null when the feed sends none (no dashboard-side thresholds). */
  valueIcon: ValueIcon | null
}

function firstNonBlank(...values: Array<string | undefined>): string | undefined {
  return values.find((v) => typeof v === 'string' && v.trim())
}

function joinRosterPositions(values?: string[]): string | undefined {
  if (!Array.isArray(values)) return undefined
  const joined = values.filter(Boolean).join('/')
  return joined.trim() ? joined : undefined
}

/** `fire` or `ice` as the feed sends it; anything else (absent, null, unknown) is no marker. */
export function readValueIcon(value: unknown): ValueIcon | null {
  return value === 'fire' || value === 'ice' ? value : null
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toRow(player: Player, index: number): PlayerPoolRow {
  const position =
    firstNonBlank(player.position, joinRosterPositions(player.roster_positions)) ?? DASH
  const key =
    player.player_key ||
    (`${player.name}|${player.team}|${player.salary}|${position}`.trim() || `player-${index}`)
  return {
    key,
    name: player.name,
    team: player.team,
    position,
    matchup: player.matchup || DASH,
    salary: player.salary,
    ownershipPct: finiteOrNull(player.ownership_pct),
    points: finiteOrNull(player.fantasy_points),
    value: finiteOrNull(player.value),
    status: player.game_status ?? DASH,
    valueIcon: readValueIcon(player.value_icon),
  }
}

function sortScore(row: PlayerPoolRow): number {
  return row.ownershipPct ?? row.points ?? Number.NEGATIVE_INFINITY
}

/** Keep rows whose player name contains the search text (case-insensitive); blank keeps all. */
export function searchPlayerPool(rows: PlayerPoolRow[], search: string): PlayerPoolRow[] {
  const needle = search.trim().toLowerCase()
  return needle ? rows.filter((row) => row.name.toLowerCase().includes(needle)) : rows
}

/** Search, drop irrelevant rows, and order by ownership then points. Shared by Live and Sport. */
export function buildPlayerPool(players: Player[], search: string): PlayerPoolRow[] {
  return searchPlayerPool(players.map(toRow), search)
    .filter((row) => isRelevantPlayerRow({ ownershipPct: row.ownershipPct, points: row.points, value: row.value }))
    .sort((a, b) => sortScore(b) - sortScore(a))
}

export function formatOwnership(value: number | null): string {
  if (value === null) return DASH
  return `${Math.round(value * 100) / 100}%`
}
