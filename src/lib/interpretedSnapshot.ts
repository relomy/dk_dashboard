import type { Contest, Snapshot, SportSnapshot } from './types'

export type LiveContest = Contest
export type LiveSport = SportSnapshot
export type LiveSnapshot = Snapshot
/** Unsupported envelopes retain their raw fields without claiming a generated v3 shape. */
export interface UnsupportedSnapshot {
  schema_version: unknown
  snapshot_at?: unknown
  generated_at?: unknown
  sports?: unknown
}
export type InterpretedSnapshot = Snapshot | UnsupportedSnapshot
export function isSupportedSnapshot(snapshot: InterpretedSnapshot): snapshot is Snapshot {
  return snapshot.schema_version === 3
}

interface Provenance { raw: unknown; origins: Map<string, string | null> }
const provenance = new WeakMap<object, Provenance>()
export function snapshotProvenance(snapshot: object): Provenance | undefined { return provenance.get(snapshot) }

function numeric(value: unknown, strings = false): number | undefined {
  if (strings && typeof value === 'string' && value.trim()) value = Number(value)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** The sole compatibility boundary. Unsupported versions retain their version, never becoming v3. */
export function interpretSnapshot(raw: unknown): InterpretedSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid snapshot envelope')
  if (provenance.has(raw)) return raw as InterpretedSnapshot
  const envelope = structuredClone(raw) as UnsupportedSnapshot
  const origins = new Map<string, string | null>()
  if (envelope.schema_version !== 3) {
    provenance.set(envelope, { raw, origins })
    return envelope
  }
  // Only a supported envelope crosses the generated producer boundary.
  const snapshot = envelope as Snapshot
  {
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
