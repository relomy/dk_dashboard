import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import ContestCard from '../components/ContestCard'
import DataPage from '../components/DataPage'
import StatusPill from '../components/StatusPill'
import { useProfiles } from '../context/ProfileContext'
import { useSportSnapshot } from '../hooks/useSportSnapshot'
import { contestStates, groupContestsByState } from '../lib/contestDisplay'
import { formatPoints } from '../lib/format'
import type { ProfileMatchRules } from '../lib/profiles'
import { buildPlayerPool, formatOwnership } from '../lib/playerPool'
import type { Player, SportSnapshot } from '../lib/types'
import { filterVipLineups } from '../lib/vipMatcher'

const numericCell = 'text-right font-mono tabular-nums'

function PlayerPoolTable({ players }: { players: Player[] }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    return buildPlayerPool(players, search)
  }, [players, search])

  return (
    <section aria-labelledby="player-pool-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <h2 id="player-pool-heading" className="text-base font-semibold">
          Player pool
        </h2>
        <div className="flex w-full flex-col gap-1 sm:w-64">
          <label htmlFor="player-search" className="text-xs text-muted-foreground">
            Search players
          </label>
          <Input
            id="player-search"
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name"
            className="h-8"
          />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <Table className="text-xs sm:text-sm [&_td]:px-1.5 [&_th]:px-1.5 sm:[&_td]:px-2 sm:[&_th]:px-2">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 text-xs text-muted-foreground">Name</TableHead>
              <TableHead className="h-8 text-xs text-muted-foreground">Team</TableHead>
              <TableHead className="h-8 text-xs text-muted-foreground">Positions</TableHead>
              <TableHead className={`h-8 text-xs text-muted-foreground ${numericCell}`}>Actual</TableHead>
              <TableHead className={`h-8 text-xs text-muted-foreground ${numericCell}`}>Ownership</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((player) => (
              <TableRow key={player.key}>
                <TableCell className="max-w-32 font-medium whitespace-normal sm:max-w-none">{player.name}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{player.team}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{player.position}</TableCell>
                <TableCell className={numericCell}>{formatPoints(player.points)}</TableCell>
                <TableCell className={numericCell}>{formatOwnership(player.ownershipPct)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function ContestSection({
  sportData,
  vipFilterMode,
  activeProfileRules,
}: {
  sportData: SportSnapshot
  vipFilterMode: 'all' | 'active'
  activeProfileRules: ProfileMatchRules
}) {
  const grouped = groupContestsByState(sportData.contests)

  return (
    <>
      {contestStates.map((state) => (
        <section key={state} className="flex flex-col gap-3">
          <h2 className="text-base font-semibold capitalize">
            {state} ({grouped[state].length})
          </h2>
          {grouped[state].length === 0 ? <p className="text-muted-foreground">No contests in this state.</p> : null}
          {grouped[state].map((contest, contestIndex) => (
            <ContestCard
              key={contest.contest_key || `${state}-${contestIndex}`}
              contest={contest}
              lineups={filterVipLineups(contest.vip_lineups, activeProfileRules, vipFilterMode)}
            />
          ))}
        </section>
      ))}
      <PlayerPoolTable players={sportData.players} />
    </>
  )
}

function Sport() {
  const { activeProfile } = useProfiles()
  const { sport } = useParams()
  const [vipFilterMode, setVipFilterMode] = useState<'all' | 'active'>('all')

  const { snapshot, loading, error } = useSportSnapshot()

  if (!sport) {
    return (
      <DataPage>
        <p className="text-muted-foreground">Sport not specified.</p>
      </DataPage>
    )
  }

  const sportKey = sport.toLowerCase()

  if (loading) {
    return (
      <DataPage>
        <p className="text-muted-foreground">Loading sport snapshot...</p>
      </DataPage>
    )
  }

  if (error instanceof Error) {
    return (
      <DataPage title={`Sport: ${sport.toUpperCase()}`}>
        <p className="rounded-lg bg-non-cashing-muted px-3 py-2 text-non-cashing-foreground">{error.message}</p>
      </DataPage>
    )
  }

  const sportData = snapshot?.sports[sportKey]

  if (!sportData) {
    return (
      <DataPage title={`Sport: ${sport.toUpperCase()}`}>
        <p className="text-muted-foreground">Sport not found in snapshot.</p>
      </DataPage>
    )
  }

  return (
    <DataPage
      title={`Sport: ${sport.toUpperCase()}`}
      actions={
        <>
          <StatusPill status={sportData.status} />
          <Link
            to={`/live/${sportKey}`}
            className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
          >
            Open live sweat view
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-1 font-mono text-xs text-muted-foreground tabular-nums">
        <p>Snapshot at: {new Date(snapshot.snapshot_at).toLocaleString()}</p>
        <p>Sport updated: {new Date(sportData.updated_at).toLocaleString()}</p>
        {sportData.error ? (
          <p className="mt-1 rounded-lg bg-non-cashing-muted px-3 py-2 font-sans text-sm text-non-cashing-foreground">
            Sport error: {sportData.error}
          </p>
        ) : null}
      </div>
      <div className="grid w-fit min-w-36 gap-1">
        <Label htmlFor="sport-vip-filter" className="text-xs font-normal text-muted-foreground">
          VIP filter
        </Label>
        <NativeSelect
          id="sport-vip-filter"
          value={vipFilterMode}
          onChange={(event) => setVipFilterMode(event.target.value as 'all' | 'active')}
        >
          <option value="all">All VIPs</option>
          <option value="active">Active profile only</option>
        </NativeSelect>
      </div>
      <ContestSection
        sportData={sportData}
        vipFilterMode={vipFilterMode}
        activeProfileRules={activeProfile.rules}
      />
    </DataPage>
  )
}

export default Sport
