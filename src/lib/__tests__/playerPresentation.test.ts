import { describe, expect, it } from 'vitest'
import { classifyValueTier, isRelevantPlayerRow, normalizeTeamCode, toFiniteNumber } from '../playerPresentation'

describe('playerPresentation', () => {
  it('coerces non-numeric values to 0', () => {
    expect(toFiniteNumber(undefined)).toBe(0)
    expect(toFiniteNumber('abc')).toBe(0)
  })

  it('uses deterministic relevance rule with value as a positive signal', () => {
    expect(isRelevantPlayerRow({ ownershipPct: 0, points: 0, value: 0 })).toBe(false)
    expect(isRelevantPlayerRow({ ownershipPct: 0, points: 0.1, value: 0 })).toBe(true)
    expect(isRelevantPlayerRow({ ownershipPct: 0, points: 0, value: 1 })).toBe(true)
  })

  it('normalizes nba team aliases', () => {
    expect(normalizeTeamCode('nba', 'gs')).toBe('GSW')
  })

  it('classifies value tiers from sheet thresholds', () => {
    expect(classifyValueTier(8)).toBe('elite')
    expect(classifyValueTier(5)).toBe('strong')
    expect(classifyValueTier(3)).toBe('medium')
    expect(classifyValueTier(2.99)).toBe('low')
  })

  it('treats blank-like values as unknown', () => {
    expect(classifyValueTier('')).toBe('unknown')
    expect(classifyValueTier('   ')).toBe('unknown')
    expect(classifyValueTier(null)).toBe('unknown')
    expect(classifyValueTier(undefined)).toBe('unknown')
  })
})
