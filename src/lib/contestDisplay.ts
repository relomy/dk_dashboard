import type { Contest, ContestState, VipLineup } from './types'
import { buildPerVipIndex, resolveVipMetricMatchKey } from './perVipKeys'

export const contestStates: ContestState[] = ['live', 'upcoming', 'completed', 'cancelled', 'unknown']

export function formatMoney(cents: number, currency: string, wholeDollars = false): string {
  const safeCents = Number.isFinite(cents) ? cents : 0
  const safeCurrency = currency || 'USD'

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: safeCurrency,
      ...(wholeDollars ? { maximumFractionDigits: 0 } : {}),
    }).format(safeCents / 100)
  } catch {
    return `$${(safeCents / 100).toFixed(0)}`
  }
}

export function groupContestsByState(contests: Contest[]): Record<ContestState, Contest[]> {
  const grouped: Record<ContestState, Contest[]> = {
    upcoming: [],
    live: [],
    completed: [],
    cancelled: [],
    unknown: [],
  }

  for (const contest of contests) {
    grouped[normalizeContestState(contest.state)].push(contest)
  }

  return grouped
}

export function formatContestState(state: ContestState): string {
  return state.charAt(0).toUpperCase() + state.slice(1)
}

export function normalizeContestState(state: Contest['state'] | null | undefined): ContestState {
  return contestStates.find((candidate) => candidate === state) ?? 'unknown'
}

export function getVipCashingStatus(
  contest: Contest,
  lineup: VipLineup,
): { label: string; positive: boolean } | null {
  const contestState = normalizeContestState(contest.state)
  if (contestState !== 'completed' && contestState !== 'live') {
    return null
  }

  const key = resolveVipMetricMatchKey(lineup)
  const standing = key ? buildPerVipIndex(contest.standings).get(key) : undefined
  const distance = key ? buildPerVipIndex(contest.metrics?.distance_to_cash?.per_vip ?? []).get(key) : undefined
  const isCashing = resolveVipCashing(distance, standing)
  if (isCashing === null) return null
  const payoutCents = standing?.payout_cents

  if (contestState === 'completed') {
    if (isCashing) {
      return { label: typeof payoutCents === 'number' && Number.isFinite(payoutCents) && payoutCents > 0
        ? `Cashed ${formatMoney(payoutCents, contest.currency, true)}` : 'Cashed', positive: true }
    }
    return { label: 'Not cashing', positive: false }
  }

  return { label: isCashing ? 'Cashing' : 'Outside cash', positive: isCashing }
}

/** Stable-key callers share the Live interpretation; absent evidence remains unavailable. */
export function resolveVipCashing(
  distance: { points_delta?: number; rank_delta?: number } | undefined,
  standing: Contest['standings'][number] | undefined,
): boolean | null {
  if (typeof distance?.points_delta === 'number' && Number.isFinite(distance.points_delta)) return distance.points_delta >= 0
  if (typeof distance?.rank_delta === 'number' && Number.isFinite(distance.rank_delta)) return distance.rank_delta >= 0
  if (typeof standing?.is_cashing === 'boolean') return standing.is_cashing
  if (typeof standing?.payout_cents === 'number' && Number.isFinite(standing.payout_cents)) return standing.payout_cents > 0
  return null
}
