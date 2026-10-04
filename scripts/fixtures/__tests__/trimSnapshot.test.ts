import { describe, expect, it } from 'vitest'

import prodFixtureText from '../../../public/mock/snapshots/live-2026-10-04T18-41-34Z.json?raw'
import { trimSnapshot } from '../lib/trimSnapshot'

describe('committed prod fixture', () => {
  it('already satisfies the trimming rules, so a refresh would not drop more rows', () => {
    expect(trimSnapshot(prodFixtureText).text).toBe(prodFixtureText)
  })
})

// Producer formatting: two-space indent, no space after the colon, floats keep their `.0`.
const PRODUCER_TEXT = `{
  "schema_version":3,
  "sports":{
    "golf":{
      "contests":[
        {
          "standings":[
            {
              "entry_key":"1",
              "is_cashing":true,
              "pmr":94.0,
              "points":614.5,
              "rank":1
            },
            {
              "entry_key":"2",
              "is_cashing":true,
              "pmr":90.0,
              "points":600.0,
              "rank":2
            },
            {
              "entry_key":"3",
              "is_cashing":false,
              "pmr":80.0,
              "points":500.0,
              "rank":3
            },
            {
              "entry_key":"4",
              "is_cashing":false,
              "pmr":70.0,
              "points":400.0,
              "rank":4
            }
          ]
        }
      ],
      "players":[]
    }
  }
}
`

describe('trimSnapshot', () => {
  it('drops standings rows past the head and copies every kept byte verbatim', () => {
    const { text } = trimSnapshot(PRODUCER_TEXT, { standingsHead: 1, mostOwned: 0 })

    expect(text).toBe(`{
  "schema_version":3,
  "sports":{
    "golf":{
      "contests":[
        {
          "standings":[
            {
              "entry_key":"1",
              "is_cashing":true,
              "pmr":94.0,
              "points":614.5,
              "rank":1
            },
            {
              "entry_key":"2",
              "is_cashing":true,
              "pmr":90.0,
              "points":600.0,
              "rank":2
            },
            {
              "entry_key":"3",
              "is_cashing":false,
              "pmr":80.0,
              "points":500.0,
              "rank":3
            }
          ]
        }
      ],
      "players":[]
    }
  }
}
`)
  })
})

type Row = { entry_key: string; is_cashing: boolean; is_vip: boolean; points: number; rank: number }

function row(entryKey: string, rank: number, points: number, isCashing = true, isVip = false): Row {
  return { entry_key: entryKey, is_cashing: isCashing, is_vip: isVip, points, rank }
}

function snapshotText(contest: Record<string, unknown>, players: unknown[] = []): string {
  return `${JSON.stringify({ schema_version: 3, sports: { nfl: { contests: [contest], players } } }, null, 2)}\n`
}

function keptEntryKeys(text: string): string[] {
  const parsed = JSON.parse(text) as { sports: { nfl: { contests: Array<{ standings: Row[] }> } } }
  return parsed.sports.nfl.contests[0].standings.map((item) => item.entry_key)
}

describe('trimSnapshot standings', () => {
  const head = [row('a', 1, 90), row('b', 2, 80)]
  const options = { standingsHead: 1, mostOwned: 0 }

  it('keeps every tracked VIP row, flagged or named in vip_lineups', () => {
    const text = snapshotText({
      standings: [...head, row('flagged', 3, 70, true, true), row('lineup', 4, 60), row('x', 5, 50)],
      vip_lineups: [{ entry_key: 'lineup', players_live: [] }],
    })

    expect(keptEntryKeys(trimSnapshot(text, options).text)).toEqual(['a', 'flagged', 'lineup', 'x'])
  })

  it('keeps every row the ownership watchlist references', () => {
    const text = snapshotText({
      standings: [...head, row('watched', 3, 70), row('y', 4, 60), row('x', 5, 50)],
      ownership_watchlist: { entries: [{ entry_key: 'watched' }] },
    })

    expect(keptEntryKeys(trimSnapshot(text, options).text)).toEqual(['a', 'watched', 'x'])
  })

  it('keeps whole tie groups so a kept tied score is never shown alone', () => {
    const text = snapshotText({
      standings: [
        row('a', 1, 90),
        row('a-tie', 1, 90),
        row('b', 3, 80),
        row('watched', 4, 70),
        row('watched-tie', 4, 70),
        row('c', 6, 60),
        row('x', 7, 50),
      ],
      ownership_watchlist: { entries: [{ entry_key: 'watched' }] },
    })

    expect(keptEntryKeys(trimSnapshot(text, options).text)).toEqual([
      'a',
      'a-tie',
      'watched',
      'watched-tie',
      'x',
    ])
  })
})

describe('trimSnapshot players', () => {
  function player(name: string, ownership: number) {
    return { name, ownership_pct: ownership, player_key: `nfl:${name.toLowerCase()}` }
  }

  function keptPlayerNames(text: string): string[] {
    const parsed = JSON.parse(text) as { sports: { nfl: { players: Array<{ name: string }> } } }
    return parsed.sports.nfl.players.map((item) => item.name)
  }

  it('keeps VIP lineup, train signature and metric players plus the most owned', () => {
    const players = [
      player('Unused', 1),
      player('Vip', 2),
      player('Dst', 3),
      player('Train', 4),
      player('Swing', 5),
      player('Remaining', 6),
      player('Chalk', 90),
      player('Second', 80),
    ]
    const text = snapshotText(
      {
        standings: [],
        vip_lineups: [
          {
            entry_key: 'v',
            players_live: [
              { player_key: 'nfl:vip', player_name: 'Vip' },
              { player_key: 'nfl:dst', player_name: 'Dst ' },
              { is_locked: true, player_name: 'LOCKED' },
            ],
          },
        ],
        train_clusters: [{ lineup_signature: 'Train|LOCKED|Vip' }],
        metrics: {
          threat: { top_swing_players: [{ player_key: 'nfl:swing', player_name: 'Swing' }] },
          non_cashing: { top_remaining_players: [{ player_name: 'Remaining' }] },
        },
      },
      players,
    )

    expect(keptPlayerNames(trimSnapshot(text, { standingsHead: 0, mostOwned: 1 }).text)).toEqual([
      'Vip',
      'Dst',
      'Train',
      'Swing',
      'Remaining',
      'Chalk',
    ])
  })
})
