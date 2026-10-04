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

/**
 * The sport the home page opens on: the last-viewed sport if the snapshot still has it,
 * otherwise the first sport whose primary contest is live, otherwise the first sport.
 * Null only when the snapshot has no sports.
 */
export function chooseLandingSport(snapshot: Snapshot, lastViewed: string | null): string | null {
  const sports = Object.keys(snapshot.sports)

  if (lastViewed && sports.includes(lastViewed)) {
    return lastViewed
  }

  const live = sports.find((sport) => {
    const { primary_contest: configured, contests } = snapshot.sports[sport]
    return Boolean(configured) && resolvePrimaryContest(contests, configured!)?.state === 'live'
  })

  return live ?? sports[0] ?? null
}
