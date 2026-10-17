import { useState } from 'react'
import { Link, matchPath, Outlet, useLocation } from 'react-router-dom'
import { ShiftsProvider } from '../context/ShiftsProvider'
import { TopBarSlotContext } from '../context/TopBarSlotContext'
import { useLatest } from '../hooks/useLatest'
import { readLastViewedSport } from '../lib/landing'
import ShiftsBanner from './shifts/ShiftsBanner'
import ShiftsEntry from './shifts/ShiftsEntry'
import SportTabs, { type SportTab } from './SportTabs'
import UserMenu from './UserMenu'

/** The sport a /live/:sport, /sport/:sport or /shifts/:sport page is showing, if any. */
function sportFromPath(pathname: string): string | null {
  const match =
    matchPath('/live/:sport', pathname) ?? matchPath('/sport/:sport', pathname) ?? matchPath('/shifts/:sport', pathname)
  return match?.params.sport ?? null
}

function AppShell() {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const { pathname } = useLocation()
  const { snapshotQuery } = useLatest()

  const tabs: SportTab[] = Object.entries(snapshotQuery.data?.sports ?? {}).map(([sport, data]) => ({
    sport,
    status: data.status,
  }))
  const currentSport = sportFromPath(pathname)
  // The sport the Shifts feed follows and its entry point links to: the one on screen, else the last-viewed one.
  const shiftsSport = (currentSport ?? readLastViewedSport())?.toLowerCase() ?? null

  return (
    <ShiftsProvider sport={shiftsSport}>
      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-2 text-xs">
            <Link to="/" className="shrink-0 font-mono font-bold text-cashing">
              DK/LIVE
            </Link>
            <SportTabs tabs={tabs} currentSport={currentSport} />
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <div ref={setSlot} className="flex items-center gap-3 empty:hidden" />
              <ShiftsEntry sport={shiftsSport} />
              <UserMenu allContestsSport={currentSport ?? tabs[0]?.sport ?? null} />
            </div>
          </div>
        </header>
        <ShiftsBanner sport={shiftsSport} />
        <TopBarSlotContext.Provider value={slot}>
          <main className="flex-1">
            <Outlet />
          </main>
        </TopBarSlotContext.Provider>
      </div>
    </ShiftsProvider>
  )
}

export default AppShell
