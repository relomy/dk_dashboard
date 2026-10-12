/* eslint-disable react-refresh/only-export-components */
/** PROTOTYPE (issue #81): throwaway, not for main. In-memory stand-in for the Shifts feed module. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  SCENARIOS,
  SCENARIO_KEYS,
  type FeedItem,
  type ScenarioKey,
  type ShiftsOutput,
} from './sampleOutputs'

export type SurfaceMode = 'render' | 'dismiss'

interface ShiftsProto {
  scenario: ScenarioKey
  setScenario: (key: ScenarioKey) => void
  /** The sample output, adjusted for what this session did (marked as seen, surfaced). */
  output: ShiftsOutput
  surfaceMode: SurfaceMode
  setSurfaceMode: (mode: SurfaceMode) => void
  /** Explicit call from the UI: these High items were shown. */
  markSurfaced: (ids: string[]) => void
  /** Explicit call from the UI: advance the Seen mark to now. */
  markSeen: () => void
  /** Bumped by "simulate reload" so the banner remounts and re-reads `unsurfacedHigh`. */
  reloadCount: number
  reload: () => void
  /** Visit signals the shell saw, newest first. */
  visits: string[]
}

const Context = createContext<ShiftsProto | null>(null)

function isScenario(value: string | null): value is ScenarioKey {
  return value !== null && (SCENARIO_KEYS as string[]).includes(value)
}

export function ShiftsProtoProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams()
  const raw = params.get('scenario')
  const scenario: ScenarioKey = isScenario(raw) ? raw : 'mid-slate'
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>('render')
  const [reloadCount, setReloadCount] = useState(0)
  const [visits, setVisits] = useState<string[]>([])
  // Session overrides, keyed by scenario so switching scenarios starts each one fresh.
  const [seen, setSeen] = useState<Partial<Record<ScenarioKey, true>>>({})
  const [surfaced, setSurfaced] = useState<Partial<Record<ScenarioKey, string[]>>>({})

  const setScenario = useCallback(
    (key: ScenarioKey) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('scenario', key)
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // Decision 4: the visit signal. The shell, not the page, listens, so a visit counts wherever the user lands.
  useEffect(() => {
    const note = (what: string) => setVisits((prev) => [`${new Date().toLocaleTimeString()} ${what}`, ...prev].slice(0, 4))
    note('page open')
    const onVisibility = () => {
      if (document.visibilityState === 'visible') note('tab visible')
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const output = useMemo<ShiftsOutput>(() => {
    const base = SCENARIOS[scenario]
    if (seen[scenario]) {
      return { ...base, feed: [], unseenCount: 0, unsurfacedHigh: [], returnedAfterGap: null }
    }
    const surfacedIds = new Set(surfaced[scenario] ?? [])
    const feed: FeedItem[] = base.feed.map((item) => (surfacedIds.has(item.id) ? { ...item, surfaced: true } : item))
    return {
      ...base,
      feed,
      unsurfacedHigh: feed.filter((item) => item.priority === 'high' && !item.surfaced),
    }
  }, [scenario, seen, surfaced])

  const markSurfaced = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return
      setSurfaced((prev) => ({ ...prev, [scenario]: [...new Set([...(prev[scenario] ?? []), ...ids])] }))
    },
    [scenario],
  )
  const markSeen = useCallback(() => setSeen((prev) => ({ ...prev, [scenario]: true })), [scenario])
  const reload = useCallback(() => setReloadCount((n) => n + 1), [])

  const value = useMemo<ShiftsProto>(
    () => ({ scenario, setScenario, output, surfaceMode, setSurfaceMode, markSurfaced, markSeen, reloadCount, reload, visits }),
    [scenario, setScenario, output, surfaceMode, markSurfaced, markSeen, reloadCount, reload, visits],
  )
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useShiftsProto(): ShiftsProto {
  const value = useContext(Context)
  if (!value) throw new Error('useShiftsProto needs ShiftsProtoProvider')
  return value
}
