import { INVARIANTS, contractCasesOf } from '../../../src/lib/liveInvariants'
import {
  buildLiveModel,
  type LiveModel,
  type LiveNotRenderableReason,
  type LiveVip,
  type Section,
} from '../../../src/lib/liveModel'
import { LIVE_UNREAD_ALLOWLIST, liveUnreadPaths } from '../../../src/lib/liveUnreadPaths'
import { formatOwnership } from '../../../src/lib/playerPool'
import { interpretSnapshot, type InterpretedSnapshot, isSupportedSnapshot } from '../../../src/lib/interpretedSnapshot'
import type { Snapshot } from '../../../src/lib/types'
import { unallowlistedPaths } from '../../../src/lib/unreadPaths'
import { SNAPSHOT_KEY, guardProdRead, type ProdReadDeps, type SnapshotSource } from '../../lib/snapshotSource'

/** "Is `commit` the same as, or a descendant of, `base` on the producer's main?" The real one asks GitHub; tests pass a fake. */
export type CommitOrderCheck = (commit: string, base: string) => boolean

export interface ProdCheckDeps extends ProdReadDeps {
  commitOrder?: CommitOrderCheck
}

/** `producer`: only presence warnings failed. `dashboard`: an invariant failed or an unread path isn't allowlisted; it wins over `producer`. */
export type ProdCheckOutcome = 'pass' | 'producer' | 'dashboard'

export interface ProdCheckResult {
  exitCode: 0 | 1
  outcome: ProdCheckOutcome
  /** The snapshot that was checked (what `latest` resolved to), for the workflow to capture on a failure. */
  key: string
  output: string
}

const USAGE =
  'Usage: npm run prod:check -- [all | <sport>...] [latest | snapshots/live-<timestamp>.json] [--expect-commit <sha>]'
const EXPECT_COMMIT_FLAG = '--expect-commit'
const MAX_LISTED = 10
const SPORT_NAME = /^[a-z][a-z0-9_-]*$/
const MAX_FAILURE_LENGTH = 200
const COMMIT_SHA = /^[0-9a-f]{40}$/
const SHORT_COMMIT_LENGTH = 7

/**
 * Runs the Live contract (the shared invariants and the unread-field detector) against the sports of
 * a prod snapshot (every sport unless some are named) and reports the result compactly. Setup problems
 * throw; contract failures come back as a report with exit code 1. Never prints the raw snapshot.
 */
export function runProdCheck(args: string[], deps: ProdCheckDeps): ProdCheckResult {
  // "latest", "all" and a blank spell the defaults out, so the workflow can pass its inputs straight through.
  // Anything that isn't a bare sport name is the snapshot key, which the guard then validates.
  const { rest, expectedCommit } = takeExpectedCommit(args)
  const named = rest.filter((arg) => arg !== '')
  const requestedSports = named.filter((arg) => SPORT_NAME.test(arg) && arg !== 'latest' && arg !== 'all')
  const requestedKey = named.find((arg) => !SPORT_NAME.test(arg))
  guardProdRead({ task: 'The prod check', key: requestedKey, usage: USAGE }, deps)

  const key = requestedKey ?? latestSnapshotKey(deps.source)
  const snapshot = interpretSnapshot(JSON.parse(deps.source.read(key)))
  if (expectedCommit !== undefined) expectProducerCommit(snapshot, expectedCommit, deps.commitOrder)
  return checkSnapshot(snapshot, requestedSports, key)
}

/** Pulls `--expect-commit <sha>` out of the args. A blank SHA means no expectation, so the workflow can pass its input straight through. */
function takeExpectedCommit(args: string[]): { rest: string[]; expectedCommit?: string } {
  const at = args.indexOf(EXPECT_COMMIT_FLAG)
  if (at === -1) return { rest: args }
  const value = args[at + 1] ?? ''
  const rest = [...args.slice(0, at), ...args.slice(at + 2)]
  if (value === '') return { rest }
  if (!COMMIT_SHA.test(value)) {
    throw new Error(
      `Expected ${EXPECT_COMMIT_FLAG} to be a full 40-character lowercase commit SHA, got "${value}".\n${USAGE}`,
    )
  }
  return { rest, expectedCommit: value }
}

/** Setup errors, not contract failures: the run stops before any sport is checked. */
function expectProducerCommit(snapshot: Snapshot, expected: string, commitOrder: CommitOrderCheck | undefined): void {
  if (!commitOrder) throw new Error(`${EXPECT_COMMIT_FLAG} needs a commit-order check, and none was provided.`)
  const actual = producerCommitOf(snapshot)
  if (actual === null) {
    throw new Error(
      `The snapshot has no producer commit (older snapshots do not), so it cannot be checked against ${expected}.`,
    )
  }
  if (!commitOrder(actual, expected)) {
    throw new Error(
      `The snapshot's producer commit ${actual} is not ${expected} or a descendant of it, so the producer hasn't run since the deploy; retry later.`,
    )
  }
}

/**
 * The one line a setup failure shows the operator. Only the first line, capped: a parse or wrangler error's
 * later lines can echo what was read, and the output lands in the job summary.
 */
export function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `prod:check failed: ${message.split('\n')[0].slice(0, MAX_FAILURE_LENGTH)}`
}

function latestSnapshotKey(source: SnapshotSource): string {
  const latest = JSON.parse(source.read('latest.json')) as { latest_snapshot_path?: unknown }
  const key = latest.latest_snapshot_path
  if (typeof key !== 'string' || !SNAPSHOT_KEY.test(key)) {
    throw new Error('latest.json has no usable latest_snapshot_path.')
  }
  return key
}

