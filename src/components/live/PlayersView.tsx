import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { DASH, formatPoints } from '../../lib/format'
import {
  defaultSortDir,
  queryPool,
  visibleValue,
  type LiveModel,
  type LivePoolPlayer,
  type PoolFilter,
  type PoolSort,
  type PoolSortKey,
} from '../../lib/liveModel'
import { GameStatusDot, OwnCell, TeamChip, ValuePill, VipAvatars, type AvatarVip } from './atoms'
import { GAME_STATUS_LABEL } from './presentation'
import TotalOwnershipBar from './TotalOwnershipBar'

const FILTERS: Array<[PoolFilter, string]> = [
  ['all', 'All'],
  ['still-to-play', 'Still to play'],
  ['on-a-vip', 'On a VIP'],
]

function formatSalary(salary: number): string {
  return `$${Math.round(salary).toLocaleString()}`
}

interface PlayersViewProps {
  model: LiveModel
  isPhone: boolean
  /** The `search` of a link that opens a VIP. */
  vipHref: (vipKey: string) => string
}

/** The player ownership table (the group's sheet), with VIP avatars, sorting, filters and search. */
function PlayersView({ model, isPhone, vipHref }: PlayersViewProps) {
  const [sort, setSort] = useState<PoolSort>({ key: 'own', dir: 'desc' })
  const [filter, setFilter] = useState<PoolFilter>('all')
  const [search, setSearch] = useState('')

  const rows = useMemo(() => queryPool(model.pool, { search, filter, sort }), [model.pool, search, filter, sort])

  const toggleSort = (key: PoolSortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: defaultSortDir(key) },
    )

  const vipsOf = (player: LivePoolPlayer): AvatarVip[] =>
    player.vipIndexes.map((index) => ({ key: model.vips[index].key, name: model.vips[index].name, index }))
  const avatarHref = (vip: AvatarVip) => vipHref(vip.key)

  return (
    <div>
      <TotalOwnershipBar total={model.totalOwnership} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-bold md:text-xl">Players</h2>
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search player or team"
          aria-label="Search player or team"
          className="h-8 w-full bg-card sm:w-56"
        />
        <div role="group" aria-label="Filter players" className="flex rounded-md bg-card p-0.5 text-xs ring-1 ring-border">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                'rounded px-2.5 py-1',
                filter === key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {model.pool.length === 0 ? (
        <p className="text-sm text-muted-foreground">No players in the pool yet.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No players match.</p>
      ) : isPhone ? (
        <PhoneList rows={rows} sort={sort} onSort={toggleSort} vipsOf={vipsOf} avatarHref={avatarHref} />
      ) : (
        <PlayersTable rows={rows} sort={sort} onSort={toggleSort} vipsOf={vipsOf} avatarHref={avatarHref} />
      )}
    </div>
  )
}

interface RowsProps {
  rows: LivePoolPlayer[]
  sort: PoolSort
  onSort: (key: PoolSortKey) => void
  vipsOf: (player: LivePoolPlayer) => AvatarVip[]
  avatarHref: (vip: AvatarVip) => string
}

function SortArrow({ active, dir }: { active: boolean; dir: PoolSort['dir'] }) {
  if (!active) return null
  return <span aria-hidden="true">{dir === 'desc' ? ' ↓' : ' ↑'}</span>
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = 'right',
  className,
}: {
  label: string
  sortKey: PoolSortKey
  sort: PoolSort
  onSort: (key: PoolSortKey) => void
  align?: 'left' | 'right'
  className?: string
}) {
  const active = sort.key === sortKey
  return (
    <th
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn('px-3 py-2 font-semibold whitespace-nowrap', align === 'right' ? 'text-right' : 'text-left', className)}
    >
      <button type="button" onClick={() => onSort(sortKey)} className={cn('uppercase', active && 'text-foreground')}>
        {label}
        <SortArrow active={active} dir={sort.dir} />
      </button>
    </th>
  )
}

