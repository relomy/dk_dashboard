import { LOCKED_SLOT_DETAIL, resolvePrimaryContest, type LiveModel, type LiveVip } from './liveModel'
import { haveOrFade } from './livePresentation'
import { buildPerVipIndex, resolveVipMetricMatchKey } from './perVipKeys'
import type { Contest, Snapshot, VipLineup } from './types'

/**
 * The Live contract's invariants (#37): hand-written checks on what the Live view would show for one
 * sport of a real producer snapshot. One definition shared by the contract suite
 * (src/lib/__tests__/liveContract.test.ts) and the prod check (npm run prod:check).
 *
 * Add an invariant: add an entry to INVARIANTS.
 */

export interface ContractCase {
  /** The fixture file or snapshot key the snapshot came from. */
  input: string
  sport: string
  snapshot: Snapshot
  /** The feed's primary contest for this sport, as the model resolves it. */
  contest: Contest | null
}

/** Returns one message per violation; an empty list means the invariant holds. */
export type Invariant = (model: LiveModel, contractCase: ContractCase) => string[]

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

/** Each feed VIP lineup with its index and the model's card for it: the cards follow the feed's VIP order. */
function feedVips(model: LiveModel, contest: Contest | null): Array<{ lineup: VipLineup; index: number; vip: LiveVip | undefined }> {
  return (contest?.vip_lineups ?? []).map((lineup, index) => ({ lineup, index, vip: model.vips[index] }))
}

/** The model's VIP card for each feed lineup, keyed the way the producer keys per-VIP metrics. */
function vipsByMetricKey(model: LiveModel, contest: Contest | null): Map<string, LiveVip> {
  const vips = new Map<string, LiveVip>()
  for (const { lineup, vip } of feedVips(model, contest)) {
    const key = resolveVipMetricMatchKey(lineup)
    if (key && vip) vips.set(key, vip)
  }
  return vips
}

/**
 * Every `vip_vs_field_leverage` row gives its VIP an available leverage row carrying its uniqueness delta
 * and partial flag, and the field figure is the threat metrics' own, captioned by its scope.
 */
const leverageRowsAreRead: Invariant = (model, { contest }) => {
  const threat = contest?.metrics?.threat
  const vips = vipsByMetricKey(model, contest)
  const violations: string[] = []
  for (const row of threat?.vip_vs_field_leverage ?? []) {
    const key = resolveVipMetricMatchKey(row)
    const vip = key ? vips.get(key) : undefined
    if (!vip) {
      violations.push(`leverage row ${String(key)} has no VIP card`)
      continue
    }
    const leverage = vip.leverage
    if (leverage.availability !== 'available') {
      violations.push(`VIP ${vip.name}: leverage is ${leverage.availability}`)
      continue
    }
    if (leverage.data.uniquenessDeltaPct !== (row.uniqueness_delta_pct ?? null)) {
      violations.push(`VIP ${vip.name}: uniqueness delta ${String(leverage.data.uniquenessDeltaPct)}, feed ${String(row.uniqueness_delta_pct)}`)
    }
    if (leverage.data.partial !== (row.is_partial === true)) {
      violations.push(`VIP ${vip.name}: partial ${String(leverage.data.partial)}, feed ${String(row.is_partial)}`)
    }
  }
  if (isFiniteNumber(threat?.field_remaining_pct)) {
    const field = model.fieldOwnershipRemaining
    if (field?.pct !== threat?.field_remaining_pct) {
      violations.push(`field remaining ${String(field?.pct)}, threat metrics ${String(threat?.field_remaining_pct)}`)
    }
    if (field?.scope !== threat?.field_remaining_scope) {
      violations.push(`field remaining scope ${String(field?.scope)}, feed ${String(threat?.field_remaining_scope)}`)
    }
  }
  return violations
}

/**
 * A VIP whose feed gives their ownership remaining (their standings row's total, or their leverage row's VIP
 * figure) shows a numeric ownership remaining on their card.
 */
