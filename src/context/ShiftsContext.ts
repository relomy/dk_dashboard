import { createContext } from 'react'
import type { ShiftsFeed } from '../lib/shifts'

/**
 * The Shifts feed the app shell records Live builds into; null outside the shell. The feed is a plain object
 * with no change notification yet: the UI tickets that read it decide how to re-render.
 */
export const ShiftsContext = createContext<ShiftsFeed | null>(null)
