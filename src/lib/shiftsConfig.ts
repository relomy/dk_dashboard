// --- Thresholds -------------------------------------------------------------------------------------------------
// A tuned-by-feel starting point, to be adjusted against real snapshots. A move smaller than its threshold is
// ignored. All figures are net moves between the Seen mark and the current Live model.
/** VIP rank, in places. */
export const VIP_RANK_THRESHOLD = 2
/** VIP points. */
export const VIP_POINTS_THRESHOLD = 1.0
/** Distance to cash, in points; a VIP shifts when either this or the rank threshold is met. */
export const DISTANCE_TO_CASH_POINTS_THRESHOLD = 1.0
/** Distance to cash, in ranks. */
export const DISTANCE_TO_CASH_RANK_THRESHOLD = 2
/** The cash line, in points; the line moves when either this or the rank threshold is met. */
export const CASH_LINE_POINTS_THRESHOLD = 1.0
/** The cash line, in ranks. */
export const CASH_LINE_RANK_THRESHOLD = 2
/** The High priority log keeps at most this many entries; the oldest are dropped first. */
export const HIGH_LOG_CAP = 50
/** A visit after an absence shorter than this advances the Seen mark silently, in milliseconds. */
export const AUTO_ADVANCE_MS = 10 * 60_000
/** A visit after an absence of at least this long sets the away summary (when something is unseen). */
export const SUMMARY_MS = 30 * 60_000
// ----------------------------------------------------------------------------------------------------------------
