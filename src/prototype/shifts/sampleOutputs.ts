/**
 * PROTOTYPE (issue #81): throwaway, not for main. Hand-written sample outputs in the *draft* shape of the
 * Shifts feed module's public outputs (#80). Nothing here depends on the real module or the Live model.
 *
 * Every number in a feed item is a plain from/to pair, so a renderer never re-derives anything.
 */

export type Priority = 'high' | 'normal'

export interface FromTo {
  from: number | null
  to: number | null
}

/** A cash line move, as the cause of a crossing or as its own feed item. */
export interface CashLineChange {
  points: FromTo
  rank: FromTo
}

export type GameState = 'pre-game' | 'in-progress' | 'final'

/**
 * One player in a VIP's lineup, before (Seen mark) and now. Every slot appears, changed or not, so the UI
 * draws a full lineup diff without comparing anything. A late swap is not reported: a slot whose player
 * differs is simply absent.
 */
export interface PlayerDiff {
  playerKey: string
  name: string
  slot: string
  /** Raw points of this player alone; null while the slot is hidden. */
  points: FromTo
  /** to - from, with a null `from` counting as 0; null while the slot is still hidden. */
  pointsDelta: number | null
  locked: { from: boolean; to: boolean }
  game: { from: GameState | null; to: GameState | null }
  /** The new `stats` line, only when it adds information. */
  stats: string | null
}

interface ItemBase {
  /** Stable across polls; the log's id for High items. */
  id: string
  priority: Priority
  /** When the module detected it (ISO). */
  detectedAt: string
  /** High items only: has the banner already shown it? */
  surfaced: boolean
}

export type CrossingPath = 'in' | 'out' | 'in-then-out' | 'out-then-in'

export interface CashCrossingItem extends ItemBase {
  kind: 'cash-crossing'
  priority: 'high'
  vipKey: string
  path: CrossingPath
  /** Net since the Seen mark, so a crossing row carries the same headline moves as a VIP move. */
  rank: FromTo
  points: FromTo
  /** Where the VIP stands now. */
  cashing: boolean
  /** Set when a cash line move in the same poll caused the crossing. */
  cause: CashLineChange | null
  /** The VIP's lineup diff, so a crossing explains itself the way a move does. */
  lineup: PlayerDiff[]
}

export interface VipMoveItem extends ItemBase {
  kind: 'vip-move'
  priority: 'normal'
  vipKey: string
  rank: FromTo
  points: FromTo
  /** Distance to cash: points and ranks, both from/to; null when the VIP has no line to measure against. */
  distancePoints: FromTo | null
  distanceRanks: FromTo | null
  /** The whole lineup, changed players first by absolute points delta, then unchanged, then still-hidden slots. */
  lineup: PlayerDiff[]
}

export interface CashLineMoveItem extends ItemBase {
  kind: 'cash-line-move'
  priority: 'normal'
  change: CashLineChange
}

export interface ContestStateItem extends ItemBase {
  kind: 'contest-state'
  priority: 'high'
  from: string
  to: string
}

/** A completed contest compares final standings only: no contributors. */
export interface FinalStandingItem extends ItemBase {
  kind: 'final-standing'
  priority: 'normal'
  vipKey: string
  rank: FromTo
  points: FromTo
  cashing: boolean
}

export type FeedItem =
  | CashCrossingItem
  | VipMoveItem
  | CashLineMoveItem
  | ContestStateItem
  | FinalStandingItem

export interface SampleVip {
  key: string
  name: string
  /** Index into the Live model's VIP order: drives the identity color. */
  index: number
}

export interface GapSummaryData {
  /** Unseen items in the feed. */
  count: number
  /** The feed's first item. */
  top: FeedItem | null
  /** How long the user was away. */
  awayMinutes: number
}

