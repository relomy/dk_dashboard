import { describe, expect, it } from 'vitest'
import snapshot from '../../test/fixtures/nfl-live-2026-10-04T20-41-34Z.json'
import { buildLiveModel } from '../liveModel'
import type { Snapshot } from '../types'

function modelOf(raw: unknown = snapshot) {
  const result = buildLiveModel(raw as Snapshot, 'nfl')
  if (result.kind !== 'ready') throw new Error('Expected NFL live model')
  return result.model
}

describe('production NFL VIP summaries', () => {
  it('reads rank, pts and PMR for every VIP, including those outside the capped standings', () => {
    const model = modelOf()
    expect(model.vips.map(v => [v.name, v.rank, v.points, v.pmr])).toEqual([
      ['EmpireMaker2', 571, 54.48, 153.15001],
      ['cglenn91', 859, 52.88, 200.04001],
      ['tuck8989', 945, 48.780003, 191.70001],
      ['Mcoleman1902', 440, 60.480003, 145.52],
      ['Cubbiesftw23', 1041, 36.18, 191.70001],
      ['Aj_cray', 859, 52.88, 200.04001],
    ])
  })

  it('reads remaining ownership from per-VIP field leverage, including VIPs outside standings', () => {
    expect(modelOf().vips.map(v => v.ownershipRemainingPct)).toEqual([14.62, 109.6, 223.59, 96.04, 152.55, 180.64])
  })

  it('does not match leverage on display name or show a partial value as complete', () => {
    const raw = structuredClone(snapshot)
    const leverage = raw.sports.nfl.contests[0].metrics.threat.vip_vs_field_leverage
    leverage[0].entry_key = 'another-entry'
    leverage[0].vip_entry_key = 'another-entry'
    expect(modelOf(raw).vips[0].ownershipRemainingPct).toBeNull()
    leverage[0].entry_key = snapshot.sports.nfl.contests[0].vip_lineups[0].entry_key
    leverage[0].vip_entry_key = leverage[0].entry_key
    leverage[0].is_partial = true
    expect(modelOf(raw).vips[0].ownershipRemainingPct).toBeNull()
  })

  it('rejects invalid summary strings and keeps numeric zero', () => {
    const raw = structuredClone(snapshot)
    const vip = raw.sports.nfl.contests[0].vip_lineups[0]
    vip.rank = ''
    vip.pmr = 'unknown'
    vip.pts = 0
    expect(modelOf(raw).vips[0]).toMatchObject({ rank: null, pmr: null, points: 0 })
  })
})
