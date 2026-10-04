import type { Contest, ContestState, VipLineup } from './types'

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
    const state = contest.state && contest.state in grouped ? contest.state : 'unknown'
    grouped[state as ContestState].push(contest)
  }

  return grouped
}

export function formatContestState(state: ContestState): string {
  return state.charAt(0).toUpperCase() + state.slice(1)
}

export function normalizeContestState(state: Contest['state'] | null | undefined): ContestState {
  return state && contestStates.includes(state) ? state : 'unknown'
}

export function getVipCashingStatus(
  contestState: ContestState,
  lineup: VipLineup,
  currency: string,
): { label: string; positive: boolean } | null {
  if (contestState !== 'completed' && contestState !== 'live') {
    return null
  }

  const payoutCents = lineup.payout_cents ?? lineup.live?.payout_cents
  const isCashing = typeof payoutCents === 'number' && payoutCents > 0

  if (contestState === 'completed') {
    if (isCashing) {
      return { label: `Cashed ${formatMoney(payoutCents, currency, true)}`, positive: true }
    }
    return { label: 'Not cashing', positive: false }
  }

  return { label: isCashing ? 'Cashing' : 'Outside cash', positive: isCashing }
}
