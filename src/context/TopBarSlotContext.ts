import { createContext } from 'react'

/** The DOM element inside the top bar that routes can render into, or null before the bar mounts. */
export const TopBarSlotContext = createContext<HTMLElement | null>(null)
