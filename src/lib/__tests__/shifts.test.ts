import { describe, expect, it } from 'vitest'
// Exported by the dk_results producer: cfb and mlb contests (provenance in public/mock/PRODUCER_FIXTURE.md).
import producerSnapshot from '../../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import { buildLiveModel, type LiveModel } from '../liveModel'
import { createShiftsFeed, type ShiftsStorage } from '../shifts'

/* eslint-disable @typescript-eslint/no-explicit-any */
function modelOf(sport: string, mutate: (snapshot: any) => void = () => {}): LiveModel {
  const snapshot: any = structuredClone(producerSnapshot)
  mutate(snapshot)
  const result = buildLiveModel(snapshot, sport)
  if (result.kind !== 'ready') throw new Error(`Expected a renderable model, got ${result.reason.kind}`)
  return result.model
}

function otherSlate(snapshot: any) {
  snapshot.sports.cfb.contests[0].name = 'Tomorrow Slate'
  snapshot.sports.cfb.contests[0].start_time = '2099-01-01T00:00:00Z'
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function memoryStorage(initial: Record<string, string> = {}): ShiftsStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

const throwingStorage: ShiftsStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('quota')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

const T0 = Date.parse('2026-10-03T21:00:00Z')

function feedOver(storage: ShiftsStorage | null) {
  return createShiftsFeed({ storage, now: () => T0 })
}

function expectQuiet(feed: ReturnType<typeof feedOver>) {
  expect(feed.feed()).toEqual([])
  expect(feed.unseenCount()).toBe(0)
  expect(feed.unsurfaced()).toEqual([])
  expect(feed.gap()).toBeNull()
}

describe('first build', () => {
  it('seeds from the Live model and returns an empty feed', () => {
    const feed = feedOver(memoryStorage())
    feed.record(modelOf('cfb'), { visit: true })
    expectQuiet(feed)
  })

  it('stays empty on later builds of the same contest', () => {
    const feed = feedOver(memoryStorage())
    feed.record(modelOf('cfb'), { visit: true })
    feed.record(modelOf('cfb'), { visit: false })
    expectQuiet(feed)
  })
})

describe('switching', () => {
  it('seeds clean for a different primary contest and drops the old contest state', () => {
    const storage = memoryStorage()
    const feed = feedOver(storage)
    const oldModel = modelOf('cfb')
    feed.record(oldModel, { visit: true })
    feed.record(modelOf('cfb', otherSlate), { visit: true })
    expectQuiet(feed)
    const stored = [...storage.data.values()].join('')
    expect(stored).toContain('Tomorrow Slate')
    expect(stored).not.toContain(oldModel.contest.name)
  })

  it('seeds clean for a different sport', () => {
    const feed = feedOver(memoryStorage())
    feed.record(modelOf('cfb'), { visit: true })
    feed.record(modelOf('mlb'), { visit: true })
    expectQuiet(feed)
  })

  it('keeps separate stored state per sport', () => {
    const storage = memoryStorage()
    const feed = feedOver(storage)
    feed.record(modelOf('cfb'), { visit: true })
    expect(storage.data.size).toBe(1)
    const [[cfbKey, cfbValue]] = [...storage.data.entries()]
    feed.record(modelOf('mlb'), { visit: true })
    expect(storage.data.size).toBe(2)
    expect(storage.data.get(cfbKey)).toBe(cfbValue)
  })
})

describe('unusable storage', () => {
  it('leaves the feed empty when storage is missing', () => {
    const feed = feedOver(null)
    expect(() => feed.record(modelOf('cfb'), { visit: true })).not.toThrow()
    expectQuiet(feed)
  })

  it('leaves the feed empty when storage throws', () => {
    const feed = feedOver(throwingStorage)
    expect(() => feed.record(modelOf('cfb'), { visit: true })).not.toThrow()
    expect(() => feed.markSeen()).not.toThrow()
    expect(() => feed.markSurfaced(['x'])).not.toThrow()
    expectQuiet(feed)
  })

  it.each(['{not json', '"a string"', 'null', '{"contest":42}', '[]'])(
    'recovers from corrupt stored value %s',
    (corrupt) => {
      const probe = memoryStorage()
      feedOver(probe).record(modelOf('cfb'), { visit: true })
      const [key] = [...probe.data.keys()]
      const storage = memoryStorage({ [key]: corrupt })
      const feed = feedOver(storage)
      expect(() => feed.record(modelOf('cfb'), { visit: true })).not.toThrow()
      expectQuiet(feed)
      expect(() => JSON.parse(storage.data.get(key) ?? '')).not.toThrow()
    },
  )
})

describe('acknowledging', () => {
  it('markSurfaced and markSeen change nothing on a seeded feed', () => {
    const feed = feedOver(memoryStorage())
    feed.record(modelOf('cfb'), { visit: true })
    expect(() => feed.markSurfaced(['missing'])).not.toThrow()
    expect(() => feed.markSeen()).not.toThrow()
    expectQuiet(feed)
  })
})
