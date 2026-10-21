import { screen, within } from '@testing-library/react'
import { contestOf, vipOf, type Json } from './liveHarness'

// The Live VIP view: rail rows, the focused VIP's stats, cash-line meter and grouped lineup.
// Driven by the captured NFL slate (field of 1,136, cash line at rank 500): six VIPs ranked 511-1014, all
// below the line and below the standings cut, with locked slots. Hand-built VIPs (`setVips`) appear only
// where the fixture lacks the case; each says why.

// The feed's VIP order. EmpireMaker2 (#511, 0.3 points off the cash line) is the one most tests focus.
export const FEED_ORDER = ['cglenn91', 'Cubbiesftw23', 'tuck8989', 'EmpireMaker2', 'Aj_cray', 'Mcoleman1902']
export const EMPIRE = 'EmpireMaker2'

export const VIPS = '/live/nfl?view=vips'

/** The path of the VIPs view focused on a captured VIP. */
export function vipView(snapshot: Json, displayName: string) {
  return `${VIPS}&vip=${String(vipOf(snapshot, displayName).entry_key)}`
}

export function chips() {
  return screen.getByRole('navigation', { name: /^vips$/i })
}

/** One of the focused VIP's stats, a labelled group. */
export function stat(label: string) {
  return within(screen.getByRole('group', { name: label }))
}

/** A player in the sport's pool, to change what the feed says about them. */
export function poolPlayer(snapshot: Json, name: string, sport = 'nfl'): Json {
  const player = snapshot.sports[sport].players.find((row: Json) => row.name === name)
  if (!player) throw new Error(`No ${name} in the ${sport} pool`)
  return player
}

/** The captured VIP's lineup-ownership row in the ownership summary. */
export function ownershipRow(snapshot: Json, displayName: string): Json {
  return contestOf(snapshot).metrics.ownership_summary.per_vip.find((row: Json) => row.display_name === displayName)
}
