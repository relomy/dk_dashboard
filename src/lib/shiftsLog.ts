import { HIGH_LOG_CAP } from './shiftsConfig'
import type { Digest } from './shiftsDigest'
import { vipsByKey } from './shiftsDigest'
import { cashLineMoved, cashLineMoveOf, itemId, moveOf } from './shiftsMoves'
import type { CashLineMove, ContestShiftItem } from './shiftsTypes'
import type { ContestState } from './types'

/** A cash crossing in the High priority log. Later tickets add other entry kinds to this union. */
export interface CrossingEntry {
  id: string
  kind: 'crossing'
  seq: number
  vipKey: string
  direction: 'in' | 'out'
  at: number
  surfaced: boolean
  cause: CashLineMove | null
}

/** A contest state change to completed in the High priority log. */
export interface ContestStateEntry {
  id: string
  kind: 'contest-state'
  seq: number
  at: number
  surfaced: boolean
  from: ContestState
  to: ContestState
}

export type LogEntry = CrossingEntry | ContestStateEntry

export interface StoredState {
  contestKey: string
  seen: Digest
  last: Digest
  /** The High priority log, capped at `HIGH_LOG_CAP`. */
  log: LogEntry[]
}

function isDigest(value: unknown): value is Digest {
  if (typeof value !== 'object' || value === null) return false
  const digest = value as Record<string, unknown>
  return typeof digest.at === 'number' && typeof digest.contestKey === 'string' && Array.isArray(digest.vips)
}

function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  const common =
    typeof entry.id === 'string' &&
    typeof entry.seq === 'number' &&
    typeof entry.at === 'number' &&
    typeof entry.surfaced === 'boolean'
  if (entry.kind === 'contest-state') return common && typeof entry.from === 'string' && typeof entry.to === 'string'
  return (
    entry.kind === 'crossing' &&
    common &&
    typeof entry.vipKey === 'string' &&
    (entry.direction === 'in' || entry.direction === 'out')
  )
}

export function isStoredState(value: unknown): value is StoredState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  return (
    typeof state.contestKey === 'string' &&
    isDigest(state.seen) &&
    isDigest(state.last) &&
    Array.isArray(state.log) &&
    state.log.every(isLogEntry)
  )
}

type NewCrossing = Omit<CrossingEntry, 'seq' | 'id'>

/**
 * Cash crossings between two consecutive builds, for VIPs present on both sides. A cash line move in the same poll
 * is carried as the cause.
 */
export function detectCrossings(last: Digest, current: Digest): NewCrossing[] {
  // A flip in the poll that completes the contest still counts; from the next poll on only final standings are
  // compared, so a flip of cashing is reported there, not as a crossing.
  if (last.contestState === 'completed') return []
  const before = vipsByKey(last.vips)
  const move = cashLineMoveOf(last, current)
  const cause = cashLineMoved(move) ? move : null
  const crossings: NewCrossing[] = []
  const handledKeys = new Set<string>()
  for (const vip of current.vips) {
    const prior = before.get(vip.key)
    if (!prior || handledKeys.has(vip.key)) continue
    handledKeys.add(vip.key)
    if (prior.cashing === vip.cashing) continue
    crossings.push({
      kind: 'crossing',
      vipKey: vip.key,
      direction: vip.cashing ? 'in' : 'out',
      at: current.at,
      surfaced: false,
      cause,
    })
  }
  return crossings
}

type NewContestState = Omit<ContestStateEntry, 'seq' | 'id'>

/** The contest becoming completed between two consecutive builds, once. */
export function detectCompletion(last: Digest, current: Digest): NewContestState[] {
  if (last.contestState === 'completed' || current.contestState !== 'completed') return []
  return [{ kind: 'contest-state', at: current.at, surfaced: false, from: last.contestState, to: current.contestState }]
}

export function appendEntries(log: LogEntry[], newEntries: (NewCrossing | NewContestState)[]): LogEntry[] {
  let seq = log.reduce((max, entry) => Math.max(max, entry.seq), 0)
  const added = newEntries.map((entry): LogEntry => {
    seq += 1
    return entry.kind === 'crossing'
      ? { ...entry, seq, id: itemId('crossing', entry.vipKey, seq) }
      : { ...entry, seq, id: itemId('contest-state', seq) }
  })
  return [...log, ...added].slice(-HIGH_LOG_CAP)
}

/** The contest-level items for the log's state changes, oldest first. */
export function contestStateItems(log: LogEntry[], snapshotAt: string): ContestShiftItem[] {
  return log.flatMap((entry): ContestShiftItem[] =>
    entry.kind === 'contest-state'
      ? [
          {
            kind: 'contest-state',
            id: entry.id,
            priority: 'high',
            detectedAt: entry.at,
            snapshotAt,
            parts: ['contest-state'],
            surfaced: entry.surfaced,
            state: moveOf(entry.from, entry.to),
          },
        ]
      : [],
  )
}
