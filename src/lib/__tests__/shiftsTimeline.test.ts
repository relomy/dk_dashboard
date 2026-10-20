import { describe, expect, it } from 'vitest'
import type { LiveModel } from '../liveModel'
import { T0, nflModel, KEY, LAWRENCE, pooled, cashLine, INSIDE, OUTSIDE, MINUTE, completed } from './shiftsTestKit'
import { buildTimeline, digestOf, type Digest, type TimelineInput, type VipShiftItem } from '../shifts'

describe('timeline', () => {
  const minute = (n: number) => `2026-10-04T18:${String(40 + n).padStart(2, '0')}:00Z`

  /** A digest of an NFL model stamped as the snapshot taken `n` minutes after 18:40. */
  function snap(n: number, model: LiveModel = nflModel()): Digest {
    return digestOf({ ...model, snapshotAt: minute(n) }, T0 + n * MINUTE)
  }

  const stepsOf = (inputs: TimelineInput[], options?: Parameters<typeof buildTimeline>[1]) =>
    buildTimeline(inputs, options).entries

  describe('steps', () => {
    it('is empty for no snapshot or one snapshot', () => {
      expect(stepsOf([])).toEqual([])
      expect(stepsOf([snap(0)])).toEqual([])
    })

    it('makes one step per consecutive snapshot pair, newest first, timed by the later snapshot', () => {
      const entries = stepsOf([
        snap(0),
        snap(5, nflModel({ EmpireMaker2: { rank: 480 } })),
        snap(10, nflModel({ EmpireMaker2: { rank: 400 } })),
        snap(15, nflModel({ EmpireMaker2: { rank: 400 } })),
      ])
      expect(entries.map((entry) => [entry.kind, entry.snapshotAt])).toEqual([
        ['step', minute(15)],
        ['step', minute(10)],
        ['step', minute(5)],
      ])
      const [newest, middle] = entries
      expect(newest).toMatchObject({ kind: 'step', items: [] })
      expect(middle).toMatchObject({
        kind: 'step',
        items: [{ vipKey: KEY.empire, rank: { from: 480, to: 400 }, snapshotAt: minute(10) }],
      })
    })

    it('gives the same item and step ids when the same snapshots are rebuilt later', () => {
      const models = [
        nflModel(),
        nflModel({ EmpireMaker2: { rank: 480 } }, cashLine(33.5, 505)),
        nflModel({ EmpireMaker2: INSIDE }),
      ]
      const build = (clock: number) =>
        stepsOf(models.map((model, n) => digestOf({ ...model, snapshotAt: minute(n * 5) }, clock + n)))
      const ids = (entries: ReturnType<typeof build>) =>
        entries.flatMap((entry) => [entry.id, ...(entry.kind === 'step' ? entry.items.map((item) => item.id) : [])])
      expect(ids(build(1))).toEqual(ids(build(999_999)))
      expect(new Set(ids(build(1))).size).toBe(ids(build(1)).length)
    })

    it('shows a VIP crossing in and then out as two items in two steps, both High', () => {
      const entries = stepsOf([
        snap(0),
        snap(5, nflModel({ EmpireMaker2: INSIDE })),
        snap(10, nflModel({ EmpireMaker2: OUTSIDE })),
      ])
      const crossings = entries.map((entry) => (entry.kind === 'step' ? entry.items : []))
      expect(crossings).toEqual([
        [
          expect.objectContaining({
            vipKey: KEY.empire,
            priority: 'high',
            crossing: expect.objectContaining({ path: 'out' }),
          }),
        ],
        [
          expect.objectContaining({
            vipKey: KEY.empire,
            priority: 'high',
            crossing: expect.objectContaining({ path: 'in' }),
          }),
        ],
      ])
    })
  })

  describe('cash line', () => {
    const itemsOf = (entry: ReturnType<typeof stepsOf>[number]) => (entry.kind === 'step' ? entry.items : [])

    it('links a cash line move to the crossing it caused, in the same step', () => {
      const [step] = stepsOf([snap(0), snap(5, nflModel({ EmpireMaker2: INSIDE }, cashLine(33.5, 505)))])
      const items = itemsOf(step)
      const vip = items.find((item): item is VipShiftItem => item.kind === 'vip')
      const line = items.find((item) => item.kind === 'cash-line')
      expect(vip?.crossing?.cause).not.toBeNull()
      expect(line).toMatchObject({ kind: 'cash-line', causedCrossings: [vip?.id] })
    })

    it('lists a cash line move with no crossing as its own item with no cause link', () => {
      const [step] = stepsOf([snap(0), snap(5, nflModel({}, cashLine(33.5, 505)))])
      expect(itemsOf(step)).toEqual([expect.objectContaining({ kind: 'cash-line', parts: ['cash-line'] })])
      expect(itemsOf(step)[0]).not.toHaveProperty('causedCrossings')
    })

    it('does not link a crossing when the line moved in another step', () => {
      const entries = stepsOf([
        snap(0),
        snap(5, nflModel({}, cashLine(33.5, 505))),
        snap(10, nflModel({ EmpireMaker2: INSIDE }, cashLine(33.5, 505))),
      ])
      expect(itemsOf(entries[0]).map((item) => item.kind)).toEqual(['vip'])
      expect(itemsOf(entries[1]).map((item) => item.kind)).toEqual(['cash-line'])
    })
  })

  describe('per-step moves', () => {
    it('applies the thresholds to each step, so a slow drift under them is not reported', () => {
      const entries = stepsOf([
        snap(0),
        snap(5, nflModel({ EmpireMaker2: { rank: 510 } })),
        snap(10, nflModel({ EmpireMaker2: { rank: 509 } })),
        snap(15, nflModel({ EmpireMaker2: { rank: 508 } })),
      ])
      expect(entries.map((entry) => (entry.kind === 'step' ? entry.items : null))).toEqual([[], [], []])
    })

    it('reports a player event and exposes the whole lineup, changed or not', () => {
      const [moved] = stepsOf([
        snap(0),
        snap(
          5,
          nflModel({ EmpireMaker2: { rank: 480 } }, (snapshot) =>
            pooled(snapshot, LAWRENCE, { fantasy_points: 15.44, game_status: 'Final' }),
          ),
        ),
      ])
      const item = (moved.kind === 'step' ? moved.items : [])[0] as VipShiftItem
      expect(item.parts).toEqual(['rank-points', 'player-events'])
      expect(item.lineup?.length).toBeGreaterThan(1)
      expect(item.lineup?.some((slot) => slot.pointsMove === 0)).toBe(true)
    })

    it('carries no VIP display names', () => {
      const entries = stepsOf([snap(0), snap(5, nflModel({ EmpireMaker2: { rank: 480 } }))])
      expect(JSON.stringify(entries)).not.toContain('EmpireMaker2')
    })
  })

  describe('gaps', () => {
    it('puts a gap entry with its reason where the skipped snapshot was and compares across it', () => {
      const entries = stepsOf([
        snap(0),
        { reason: 'unavailable', snapshotAt: minute(5) },
        snap(10, nflModel({ EmpireMaker2: { rank: 480 } })),
      ])
      expect(entries.map((entry) => [entry.kind, entry.snapshotAt])).toEqual([
        ['step', minute(10)],
        ['gap', minute(5)],
      ])
      expect(entries[0]).toMatchObject({ items: [{ vipKey: KEY.empire, rank: { from: 511, to: 480 } }] })
      expect(entries[1]).toMatchObject({ kind: 'gap', reason: 'unavailable' })
    })

    it('keeps a not-fresh reason, and several gaps in a row, and a gap at the start', () => {
      const entries = stepsOf([
        { reason: 'not-fresh', snapshotAt: minute(0) },
        snap(5),
        { reason: 'not-fresh', snapshotAt: minute(10) },
        { reason: 'unavailable', snapshotAt: minute(15) },
        snap(20),
      ])
      expect(entries.map((entry) => [entry.kind, entry.kind === 'gap' ? entry.reason : null])).toEqual([
        ['step', null],
        ['gap', 'unavailable'],
        ['gap', 'not-fresh'],
        ['gap', 'not-fresh'],
      ])
    })
  })

  describe('completed contest', () => {
    const done = (changes = {}) => nflModel(changes, completed)

    it('gives every step up to completion, then one High item with the final standings, and nothing after', () => {
      const entries = stepsOf([
        snap(0),
        snap(5, nflModel({ EmpireMaker2: { rank: 480 } })),
        snap(10, done({ EmpireMaker2: { rank: 470 } })),
        snap(15, done({ EmpireMaker2: { rank: 400 } })),
        snap(20, done()),
      ])
      const items = entries.map((entry) => (entry.kind === 'step' ? entry.items : []))
      expect(items[0]).toEqual([])
      expect(items[1]).toEqual([])
      expect(items[3]).toHaveLength(1)
      expect(items[2]).toEqual([
        expect.objectContaining({
          kind: 'contest-state',
          priority: 'high',
          state: { from: 'live', to: 'completed' },
          standings: expect.arrayContaining([
            { vipKey: KEY.empire, rank: { from: 480, to: 470 }, points: expect.anything(), cashing: false },
          ]),
        }),
      ])
    })

    it('holds final standings once, not as per-VIP items', () => {
      const entries = stepsOf([snap(0), snap(5, done({ EmpireMaker2: { rank: 400 } }))])
      const items = entries[0].kind === 'step' ? entries[0].items : []
      expect(items.map((item) => item.kind)).toEqual(['contest-state'])
      expect(items[0].kind === 'contest-state' && items[0].standings).toHaveLength(nflModel().vips.length)
    })
  })

  describe('range note', () => {
    it('says the timeline starts from the oldest snapshot by default', () => {
      expect(buildTimeline([snap(5), snap(10)]).rangeNote).toEqual({ kind: 'from', snapshotAt: minute(5) })
    })

    it('says the contest start or the cap when told what stopped the range', () => {
      expect(buildTimeline([snap(5), snap(10)], { reach: 'contest-start' }).rangeNote).toEqual({
        kind: 'contest-start',
        snapshotAt: minute(5),
      })
      expect(buildTimeline([snap(5), snap(10)], { reach: 'cap' }).rangeNote).toEqual({
        kind: 'cap',
        snapshotAt: minute(5),
      })
    })

    it('has no note without snapshots', () => {
      expect(buildTimeline([]).rangeNote).toBeNull()
    })
  })
})
