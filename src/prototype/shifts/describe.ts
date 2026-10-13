/** PROTOTYPE (issue #81): throwaway, not for main. Plain-text formatting the UI derives from feed items. */
import { formatPoints } from '../../lib/format'
import type {
  CashLineChange,
  CrossingPath,
  FeedItem,
  FromTo,
  GapSummaryData,
  ShiftsOutput,
} from './sampleOutputs'
import { vipFor } from './sampleOutputs'

export function signed(value: number, digits = 2): string {
  const text = Math.abs(value).toFixed(digits)
  return value > 0 ? `+${text}` : value < 0 ? `-${text}` : text
}

export function delta(pair: FromTo): number | null {
  return pair.from === null || pair.to === null ? null : pair.to - pair.from
}

/** The name a sentence uses: "You" when the Profile tracks one VIP, who is the viewer. */
export function subject(output: ShiftsOutput, vipKey: string): string {
  return output.vips.length === 1 ? 'You' : vipFor(output, vipKey).name
}

export const PATH_LABEL: Record<CrossingPath, string> = {
  in: 'moved into cashing',
  out: 'fell out of cashing',
  'in-then-out': 'crossed into cashing and back out',
  'out-then-in': 'fell out of cashing and back in',
}

/** Words for how a cash line move landed, for a crossing's cause. */
export function lineMoveText(change: CashLineChange): string {
  const points = delta(change.points)
  const rank = delta(change.rank)
  const parts: string[] = []
  if (points !== null && points !== 0) parts.push(`${signed(points)} pts to ${formatPoints(change.points.to)}`)
  if (rank !== null && rank !== 0) parts.push(`${rank > 0 ? 'down' : 'up'} ${Math.abs(rank)} places to ${change.rank.to}`)
  return parts.join(' and ')
}

/** One line for a feed item: the banner, the gap summary and list headers all use it. */
export function oneLine(item: FeedItem, output: ShiftsOutput): string {
  switch (item.kind) {
    case 'cash-crossing': {
      const name = subject(output, item.vipKey)
      const cause = item.cause ? `, because the cash line moved ${lineMoveText(item.cause)}` : ''
      return `${name} ${PATH_LABEL[item.path]}${cause}`
    }
    case 'vip-move': {
      const name = subject(output, item.vipKey)
      const rank = delta(item.rank)
      const pts = delta(item.points)
      const bits: string[] = []
      if (rank !== null && rank !== 0) bits.push(`${rank < 0 ? 'up' : 'down'} ${Math.abs(rank)} places`)
      if (pts !== null && pts !== 0) bits.push(`${signed(pts)} pts`)
      return `${name} moved ${bits.join(', ') || 'a little'}`
    }
    case 'cash-line-move':
      return `The cash line moved ${lineMoveText(item.change)}`
    case 'contest-state':
      return `The contest is ${item.to}: final standings are in`
    case 'final-standing': {
      const name = subject(output, item.vipKey)
      return `${name} finished ${item.cashing ? 'cashing' : 'outside the cash line'} at rank ${item.rank.to}`
    }
  }
}

/** Decision 3: the module returns data (count, top item, minutes away); the UI words it. */
export function gapSummaryLine(gap: GapSummaryData, output: ShiftsOutput): string {
  const away = gap.awayMinutes >= 120 ? `${Math.round(gap.awayMinutes / 60)}h` : `${gap.awayMinutes} min`
  const lead = `While you were away (${away}): ${gap.count} ${gap.count === 1 ? 'shift' : 'shifts'}`
  return gap.top ? `${lead}. Top: ${oneLine(gap.top, output)}.` : `${lead}.`
}
