import { useEffect } from 'react'
import { writeLastViewedSport } from '../lib/landing'

/** Remembers the sport Live is showing so the home page can reopen it. */
export function useRememberSport(sport: string | undefined): void {
  useEffect(() => {
    if (sport) writeLastViewedSport(sport)
  }, [sport])
}
