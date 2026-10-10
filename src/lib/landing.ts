import { resolvePrimaryContest } from './liveModel'
import type { Snapshot } from './types'

const LAST_SPORT_KEY = 'dk_dashboard_last_sport'

/** The sport last shown on Live, or null when nothing is remembered or storage is unavailable. */
export function readLastViewedSport(): string | null {
  try {
    return globalThis.localStorage.getItem(LAST_SPORT_KEY) || null
  } catch {
    return null
  }
}

export function writeLastViewedSport(sport: string): void {
  try {
    globalThis.localStorage.setItem(LAST_SPORT_KEY, sport)
  } catch {
    // Storage can be blocked (private windows, site data off); landing just falls back.
  }
}

/** The sport's primary contest, or null when none is configured or it is absent from the snapshot. */
function primaryContestOf(snapshot: Snapshot, sport: string) {
  const { primary_contest: configured, contests } = snapshot.sports[sport]
  return configured ? resolvePrimaryContest(contests, configured) : null
}

/**
 * The sport the home page opens on: the first sport whose primary contest is live, then the sport whose
 * primary contest completed most recently, then the last-viewed sport if the snapshot still has it, then
 * the first sport. Cancelled contests never count as completed. Null only when the snapshot has no sports.
 *
 * Known limitation: the feed has no completion timestamp, so "most recently completed" is ordered by the
 * contest's `start_time`. A contest that runs long can be mis-ordered against one that started later.
 * Switch to `completed_at` once the producer emits it (relomy/dk_results#210).
 */
export function chooseLandingSport(snapshot: Snapshot, lastViewed: string | null): string | null {
  const sports = Object.keys(snapshot.sports)

  const live = sports.find((sport) => primaryContestOf(snapshot, sport)?.state === 'live')
  if (live) return live

  let completed: string | null = null
  let completedStart = ''
  for (const sport of sports) {
    const contest = primaryContestOf(snapshot, sport)
    // ISO-8601 UTC timestamps compare correctly as strings; the first sport wins a tie.
    if (contest?.state === 'completed' && (completed === null || contest.start_time > completedStart)) {
      completed = sport
      completedStart = contest.start_time
    }
  }
  if (completed) return completed

  if (lastViewed && sports.includes(lastViewed)) return lastViewed

  return sports[0] ?? null
}
