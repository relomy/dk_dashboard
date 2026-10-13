import { useContext } from 'react'
import { ShiftsContext } from '../context/ShiftsContext'
import type { ShiftsFeed } from '../lib/shifts'

/** The Shifts feed, or null outside the app shell. */
export function useShiftsFeed(): ShiftsFeed | null {
  return useContext(ShiftsContext)
}
