import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useLatest } from '../hooks/useLatest'
import { useLiveModel } from '../hooks/useLiveModel'
import { readLastViewedSport } from '../lib/landing'
import type { LiveModel } from '../lib/liveModel'
import { createShiftsFeed } from '../lib/shifts'
import { ShiftsContext } from './ShiftsContext'

/** How long a returning tab waits for a fresh build before the model it already shows counts as the visit. */
export const VISIT_SETTLE_MS = 3000

/**
 * The Shifts feed is owner-only while it has no UI: for anyone else this renders the children untouched, with no
 * feed, no model build and no storage access, so nothing about it is observable.
 */
export function ShiftsProvider({ sport, children }: { sport: string | null; children: ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'owner') return <ShiftsContext.Provider value={null}>{children}</ShiftsContext.Provider>
  return <OwnerShiftsProvider sport={sport}>{children}</OwnerShiftsProvider>
}

/**
 * Owns the Shifts feed and records each Live model build for the sport being viewed (or the last-viewed sport
 * on pages without one), once per build. The page opening and the tab returning to visible are visits; polls
 * are not. A visit rides on the next build, since that is the data the user returns to; if none arrives within
 * `VISIT_SETTLE_MS` the current model is recorded as the visit. Nothing here renders anything.
 */
function OwnerShiftsProvider({ sport, children }: { sport: string | null; children: ReactNode }) {
  const [feed] = useState(() => createShiftsFeed())
  const { snapshotQuery } = useLatest()
  const sportKey = sport?.toLowerCase() ?? readLastViewedSport()?.toLowerCase() ?? null
  const result = useLiveModel(snapshotQuery.data, sportKey)
  const model = result?.kind === 'ready' ? result.model : null

  const recordedModel = useRef<LiveModel | null>(null)
  const latestModel = useRef<LiveModel | null>(null)
  const visitPending = useRef(true)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    latestModel.current = model
    if (!model || recordedModel.current === model) return
    recordedModel.current = model
    clearTimeout(settleTimer.current)
    const visit = visitPending.current
    visitPending.current = false
    feed.record(model, { visit })
  }, [model, feed])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      visitPending.current = true
      clearTimeout(settleTimer.current)
      settleTimer.current = setTimeout(() => {
        const latest = latestModel.current
        if (!visitPending.current || !latest || recordedModel.current !== latest) return
        visitPending.current = false
        feed.record(latest, { visit: true })
      }, VISIT_SETTLE_MS)
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      clearTimeout(settleTimer.current)
    }
  }, [feed])

  return <ShiftsContext.Provider value={feed}>{children}</ShiftsContext.Provider>
}
