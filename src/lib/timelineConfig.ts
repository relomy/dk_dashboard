/**
 * The Timeline's sizes, in one place so tuning them against real snapshots is a one-line change. All counts are
 * snapshots. Later tickets read the page size for "Load more" and the cap.
 */

/** Snapshots loaded when the Timeline opens: 5 snapshots give 4 Steps, as the oldest Step needs the one before it. */
export const TIMELINE_OPEN_SNAPSHOTS = 5

/** Snapshots a "Load more" goes further back. */
export const TIMELINE_LOAD_MORE_SNAPSHOTS = 10

/** Snapshots the Timeline holds before the oldest Steps drop off the bottom. */
export const TIMELINE_CAP = 60

/** The most snapshot fetches in flight at once. */
export const TIMELINE_FETCH_BOUND = 4
