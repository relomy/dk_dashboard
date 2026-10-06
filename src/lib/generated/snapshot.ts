/* eslint-disable */
/**
 * GENERATED FILE: do not edit. Run `npm run contract:sync` to regenerate it from
 * contract/snapshot.schema.json, the schema relomy/dk_results exports.
 */

export type GeneratedAt = string;
export type SchemaVersion = 3;
export type SnapshotAt = string;
export type ContestId = string;
export type ContestKey = string;
export type ContestType = string;
export type Currency = string;
export type EntryFeeCents = number;
export type AvgSalaryPerPlayerRemaining = number;
export type CutoffType = "rank" | "points" | "unknown";
export type PointsCutoff = number;
export type RankCutoff = number;
export type UpdatedAt = string;
export type MaxEntries = number;
export type MaxEntriesPerUser = number | null;
export type CutoffPoints = number;
/**
 * @minItems 1
 */
export type PerVip = [DistanceToCashVip, ...DistanceToCashVip[]];
export type DisplayName = string;
export type EntryKey = string;
export type PointsDelta = number;
export type RankDelta = number;
export type VipEntryKey = string;
export type AvgPmrRemaining = number;
/**
 * @maxItems 10
 */
export type TopRemainingPlayers =
  | []
  | [TopRemainingPlayer]
  | [TopRemainingPlayer, TopRemainingPlayer]
  | [TopRemainingPlayer, TopRemainingPlayer, TopRemainingPlayer]
  | [TopRemainingPlayer, TopRemainingPlayer, TopRemainingPlayer, TopRemainingPlayer]
  | [TopRemainingPlayer, TopRemainingPlayer, TopRemainingPlayer, TopRemainingPlayer, TopRemainingPlayer]
  | [
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer
    ]
  | [
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer
    ]
  | [
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer
    ]
  | [
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer
    ]
  | [
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer,
      TopRemainingPlayer
    ];
export type OwnershipRemainingPct = number;
export type PlayerName = string;
export type UsersNotCashing = number;
/**
 * @minItems 1
 */
export type PerVip1 = [OwnershipSummaryVip, ...OwnershipSummaryVip[]];
export type DisplayName1 = string;
export type EntryKey1 = string;
export type IsPartial = boolean;
export type OwnershipInPlayPct = number;
export type TotalOwnershipPct = number;
export type VipEntryKey1 = string;
export type Scope = "vip_lineup";
export type Source = "vip_lineup_players";
export type FieldRemainingIsPartial = boolean;
export type FieldRemainingPct = number;
export type FieldRemainingScope = "contest_field";
export type FieldRemainingSource = "contest_standings_mean";
export type LeverageSemantics = "positive=unique";
export type OwnershipRemainingPct1 = number;
export type PlayerKey = string;
export type PlayerName1 = string;
export type VipCount = number;
export type TopSwingPlayers = SwingPlayer[];
export type DisplayName2 = string;
export type EntryKey2 = string;
export type FieldRemainingPct1 = number;
export type IsPartial1 = boolean;
export type UniquenessDeltaPct = number;
export type VipEntryKey2 = string;
export type VipRemainingPct = number;
export type VipVsFieldLeverage = VipVsFieldLeverage1[];
export type UpdatedAt1 = string;
export type Name = string;
export type PositionsPaid = number;
export type PrizePoolCents = number;
export type Sport = string;
export type Standings = StandingsRow[];
export type StartTime = string;
export type State = string;
export type TrainClusters = TrainCluster[];
export type DisplayName3 = string;
export type EntryKey3 = string;
export type IsLive = boolean;
export type IsLocked = boolean;
export type PlayerKey1 = string;
export type PlayerName2 = string;
export type Salary = number;
export type Slot = string;
export type PlayersLive = VipLineupSlot[];
export type Pmr = number;
export type Points = number;
export type Rank = number;
export type VipEntryKey3 = string;
export type VipLineups = VipLineupRow[];
export type Contests = Contest[];
export type Players = SportPlayer[];
export type ContestId1 = string;
export type ContestKey1 = string;
export type SelectedAt = string;
export type Status = "ok" | "stale" | "error";
export type UpdatedAt2 = string;

/**
 * A schema-3 live snapshot, keyed by lowercase sport name.
 */
export interface SnapshotEnvelope {
  generated_at: GeneratedAt;
  schema_version: SchemaVersion;
  snapshot_at: SnapshotAt;
  sports: Sports;
}
export interface Sports {
  [k: string]: SportPayload;
}
/**
 * One sport's slice of the snapshot.
 */
export interface SportPayload {
  contests: Contests;
  players: Players;
  primary_contest: PrimaryContest;
  status: Status;
  updated_at: UpdatedAt2;
}
/**
 * One DraftKings contest with its standings, VIP lineups and metrics.
 */
export interface Contest {
  contest_id: ContestId;
  contest_key: ContestKey;
  contest_type: ContestType;
  currency: Currency;
  entry_fee_cents: EntryFeeCents;
  live_metrics?: LiveMetrics;
  max_entries: MaxEntries;
  max_entries_per_user: MaxEntriesPerUser;
  metrics?: ContestMetrics;
  name: Name;
  ownership_watchlist?: OwnershipWatchlist;
  positions_paid?: PositionsPaid;
  prize_pool_cents: PrizePoolCents;
  sport: Sport;
  standings: Standings;
  start_time: StartTime;
  state: State;
  train_clusters: TrainClusters;
  vip_lineups: VipLineups;
}
/**
 * The `contest.live_metrics` section: figures that move while the contest is live.
 */
