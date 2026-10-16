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
    // The key `latest` resolved to, so the workflow can capture exactly the snapshot that was checked.
    expect(result.key).toBe(KEY)
    expect(result.output).toMatch(/^## golf$/m)
    expect(result.output).toMatch(/^## nfl$/m)
  })

  it('checks the snapshot named by the key instead of the latest', () => {
    const snapshots = source({ [KEY]: FIXTURE })

    const result = runProdCheck(['nfl', KEY], { source: snapshots, env: {} })

    expect(snapshots.reads).toEqual([KEY])
    expect(result.key).toBe(KEY)
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

  it('runs in CI on the R2 access key and account ID, without asking wrangler who is logged in', () => {
    const snapshots = source({ [KEY]: FIXTURE }, false)
    const env = { CI: 'true', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret', CLOUDFLARE_ACCOUNT_ID: 'account' }

    const result = runProdCheck([KEY], { source: snapshots, env })

    expect(result.exitCode).toBe(0)
  })

  it.each([
    ['all', { CI: 'true' }],
    ['the access key ID', { CI: 'true', R2_SECRET_ACCESS_KEY: 'secret', CLOUDFLARE_ACCOUNT_ID: 'account' }],
    ['the secret access key', { CI: 'true', R2_ACCESS_KEY_ID: 'id', CLOUDFLARE_ACCOUNT_ID: 'account' }],
    ['the account ID', { CI: 'true', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret' }],
  ])('names all three secrets and reads nothing in CI when %s is missing', (_missing, env) => {
    const snapshots = source({ [KEY]: FIXTURE })

    expect(() => runProdCheck([KEY], { source: snapshots, env })).toThrow(
      /R2_ACCESS_KEY_ID.*R2_SECRET_ACCESS_KEY.*CLOUDFLARE_ACCOUNT_ID/,
    )
    expect(snapshots.reads).toEqual([])
  })

  it('reads with the R2 credentials outside CI too, without needing a wrangler login', () => {
    const snapshots = source({ [KEY]: FIXTURE }, false)
    const env = { R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret', CLOUDFLARE_ACCOUNT_ID: 'account' }

    expect(runProdCheck([KEY], { source: snapshots, env }).exitCode).toBe(0)
  })

  it('rejects a key that is not a live snapshot', () => {
    expect(() => runProdCheck(['nfl', 'manifest/2026-10-04.json'], { source: source({}), env: {} })).toThrow(
      'snapshots/live-<timestamp>.json',
    )
  })
})

const SHA = '0123456789abcdef0123456789abcdef01234567'

function withProducerCommit(value: unknown): string {
  return withSnapshot((snapshot) => {
    ;(snapshot as unknown as Record<string, unknown>).producer_commit = value
  })
}

const WARNINGS = [
  { path: 'sports.nfl.contests[0].standings[3].payout_cents', rule: 'a cashing standings row has a payout' },
  { path: 'sports.nfl.players[7].stats_text', rule: 'an in-progress player has stats' },
]

function withPresenceWarnings(warnings: unknown, edit: (snapshot: Snapshot) => void = () => {}): string {
  return withSnapshot((snapshot) => {
    ;(snapshot as unknown as Record<string, unknown>).presence_warnings = warnings
    edit(snapshot)
  })
}

describe('runProdCheck presence warnings', () => {
  it('passes and lists none when the snapshot recorded no presence warnings', () => {
    const result = runProdCheck(['nfl', KEY], { source: source({ [KEY]: withPresenceWarnings([]) }), env: {} })

    expect(result.exitCode).toBe(0)
    expect(result.outcome).toBe('pass')
    expect(result.output).toContain('Presence warnings: none')
  })

  it('reports each warning with its path and rule, and gives the run the producer outcome when they are the only failure', () => {
    const result = runProdCheck(['nfl', KEY], { source: source({ [KEY]: withPresenceWarnings(WARNINGS) }), env: {} })

    expect(result.exitCode).toBe(1)
    expect(result.outcome).toBe('producer')
    expect(result.output).toContain('Presence warnings (2)')
    expect(result.output).toContain('  - sports.nfl.contests[0].standings[3].payout_cents: a cashing standings row has a payout')
    expect(result.output).toContain('  - sports.nfl.players[7].stats_text: an in-progress player has stats')
    expect(result.output).toContain('FAIL')
    expect(result.output).not.toContain('{')
  })

  it('lists the warnings even when only one sport is named', () => {
    const result = runProdCheck(['golf', KEY], { source: source({ [KEY]: withPresenceWarnings(WARNINGS) }), env: {} })

    expect(result.outcome).toBe('producer')
    expect(result.output).toContain('Presence warnings (2)')
  })

  it('gives the dashboard outcome precedence when an invariant fails alongside presence warnings, and still lists them', () => {
    const broken = withPresenceWarnings(WARNINGS, (snapshot) => {
      const contest = snapshot.sports.nfl.contests.find((c) => c.vip_lineups?.length)
      contest.vip_lineups[0].rank = 'n/a'
      contest.standings = []
    })

    const result = runProdCheck(['nfl', KEY], { source: source({ [KEY]: broken }), env: {} })

    expect(result.exitCode).toBe(1)
    expect(result.outcome).toBe('dashboard')
    expect(result.output).toContain('VIP cglenn91: rank is null')
    expect(result.output).toContain('Presence warnings (2)')
  })

  it('gives the dashboard outcome precedence when an unread path is not allowlisted alongside presence warnings', () => {
    const extra = withPresenceWarnings(WARNINGS, (snapshot) => {
      snapshot.sports.nfl.players[0].brand_new_field = 7
    })

    const result = runProdCheck(['nfl', KEY], { source: source({ [KEY]: extra }), env: {} })

    expect(result.outcome).toBe('dashboard')
    expect(result.output).toContain('sports.*.players[].brand_new_field')
    expect(result.output).toContain('Presence warnings (2)')
  })

  it('lists every warning, however many', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ path: `sports.nfl.players[${i}].stats_text`, rule: 'an in-progress player has stats' }))

    const result = runProdCheck(['nfl', KEY], { source: source({ [KEY]: withPresenceWarnings(many) }), env: {} })

    expect(result.output).toContain('Presence warnings (12)')
    expect(result.output).toContain('sports.nfl.players[11].stats_text')
  })

  it('still fails as a dashboard problem on a field of a warning the Live view does not know', () => {
    const odd = withPresenceWarnings([{ ...WARNINGS[0], severity: 'high' }])

    const result = runProdCheck(['nfl', KEY], { source: source({ [KEY]: odd }), env: {} })

    expect(result.outcome).toBe('dashboard')
    expect(result.output).toContain('presence_warnings[].severity')
  })

  it('treats a snapshot without the field (an older producer) as having none', () => {
    const result = runProdCheck(['nfl', KEY], { source: source({ [KEY]: FIXTURE }), env: {} })

    expect(result.outcome).toBe('pass')
    expect(result.output).toContain('Presence warnings: none')
  })
})