/** What the module reports for one sport's primary contest at one moment. */
export interface ShiftsOutput {
  label: string
  note: string
  contest: { name: string; state: 'live' | 'completed'; sport: string }
  vips: SampleVip[]
  /**
   * The VIP the UI addresses as "You": the one whose display name equals the active Profile's `username` rule.
   * Null when the Profile has no username rule or it matches nobody.
   */
  youKey: string | null
  feed: FeedItem[]
  unseenCount: number
  /** High items not yet shown by the banner, a subset of `feed`. */
  unsurfacedHigh: FeedItem[]
  /** Set on a visit that follows a gap of at least the summary duration. */
  returnedAfterGap: GapSummaryData | null
  /** The gap band the build fell in; shown to explain the scenario, never rendered by the UI. */
  gapBand: 'none' | 'under-10' | '10-to-30' | '30-plus'
}

const VIPS: SampleVip[] = [
  { key: 'v-mara', name: 'mara_k', index: 0 },
  { key: 'v-dusk', name: 'DuskTrader', index: 1 },
  { key: 'v-bell', name: 'bellwether', index: 2 },
  { key: 'v-orin', name: 'orin44', index: 3 },
]

function pd(
  playerKey: string,
  name: string,
  slot: string,
  from: number | null,
  to: number | null,
  game: [GameState | null, GameState | null],
  extra: { locked?: [boolean, boolean]; stats?: string } = {},
): PlayerDiff {
  const locked = extra.locked ?? [false, false]
  return {
    playerKey,
    name,
    slot,
    points: { from, to },
    pointsDelta: to === null ? null : to - (from ?? 0),
    locked: { from: locked[0], to: locked[1] },
    game: { from: game[0], to: game[1] },
    stats: extra.stats ?? null,
  }
}

const T = (minute: number) => `2026-10-12T20:${String(minute).padStart(2, '0')}:00Z`

const crossingOutCaused: CashCrossingItem = {
  id: 'hi-1',
  kind: 'cash-crossing',
  priority: 'high',
  detectedAt: T(40),
  surfaced: false,
  vipKey: 'v-mara',
  path: 'out',
  rank: { from: 1170, to: 1204 },
  points: { from: 212.0, to: 214.25 },
  cashing: false,
  cause: { points: { from: 211.5, to: 216.25 }, rank: { from: 1180, to: 1196 } },
  lineup: [
    pd('p-20', 'Luka Doncic', 'PG', 41.0, 42.25, ['in-progress', 'in-progress']),
    pd('p-21', 'Anthony Edwards', 'SG', 29.0, 30.0, ['in-progress', 'in-progress']),
    pd('p-22', 'Franz Wagner', 'SF', 26.0, 26.0, ['final', 'final']),
    pd('p-23', 'Evan Mobley', 'PF', 24.25, 24.25, ['final', 'final']),
    pd('p-24', 'Nikola Jokic', 'C', 47.5, 48.5, ['in-progress', 'in-progress']),
    pd('p-25', 'Dyson Daniels', 'G', 16.0, 16.0, ['final', 'final']),
    pd('p-26', 'Scottie Barnes', 'F', 28.25, 28.25, ['final', 'final']),
    pd('p-27', 'Jalen Green', 'UTIL', 0, 0.0, ['pre-game', 'pre-game']),
  ],
}

const crossingInAndOut: CashCrossingItem = {
  id: 'hi-2',
  kind: 'cash-crossing',
  priority: 'high',
  detectedAt: T(25),
  surfaced: false,
  vipKey: 'v-dusk',
  path: 'in-then-out',
  rank: { from: 1250, to: 1311 },
  points: { from: 210.0, to: 213.0 },
  cashing: false,
  cause: null,
  lineup: [
    pd('p-30', 'Stephen Curry', 'PG', 38.0, 36.0, ['in-progress', 'in-progress'], { stats: '3-of-11 3PT' }),
    pd('p-31', 'Devin Booker', 'SG', 30.5, 30.5, ['final', 'final']),
    pd('p-32', 'Jaylen Brown', 'SF', 25.0, 28.0, ['in-progress', 'in-progress']),
    pd('p-33', 'Jabari Smith Jr.', 'PF', 21.0, 21.0, ['final', 'final']),
    pd('p-34', 'Victor Wembanyama', 'C', 52.0, 55.25, ['in-progress', 'in-progress']),
    pd('p-35', 'Immanuel Quickley', 'G', 18.5, 18.5, ['final', 'final']),
    pd('p-36', 'Julius Randle', 'F', 20.0, 20.0, ['final', 'final']),
    pd('p-37', 'Collin Sexton', 'UTIL', 5.0, 4.0, ['in-progress', 'in-progress']),
  ],
}

