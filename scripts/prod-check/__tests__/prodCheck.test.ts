import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { SnapshotSource } from '../../lib/snapshotSource'
import type { Snapshot } from '../../../src/lib/types'
import { describeFailure, runProdCheck } from '../lib/prodCheck'

const KEY = 'snapshots/live-2026-10-04T18-41-34Z.json'
const FIXTURE = readFileSync(`public/mock/${KEY}`, 'utf8')

function source(objects: Record<string, string>, loggedIn = true): SnapshotSource & { reads: string[] } {
  const reads: string[] = []
  return {
    reads,
    isLoggedIn: () => loggedIn,
    read: (key) => {
      reads.push(key)
      const text = objects[key]
      if (text === undefined) throw new Error(`no such object ${key}`)
      return text
    },
  }
}

/** The real fixture with one deliberate break, for the failure cases. */
function withSnapshot(edit: (snapshot: Snapshot) => void): string {
  const snapshot = JSON.parse(FIXTURE) as Snapshot
  edit(snapshot)
  return JSON.stringify(snapshot)
}

describe('runProdCheck', () => {
  it('checks the latest snapshot by default and reports sections, VIP card figures and a pass', () => {
    const snapshots = source({ 'latest.json': JSON.stringify({ latest_snapshot_path: KEY }), [KEY]: FIXTURE })

    const result = runProdCheck(['nfl'], { source: snapshots, env: {} })

    expect(snapshots.reads).toEqual(['latest.json', KEY])
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain(KEY)
    expect(result.output).toMatch(/trains\s+available/)
    expect(result.output).toMatch(/standings\s+available/)
    expect(result.output).toContain('cglenn91')
    expect(result.output).toMatch(/rank 879\b/)
    expect(result.output).toMatch(/pmr 390\b/)
    // Every NFL leverage row is partial; cglenn91's says 262.59% remaining, 15.7 less unique than the field.
    expect(result.output).toMatch(/cglenn91: .*own rem 262\.59%, leverage delta -15\.7 \(partial\)$/m)
    expect(result.output).toContain('PASS')
    expect(result.output.split('\n').length).toBeLessThan(60)
    expect(result.output).not.toContain('{')
  })

  it('checks every sport in the snapshot when none is named, each under its own heading', () => {
    const result = runProdCheck([KEY], { source: source({ [KEY]: FIXTURE }), env: {} })

    expect(result.exitCode).toBe(0)
    expect(result.outcome).toBe('pass')
    expect(result.output).toMatch(/^## golf$/m)
    expect(result.output).toMatch(/^## nfl$/m)
    expect(result.output).toContain('cglenn91')
    expect(result.output.split('\n').length).toBeLessThan(120)
    expect(result.output).not.toContain('{')
  })

  it('reads "latest", "all" and a blank input as the defaults, so the workflow can pass its inputs straight through', () => {
    const snapshots = source({ 'latest.json': JSON.stringify({ latest_snapshot_path: KEY }), [KEY]: FIXTURE })

    const result = runProdCheck(['', 'all', 'latest'], { source: snapshots, env: {} })

    expect(snapshots.reads).toEqual(['latest.json', KEY])
    expect(result.output).toMatch(/^## golf$/m)
    expect(result.output).toMatch(/^## nfl$/m)
  })

  it('checks the snapshot named by the key instead of the latest', () => {
    const snapshots = source({ [KEY]: FIXTURE })

    const result = runProdCheck(['nfl', KEY], { source: snapshots, env: {} })

    expect(snapshots.reads).toEqual([KEY])
    expect(result.exitCode).toBe(0)
  })

  it("rounds a VIP's ownership remaining as the card shows it", () => {
    // Prod sums ownership with float noise (96.03999999999999); the fixture's figures are already rounded.
    const noisy = withSnapshot((snapshot) => {
      const contest = snapshot.sports.nfl.contests.find((c) => c.vip_lineups?.length)
      const row = contest.metrics.threat.vip_vs_field_leverage.find((r) => r.display_name === 'cglenn91')
      row.vip_remaining_pct = 96.03999999999999
    })

    const result = runProdCheck(['nfl', KEY], { source: source({ [KEY]: noisy }), env: {} })

    expect(result.output).toMatch(/cglenn91: .*own rem 96\.04%,/)
  })

  it('fails with the violation named when an invariant breaks', () => {
    const broken = withSnapshot((snapshot) => {
      const contest = snapshot.sports.nfl.contests.find((c) => c.vip_lineups?.length)
      contest.vip_lineups[0].rank = 'n/a'
      contest.standings = []
    })

    const result = runProdCheck(['nfl', KEY], { source: source({ [KEY]: broken }), env: {} })

    expect(result.exitCode).toBe(1)
    expect(result.outcome).toBe('dashboard')
    expect(result.output).toContain('FAIL')
    expect(result.output).toContain('every VIP card has a numeric rank, points and PMR')
    expect(result.output).toContain('VIP cglenn91: rank is null')
  })

  it('fails and lists a field the feed emits that the Live view neither reads nor allowlists', () => {
    const extra = withSnapshot((snapshot) => {
      snapshot.sports.nfl.players[0].brand_new_field = 7
    })

    const result = runProdCheck(['nfl', KEY], { source: source({ [KEY]: extra }), env: {} })

    expect(result.exitCode).toBe(1)
    expect(result.outcome).toBe('dashboard')
    expect(result.output).toContain('sports.*.players[].brand_new_field')
  })

  it('skips a named sport the snapshot lacks, naming the sports it has, and passes when others were checked', () => {
    const result = runProdCheck(['nfl', 'hockey', KEY], { source: source({ [KEY]: FIXTURE }), env: {} })

    expect(result.exitCode).toBe(0)
    expect(result.outcome).toBe('pass')
    expect(result.output).toMatch(/^## nfl$/m)
    expect(result.output).toMatch(/skipped hockey: not in the snapshot \(it has golf, nfl\)/)
  })

  it('skips a sport the Live view cannot render, with the reason', () => {
    const unrenderable = withSnapshot((snapshot) => {
      snapshot.sports.golf.primary_contest = null
    })

    const result = runProdCheck([KEY], { source: source({ [KEY]: unrenderable }), env: {} })

    expect(result.exitCode).toBe(0)
    expect(result.output).toMatch(/^## nfl$/m)
    expect(result.output).toMatch(/skipped golf: the Live view cannot render it \(no-primary-contest\)/)
  })

  it('passes with a note when no sport could be checked', () => {
    const result = runProdCheck(['hockey', KEY], { source: source({ [KEY]: FIXTURE }), env: {} })

    expect(result.exitCode).toBe(0)
    expect(result.outcome).toBe('pass')
    expect(result.output).toContain('No sport was checked, so there is nothing to fail')
    expect(result.output).toContain('PASS')
  })

  it('prints the exact login command and reads nothing when the Cloudflare login is missing', () => {
    const snapshots = source({}, false)

    expect(() => runProdCheck(['nfl'], { source: snapshots, env: {} })).toThrow('Run: npx wrangler login')
    expect(snapshots.reads).toEqual([])
  })

  it('runs in CI on the Cloudflare token and account ID, without asking wrangler who is logged in', () => {
    // A read-only R2 token may not be allowed to run `wrangler whoami`, so CI never asks.
    const snapshots = source({ [KEY]: FIXTURE }, false)
    const env = { CI: 'true', CLOUDFLARE_API_TOKEN: 'token', CLOUDFLARE_ACCOUNT_ID: 'account' }

    const result = runProdCheck([KEY], { source: snapshots, env })

    expect(result.exitCode).toBe(0)
  })

  it.each([
    ['both', { CI: 'true' }],
    ['the token', { CI: 'true', CLOUDFLARE_ACCOUNT_ID: 'account' }],
    ['the account ID', { CI: 'true', CLOUDFLARE_API_TOKEN: 'token' }],
  ])('names both secrets and reads nothing in CI when %s is missing', (_missing, env) => {
    const snapshots = source({ [KEY]: FIXTURE })

    expect(() => runProdCheck([KEY], { source: snapshots, env })).toThrow(/CLOUDFLARE_API_TOKEN.*CLOUDFLARE_ACCOUNT_ID/)
    expect(snapshots.reads).toEqual([])
  })

  it('rejects a key that is not a live snapshot', () => {
    expect(() => runProdCheck(['nfl', 'manifest/2026-10-04.json'], { source: source({}), env: {} })).toThrow(
      'snapshots/live-<timestamp>.json',
    )
  })
})

describe('describeFailure', () => {
  it('keeps the operator-facing line of a setup error and drops the rest, which may echo what was read', () => {
    const error = new Error('Unexpected token in snapshot\n{"secret":"value"}')

    expect(describeFailure(error)).toBe('prod:check failed: Unexpected token in snapshot')
  })

  it('caps a long first line', () => {
    expect(describeFailure(new Error('x'.repeat(500))).length).toBeLessThan(260)
  })

  it('describes a thrown non-error', () => {
    expect(describeFailure('boom')).toBe('prod:check failed: boom')
  })
})