describe('runProdCheck producer commit', () => {
  it.each([
    ['a stamp', withProducerCommit(SHA), 'producer 0123456'],
    ['a null stamp', withProducerCommit(null), 'producer unknown'],
    ['no stamp', FIXTURE, 'producer unknown'],
  ])('shows the shortened producer commit in the header for %s', (_name, text, expected) => {
    const result = runProdCheck(['nfl', KEY], { source: source({ [KEY]: text }), env: {} })

    expect(result.output.split('\n')[0]).toBe(`Prod check: ${KEY} | snapshot_at 2026-10-04T18:41:34Z | ${expected}`)
  })
})

describe('runProdCheck --expect-commit', () => {
  const EXPECTED = 'fedcba9876543210fedcba9876543210fedcba98'

  /** A fake commit-order check: records what it was asked and answers as told. */
  function commitOrder(answer: boolean) {
    const asked: Array<[string, string]> = []
    return {
      asked,
      isSameOrDescendant: (commit: string, base: string) => {
        asked.push([commit, base])
        return answer
      },
    }
  }

  it('passes when the stamped commit is the expected one or a later one', () => {
    const order = commitOrder(true)

    const result = runProdCheck(['nfl', '--expect-commit', EXPECTED, KEY], {
      source: source({ [KEY]: withProducerCommit(SHA) }),
      env: {},
      commitOrder: order.isSameOrDescendant,
    })

    expect(order.asked).toEqual([[SHA, EXPECTED]])
    expect(result.output).toContain('## nfl')
  })

  it('stops at once on a mismatch, naming both commits and telling the operator to retry later', () => {
    const order = commitOrder(false)

    expect(() =>
      runProdCheck(['--expect-commit', EXPECTED, KEY], {
        source: source({ [KEY]: withProducerCommit(SHA) }),
        env: {},
        commitOrder: order.isSameOrDescendant,
      }),
    ).toThrow(
      `The snapshot's producer commit ${SHA} is not ${EXPECTED} or a descendant of it, so the producer hasn't run since the deploy; retry later.`,
    )
  })

  it.each([
    ['null', withProducerCommit(null)],
    ['missing', FIXTURE],
  ])('fails the expectation with its own message when the stamp is %s', (_name, text) => {
    const order = commitOrder(true)

    expect(() =>
      runProdCheck(['--expect-commit', EXPECTED, KEY], {
        source: source({ [KEY]: text }),
        env: {},
        commitOrder: order.isSameOrDescendant,
      }),
    ).toThrow(`The snapshot has no producer commit (older snapshots do not), so it cannot be checked against ${EXPECTED}.`)
    expect(order.asked).toEqual([])
  })

  it('rejects an expected commit that is not a full SHA before reading anything', () => {
    const snapshots = source({ [KEY]: FIXTURE })

    expect(() => runProdCheck(['--expect-commit', 'abc123', KEY], { source: snapshots, env: {}, commitOrder: commitOrder(true).isSameOrDescendant })).toThrow(
      'Expected --expect-commit to be a full 40-character lowercase commit SHA, got "abc123".',
    )
    expect(snapshots.reads).toEqual([])
  })

  it('does not check commit order when no commit is expected, and a blank expectation means none', () => {
    const order = commitOrder(false)

    const result = runProdCheck(['nfl', '--expect-commit', '', KEY], {
      source: source({ [KEY]: withProducerCommit(SHA) }),
      env: {},
      commitOrder: order.isSameOrDescendant,
    })

    expect(order.asked).toEqual([])
    expect(result.output).toContain('## nfl')
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
