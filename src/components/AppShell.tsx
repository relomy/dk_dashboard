import { useState } from 'react'
import { Link, matchPath, Outlet, useLocation } from 'react-router-dom'
import { TopBarSlotContext } from '../context/TopBarSlotContext'
import { useLatest } from '../hooks/useLatest'
import SportTabs, { type SportTab } from './SportTabs'
import UserMenu from './UserMenu'

/** The sport a /live/:sport or /sport/:sport page is showing, if any. */
function sportFromPath(pathname: string): string | null {
  const match = matchPath('/live/:sport', pathname) ?? matchPath('/sport/:sport', pathname)
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

  return (
    <div className="app-shell flex flex-col">
      <header className="app-ui sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2 text-xs">
          <Link to="/latest" className="shrink-0 font-mono font-bold text-cashing">
            DK/LIVE
          </Link>
          <SportTabs tabs={tabs} currentSport={currentSport} />
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <div ref={setSlot} className="flex items-center gap-3 empty:hidden" />
            <UserMenu allContestsSport={currentSport ?? tabs[0]?.sport ?? null} />
          </div>
        </div>
      </header>
      <TopBarSlotContext.Provider value={slot}>
        <main className="legacy-surface flex-1">
          <Outlet />
        </main>
      </TopBarSlotContext.Provider>
    </div>
  )
}

export default AppShell
