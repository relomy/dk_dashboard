import { describe, expect, it } from 'vitest'
import { formatAge } from '../format'

const NOW = '2026-10-04T12:00:00Z'

describe('formatAge', () => {
  it.each([
    ['2026-10-04T11:59:30Z', 'just now'],
    ['2026-10-04T11:59:00Z', '1m ago'],
    ['2026-10-04T11:01:00Z', '59m ago'],
    ['2026-10-04T11:00:00Z', '1h ago'],
    ['2026-10-03T12:01:00Z', '23h ago'],
    ['2026-10-03T12:00:00Z', '1d ago'],
    ['2026-10-01T12:00:00Z', '3d ago'],
    ['2026-10-04T12:05:00Z', 'just now'],
  ])('reads %s as %s', (then, expected) => {
    expect(formatAge(then, NOW)).toBe(expected)
  })

  it.each([
    ['not a date', NOW],
    ['', NOW],
    [NOW, 'not a date'],
  ])('returns null for unparseable input (%j, %j)', (then, now) => {
    expect(formatAge(then, now)).toBeNull()
  })
})
