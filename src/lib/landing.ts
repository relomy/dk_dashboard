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

/** Epoch milliseconds of an ISO-8601 timestamp; missing or unparseable values are the oldest possible. */
function startedAt(startTime: string | null | undefined): number {
  const parsed = startTime ? Date.parse(startTime) : Number.NaN
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed
}

/** The sport whose completed primary contest started last; the first sport wins a tie. Null when none completed. */
function findLatestCompletedSport(snapshot: Snapshot, sports: string[]): string | null {
  let latestSport: string | null = null
  let latestStart = Number.NEGATIVE_INFINITY
  for (const sport of sports) {
    const contest = primaryContestOf(snapshot, sport)
    if (contest?.state !== 'completed') continue
    const start = startedAt(contest.start_time)
    if (latestSport === null || start > latestStart) {
      latestSport = sport
      latestStart = start
    }
  }
  return latestSport
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

  const liveSport = sports.find((sport) => primaryContestOf(snapshot, sport)?.state === 'live')
  if (liveSport) return liveSport

  const latestCompletedSport = findLatestCompletedSport(snapshot, sports)
  if (latestCompletedSport) return latestCompletedSport

  if (lastViewed && sports.includes(lastViewed)) return lastViewed

  return sports[0] ?? null
}
