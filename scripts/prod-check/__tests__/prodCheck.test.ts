import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { SnapshotSource } from '../../lib/snapshotSource'
import type { Snapshot } from '../../../src/lib/types'
import { runProdCheck } from '../lib/prodCheck'

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
    expect(result.output).toContain('sports.*.players[].brand_new_field')
  })

  it('fails when the sport is not in the snapshot, naming the sports it has', () => {
    const result = runProdCheck(['hockey', KEY], { source: source({ [KEY]: FIXTURE }), env: {} })

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('hockey')
    expect(result.output).toContain('golf, nfl')
  })

  it('prints the exact login command and reads nothing when the Cloudflare login is missing', () => {
    const snapshots = source({}, false)

    expect(() => runProdCheck(['nfl'], { source: snapshots, env: {} })).toThrow('Run: npx wrangler login')
    expect(snapshots.reads).toEqual([])
  })

  it('refuses to run in CI', () => {
    expect(() => runProdCheck(['nfl'], { source: source({}), env: { CI: 'true' } })).toThrow('never runs in CI')
  })

  it('rejects a missing sport and a key that is not a live snapshot', () => {
    expect(() => runProdCheck([], { source: source({}), env: {} })).toThrow('Usage')
    expect(() => runProdCheck(['nfl', 'manifest/2026-10-04.json'], { source: source({}), env: {} })).toThrow(
      'snapshots/live-<timestamp>.json',
    )
  })
})
