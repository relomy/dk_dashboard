import { screen, within } from '@testing-library/react'
import { contestOf, setPlayers, type Json } from './liveHarness'

// The Live Train view: rail rows, the focused Train's stats, VIP overlap, riding entries and grouped
// lineup, plus the VIP view's overlap notice. The last block runs on the captured NFL slate as it is.
// The rest hand-build trains (and the player pool behind them) over that fixture, because the cases need
// what it lacks: the captured trains carry no `min_shared_slots`, no standings rows for their riders, and
// every player is in progress, so closeness labels, sizes, ranks, rider names and game-status groups
// are set by the test.

export const LINEUP = 'Live Guy|Later Guy|Finished Guy|Fourth Guy|Fifth Guy|Sixth Guy|Seventh Guy|Eighth Guy'

export const BIG = {
  cluster_id: 'big',
  cluster_rule: 'salary_remaining<=40000_and_same_points_pmr',
  user_count: 19,
  rank: 16,
  points: 198.254,
  pmr: 142.04,
  lineup_signature: LINEUP,
  entry_keys: ['k1', 'k2', 'k3'],
}
export const SMALL = {
  cluster_id: 'small',
  cluster_rule: 'salary_remaining<=40000_and_same_points_pmr',
  user_count: 3,
  rank: 88,
  points: 120.5,
  pmr: 116,
  lineup_signature: 'Live Guy|Zed|Yan|Xi|Wu|Vu|Ut|Tu',
  entry_keys: ['k9'],
}

export function setTrains(snapshot: Json, trains: Json[]) {
  contestOf(snapshot).train_clusters = trains
}

/** The pool behind the first three players of `LINEUP`. */
export function setLineupPool(snapshot: Json) {
  setPlayers(snapshot, [
    {
      name: 'Live Guy',
      team: 'FSU',
      position: 'QB',
      matchup: 'FSU@MIZZ',
      game_status: 'In-Progress',
      fantasy_points: 12.5,
      ownership_pct: 31.5,
      value: 4.5,
    },
    {
      name: 'Later Guy',
      team: 'MIZZ',
      position: 'RB',
      game_status: 'FSU@MIZZ 07:30PM ET',
      fantasy_points: 0,
      ownership_pct: 12,
      value: null,
    },
    {
      name: 'Finished Guy',
      team: 'FSU',
      position: 'WR',
      matchup: 'ISU@ARIZ',
      game_status: 'Final',
      fantasy_points: 30,
      ownership_pct: 55,
      value: 6.5,
    },
  ])
}

export function setStandings(snapshot: Json) {
  contestOf(snapshot).standings = ['k1', 'k2', 'k3', 'k9'].map((entry_key, index) => ({
    entry_key,
    username: `rider-${entry_key}`,
    rank: index + 1,
  }))
}

export const TRAINS = '/live/nfl?view=trains'

export function chips() {
  return screen.getByRole('navigation', { name: /^trains$/i })
}

/** One of the focused Train's stats, a labelled group. */
export function stat(label: string) {
  return within(screen.getByRole('group', { name: label }))
}

export function trainHeading() {
  return screen.getByRole('heading', { name: /^×\d+/ })
}