const bellMove: VipMoveItem = {
  id: 'n-bell',
  kind: 'vip-move',
  priority: 'normal',
  detectedAt: T(41),
  surfaced: false,
  vipKey: 'v-bell',
  rank: { from: 2210, to: 1488 },
  points: { from: 168.75, to: 203.5 },
  distancePoints: { from: 42.75, to: 12.75 },
  distanceRanks: { from: 1030, to: 308 },
  lineup: [
    pd('p-1', 'Jalen Brunson', 'PG', 12.5, 34.0, ['in-progress', 'final'], { stats: '31 PTS, 8 AST, 4 REB' }),
    pd('p-2', 'Domantas Sabonis', 'C', 18.0, 27.25, ['in-progress', 'in-progress']),
    pd('p-3', 'Lauri Markkanen', 'F', null, 4.0, ['pre-game', 'in-progress'], { locked: [true, false], stats: '9 PTS, 3 REB' }),
    pd('p-7', 'Mikal Bridges', 'SF', 22.0, 22.0, ['final', 'final']),
    pd('p-8', 'Alperen Sengun', 'PF', 30.75, 30.75, ['final', 'final']),
    pd('p-9', 'Jrue Holiday', 'G', 8.0, 8.0, ['final', 'final']),
    pd('p-10', 'Cade Cunningham', 'SG', 33.5, 33.5, ['final', 'final']),
    pd('p-4', 'Locked', 'UTIL', null, null, ['pre-game', 'pre-game'], { locked: [true, true] }),
  ],
}

const orinMove: VipMoveItem = {
  id: 'n-orin',
  kind: 'vip-move',
  priority: 'normal',
  detectedAt: T(41),
  surfaced: false,
  vipKey: 'v-orin',
  rank: { from: 640, to: 702 },
  points: { from: 233.0, to: 237.5 },
  distancePoints: { from: -17.0, to: -8.75 },
  distanceRanks: { from: -380, to: -300 },
  lineup: [
    pd('p-6', 'Rudy Gobert', 'C', 12.0, 19.0, ['in-progress', 'final'], { stats: '11 PTS, 14 REB' }),
    pd('p-5', 'Tyrese Maxey', 'SG', 28.5, 26.0, ['in-progress', 'in-progress']),
    pd('p-11', 'Jalen Williams', 'SF', 31.0, 31.0, ['final', 'final']),
    pd('p-12', 'Paolo Banchero', 'PF', 40.25, 40.25, ['final', 'final']),
    pd('p-13', 'Derrick White', 'G', 22.0, 22.0, ['final', 'final']),
    pd('p-14', 'Tyler Herro', 'PG', 36.75, 36.75, ['final', 'final']),
    pd('p-15', 'Bam Adebayo', 'F', 35.0, 35.0, ['final', 'final']),
    pd('p-16', 'Ausar Thompson', 'UTIL', 27.5, 27.5, ['final', 'final']),
  ],
}

const lineMove: CashLineMoveItem = {
  id: 'n-line',
  kind: 'cash-line-move',
  priority: 'normal',
  detectedAt: T(40),
  surfaced: false,
  change: { points: { from: 211.5, to: 216.25 }, rank: { from: 1180, to: 1196 } },
}

const midSlateFeed: FeedItem[] = [crossingOutCaused, crossingInAndOut, bellMove, orinMove, lineMove]

