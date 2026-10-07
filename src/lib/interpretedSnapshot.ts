import type { ContestMetrics, LiveMetrics, VipLineupRow } from './generated/snapshot'
import type { Contest, Snapshot, SportSnapshot } from './types'

/** Staged migration: strict producer sections, retaining the open pool/standings sections. */
export type LiveContest = Omit<Contest, 'vip_lineups' | 'metrics' | 'live_metrics'> & {
  vip_lineups: VipLineupRow[]
  metrics?: ContestMetrics
  live_metrics?: LiveMetrics
}
export type LiveSport = Omit<SportSnapshot, 'contests'> & { contests: LiveContest[] }
export type LiveSnapshot = Omit<Snapshot, 'sports'> & { sports: Record<string, LiveSport> }

interface Provenance { raw: unknown; origins: Map<string, string | null> }
const provenance = new WeakMap<object, Provenance>()
export function snapshotProvenance(snapshot: object): Provenance | undefined { return provenance.get(snapshot) }

/** Temporary public facade until the application-wide type migration (#61). */
export function interpretPublicSnapshot(raw: unknown): Snapshot {
  return interpretSnapshot(raw) as unknown as Snapshot
}

function numeric(value: unknown, strings = false): number | undefined {
  if (strings && typeof value === 'string' && value.trim()) value = Number(value)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** The sole compatibility boundary. Unsupported versions retain their version, never becoming v3. */
export function interpretSnapshot(raw: unknown): LiveSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid snapshot envelope')
  if (provenance.has(raw)) return raw as LiveSnapshot
  const snapshot = structuredClone(raw) as LiveSnapshot
  const origins = new Map<string, string | null>()
  if (snapshot.schema_version === 3) {
    if (!snapshot.sports || typeof snapshot.sports !== 'object') throw new Error('Invalid snapshot sports')
    for (const [sport, payload] of Object.entries(snapshot.sports)) {
      for (const [ci, contest] of (payload.contests ?? []).entries()) {
        for (const [vi, vip] of (contest.vip_lineups ?? []).entries()) {
          const row = vip as unknown as Record<string, unknown>
          const path = `sports.${sport}.contests[${ci}].vip_lineups[${vi}]`
          for (const field of ['points', 'rank', 'pmr']) {
            const source = field === 'points' && !Object.hasOwn(row, 'points') ? 'pts' : field
            const value = numeric(row[source], field !== 'points')
            origins.set(`${path}.${field}`, value === undefined ? null : `${path}.${source}`)
            if (value === undefined) delete row[field]
            else row[field] = value
          }
          delete row.pts
        }
      }
    }
  }
  provenance.set(snapshot, { raw, origins })
  return snapshot
}
