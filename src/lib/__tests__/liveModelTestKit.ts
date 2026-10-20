// Exported by the dk_results producer; provenance in public/mock/PRODUCER_FIXTURE.md.
// cfb carries `metrics.threat`; mlb carries no `metrics` at all (the missing-metrics variant).
import producerSnapshot from '../../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import { buildLiveModel, type LiveModel } from '../liveModel'

export const VIP_KEY = '5067365318'
export const VIP_NAME = 'cglenn91'

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Json = any

export function load(): Json {
  return structuredClone(producerSnapshot)
}

export function contestOf(snapshot: Json, sport = 'cfb'): Json {
  return snapshot.sports[sport].contests[0]
}

export function addVip(snapshot: Json, sport = 'cfb', overrides: Json = {}): Json {
  const vip = {
    entry_key: VIP_KEY,
    display_name: VIP_NAME,
    players_live: [{ slot: 'QB', player_name: 'Ashton Daniels' }],
    ...overrides,
  }
  contestOf(snapshot, sport).vip_lineups = [vip]
  return vip
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function build(snapshot: unknown, sport = 'cfb') {
  return buildLiveModel(snapshot, sport)
}

export function modelOf(snapshot: unknown, sport = 'cfb'): LiveModel {
  const result = build(snapshot, sport)
  if (result.kind !== 'ready') throw new Error(`Expected a renderable model, got ${result.reason.kind}`)
  return result.model
}