function checkSnapshot(snapshot: InterpretedSnapshot, requestedSports: string[], key: string): ProdCheckResult {
  if (!isSupportedSnapshot(snapshot)) {
    return {
      exitCode: 1,
      outcome: 'dashboard',
      key,
      output: `Unsupported snapshot schema version: ${String(snapshot.schema_version)}`,
    }
  }
  const sports = requestedSports.length > 0 ? requestedSports : sportsIn(snapshot)
  const lines = [
    `Prod check: ${key} | snapshot_at ${String(snapshot.snapshot_at)} | producer ${shortCommit(producerCommitOf(snapshot))}`,
  ]
  const skipped: string[] = []
  let checkedCount = 0
  let ok = true
  for (const sport of sports) {
    const checked = checkSport(snapshot, sport, key)
    if (checked.kind === 'skipped') {
      skipped.push(`skipped ${sport}: ${checked.reason}`)
      continue
    }
    checkedCount += 1
    ok &&= checked.ok
    lines.push('', `## ${sport}`, ...checked.lines)
  }
  if (skipped.length > 0) lines.push('', ...skipped.map((line) => `  ${line}`))
  if (checkedCount === 0) lines.push('', 'No sport was checked, so there is nothing to fail.')
  const warnings = presenceWarningsOf(snapshot)
  lines.push('', ...presenceWarningLines(warnings))
  const outcome: ProdCheckOutcome = !ok ? 'dashboard' : warnings.length > 0 ? 'producer' : 'pass'
  lines.push('', outcome === 'pass' ? 'PASS' : 'FAIL')
  return { exitCode: outcome === 'pass' ? 0 : 1, outcome, key, output: lines.join('\n') }
}

type SportCheck = { kind: 'checked'; ok: boolean; lines: string[] } | { kind: 'skipped'; reason: string }

function checkSport(snapshot: Snapshot, sport: string, key: string): SportCheck {
  const fail = (message: string): SportCheck => ({ kind: 'checked', ok: false, lines: [`FAIL: ${message}`] })

  if (!snapshot.sports?.[sport]) {
    return { kind: 'skipped', reason: `not in the snapshot (it has ${sportsIn(snapshot).join(', ')})` }
  }
  const built = buildLiveModel(snapshot, sport)
  if (built.kind !== 'ready')
    return { kind: 'skipped', reason: `the Live view cannot render it (${describeReason(built.reason)})` }

  const model = built.model
  const contractCase = contractCasesOf(key, snapshot).find((candidate) => candidate.sport === sport)
  if (!contractCase) return fail(`no contract case for ${sport}`)

  const failures = Object.entries(INVARIANTS).map(([name, invariant]) => ({
    name,
    violations: invariant(model, contractCase),
  }))
  const unread = liveUnreadPaths(snapshot, sport).filter((path) => !reportedByTheCheck(path))
  const unallowlisted = unallowlistedPaths(unread, LIVE_UNREAD_ALLOWLIST)
  const ok = failures.every(({ violations }) => violations.length === 0) && unallowlisted.length === 0

  const lines = [
    `Contest: ${model.contest.name} | field ${show(model.fieldSize)} | cash line ${show(model.cashLine.points)} pts, rank ${show(model.cashLine.rank)}`,
  ]
  lines.push('', 'Sections', ...sectionLines(model))
  lines.push('', `VIP cards (${model.vips.length})`, ...vipLines(model))
  lines.push('', 'Invariants', ...failures.flatMap(invariantLines))
  lines.push(
    '',
    `Unread paths: ${unallowlisted.length} unallowlisted, ${unread.length - unallowlisted.length} allowlisted`,
  )
  lines.push(...capped(unallowlisted.map((path) => `  - ${path}`)))
  return { kind: 'checked', ok, lines }
}

/** The producer commit the snapshot records, or null for `null`, a missing stamp (older snapshots) or anything that is not a SHA. */
function producerCommitOf(snapshot: Snapshot): string | null {
  const stamp = (snapshot as { producer_commit?: unknown }).producer_commit
  return typeof stamp === 'string' && COMMIT_SHA.test(stamp) ? stamp : null
}

/** The check shows each warning's path and rule itself, so those two are read, not unread; the empty list stays allowlisted, and any other field on a warning still has to be. */
function reportedByTheCheck(path: string): boolean {
  return path === 'presence_warnings[].path' || path === 'presence_warnings[].rule'
}

interface PresenceWarning {
  path: string
  rule: string
}

/** The presence warnings the snapshot records; none for an older snapshot without the field. Entries of an unexpected shape are ignored. */
function presenceWarningsOf(snapshot: Snapshot): PresenceWarning[] {
  const recorded = (snapshot as { presence_warnings?: unknown }).presence_warnings
  if (!Array.isArray(recorded)) return []
  return recorded.filter(
    (entry): entry is PresenceWarning =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as PresenceWarning).path === 'string' &&
      typeof (entry as PresenceWarning).rule === 'string',
  )
}

function presenceWarningLines(warnings: PresenceWarning[]): string[] {
  if (warnings.length === 0) return ['Presence warnings: none']
  return [`Presence warnings (${warnings.length})`, ...warnings.map(({ path, rule }) => `  - ${path}: ${rule}`)]
}

function shortCommit(commit: string | null): string {
  return commit === null ? 'unknown' : commit.slice(0, SHORT_COMMIT_LENGTH)
}

function sportsIn(snapshot: Snapshot): string[] {
  return Object.keys(snapshot.sports ?? {}).sort()
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
