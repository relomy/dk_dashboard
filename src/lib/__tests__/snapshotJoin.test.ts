import { expect, test } from 'vitest'
import { buildPerVipIndex, resolveVipMetricMatchKey } from '../perVipKeys'

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
