import { cleanup, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { contestOf, load, renderLive } from './liveHarness'
import { expectNoDeveloperDetails } from './liveRouteTestKit'

// The Live route as a whole: states where there is nothing to render, the plain-language rules,
// and edge cases of the producer fixture (no primary contest, missing sections, empty standings).
// Driven by the captured NFL slate: six VIPs below the standings cut, `metrics.threat`, an ownership
// watchlist and trains. Golf carries `metrics` without `threat` and has no watchlist. Where the fixture
// lacks a case, the test changes a clone of it or injects a hand-built piece, and says why.

describe('nothing to render', () => {
  it('says the snapshot format is unsupported for a schema version other than 3', async () => {
    const snapshot = load()
    snapshot.schema_version = 2

    await renderLive(snapshot)

    expect(screen.getByText(/this snapshot uses an unsupported format \(version 2\)/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expectNoDeveloperDetails()
  })

  it('says the sport is not in the snapshot', async () => {
    await renderLive(load(), '/live/nba')

    expect(screen.getByText(/this snapshot has no NBA data/i)).toBeInTheDocument()
    expectNoDeveloperDetails()
  })

  it('says why the view is empty when the sport has no primary contest, and links to all contests', async () => {
    const snapshot = load()
    delete snapshot.sports.nfl.primary_contest

    await renderLive(snapshot)

    expect(screen.getByText(/no primary contest is set for NFL/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /all NFL contests/i })).toHaveAttribute('href', '/sport/nfl')
    expectNoDeveloperDetails()
  })

  it('says the primary contest is missing from the snapshot without naming its key or id', async () => {
    const snapshot = load()
    snapshot.sports.nfl.primary_contest.contest_key = 'nfl:777'
    snapshot.sports.nfl.primary_contest.contest_id = '777'

    await renderLive(snapshot)

    expect(screen.getByText(/the primary contest for NFL is not in this snapshot/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /all NFL contests/i })).toHaveAttribute('href', '/sport/nfl')
    expect(document.body).not.toHaveTextContent('777')
    expectNoDeveloperDetails()
  })
})

describe('the producer snapshot', () => {
  it('renders golf, which has no threat metrics or ownership leaders, in plain language', async () => {
    await renderLive(load(), '/live/golf')

    const bar = within(screen.getByRole('banner'))
    expect(bar.getByText('PGA TOUR Single Entry $10 Double Up')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /players/i })).toBeInTheDocument()
    expect(screen.getByText('Swing players are unavailable for this contest.')).toBeInTheDocument()
    expect(screen.getByText('Ownership leaders are unavailable for this contest.')).toBeInTheDocument()
    expectNoDeveloperDetails()
  })

  it('shows no internal identifiers or developer notes on any view', async () => {
    const snapshot = load()

    for (const path of ['/live/nfl', '/live/nfl?view=vips', '/live/nfl?view=trains', '/live/nfl?view=leverage']) {
      await renderLive(snapshot, path)
      expectNoDeveloperDetails()
      cleanup()
    }
  })

  it('never says unknown for values the snapshot does not carry', async () => {
    const snapshot = load()
    snapshot.sports.nfl.primary_contest.selection_reason = {}
    delete contestOf(snapshot).live_metrics.updated_at

    await renderLive(snapshot)

    expect(document.body.textContent).not.toMatch(/unknown/i)
  })

  it('follows the configured primary contest among multiple contests', async () => {
    const snapshot = load()
    const primary = contestOf(snapshot)
    const decoy = structuredClone(primary)
    decoy.contest_id = '1002'
    decoy.contest_key = 'nfl:1002'
    decoy.name = 'Decoy Contest'
    snapshot.sports.nfl.contests.push(decoy)
    snapshot.sports.nfl.primary_contest.contest_id = '1002'
    snapshot.sports.nfl.primary_contest.contest_key = 'nfl:1002'

    await renderLive(snapshot)

    const bar = within(screen.getByRole('banner'))
    expect(bar.getByText('Decoy Contest')).toBeInTheDocument()
    expect(bar.queryByText('NFL GIANT $50 Double Up [Single Entry]')).not.toBeInTheDocument()
  })
})

describe('missing and empty sections', () => {
  it('says each missing section is unavailable and still renders the rest', async () => {
    const snapshot = load()
    const contest = contestOf(snapshot)
    delete contest.ownership_watchlist
    delete contest.train_clusters
    delete contest.standings
    delete contest.metrics

    await renderLive(snapshot)

    expect(screen.getByRole('table', { name: /players/i })).toBeInTheDocument()
    expect(screen.getByText('Swing players are unavailable for this contest.')).toBeInTheDocument()
    expect(screen.getByText('Ownership leaders are unavailable for this contest.')).toBeInTheDocument()
    const rail = within(screen.getByRole('navigation', { name: /live views/i }))
    expect(rail.getByRole('link', { name: /trains/i })).toHaveTextContent(/unavailable/i)
    expect(document.body.textContent).not.toMatch(/cluster/i)
    expectNoDeveloperDetails()
  })

  it('renders trains without naming riders when the standings are empty', async () => {
    const snapshot = load()
    contestOf(snapshot).standings = []

    await renderLive(snapshot, '/live/nfl?view=trains')

    expect(screen.getByRole('heading', { name: /^×312/ })).toBeInTheDocument()
    expect(screen.queryByText(/riding it/i)).not.toBeInTheDocument()
  })

  it('reads no rows from the pre-v3 standings object shape', async () => {
    const snapshot = load()
    contestOf(snapshot).standings = {
      updated_at: '2026-10-04T18:41:34Z',
      rows: [{ entry_key: 'old-row', username: 'Old Row', rank: 1, points: 10 }],
    }

    await renderLive(snapshot, '/live/nfl?view=trains')

    expect(screen.getByRole('heading', { name: /^×312/ })).toBeInTheDocument()
    expect(screen.queryByText(/old row/i)).not.toBeInTheDocument()
  })
})
