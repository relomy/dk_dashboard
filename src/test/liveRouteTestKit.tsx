import { screen } from '@testing-library/react'
import { expect } from 'vitest'
import { contestOf, type Json } from './liveHarness'

export function setTrains(snapshot: Json, trains: Array<{ id: string; size: number; players: string[] }>) {
  contestOf(snapshot).train_clusters = trains.map((train, index) => ({
    cluster_id: train.id,
    user_count: train.size,
    rank: index + 1,
    points: 100,
    pmr: 50,
    lineup_signature: train.players.join('|'),
    entry_keys: [],
  }))
}

/** No developer notes, issue links or internal identifiers anywhere on the page. */
export function expectNoDeveloperDetails() {
  const text = document.body.textContent ?? ''
  expect(text).not.toMatch(/dk_results|#156|feed does not provide/i)
  expect(text).not.toMatch(/contest key|contest id|selection reason|explicit_id|configured (key|id)/i)
  expect(text).not.toMatch(/\/sport\//)
  expect(text).not.toMatch(/196169749|196164820/)
  for (const link of screen.queryAllByRole('link')) {
    expect(link).not.toHaveAttribute('href', expect.stringContaining('github.com'))
  }
}
