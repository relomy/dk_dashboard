import { resolvePrimaryContest, type LiveModel, type LiveVip } from './liveModel'
import { haveOrFade } from './livePresentation'
import { resolveVipMetricMatchKey } from './perVipKeys'
import type { Contest, Snapshot } from './types'

/**
 * The Live contract's invariants (#37): hand-written checks on what the Live view would show for one
 * sport of a real producer snapshot. One definition shared by the contract suite
 * (src/lib/__tests__/liveContract.test.ts) and the prod check (npm run prod:check).
 *
 * Add an invariant: add an entry to INVARIANTS.
 */

export interface ContractCase {
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

/** The model's VIP card for each feed lineup, keyed the way the producer keys per-VIP metrics. */
function vipsByMetricKey(model: LiveModel, contest: Contest | null): Map<string, LiveVip> {
  const vips = new Map<string, LiveVip>()
  contest?.vip_lineups.forEach((lineup, index) => {
    const key = resolveVipMetricMatchKey(lineup)
    const vip = model.vips[index]
    if (key && vip) vips.set(key, vip)
  })
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

/** A VIP whose feed lineup rosters a swing player (same `player_key`) sees that swing player marked HAVE. */
const rosteredSwingPlayersAreHave: Invariant = (model, { contest }) => {
  if (model.threat.availability !== 'available') return []
  const swingPlayers = model.threat.data.swingPlayers
  const violations: string[] = []
  contest?.vip_lineups.forEach((lineup, index) => {
    const vip = model.vips[index]
    const rosteredKeys = new Set((lineup.players_live ?? []).flatMap((row) => (row.player_key ? [row.player_key] : [])))
    for (const [swingIndex, swing] of (contest.metrics?.threat?.top_swing_players ?? []).entries()) {
      if (!swing.player_key || !rosteredKeys.has(swing.player_key)) continue
      const modelSwing = swingPlayers[swingIndex]
      const mark = vip && modelSwing ? haveOrFade(vip.players, modelSwing) : null
      if (mark !== 'have') violations.push(`VIP ${lineup.display_name}: ${swing.player_name} is ${String(mark)}`)
    }
  })
  return violations
}

/** A pool player a VIP rosters (same `player_key`) lists that VIP in the player table. */
const poolPlayersListTheirVips: Invariant = (model, { contest }) => {
  const poolByKey = new Map(model.pool.map((row) => [row.key, row]))
  const violations: string[] = []
  contest?.vip_lineups.forEach((lineup, index) => {
    for (const row of lineup.players_live ?? []) {
      const pooled = row.player_key ? poolByKey.get(row.player_key) : undefined
      if (pooled && !pooled.vipIndexes.includes(index)) {
        violations.push(`${pooled.name} does not list VIP ${lineup.display_name}`)
      }
    }
  })
  return violations
}

/** A locked VIP slot renders as locked, with nothing taken from the player pool. */
const lockedSlotsRenderLocked: Invariant = (model, { contest }) => {
  const violations: string[] = []
  contest?.vip_lineups.forEach((lineup, index) => {
    ;(lineup.players_live ?? []).forEach((row, slotIndex) => {
      if (!row.is_locked) return
      const player = model.vips[index]?.players[slotIndex]
      const where = `VIP ${lineup.display_name} slot ${slotIndex} (${String(row.slot)})`
      if (player?.locked !== true) {
        violations.push(`${where}: locked is ${String(player?.locked)}`)
        return
      }
      const { playerKey, matchup, gameStatus, ownershipPct, value, points } = player
      const details = { playerKey, matchup, gameStatus, ownershipPct, value, points }
      for (const [field, detail] of Object.entries(details)) {
        if (detail !== null) violations.push(`${where}: ${field} is ${String(detail)}`)
      }
    })
  })
  return violations
}

export const INVARIANTS: Record<string, Invariant> = {
  'every VIP card has a numeric rank, points and PMR': vipCardHasFigures,
  'every leverage row becomes an available model leverage row': leverageRowsAreRead,
  'a VIP rostering a swing player is marked HAVE for it': rosteredSwingPlayersAreHave,
  'every pool player a VIP rosters lists that VIP': poolPlayersListTheirVips,
  'locked VIP slots render as locked, with no pool lookup': lockedSlotsRenderLocked,
}

/** The contract cases of one snapshot: one per sport it carries. */
export function contractCasesOf(input: string, snapshot: Snapshot): ContractCase[] {
  return Object.entries(snapshot.sports).map(([sport, sportSnapshot]) => ({
    input,
    sport,
    snapshot,
    contest: sportSnapshot.primary_contest
      ? resolvePrimaryContest(sportSnapshot.contests, sportSnapshot.primary_contest)
      : null,
  }))
}