const vipOwnershipRemainingIsShown: Invariant = (model, { contest }) => {
  const standings = Array.isArray(contest?.standings) ? contest.standings : []
  const standingsByKey = buildPerVipIndex(standings)
  const leverageByKey = buildPerVipIndex(contest?.metrics?.threat?.vip_vs_field_leverage ?? [])
  const violations: string[] = []
  for (const { lineup, vip } of feedVips(model, contest)) {
    const key = resolveVipMetricMatchKey(lineup)
    if (!key) continue
    const hasSource =
      isFiniteNumber(standingsByKey.get(key)?.ownership_remaining_total_pct) ||
      isFiniteNumber(leverageByKey.get(key)?.vip_remaining_pct)
    const own = vip?.ownershipRemainingPct
    if (hasSource && !isFiniteNumber(own)) violations.push(`VIP ${lineup.display_name}: ownership remaining is ${String(own)}`)
  }
  return violations
}

/** A VIP whose feed lineup rosters a swing player (same `player_key`) sees that swing player marked HAVE. */
const rosteredSwingPlayersAreHave: Invariant = (model, { contest }) => {
  if (model.threat.availability !== 'available') return []
  const swingPlayers = model.threat.data.swingPlayers
  const feedSwings = contest?.metrics?.threat?.top_swing_players ?? []
  const violations: string[] = []
  for (const { lineup, vip } of feedVips(model, contest)) {
    const rosteredKeys = new Set((lineup.players_live ?? []).flatMap((row) => (row.player_key ? [row.player_key] : [])))
    for (const [swingIndex, swing] of feedSwings.entries()) {
      if (!swing.player_key || !rosteredKeys.has(swing.player_key)) continue
      const modelSwing = swingPlayers[swingIndex]
      const mark = vip && modelSwing ? haveOrFade(vip.players, modelSwing) : null
      if (mark !== 'have') violations.push(`VIP ${lineup.display_name}: ${swing.player_name} is ${String(mark)}`)
    }
  }
  return violations
}

/** A pool player a VIP rosters (same `player_key`) lists that VIP in the player table. */
const poolPlayersListTheirVips: Invariant = (model, { contest }) => {
  const poolByKey = new Map(model.pool.map((row) => [row.key, row]))
  const violations: string[] = []
  for (const { lineup, index } of feedVips(model, contest)) {
    for (const row of lineup.players_live ?? []) {
      const pooled = row.player_key ? poolByKey.get(row.player_key) : undefined
      if (pooled && !pooled.vipIndexes.includes(index)) {
        violations.push(`${pooled.name} does not list VIP ${lineup.display_name}`)
      }
    }
  }
  return violations
}

/** A locked VIP slot renders as locked, with every player detail empty: nothing is taken from the player pool. */
const lockedSlotsRenderLocked: Invariant = (model, { contest }) => {
  const violations: string[] = []
  for (const { lineup, vip } of feedVips(model, contest)) {
    for (const [slotIndex, row] of (lineup.players_live ?? []).entries()) {
      if (!row.is_locked) continue
      const player = vip?.players[slotIndex]
      const where = `VIP ${lineup.display_name} slot ${slotIndex} (${String(row.slot)})`
      if (player?.locked !== true) {
        violations.push(`${where}: locked is ${String(player?.locked)}`)
        continue
      }
      for (const [field, empty] of Object.entries(LOCKED_SLOT_DETAIL)) {
        const detail = player[field as keyof typeof LOCKED_SLOT_DETAIL]
        if (detail !== empty) violations.push(`${where}: ${field} is ${String(detail)}`)
      }
    }
  }
  return violations
}

export const INVARIANTS: Record<string, Invariant> = {
  'every VIP card has a numeric rank, points and PMR': vipCardHasFigures,
  'every leverage row becomes an available model leverage row': leverageRowsAreRead,
  'every VIP with a source for ownership remaining shows one': vipOwnershipRemainingIsShown,
  'a VIP rostering a swing player is marked HAVE for it': rosteredSwingPlayersAreHave,
  'every pool player a VIP rosters lists that VIP': poolPlayersListTheirVips,
  'locked VIP slots render as locked, with no pool lookup': lockedSlotsRenderLocked,
}

/** The contract cases of one snapshot, named by its fixture file or snapshot key: one per sport it carries. */
export function contractCasesOf(sourceName: string, snapshot: Snapshot): ContractCase[] {
  return Object.entries(snapshot.sports).map(([sport, sportSnapshot]) => ({
    input: sourceName,
    sport,
    snapshot,
    contest: sportSnapshot.primary_contest
      ? resolvePrimaryContest(sportSnapshot.contests, sportSnapshot.primary_contest)
      : null,
  }))
}
