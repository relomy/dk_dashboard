import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import KeyGate from '../components/KeyGate'
import { useSportSnapshot } from '../hooks/useSportSnapshot'
import { clearKey, getStoredKey, getStoredMode, storeKey, type StorageMode } from '../lib/accessKey'
import type { VipLineup } from '../lib/types'

function resolveCashing(lineup: VipLineup): boolean {
  if (lineup.live?.is_cashing === true || lineup.live?.is_cashing === false) {
    return lineup.live.is_cashing
  }

  return lineup.payout_cents !== undefined
}

function formatValue(value: number | null | undefined, opts?: { suffix?: string }): string {
  if (value === null || value === undefined) {
    return '—'
  }

  return `${value}${opts?.suffix ?? ''}`
}

function Live() {
  const queryClient = useQueryClient()
  const { sport } = useParams()
  const [apiKey, setApiKey] = useState('')

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
    return <p className="page">Sport not specified.</p>
  }

  const sportKey = sport.toLowerCase()

  if (!usingCache && !apiKey) {
    return <KeyGate onSave={handleSaveKey} />
  }

  if (loading) {
    return <p className="page">Loading live snapshot...</p>
  }

  if (error instanceof Error) {
    return (
      <section className="page page-stack">
        <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
        <p className="error-text">{error.message}</p>
        <button type="button" onClick={handleChangeKey}>
          Change key
        </button>
      </section>
    )
  }

  if (!snapshot) {
    return <p className="page">Snapshot not available.</p>
  }

  const sportData = snapshot.sports[sportKey]

  if (!sportData) {
    return (
      <section className="page page-stack">
        <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
        <p>Sport not found in snapshot.</p>
      </section>
    )
  }

  const primaryContest =
    sportData.contests.find((contest) => contest.is_primary === true) ??
    (sportData.primary_contest
      ? sportData.contests.find((contest) => contest.contest_key === sportData.primary_contest?.contest_key) ??
        sportData.contests.find((contest) => contest.contest_id === sportData.primary_contest?.contest_id) ??
        null
      : null)

  const playersById = new Map(sportData.players.map((player) => [player.player_id, player]))
  const ownershipWatchlist = primaryContest?.ownership_watchlist
  const topN = ownershipWatchlist?.top_n_default ?? 10
  const topEntries = ownershipWatchlist ? ownershipWatchlist.entries.slice(0, Math.max(0, topN)) : []
  const trainClusters = primaryContest?.train_clusters
  const sortedClusters = trainClusters ? [...trainClusters.clusters].sort((a, b) => b.entry_count - a.entry_count) : []
  const standings = primaryContest?.standings

  if (!sportData.primary_contest) {
    return (
      <section className="page page-stack">
        <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
        <p>Primary contest is not configured for this sport.</p>
        <p className="meta-text">Use /sport/{sportKey} for the broader multi-contest view.</p>
      </section>
    )
  }

  if (!primaryContest) {
    return (
      <section className="page page-stack">
        <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
        <p>Primary contest data is missing from this snapshot.</p>
        <p className="meta-text">Configured key: {sportData.primary_contest.contest_key}</p>
        <p className="meta-text">Configured id: {sportData.primary_contest.contest_id}</p>
      </section>
    )
  }

  return (
    <section className="page page-stack">
      <div className="action-row">
        <button type="button" onClick={handleChangeKey}>
          Change key ({getStoredMode()})
        </button>
      </div>

      <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
      <p className="page-meta">Snapshot at: {new Date(snapshot.snapshot_at).toLocaleString()}</p>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Primary contest</h2>
        <p className="meta-text">{primaryContest.name}</p>
        <p className="meta-text">Contest key: {primaryContest.contest_key}</p>
        <p className="meta-text">Contest id: {primaryContest.contest_id}</p>
        <p className="meta-text">Selection reason: {sportData.primary_contest.selection_reason}</p>
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">VIP board</h2>
        {primaryContest.vip_lineups.length === 0 ? (
          <p className="meta-text">No VIP lineups available for this contest or active filter.</p>
        ) : (
          <ul className="list-panel">
            {primaryContest.vip_lineups.map((lineup) => {
              const isCashing = resolveCashing(lineup)
              const delta =
                lineup.live?.cash_line_delta_points === null || lineup.live?.cash_line_delta_points === undefined
                  ? '—'
                  : String(lineup.live.cash_line_delta_points)
              const updatedAt = lineup.live?.updated_at
                ? new Date(lineup.live.updated_at).toLocaleString()
                : 'unknown'

              return (
                <li key={lineup.vip_entry_key} className="item-card page-stack-sm">
                  <div className="sport-contest-headline">
                    <p className="item-title">{lineup.display_name}</p>
                    <span className={`status ${isCashing ? 'status-ok' : 'status-error'}`}>
                      {isCashing ? 'Cashing' : 'Not cashing'}
                    </span>
                  </div>
                  <p className="meta-text">Cash-line delta: {delta}</p>
                  <p className="meta-text">Last updated: {updatedAt}</p>
                  <ol>
                    {lineup.slots.map((slot, index) => {
                      const playerName = playersById.get(slot.player_id)?.name ?? slot.player_id
                      const multiplier = slot.multiplier ? ` x${slot.multiplier}` : ''
                      return (
                        <li key={`${lineup.vip_entry_key}-${index}`}>
                          {slot.slot}: {playerName}
                          {multiplier}
                        </li>
                      )
                    })}
                  </ol>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Ownership remaining</h2>
        {!ownershipWatchlist ? (
          <p className="meta-text">Ownership watchlist unavailable for this contest.</p>
        ) : (
          <>
            <p className="item-title">
              Ownership remaining total: {formatValue(ownershipWatchlist.ownership_remaining_total_pct, { suffix: '%' })}
            </p>
            <p className="meta-text">Top {topN}</p>
            {topEntries.length === 0 ? (
              <p className="meta-text">No ownership watchlist entries available.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Own. Remaining</th>
                    <th>PMR</th>
                    <th>Rank</th>
                    <th>Points</th>
                  </tr>
                </thead>
                <tbody>
                  {topEntries.map((entry) => (
                    <tr key={entry.entry_key}>
                      <td>{entry.display_name ?? entry.entry_key}</td>
                      <td>{formatValue(entry.ownership_remaining_pct, { suffix: '%' })}</td>
                      <td>{formatValue(entry.pmr)}</td>
                      <td>{formatValue(entry.current_rank)}</td>
                      <td>{formatValue(entry.current_points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Train finder</h2>
        {!trainClusters ? (
          <p className="meta-text">Train cluster data unavailable for this contest.</p>
        ) : (
          <>
            <p className="meta-text">
              Updated: {trainClusters.updated_at ? new Date(trainClusters.updated_at).toLocaleString() : 'unknown'}
            </p>
            <p className="meta-text">
              Cluster rule: {trainClusters.cluster_rule?.type ?? 'unknown'}{' '}
              {trainClusters.cluster_rule?.min_shared !== undefined
                ? `(min shared: ${trainClusters.cluster_rule.min_shared})`
                : ''}
            </p>
            {sortedClusters.length === 0 ? (
              <p className="meta-text">No train clusters available.</p>
            ) : (
              <ul className="list-panel">
                {sortedClusters.map((cluster) => (
                  <li key={cluster.cluster_key} className="item-card page-stack-sm">
                    <p className="item-title">{cluster.cluster_key}</p>
                    <p className="meta-text">Entry count: {cluster.entry_count}</p>
                    <p className="meta-text">Best rank: {formatValue(cluster.best_rank)}</p>
                    <p className="meta-text">Best points: {formatValue(cluster.best_points)}</p>
                    <p className="meta-text">Avg PMR: {formatValue(cluster.avg_pmr)}</p>
                    <p className="meta-text">
                      Avg ownership remaining: {formatValue(cluster.avg_ownership_remaining_pct, { suffix: '%' })}
                    </p>

                    <div>
                      <p className="meta-text">Composition</p>
                      <ol>
                        {cluster.composition.map((slot, index) => {
                          const playerName = playersById.get(slot.player_id)?.name ?? slot.player_id
                          const multiplier = slot.multiplier ? ` x${slot.multiplier}` : ''
                          return (
                            <li key={`${cluster.cluster_key}-composition-${index}`}>
                              {slot.slot}: {playerName}
                              {multiplier}
                            </li>
                          )
                        })}
                      </ol>
                    </div>

                    {cluster.sample_entries?.length ? (
                      <div>
                        <p className="meta-text">Sample entries</p>
                        <ul>
                          {cluster.sample_entries.slice(0, 3).map((entry) => (
                            <li key={`${cluster.cluster_key}-sample-${entry.entry_key}`}>
                              {entry.display_name ?? entry.entry_key}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Standings</h2>
        {!standings ? (
          <p className="meta-text">Standings unavailable for this contest.</p>
        ) : (
          <>
            <p className="meta-text">Updated: {new Date(standings.updated_at).toLocaleString()}</p>
            <p className="meta-text">Rows: {standings.rows.length}</p>
            {standings.total_rows !== undefined ? <p className="meta-text">Total rows: {standings.total_rows}</p> : null}
            {standings.is_truncated ? <p className="meta-text">Showing truncated standings payload.</p> : null}
            {standings.rows.length === 0 ? (
              <p className="meta-text">No standings rows available.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Entry</th>
                    <th>Rank</th>
                    <th>Points</th>
                    <th>PMR</th>
                    <th>Own. Remaining</th>
                    <th>Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.rows.map((row) => (
                    <tr key={row.entry_key}>
                      <td>{row.display_name ?? row.entry_key}</td>
                      <td>{formatValue(row.rank)}</td>
                      <td>{formatValue(row.points)}</td>
                      <td>{formatValue(row.pmr)}</td>
                      <td>{formatValue(row.ownership_remaining_pct, { suffix: '%' })}</td>
                      <td>{row.payout_cents === undefined ? '—' : `${row.payout_cents / 100}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default Live
