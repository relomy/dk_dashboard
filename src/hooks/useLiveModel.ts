import { useMemo } from 'react'
import { buildLiveModel, type LiveModelResult } from '../lib/liveModel'

const built = new WeakMap<object, Map<string, LiveModelResult>>()

/**
 * The Live model for a snapshot and sport, built once per snapshot object. The Live route and the app shell's
 * Shifts recorder both ask for the same model, and a snapshot is never mutated, so they share one build.
 */
export function liveModelFor(snapshot: object, sportKey: string): LiveModelResult {
  let bySport = built.get(snapshot)
  if (!bySport) {
    bySport = new Map()
    built.set(snapshot, bySport)
  }
  let result = bySport.get(sportKey)
  if (!result) {
    result = buildLiveModel(snapshot, sportKey)
    bySport.set(sportKey, result)
  }
  return result
}

/** The Live model for the snapshot and sport, or null while either is missing. */
export function useLiveModel(snapshot: object | undefined, sportKey: string | null | undefined): LiveModelResult | null {
  return useMemo(() => (snapshot && sportKey ? liveModelFor(snapshot, sportKey) : null), [snapshot, sportKey])
}