export interface LiveMetrics {
  avg_salary_per_player_remaining?: AvgSalaryPerPlayerRemaining;
  cash_line?: CashLine;
  updated_at: UpdatedAt;
}
/**
 * Where the cash line sits: a rank, a points total, or both.
 */
export interface CashLine {
  cutoff_type: CutoffType;
  points_cutoff?: PointsCutoff;
  rank_cutoff?: RankCutoff;
}
/**
 * The `contest.metrics` section (derived contest metrics).
 */
export interface ContestMetrics {
  distance_to_cash?: DistanceToCash;
  non_cashing?: NonCashing;
  ownership_summary?: OwnershipSummary;
  threat?: Threat;
  updated_at: UpdatedAt1;
}
/**
 * Per-VIP distance to the cash line; present only when some VIP can be measured.
 */
export interface DistanceToCash {
  cutoff_points?: CutoffPoints;
  per_vip: PerVip;
}
/**
 * How far one tracked VIP is from the cash line.
 */
export interface DistanceToCashVip {
  display_name?: DisplayName;
  entry_key?: EntryKey;
  points_delta: PointsDelta;
  rank_delta?: RankDelta;
  vip_entry_key?: VipEntryKey;
}
/**
 * The tally of users below the cash line.
 *
 * `top_remaining_players` is only emitted for sports that tally it (not MLB, not golf).
 */
export interface NonCashing {
  avg_pmr_remaining: AvgPmrRemaining;
  top_remaining_players?: TopRemainingPlayers;
  users_not_cashing: UsersNotCashing;
}
/**
 * A player still to play on non-cashing lineups.
 */
export interface TopRemainingPlayer {
  ownership_remaining_pct: OwnershipRemainingPct;
  player_name: PlayerName;
}
/**
 * Ownership summary over the tracked VIP lineups.
 */
export interface OwnershipSummary {
  per_vip: PerVip1;
  scope: Scope;
  source: Source;
}
/**
 * Ownership totals for one tracked VIP lineup.
 */
export interface OwnershipSummaryVip {
  display_name?: DisplayName1;
  entry_key?: EntryKey1;
  is_partial: IsPartial;
  ownership_in_play_pct?: OwnershipInPlayPct;
  total_ownership_pct: TotalOwnershipPct;
  vip_entry_key: VipEntryKey1;
}
/**
 * Threat metrics: swing players plus the field-remaining group (absent for sports with no Game status).
 */
export interface Threat {
  field_remaining_is_partial?: FieldRemainingIsPartial;
  field_remaining_pct?: FieldRemainingPct;
  field_remaining_scope?: FieldRemainingScope;
  field_remaining_source?: FieldRemainingSource;
  leverage_semantics?: LeverageSemantics;
  top_swing_players?: TopSwingPlayers;
  vip_vs_field_leverage?: VipVsFieldLeverage;
}
/**
 * A player whose result can swing VIPs against the field.
 */
export interface SwingPlayer {
  ownership_remaining_pct?: OwnershipRemainingPct1;
  player_key: PlayerKey;
  player_name: PlayerName1;
  vip_count: VipCount;
}
/**
 * One VIP's remaining ownership against the contest field's.
 */
export interface VipVsFieldLeverage1 {
  display_name: DisplayName2;
  entry_key: EntryKey2;
  field_remaining_pct: FieldRemainingPct1;
  is_partial: IsPartial1;
  uniqueness_delta_pct: UniquenessDeltaPct;
  vip_entry_key: VipEntryKey2;
  vip_remaining_pct: VipRemainingPct;
}
/**
 * The `contest.ownership_watchlist` section.
 */
export interface OwnershipWatchlist {
  [k: string]: unknown;
}
/**
 * One row of `contest.standings`.
 */
export interface StandingsRow {
  [k: string]: unknown;
}
/**
 * One cluster of identical lineups in `contest.train_clusters`.
 */
export interface TrainCluster {
  [k: string]: unknown;
}
/**
 * One tracked VIP's lineup in `contest.vip_lineups`.
 *
 * Every field is omitted when the source cannot supply it; none is ever null.
 */
export interface VipLineupRow {
  display_name?: DisplayName3;
  entry_key?: EntryKey3;
  players_live?: PlayersLive;
  pmr?: Pmr;
  points?: Points;
  rank?: Rank;
  vip_entry_key?: VipEntryKey3;
}
/**
 * One roster slot in a VIP's `players_live`.
 *
 * A revealed player carries `player_key` when resolvable, `salary` when known
 * and `is_live`. A locked slot (a player DraftKings has not revealed) is
 * `{slot, player_name: "LOCKED 🔒", is_locked: true}` and carries none of those.
 */
export interface VipLineupSlot {
  is_live?: IsLive;
  is_locked?: IsLocked;
  player_key?: PlayerKey1;
  player_name: PlayerName2;
  salary?: Salary;
  slot: Slot;
}
/**
 * One row of a sport payload's `players`.
 *
 * Not typed field by field yet, but a `name` it carries has no leading or trailing whitespace.
 */
export interface SportPlayer {
  [k: string]: unknown;
}
/**
 * The contest the sport payload is built around.
 */
export interface PrimaryContest {
  contest_id: ContestId1;
  contest_key: ContestKey1;
  selected_at: SelectedAt;
  selection_reason: SelectionReason;
}
/**
 * Why the primary contest was selected.
 */
export interface SelectionReason {
  [k: string]: unknown;
}
