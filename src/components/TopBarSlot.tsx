import { useContext, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { TopBarSlotContext } from '../context/TopBarSlotContext'

/**
 * Renders its children inside the app shell's top bar, to the left of the user
 * menu. A route renders <TopBarSlot> while it is mounted and the content leaves
 * the bar when the route unmounts. Renders nothing outside the shell.
 */
function TopBarSlot({ children }: { children: ReactNode }) {
  const slot = useContext(TopBarSlotContext)
  return slot ? createPortal(children, slot) : null
}

export default TopBarSlot
