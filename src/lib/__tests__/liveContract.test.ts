import { describe, expect, it } from 'vitest'
import { INVARIANTS, contractCasesOf, type ContractCase } from '../liveInvariants'
import { buildLiveModel, type LiveModel } from '../liveModel'
import { LIVE_UNREAD_ALLOWLIST, liveUnreadPaths } from '../liveUnreadPaths'
import type { Snapshot } from '../types'
import { staleAllowlistEntries, unallowlistedPaths } from '../unreadPaths'

/**
 * The Live contract test (#37): build the Live model from real producer output and check
 * hand-written invariants on what the Live view would show.
 *
 * - Add an input: add a glob below. Every captured prod fixture in `public/mock/snapshots/`
 *   (provenance in public/mock/PRODUCER_FIXTURE.md) is already an input.
 * - Add an invariant: add an entry to INVARIANTS in src/lib/liveInvariants.ts (shared with the prod check).
 * - Every field an input emits must be read by the Live model or listed, with its reason, in
 *   src/lib/liveUnreadAllowlist.json (the unread-field detector, src/lib/unreadPaths.ts).
 */
const INPUTS: Record<string, unknown> = {
  ...import.meta.glob('../../../public/mock/snapshots/*.json', { eager: true, import: 'default' }),
}

function casesOf(): ContractCase[] {
  return Object.entries(INPUTS).flatMap(([path, raw]) => contractCasesOf(path.split('/').pop() ?? path, raw as Snapshot))
}

const CASES = casesOf()

it('has inputs to check', () => {
  expect(CASES.length).toBeGreaterThan(0)
})

it('allowlists only fields some input still emits and the Live model leaves unread', () => {
  const unread = CASES.map(({ snapshot, sport }) => liveUnreadPaths(snapshot, sport))
  expect(staleAllowlistEntries(unread, LIVE_UNREAD_ALLOWLIST)).toEqual([])
})

function modelOf(contractCase: ContractCase): LiveModel {
  const result = buildLiveModel(contractCase.snapshot, contractCase.sport)
  if (result.kind !== 'ready') throw new Error(`Expected a renderable model, got ${result.reason.kind}`)
  return result.model
}

describe('the invariants catch a broken model', () => {
  // The NFL mid-slate fixture: six VIPs below the standings cut, each with a leverage row.
  const nfl = CASES.find(({ input, sport }) => input === 'live-2026-10-04T18-41-34Z.json' && sport === 'nfl')

  it('flags a VIP with a leverage row whose card has no ownership remaining', () => {
    if (!nfl) throw new Error('Expected the NFL mid-slate fixture among the inputs')
    const model = modelOf(nfl)
    model.vips[0].ownershipRemainingPct = null

    expect(INVARIANTS['every VIP with a source for ownership remaining shows one'](model, nfl)).toEqual([
      'VIP cglenn91: ownership remaining is null',
    ])
  })
})

describe.each(CASES)('Live contract: $input / $sport', (contractCase) => {
  it('builds a renderable model', () => {
    expect(buildLiveModel(contractCase.snapshot, contractCase.sport).kind).toBe('ready')
  })

  it.each(Object.entries(INVARIANTS))('%s', (_name, invariant) => {
    expect(invariant(modelOf(contractCase), contractCase)).toEqual([])
  })

  it('reads every field the feed emits, or allowlists it', () => {
    const unread = liveUnreadPaths(contractCase.snapshot, contractCase.sport)
    expect(unallowlistedPaths(unread, LIVE_UNREAD_ALLOWLIST)).toEqual([])
  })
})
