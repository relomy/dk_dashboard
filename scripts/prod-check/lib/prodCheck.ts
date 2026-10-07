import { INVARIANTS, contractCasesOf } from '../../../src/lib/liveInvariants'
import { buildLiveModel, type LiveModel, type LiveNotRenderableReason, type LiveVip, type Section } from '../../../src/lib/liveModel'
import { LIVE_UNREAD_ALLOWLIST, liveUnreadPaths } from '../../../src/lib/liveUnreadPaths'
import { formatOwnership } from '../../../src/lib/playerPool'
import { interpretSnapshot, type LiveSnapshot as Snapshot } from '../../../src/lib/interpretedSnapshot'
import { unallowlistedPaths } from '../../../src/lib/unreadPaths'
import { SNAPSHOT_KEY, guardProdRead, type ProdReadDeps, type SnapshotSource } from '../../lib/snapshotSource'

export type ProdCheckDeps = ProdReadDeps

export interface ProdCheckResult {
  exitCode: 0 | 1
  output: string
}

const USAGE = 'Usage: npm run prod:check -- <sport> [snapshots/live-<timestamp>.json]'
const MAX_LISTED = 10

/**
 * Runs the Live contract (the shared invariants and the unread-field detector) against one sport of
 * a prod snapshot and reports the result compactly. Setup problems throw; contract failures come back
 * as a report with exit code 1. Never prints the raw snapshot.
 */
export function runProdCheck(args: string[], deps: ProdCheckDeps): ProdCheckResult {
  const [sport, requestedKey] = args
  if (!sport) throw new Error(USAGE)
  guardProdRead({ task: 'The prod check', key: requestedKey, usage: USAGE }, deps)

  const key = requestedKey ?? latestSnapshotKey(deps.source)
  const snapshot = interpretSnapshot(JSON.parse(deps.source.read(key)))
  return checkSnapshot(snapshot, sport, key)
}

function latestSnapshotKey(source: SnapshotSource): string {
  const latest = JSON.parse(source.read('latest.json')) as { latest_snapshot_path?: unknown }
  const key = latest.latest_snapshot_path
  if (typeof key !== 'string' || !SNAPSHOT_KEY.test(key)) {
    throw new Error('latest.json has no usable latest_snapshot_path.')
  }
  return key
}

function checkSnapshot(snapshot: Snapshot, sport: string, key: string): ProdCheckResult {
  const lines = [`Prod check: ${sport} | ${key} | snapshot_at ${String(snapshot.snapshot_at)}`]
  const fail = (message: string): ProdCheckResult => ({ exitCode: 1, output: [...lines, `FAIL: ${message}`].join('\n') })

  if (!snapshot.sports?.[sport]) {
    return fail(`the snapshot has no "${sport}" feed; it has: ${Object.keys(snapshot.sports ?? {}).sort().join(', ')}`)
  }
  const built = buildLiveModel(snapshot, sport)
  if (built.kind !== 'ready') return fail(`the Live view cannot render it (${describeReason(built.reason)})`)

  const model = built.model
  const contractCase = contractCasesOf(key, snapshot).find((candidate) => candidate.sport === sport)
  if (!contractCase) return fail(`no contract case for ${sport}`)

  const failures = Object.entries(INVARIANTS).map(([name, invariant]) => ({ name, violations: invariant(model, contractCase) }))
  const unread = liveUnreadPaths(snapshot, sport)
  const unallowlisted = unallowlistedPaths(unread, LIVE_UNREAD_ALLOWLIST)
  const ok = failures.every(({ violations }) => violations.length === 0) && unallowlisted.length === 0

  lines.push(`Contest: ${model.contest.name} | field ${show(model.fieldSize)} | cash line ${show(model.cashLine.points)} pts, rank ${show(model.cashLine.rank)}`)
  lines.push('', 'Sections', ...sectionLines(model))
  lines.push('', `VIP cards (${model.vips.length})`, ...vipLines(model))
  lines.push('', 'Invariants', ...failures.flatMap(invariantLines))
  lines.push('', `Unread paths: ${unallowlisted.length} unallowlisted, ${unread.length - unallowlisted.length} allowlisted`)
  lines.push(...capped(unallowlisted.map((path) => `  - ${path}`)))
  lines.push('', ok ? 'PASS' : 'FAIL')
  return { exitCode: ok ? 0 : 1, output: lines.join('\n') }
}

function describeReason(reason: LiveNotRenderableReason): string {
  return reason.kind === 'unsupported-schema' ? `unsupported schema version ${String(reason.version)}` : reason.kind
}

function show(value: number | null): string {
  return value === null ? '-' : String(value)
}

/** "available (<what it holds>)", or "unavailable" when the feed omits the section. */
function availability<T>(section: Section<T>, describe: (data: T) => string): string {
  return section.availability === 'available' ? `available (${describe(section.data)})` : 'unavailable'
}

function sectionLines(model: LiveModel): string[] {
  const rows: Array<[string, string]> = [
    ['trains', availability(model.trains, (data) => `${data.rows.length} trains`)],
    ['standings', availability(model.standings, (data) => `${data.length} rows`)],
    ['ownership leaders', availability(model.ownershipLeaders, (data) => `${data.entries.length} entries`)],
    ['threat', availability(model.threat, (data) => `${data.swingPlayers.length} swing players`)],
    ['player pool', `${model.pool.length} players`],
  ]
  return rows.map(([name, status]) => `  ${name.padEnd(18)} ${status}`)
}

function vipLines(model: LiveModel): string[] {
  return model.vips.map(
    (vip) =>
      `  ${vip.name}: rank ${show(vip.rank)}, points ${show(vip.points)}, pmr ${show(vip.pmr)}, ` +
      `${vip.cashing ? 'cashing' : 'not cashing'}, own rem ${formatOwnership(vip.ownershipRemainingPct)}, ${leverageFigure(vip)}`,
  )
}

/** The VIP's uniqueness delta, marked when partial; or that the feed has no leverage row for them. */
function leverageFigure(vip: LiveVip): string {
  if (vip.leverage.availability !== 'available') return 'leverage unavailable'
  const { uniquenessDeltaPct, partial } = vip.leverage.data
  return `leverage delta ${show(uniquenessDeltaPct)}${partial ? ' (partial)' : ''}`
}

function invariantLines({ name, violations }: { name: string; violations: string[] }): string[] {
  if (violations.length === 0) return [`  ok   ${name}`]
  return [`  FAIL ${name}`, ...capped(violations.map((violation) => `       - ${violation}`))]
}

function capped(lines: string[]): string[] {
  if (lines.length <= MAX_LISTED) return lines
  return [...lines.slice(0, MAX_LISTED), `  ... and ${lines.length - MAX_LISTED} more`]
}
