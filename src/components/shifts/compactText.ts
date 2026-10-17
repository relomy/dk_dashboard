import { formatPoints, formatRank, formatSigned } from '../../lib/format'
import type { LineupSlotDiff, Move, ShiftPart, VipShiftItem } from '../../lib/shifts'
import { lineMoveText, PATH_TEXT } from './shiftText'

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

const moved = (move: Move<number | null>) => move.from !== null && move.to !== null && move.from !== move.to

function playerEvent(slot: LineupSlotDiff): string | null {
  if (slot.locked.from && !slot.locked.to) return `${slot.name} revealed`
  if (slot.gameStatus.from !== null && slot.gameStatus.from !== 'final' && slot.gameStatus.to === 'final') return `${slot.name} final`
  if (slot.pointsMove !== null && slot.pointsMove !== 0) return `${slot.name} ${formatSigned(slot.pointsMove)}`
  return null
}

/** One VIP part as a short sentence for Compact, or null when the part carries nothing to say. */
export function compactVipLine(item: VipShiftItem, part: ShiftPart, name: string): string | null {
  switch (part) {
    case 'crossings': {
      if (!item.crossing) return null
      const cause = item.crossing.cause ? lineMoveText(item.crossing.cause) : ''
      const sentence = `${name} ${lowerFirst(PATH_TEXT[item.crossing.path])}`
      return cause ? `${sentence} (the cash line moved ${cause})` : sentence
    }
    case 'rank-points': {
      const figures = [
        moved(item.rank) ? `rank ${formatRank(item.rank.from)} → ${formatRank(item.rank.to)}` : null,
        moved(item.points) ? `points ${formatPoints(item.points.from)} → ${formatPoints(item.points.to)}` : null,
        moved(item.distanceToCashPoints) ? `to cash ${formatSigned(item.distanceToCashPoints.from)} → ${formatSigned(item.distanceToCashPoints.to)}` : null,
      ].filter((figure): figure is string => figure !== null)
      return figures.length > 0 ? `${name} ${figures.join(' · ')}` : null
    }
    case 'player-events': {
      const events = (item.lineup ?? []).map(playerEvent).filter((event): event is string => event !== null)
      return events.length > 0 ? `${name}: ${events.join(', ')}` : null
    }
    default:
      return null
  }
}
