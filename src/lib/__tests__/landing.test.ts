import { afterEach, describe, expect, it, vi } from 'vitest'
import producerSnapshot from '../../../public/mock/snapshots/live-2026-10-03T20-48-31Z.json'
import { chooseLandingSport, readLastViewedSport, writeLastViewedSport } from '../landing'
import type { Snapshot } from '../types'

/** The producer fixture has cfb, golf and mlb, each with a live primary contest. */
function load(): Snapshot {
  return structuredClone(producerSnapshot) as unknown as Snapshot
}

function finish(snapshot: Snapshot, sport: string) {
  snapshot.sports[sport].contests[0].state = 'completed'
}

describe('chooseLandingSport', () => {
  it('lands on a sport with a live primary contest over the last-viewed sport', () => {
    const snapshot = load()
    finish(snapshot, 'cfb')
    finish(snapshot, 'golf')
    expect(chooseLandingSport(snapshot, 'cfb')).toBe('mlb')
  })

  it('prefers a completed primary contest over a stale last-viewed sport', () => {
    const snapshot = load()
    for (const sport of Object.keys(snapshot.sports)) finish(snapshot, sport)
    expect(chooseLandingSport(snapshot, 'cfb')).toBe('mlb')
  })

  it('prefers a live primary contest over a more recent completed one', () => {
    const snapshot = load()
    finish(snapshot, 'mlb')
    snapshot.sports.mlb.contests[0].start_time = '2026-10-04T01:00:00Z'
    finish(snapshot, 'cfb')
    expect(chooseLandingSport(snapshot, null)).toBe('golf')
  })

  it('opens the most recently completed primary contest when several are completed', () => {
    const snapshot = load()
    for (const sport of Object.keys(snapshot.sports)) finish(snapshot, sport)
    snapshot.sports.golf.contests[0].start_time = '2026-10-04T01:00:00Z'
    expect(chooseLandingSport(snapshot, null)).toBe('golf')
  })

  it('ignores cancelled contests', () => {
    const snapshot = load()
    for (const sport of Object.keys(snapshot.sports)) finish(snapshot, sport)
    snapshot.sports.mlb.contests[0].state = 'cancelled'
    snapshot.sports.cfb.contests[0].state = 'cancelled'
    expect(chooseLandingSport(snapshot, null)).toBe('golf')
  })

  it('falls back to the last-viewed sport when nothing is live or completed', () => {
    const snapshot = load()
    for (const sport of Object.keys(snapshot.sports)) snapshot.sports[sport].contests[0].state = 'cancelled'
    expect(chooseLandingSport(snapshot, 'mlb')).toBe('mlb')
    expect(chooseLandingSport(snapshot, null)).toBe('cfb')
  })

  it('does not count a completed contest that is not the primary one', () => {
    const snapshot = load()
    finish(snapshot, 'mlb')
    const decoy = structuredClone(snapshot.sports.golf.contests[0])
    decoy.contest_id = 'decoy'
    decoy.contest_key = 'golf:decoy'
    decoy.state = 'completed'
    decoy.start_time = '2026-10-09T00:00:00Z'
    snapshot.sports.golf.contests.push(decoy)
    snapshot.sports.golf.contests[0].state = 'cancelled'
    snapshot.sports.cfb.contests[0].state = 'cancelled'
    expect(chooseLandingSport(snapshot, null)).toBe('mlb')
  })

  it('ignores a last-viewed sport that is no longer in the snapshot', () => {
    expect(chooseLandingSport(load(), 'nba')).toBe('cfb')
  })

  it('picks the first sport whose primary contest is live', () => {
    const snapshot = load()
    finish(snapshot, 'cfb')
    expect(chooseLandingSport(snapshot, null)).toBe('golf')
  })

  it('does not count a live contest that is not the primary one', () => {
    const snapshot = load()
    finish(snapshot, 'cfb')
    const decoy = structuredClone(snapshot.sports.cfb.contests[0])
    decoy.contest_id = 'decoy'
    decoy.contest_key = 'cfb:decoy'
    decoy.state = 'live'
    snapshot.sports.cfb.contests.push(decoy)
    expect(chooseLandingSport(snapshot, null)).toBe('golf')
  })

  it('skips sports whose configured primary contest is absent', () => {
    const snapshot = load()
    snapshot.sports.cfb.primary_contest.contest_key = 'cfb:missing'
    snapshot.sports.cfb.primary_contest.contest_id = 'missing'
    expect(chooseLandingSport(snapshot, null)).toBe('golf')
  })

  it('returns null when the snapshot has no sports', () => {
    const snapshot = load()
    snapshot.sports = {}
    expect(chooseLandingSport(snapshot, 'cfb')).toBeNull()
  })
})

/** Node's own `localStorage` shadows jsdom's in this environment, so tests bring a working one. */
function stubStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  })
}

describe('last-viewed sport storage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips the sport through the browser', () => {
    stubStorage()
    expect(readLastViewedSport()).toBeNull()
    writeLastViewedSport('mlb')
    expect(readLastViewedSport()).toBe('mlb')
  })

  it('degrades to nothing remembered when storage throws', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked })
    expect(() => writeLastViewedSport('mlb')).not.toThrow()
    expect(readLastViewedSport()).toBeNull()
  })

  it('degrades to nothing remembered when storage is absent', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => writeLastViewedSport('mlb')).not.toThrow()
    expect(readLastViewedSport()).toBeNull()
  })
})
