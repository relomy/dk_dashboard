import { formatSigned } from '../../lib/format'
import type { LiveModel } from '../../lib/liveModel'
import type { CashLineMove, CrossingPath, ShiftItem } from '../../lib/shifts'
import type { ContestState } from '../../lib/types'

/** Words for a VIP item's cash crossing, as a card line; the banner lowercases the first letter to follow a name. */
export const PATH_TEXT: Record<CrossingPath, string> = {
  in: 'Moved into cashing',
  out: 'Fell out of cashing',
  'in then out': 'Crossed into cashing and back out',
  'out then in': 'Fell out of cashing and back in',
}

/** Words for a cash line move: its points and, when it shifted, its rank. */
export function lineMoveText(move: CashLineMove): string {
  const parts: string[] = []
  const { points, rank } = move
  if (points.from !== null && points.to !== null && points.to !== points.from) {
    parts.push(`${formatSigned(points.to - points.from)} pts`)
  }
  if (rank.from !== null && rank.to !== null && rank.to !== rank.from) {
    const places = rank.to - rank.from
    parts.push(`${places > 0 ? 'down' : 'up'} ${Math.abs(places)} places`)
  }
  return parts.join(' and ')
}

/** A contest state change as a sentence without its full stop. */
export function contestStateText(state: ContestState): string {
  return state === 'completed' ? 'The contest is complete: the final standings are in' : `The contest is now ${state}`
}

/**
 * "You" only for the VIP the active Profile's `username` rule matches (an exact match on the lineup's display
 * name, as the Profile matcher does); every other VIP is shown by name.
 */
export function vipName(model: LiveModel, vipKey: string, username: string | undefined): string {
  const name = model.vips.find((vip) => vip.key === vipKey)?.name ?? 'VIP'
  const rule = (username ?? '').trim().toLowerCase()
  return rule && name.trim().toLowerCase() === rule ? 'You' : name
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

/** One feed item as a sentence for the banner, without its full stop. */
export function describeItem(item: ShiftItem, model: LiveModel, username: string | undefined): string {
  switch (item.kind) {
    case 'vip': {
      const name = vipName(model, item.vipKey, username)
      if (!item.crossing) return `${name} moved in the standings`
      const cause = item.crossing.cause ? lineMoveText(item.crossing.cause) : ''
      const sentence = `${name} ${lowerFirst(PATH_TEXT[item.crossing.path])}`
      return cause ? `${sentence} because the cash line moved ${cause}` : sentence
    }
    case 'cash-line':
      return `The cash line moved ${lineMoveText(item)}`
    case 'contest-state':
      return contestStateText(item.state.to)
  }
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`
}

/** How long the user was away: minutes under an hour, else hours and the minutes left over. */
export function awayText(minutes: number): string {
  if (minutes < 60) return plural(minutes, 'minute')
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? plural(hours, 'hour') : `${plural(hours, 'hour')} ${plural(rest, 'minute')}`
}

/** A place as an ordinal: 1st, 2nd, 3rd, 11th. */
export function ordinal(place: number): string {
  const lastTwo = place % 100
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[place % 10] ?? 'th')
  return `${place}${suffix}`
}

/** One VIP's final standing as a line: "Final: You 3rd, cashing". */
export function finalStandingText(name: string, place: number | null, cashing: boolean): string {
  return `Final: ${name}${place === null ? '' : ` ${ordinal(place)}`}, ${cashing ? 'cashing' : 'not cashing'}`
}
