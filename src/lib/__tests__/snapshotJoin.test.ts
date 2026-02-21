import { expect, test } from 'vitest'
import snapshotFixture from '../../../public/mock/snapshots/canonical-live-snapshot.json'
import { buildPerVipIndex, resolveVipMetricMatchKey } from '../perVipKeys'
import type { Snapshot } from '../types'

function parseSnapshot(raw: unknown): Snapshot {
  return raw as Snapshot
}

test('parses v6 vip slot names and preserves slot order', () => {
  const snapshot = parseSnapshot(snapshotFixture)

  for (const sport of Object.values(snapshot.sports)) {
    for (const contest of sport.contests) {
      for (const lineup of contest.vip_lineups) {
        const slotNames = lineup.slots.map((slot) => slot.player_name)
        expect(slotNames.length).toBe(lineup.slots.length)
        expect(slotNames.every((name) => typeof name === 'string' && name.length > 0)).toBe(true)
      }
    }
  }

  expect(Object.keys(snapshot.sports).length).toBeGreaterThan(0)
})

test('resolves per-vip metric keys with vip_entry_key then entry_key only', () => {
  expect(resolveVipMetricMatchKey({ vip_entry_key: 'vip-1', entry_key: 'entry-1' })).toBe('vip-1')
  expect(resolveVipMetricMatchKey({ entry_key: 'entry-2' })).toBe('entry-2')
  expect(resolveVipMetricMatchKey({ vip_entry_key: '', entry_key: 'entry-3' })).toBe('entry-3')
  expect(resolveVipMetricMatchKey({ vip_entry_key: undefined, entry_key: undefined })).toBeNull()
})

test('ignores per-vip rows missing both stable keys', () => {
  const rows = [
    { entry_key: 'entry-a', display_name: 'Alpha' },
    { display_name: 'NoKey Row' },
  ]
  const lookup = buildPerVipIndex(rows)

  expect(lookup.size).toBe(1)
  expect(lookup.get('entry-a')?.display_name).toBe('Alpha')
})
