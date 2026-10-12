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

/** One player behind a VIP's move. `pointsDelta` is the player's own points; null for a still-hidden slot. */
export interface Contributor {
  playerKey: string
  name: string
  slot: string
  pointsDelta: number | null
  /** The slot was locked at the Seen mark and is now unlocked. */
  revealed: boolean
  /** The player's game went final since the Seen mark. */
  gameFinal: boolean
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
  /** Ranked by absolute points delta; reveals with no points sort last. */
  contributors: Contributor[]
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
  contributors: [
    { playerKey: 'p-1', name: 'Jalen Brunson', slot: 'PG', pointsDelta: 21.5, revealed: false, gameFinal: true, stats: '31 PTS, 8 AST, 4 REB' },
    { playerKey: 'p-2', name: 'Domantas Sabonis', slot: 'C', pointsDelta: 9.25, revealed: false, gameFinal: false, stats: null },
    { playerKey: 'p-3', name: 'Lauri Markkanen', slot: 'F', pointsDelta: 4.0, revealed: true, gameFinal: false, stats: '9 PTS, 3 REB' },
    { playerKey: 'p-4', name: 'Locked', slot: 'UTIL', pointsDelta: null, revealed: false, gameFinal: false, stats: null },
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
  contributors: [
    { playerKey: 'p-5', name: 'Tyrese Maxey', slot: 'SG', pointsDelta: -2.5, revealed: false, gameFinal: false, stats: null },
    { playerKey: 'p-6', name: 'Rudy Gobert', slot: 'C', pointsDelta: 7.0, revealed: false, gameFinal: true, stats: '11 PTS, 14 REB' },
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
    contest: { name: '$100K NBA Showdown', state, sport: 'nba' },
    vips: VIPS,
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
