import { CASH_LINE_POINTS_THRESHOLD, CASH_LINE_RANK_THRESHOLD } from './shiftsConfig'
import type { Digest } from './shiftsDigest'
import type { CashLineMove, Move, ShiftItem } from './shiftsTypes'

export function moveOf<T>(from: T, to: T): Move<T> {
  return { from, to }
}

/** True when both sides are known and differ by at least the threshold (rounded to absorb float noise). */
export function movedBy(move: Move<number | null>, threshold: number): boolean {
  if (move.from === null || move.to === null) return false
  return Math.round(Math.abs(move.to - move.from) * 1e6) >= Math.round(threshold * 1e6)
}

export function sameValue<T>(move: Move<T>): boolean {
  return move.from === move.to
}

/** Rounded so that float noise in a points subtraction does not show. */
export function pointsMoveOf(from: number | null, to: number | null): number | null {
  if (from === null || to === null) return null
  return Math.round((to - from) * 1e6) / 1e6
}

/** True when either figure of the cash line moved by at least its threshold. */
export function cashLineMoved(move: CashLineMove): boolean {
  return movedBy(move.points, CASH_LINE_POINTS_THRESHOLD) || movedBy(move.rank, CASH_LINE_RANK_THRESHOLD)
}

export function cashLineMoveOf(from: Digest, to: Digest): CashLineMove {
  return {
    points: moveOf(from.cashLine.points, to.cashLine.points),
    rank: moveOf(from.cashLine.rank, to.cashLine.rank),
  }
}

/** Every item and log entry id is `kind:part:part`; the formats live here. */
export function itemId(kind: ShiftItem['kind'] | 'crossing', ...parts: (string | number)[]): string {
  return [kind, ...parts].join(':')
}
