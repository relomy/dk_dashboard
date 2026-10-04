import { describe, expect, it } from 'vitest'
import { buildLiveModel, resolvePrimaryContest, type LiveModel } from '../liveModel'
import type { Contest, Snapshot } from '../types'

/**
 * The Live contract test (#37): build the Live model from real producer output and check
 * hand-written invariants on what the Live view would show.
 *
 * - Add an input: add a glob below. Every captured prod fixture in `public/mock/snapshots/`
 *   (provenance in public/mock/PRODUCER_FIXTURE.md) is already an input.
 * - Add an invariant: add an entry to INVARIANTS.
 */
const INPUTS: Record<string, unknown> = {
  ...import.meta.glob('../../../public/mock/snapshots/*.json', { eager: true, import: 'default' }),
}

interface ContractCase {
  input: string
  sport: string
  snapshot: Snapshot
  /** The feed's primary contest for this sport, as the model resolves it. */
  contest: Contest | null
}

/** Returns one message per violation; an empty list means the invariant holds. */
type Invariant = (model: LiveModel, contractCase: ContractCase) => string[]

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Every VIP in the feed has a card with a numeric rank, points and PMR (never "—"). */
const vipCardHasFigures: Invariant = (model, { contest }) => {
  const feedVips = contest?.vip_lineups ?? []
  const violations: string[] = []
  if (model.vips.length !== feedVips.length) {
    violations.push(`${feedVips.length} VIPs in the feed but ${model.vips.length} cards`)
  }
  for (const vip of model.vips) {
    for (const figure of ['rank', 'points', 'pmr'] as const) {
      if (!isFiniteNumber(vip[figure])) violations.push(`VIP ${vip.name}: ${figure} is ${String(vip[figure])}`)
    }
  }
  return violations
}

const INVARIANTS: Record<string, Invariant> = {
  'every VIP card has a numeric rank, points and PMR': vipCardHasFigures,
}

function casesOf(): ContractCase[] {
  return Object.entries(INPUTS).flatMap(([path, raw]) => {
    const snapshot = raw as Snapshot
    const input = path.split('/').pop() ?? path
    return Object.entries(snapshot.sports).map(([sport, sportSnapshot]) => ({
      input,
      sport,
      snapshot,
      contest: sportSnapshot.primary_contest
        ? resolvePrimaryContest(sportSnapshot.contests, sportSnapshot.primary_contest)
        : null,
    }))
  })
}

const CASES = casesOf()

it('has inputs to check', () => {
  expect(CASES.length).toBeGreaterThan(0)
})

describe.each(CASES)('Live contract: $input / $sport', (contractCase) => {
  function modelOf(): LiveModel {
    const result = buildLiveModel(contractCase.snapshot, contractCase.sport)
    if (result.kind !== 'ready') throw new Error(`Expected a renderable model, got ${result.reason.kind}`)
    return result.model
  }

  it('builds a renderable model', () => {
    expect(buildLiveModel(contractCase.snapshot, contractCase.sport).kind).toBe('ready')
  })

  it.each(Object.entries(INVARIANTS))('%s', (_name, invariant) => {
    expect(invariant(modelOf(), contractCase)).toEqual([])
  })
})