function PlayersTable({ rows, sort, onSort, vipsOf, avatarHref }: RowsProps) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table aria-label="Players" className="w-full text-sm">
        <thead className="bg-card text-[11px] tracking-wider text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Pos</th>
            <SortHeader label="Player" sortKey="name" sort={sort} onSort={onSort} align="left" />
            <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Game</th>
            <SortHeader label="Salary" sortKey="salary" sort={sort} onSort={onSort} className="hidden lg:table-cell" />
            <SortHeader label="Own" sortKey="own" sort={sort} onSort={onSort} />
            <SortHeader label="Pts" sortKey="points" sort={sort} onSort={onSort} />
            <SortHeader label="Value" sortKey="value" sort={sort} onSort={onSort} />
            <th className="px-3 py-2 text-left font-semibold">VIPs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((player) => (
            <tr key={player.key} className="border-t border-border/50 hover:bg-card/60">
              <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{player.position}</td>
              <td className="px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <TeamChip team={player.team} />
                  <span className={cn('whitespace-nowrap', player.gameStatus === 'final' && 'text-muted-foreground')}>
                    {player.name}
                  </span>
                </div>
              </td>
              <td className="px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground" title={player.matchup}>
                {player.gameStatus ? (
                  <span className="flex items-center gap-1.5">
                    <GameStatusDot status={player.gameStatus} />
                    <span className="sr-only lg:not-sr-only">{GAME_STATUS_LABEL[player.gameStatus]}</span>
                  </span>
                ) : (
                  DASH
                )}
              </td>
              <td className="hidden px-3 py-1.5 text-right font-mono text-xs text-muted-foreground tabular-nums lg:table-cell">
                {formatSalary(player.salary)}
              </td>
              <td className="px-1 py-1">
                <OwnCell own={player.ownershipPct} />
              </td>
              <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">{formatPoints(player.points)}</td>
              <td className="px-3 py-1.5 text-right">
                <ValuePill value={visibleValue(player)} />
              </td>
              <td className="px-3 py-1.5">
                <VipAvatars vips={vipsOf(player)} hrefFor={avatarHref} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const PHONE_GRID = 'grid grid-cols-[1fr_4rem_3.25rem_3rem] gap-2'

function PhoneSortButton({
  label,
  sortKey,
  sort,
  onSort,
  align = 'right',
}: {
  label: string
  sortKey: PoolSortKey
  sort: PoolSort
  onSort: (key: PoolSortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sort.key === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn('uppercase', align === 'right' ? 'text-right' : 'text-left', active && 'text-foreground')}
    >
      {label}
      <SortArrow active={active} dir={sort.dir} />
    </button>
  )
}

function PhoneList({ rows, sort, onSort, vipsOf, avatarHref }: RowsProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  return (
    <ul aria-label="Players" className="divide-y divide-border/50 overflow-hidden rounded-lg border">
      <li className={cn(PHONE_GRID, 'bg-card px-3 py-1.5 text-[10px] tracking-wider text-muted-foreground uppercase')}>
        <PhoneSortButton label="Player" sortKey="name" sort={sort} onSort={onSort} align="left" />
        <PhoneSortButton label="Own" sortKey="own" sort={sort} onSort={onSort} />
        <PhoneSortButton label="Pts" sortKey="points" sort={sort} onSort={onSort} />
        <PhoneSortButton label="Val" sortKey="value" sort={sort} onSort={onSort} />
      </li>
      {rows.map((player) => {
        const isOpen = expanded === player.key
        const vips = vipsOf(player)
        return (
          <li key={player.key}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setExpanded(isOpen ? null : player.key)}
              className={cn(PHONE_GRID, 'w-full items-center px-3 py-2 text-left')}
            >
              <span className="min-w-0">
                <span
                  className={cn('block truncate text-sm', player.gameStatus === 'final' && 'text-muted-foreground')}
                >
                  {player.name}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <GameStatusDot status={player.gameStatus} />
                  {player.position} · {player.team}
                  <VipAvatars vips={vips} hrefFor={avatarHref} small />
                </span>
              </span>
              <OwnCell own={player.ownershipPct} />
              <span className="text-right font-mono text-sm font-semibold tabular-nums">{formatPoints(player.points)}</span>
              <span className="text-right">
                <ValuePill value={visibleValue(player)} />
              </span>
            </button>
            {isOpen ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
                <span>{formatSalary(player.salary)}</span>
                <span>{player.matchup}</span>
                {player.gameStatus && GAME_STATUS_LABEL[player.gameStatus].toLowerCase() !== player.matchup.toLowerCase() ? (
                  <span>{GAME_STATUS_LABEL[player.gameStatus]}</span>
                ) : null}
                {vips.length ? (
                  <VipLinks vips={vips} avatarHref={avatarHref} />
                ) : (
                  <span>No VIPs</span>
                )}
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function VipLinks({ vips, avatarHref }: { vips: AvatarVip[]; avatarHref: (vip: AvatarVip) => string }): ReactNode {
  return (
    <span className="flex flex-wrap gap-1.5">
      On:
      {vips.map((vip) => (
        <Link key={vip.key} to={{ search: avatarHref(vip) }} className="text-foreground underline underline-offset-2">
          {vip.name}
        </Link>
      ))}
    </span>
  )
}

export default PlayersView
