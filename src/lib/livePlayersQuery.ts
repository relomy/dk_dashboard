import type { LivePoolPlayer } from './liveModel'
import { visibleValue } from './livePresentation'

// The Players view's query over the player pool: search, filters and sort.

export type PoolSortKey = 'own' | 'points' | 'value' | 'salary' | 'name'
export type PoolFilter = 'all' | 'still-to-play' | 'on-a-vip'
export interface PoolSort {
  key: PoolSortKey
  dir: 'asc' | 'desc'
}

/** Name sorts A to Z first; the numbers sort highest first. */
export function defaultSortDir(key: PoolSortKey): PoolSort['dir'] {
  return key === 'name' ? 'asc' : 'desc'
}

function sortValue(player: LivePoolPlayer, key: PoolSortKey): number | string | null {
  switch (key) {
    case 'own':
      return player.ownershipPct
    case 'points':
      return player.points
    case 'value':
      return visibleValue(player)
    case 'salary':
      return player.salary
    case 'name':
      return player.name
  }
}

/**
 * The Players view's rows: search by player or team, the "Still to play" (game not final)
 * and "On a VIP" filters, then the chosen sort. Missing values sort last in either direction.
 */
export function queryPool(
  pool: LivePoolPlayer[],
  { search, filter, sort }: { search: string; filter: PoolFilter; sort: PoolSort },
): LivePoolPlayer[] {
  const needle = search.trim().toLowerCase()
  const sign = sort.dir === 'asc' ? 1 : -1
  return pool
    .filter((player) => !needle || player.name.toLowerCase().includes(needle) || player.team.toLowerCase().includes(needle))
    .filter((player) => {
      if (filter === 'still-to-play') return player.gameStatus === 'pre-game' || player.gameStatus === 'in-progress'
      if (filter === 'on-a-vip') return player.vipIndexes.length > 0
      return true
    })
    .sort((a, b) => {
      const av = sortValue(a, sort.key)
      const bv = sortValue(b, sort.key)
      if (av === null || bv === null) return (av === null ? 1 : 0) - (bv === null ? 1 : 0)
      if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv)) * sign
      return (av - bv) * sign
    })
}
