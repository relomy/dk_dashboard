import { useState } from 'react'
import { Link, matchPath, Outlet, useLocation } from 'react-router-dom'
import { TopBarSlotContext } from '../context/TopBarSlotContext'
import { useLatest } from '../hooks/useLatest'
import { ShiftsProtoProvider, useShiftsProto } from '../prototype/shifts/ShiftsProtoContext'
import { PrototypeBar, ShiftsBadge, ShiftsBanner } from '../prototype/shifts/ShiftsUi'
import SportTabs, { type SportTab } from './SportTabs'
import UserMenu from './UserMenu'

/** The sport a /live/:sport or /sport/:sport page is showing, if any. */
function sportFromPath(pathname: string): string | null {
  const match = matchPath('/live/:sport', pathname) ?? matchPath('/sport/:sport', pathname)
  return match?.params.sport ?? null
}

function AppShellBody() {
  const { reloadCount } = useShiftsProto()
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const { pathname } = useLocation()
  const { snapshotQuery } = useLatest()

  const tabs: SportTab[] = Object.entries(snapshotQuery.data?.sports ?? {}).map(([sport, data]) => ({
    sport,
    status: data.status,
  }))
  const currentSport = sportFromPath(pathname)
  const shiftsSport = currentSport ?? sportFromPath(pathname.replace('/shifts/', '/live/')) ?? tabs[0]?.sport ?? 'nba'

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2 text-xs">
          <Link to="/" className="shrink-0 font-mono font-bold text-cashing">
            DK/LIVE
          </Link>
          <SportTabs tabs={tabs} currentSport={currentSport} />
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <div ref={setSlot} className="flex items-center gap-3 empty:hidden" />
            <ShiftsBadge sport={shiftsSport} />
            <UserMenu allContestsSport={currentSport ?? tabs[0]?.sport ?? null} />
          </div>
        </div>
      </header>
      <ShiftsBanner key={reloadCount} sport={shiftsSport} />
      <PrototypeBar onShiftsPage={pathname.startsWith('/shifts/')} />
      <TopBarSlotContext.Provider value={slot}>
        <main className="flex-1">
          <Outlet />
        </main>
      </TopBarSlotContext.Provider>
    </div>
  )
}

function AppShell() {
  return (
    <ShiftsProtoProvider>
      <AppShellBody />
    </ShiftsProtoProvider>
  )
}

export default AppShell