const completedFeed: FeedItem[] = [
  {
    id: 'hi-final',
    kind: 'contest-state',
    priority: 'high',
    detectedAt: T(55),
    surfaced: false,
    from: 'live',
    to: 'completed',
  },
  {
    id: 'f-mara',
    kind: 'final-standing',
    priority: 'normal',
    detectedAt: T(55),
    surfaced: false,
    vipKey: 'v-mara',
    rank: { from: 1204, to: 1338 },
    points: { from: 214.25, to: 219.0 },
    cashing: false,
  },
  {
    id: 'f-bell',
    kind: 'final-standing',
    priority: 'normal',
    detectedAt: T(55),
    surfaced: false,
    vipKey: 'v-bell',
    rank: { from: 1488, to: 902 },
    points: { from: 203.5, to: 226.75 },
    cashing: true,
  },
  {
    id: 'f-orin',
    kind: 'final-standing',
    priority: 'normal',
    detectedAt: T(55),
    surfaced: false,
    vipKey: 'v-orin',
    rank: { from: 702, to: 811 },
    points: { from: 237.5, to: 240.0 },
    cashing: true,
  },
]

function summarize(feed: FeedItem[], awayMinutes: number): GapSummaryData {
  return { count: feed.length, top: feed[0] ?? null, awayMinutes }
}

function output(
  partial: Pick<ShiftsOutput, 'label' | 'note' | 'feed' | 'gapBand'> & {
    state?: 'live' | 'completed'
    awayMinutes?: number
  },
): ShiftsOutput {
  const { feed, gapBand, state = 'live', awayMinutes = 0, ...rest } = partial
  return {
    ...rest,
    gapBand,
    feed,
    contest: { name: '$100K NBA Classic', state, sport: 'nba' },
    vips: VIPS,
    youKey: null,
    unseenCount: feed.length,
    unsurfacedHigh: feed.filter((item) => item.priority === 'high' && !item.surfaced),
    returnedAfterGap: gapBand === '30-plus' ? summarize(feed, awayMinutes) : null,
  }
}

export const SCENARIOS = {
  'mid-slate': output({
    label: 'Mid-slate (every item kind)',
    note: 'Visible tab, polls only. A cash line move pushed mara_k out; DuskTrader crossed in and out; bellwether surged; orin44 slid.',
    feed: midSlateFeed,
    gapBand: 'none',
  }),
  'gap-10-30': output({
    label: 'Gap 10 to 30 min',
    note: 'Returned after 18 minutes: shifts accumulate as unseen, no summary.',
    feed: [bellMove, orinMove, lineMove],
    gapBand: '10-to-30',
  }),
  'gap-30-plus': output({
    label: 'Gap 30+ min',
    note: 'Returned after 95 minutes: the returned-after-a-gap flag is set with count and top item.',
    feed: midSlateFeed,
    gapBand: '30-plus',
    awayMinutes: 95,
  }),
  'gap-under-10': output({
    label: 'Gap under 10 min',
    note: 'Returned after 4 minutes: the Seen mark advanced silently, so nothing is unseen.',
    feed: [],
    gapBand: 'under-10',
  }),
  'line-only': output({
    label: 'Cash line move only',
    note: 'The line moved 1.5 points but no VIP crossed: a contest-level item and nothing else.',
    feed: [
      {
        ...lineMove,
        change: { points: { from: 211.5, to: 213.0 }, rank: { from: 1180, to: 1185 } },
      },
    ],
    gapBand: 'none',
  }),
  empty: output({
    label: 'Empty feed',
    note: 'First visit, a new slate, or nothing moved.',
    feed: [],
    gapBand: 'none',
  }),
  completed: output({
    label: 'Completed contest',
    note: 'State change reported once as High, then final standings only: no player-level items.',
    feed: completedFeed,
    gapBand: 'none',
    state: 'completed',
  }),
} satisfies Record<string, ShiftsOutput>

export type ScenarioKey = keyof typeof SCENARIOS

export const SCENARIO_KEYS = Object.keys(SCENARIOS) as ScenarioKey[]

export function vipFor(output: ShiftsOutput, key: string): SampleVip {
  return output.vips.find((vip) => vip.key === key) ?? { key, name: key, index: 0 }
}
