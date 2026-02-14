import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import KeyGate from '../components/KeyGate'
import { useProfiles } from '../context/ProfileContext'
import { useSportSnapshot } from '../hooks/useSportSnapshot'
import { clearKey, getStoredKey, getStoredMode, storeKey, type StorageMode } from '../lib/accessKey'
import type { ProfileMatchRules } from '../lib/profiles'
import type { Contest, ContestState, Player, SportSnapshot } from '../lib/types'
import { filterVipLineups } from '../lib/vipMatcher'

const contestStates: ContestState[] = ['upcoming', 'live', 'completed', 'cancelled', 'unknown']

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(cents / 100)
}

function scoreForSort(player: Player): number {
  return player.actual_points ?? player.projected_points ?? Number.NEGATIVE_INFINITY
}

function groupContestsByState(contests: Contest[]): Record<ContestState, Contest[]> {
  const grouped: Record<ContestState, Contest[]> = {
    upcoming: [],
    live: [],
    completed: [],
    cancelled: [],
    unknown: [],
  }

  for (const contest of contests) {
    grouped[contest.state].push(contest)
  }

  return grouped
}

function PlayerPoolTable({ players }: { players: Player[] }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const lowered = search.trim().toLowerCase()

    return [...players]
      .filter((player) => (lowered ? player.name.toLowerCase().includes(lowered) : true))
      .sort((a, b) => scoreForSort(b) - scoreForSort(a))
  }, [players, search])

  return (
    <section>
      <h2>Player pool</h2>
      <label htmlFor="player-search">Search players</label>
      <input
        id="player-search"
        type="text"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name"
      />
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Team</th>
            <th>Positions</th>
            <th>Actual</th>
            <th>Projected</th>
            <th>Ownership</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((player) => (
            <tr key={player.player_id}>
              <td>{player.name}</td>
              <td>{player.team}</td>
              <td>{player.positions.join('/')}</td>
              <td>{player.actual_points ?? '-'}</td>
              <td>{player.projected_points ?? '-'}</td>
              <td>{player.ownership_pct ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  const playersById = new Map(sportData.players.map((player) => [player.player_id, player]))

  return (
    <>
      {contestStates.map((state) => (
        <section key={state}>
          <h2>
            {state} ({grouped[state].length})
          </h2>
          {grouped[state].map((contest) => (
            (() => {
              const lineups = filterVipLineups(contest.vip_lineups, activeProfileRules, vipFilterMode)

              return (
                <article key={contest.contest_key}>
                  <h3>{contest.name}</h3>
                  <p>Entry fee: {formatMoney(contest.entry_fee_cents, contest.currency)}</p>
                  <p>
                    Entries: {contest.entries_count}/{contest.max_entries}
                  </p>
                  <p>Prize pool: {formatMoney(contest.prize_pool_cents, contest.currency)}</p>
                  <h4>VIP lineups</h4>
                  {lineups.length === 0 ? (
                    <p>No matching VIP lineups.</p>
                  ) : (
                    lineups.map((lineup) => (
                      <div key={lineup.vip_entry_key}>
                        <p>{lineup.display_name}</p>
                        <ol>
                          {lineup.slots.map((slot, index) => {
                            const player = playersById.get(slot.player_id)
                            const multiplier = slot.multiplier ? ` x${slot.multiplier}` : ''
                            return (
                              <li key={`${lineup.vip_entry_key}-${index}`}>
                                {slot.slot}: {player?.name ?? slot.player_id}
                                {multiplier}
                              </li>
                            )
                          })}
                        </ol>
                      </div>
                    ))
                  )}
                </article>
              )
            })()
          ))}
        </section>
      ))}
      <PlayerPoolTable players={sportData.players} />
    </>
  )
}

function Sport() {
  const queryClient = useQueryClient()
  const { activeProfile } = useProfiles()
  const { sport } = useParams()
  const [apiKey, setApiKey] = useState('')
  const [vipFilterMode, setVipFilterMode] = useState<'all' | 'active'>('all')

  useEffect(() => {
    setApiKey(getStoredKey())
  }, [])

  const { snapshot, loading, error, usingCache } = useSportSnapshot(apiKey)

  const handleSaveKey = (key: string, mode: StorageMode) => {
    storeKey(key, mode)
    setApiKey(key)
    queryClient.clear()
  }

  const handleChangeKey = () => {
    clearKey()
    setApiKey('')
    queryClient.clear()
  }

  if (!sport) {
    return <p>Sport not specified.</p>
  }

  const sportKey = sport.toLowerCase()

  if (!usingCache && !apiKey) {
    return <KeyGate onSave={handleSaveKey} />
  }

  if (loading) {
    return <p>Loading sport snapshot...</p>
  }

  if (error instanceof Error) {
    return (
      <section>
        <h1>Sport: {sport.toUpperCase()}</h1>
        <p className="error-text">{error.message}</p>
        <button type="button" onClick={handleChangeKey}>
          Change key
        </button>
      </section>
    )
  }

  const sportData = snapshot?.sports[sportKey]

  if (!sportData) {
    return (
      <section>
        <h1>Sport: {sport.toUpperCase()}</h1>
        <p>Sport not found in snapshot.</p>
      </section>
    )
  }

  return (
    <section>
      <div className="inline-actions">
        <button type="button" onClick={handleChangeKey}>
          Change key ({getStoredMode()})
        </button>
      </div>
      <div>
        <label htmlFor="sport-vip-filter">VIP filter</label>{' '}
        <select
          id="sport-vip-filter"
          value={vipFilterMode}
          onChange={(event) => setVipFilterMode(event.target.value as 'all' | 'active')}
        >
          <option value="all">All VIPs</option>
          <option value="active">Active profile only</option>
        </select>
      </div>
      <h1>Sport: {sport.toUpperCase()}</h1>
      <p>Snapshot at: {new Date(snapshot.snapshot_at).toLocaleString()}</p>
      <ContestSection
        sportData={sportData}
        vipFilterMode={vipFilterMode}
        activeProfileRules={activeProfile.rules}
      />
    </section>
  )
}

export default Sport
