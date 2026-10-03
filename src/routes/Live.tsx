import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useSportSnapshot } from '../hooks/useSportSnapshot'
import { formatPmr, formatPoints } from '../lib/format'
import { parseLineupSignature } from '../lib/lineup'
import { buildPerVipIndex, resolveVipMetricMatchKey } from '../lib/perVipKeys'
import { buildPlayerPool, formatOwnership } from '../lib/playerPool'
import { classifyValueTier, resolveTeamStyleToken, type ValueTier } from '../lib/playerPresentation'
import type { ContestMetricsDistanceToCash, VipLineup } from '../lib/types'

type OwnershipSummaryRow = {
  key: string
  display_name: string
  total_ownership_pct?: number
  ownership_in_play_pct?: number
  is_partial?: boolean
}

type NormalizedTrainCluster = {
  cluster_id: string
  cluster_rule?: string
  user_count: number
  rank?: number
  points?: number
  pmr?: number
  lineup_signature?: string
}

function resolveCashing(
  lineup: VipLineup,
  distanceEntry?: ContestMetricsDistanceToCash['per_vip'][number],
): boolean {
  const pointsDelta = distanceEntry?.points_delta
  if (typeof pointsDelta === 'number') {
    return pointsDelta >= 0
  }

  const rankDelta = distanceEntry?.rank_delta
  if (typeof rankDelta === 'number') {
    return rankDelta >= 0
  }

  return lineup.payout_cents != null || lineup.live?.payout_cents != null
}

function formatValue(value: number | null | undefined, opts?: { suffix?: string }): string {
  if (value === null || value === undefined) {
    return '—'
  }

  if (opts?.suffix === '%') {
    return formatPercent(value)
  }

  return `${value}${opts?.suffix ?? ''}`
}

function formatSigned(value: number, opts?: { suffix?: string }): string {
  if (opts?.suffix === '%') {
    const sign = value > 0 ? '+' : ''
    return `${sign}${formatTrimmedNumber(value, 2)}%`
  }

  const sign = value > 0 ? '+' : ''
  return `${sign}${value}${opts?.suffix ?? ''}`
}

function formatTrimmedNumber(value: number, maxDecimals: number): string {
  const factor = 10 ** maxDecimals
  let rounded = Math.round(value * factor) / factor
  if (Object.is(rounded, -0)) {
    rounded = 0
  }
  if (Number.isInteger(rounded)) {
    return String(rounded)
  }
  return rounded.toFixed(maxDecimals).replace(/\.?0+$/, '')
}

function formatPercent(value: number): string {
  return `${formatTrimmedNumber(value, 2)}%`
}

const FEED_ISSUE_URL = 'https://github.com/relomy/dk_results/issues/156'

function FeedNotProvided() {
  return (
    <p className="meta-text">
      The feed does not provide this metric yet (
      <a href={FEED_ISSUE_URL} target="_blank" rel="noreferrer">
        relomy/dk_results#156
      </a>
      ).
    </p>
  )
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '—'
  }
  return `$${Math.round(value).toLocaleString()}`
}

function formatBadgeValue(value: unknown, tier: ValueTier): string {
  if (tier === 'unknown') {
    return 'N/A'
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return 'N/A'
  }
  const rounded = Math.round(numeric * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function renderValueBadge(value: unknown) {
  const tier = classifyValueTier(value)
  return <span className={`value-badge value-badge--${tier}`}>{formatBadgeValue(value, tier)}</span>
}

function formatSelectionReason(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value
  }
  if (value && typeof value === 'object') {
    const mode = (value as { mode?: unknown }).mode
    if (typeof mode === 'string' && mode.trim()) {
      return mode
    }
  }
  return undefined
}

function normalizeStandingsRows(standings: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(standings)) {
    return []
  }
  return standings.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
}

function normalizeTrainClusterRows(trainClusters: unknown): NormalizedTrainCluster[] {
  if (!Array.isArray(trainClusters)) {
    return []
  }

  const normalized: NormalizedTrainCluster[] = []
  for (const raw of trainClusters) {
    if (!raw || typeof raw !== 'object') {
      continue
    }
    const row = raw as Record<string, unknown>
    // v3 requires cluster_id and user_count; rows missing either are malformed and dropped.
    if (typeof row.cluster_id !== 'string' || !row.cluster_id || typeof row.user_count !== 'number') {
      continue
    }

    normalized.push({
      cluster_id: row.cluster_id,
      cluster_rule: typeof row.cluster_rule === 'string' && row.cluster_rule ? row.cluster_rule : undefined,
      user_count: row.user_count,
      rank: typeof row.rank === 'number' ? row.rank : undefined,
      points: typeof row.points === 'number' ? row.points : undefined,
      pmr: typeof row.pmr === 'number' ? row.pmr : undefined,
      lineup_signature: typeof row.lineup_signature === 'string' ? row.lineup_signature : undefined,
    })
  }

  return normalized
}

function Live() {
  const { sport } = useParams()
  const [playerSearch, setPlayerSearch] = useState('')

  const { snapshot, loading, error } = useSportSnapshot()

  if (!sport) {
    return <p className="page">Sport not specified.</p>
  }

  const sportKey = sport.toLowerCase()
  const sportData = snapshot?.sports[sportKey]
  const filteredPlayers = useMemo(
    () => buildPlayerPool(sportData?.players ?? [], playerSearch),
    [playerSearch, sportData?.players],
  )

  if (loading) {
    return <p className="page">Loading live snapshot...</p>
  }

  if (error instanceof Error) {
    return (
      <section className="page page-stack">
        <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
        <p className="error-text">{error.message}</p>
      </section>
    )
  }

  if (!snapshot) {
    return <p className="page">Snapshot not available.</p>
  }

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

  const ownershipWatchlist = primaryContest?.ownership_watchlist
  const topN = ownershipWatchlist?.top_n_default ?? 10
  const topEntries = ownershipWatchlist ? ownershipWatchlist.entries.slice(0, Math.max(0, topN)) : []
  const trainClustersRaw = primaryContest?.train_clusters
  const trainClusterRows = normalizeTrainClusterRows(trainClustersRaw)
  const trainsUpdatedAt = primaryContest?.live_metrics?.updated_at
  const trainRule = trainClusterRows.find((cluster) => cluster.cluster_rule)?.cluster_rule
  // Best-placed train first; trains without a rank go last.
  const sortedTrains = [...trainClusterRows].sort((a, b) => {
    if (a.rank === undefined || b.rank === undefined) {
      return (a.rank === undefined ? 1 : 0) - (b.rank === undefined ? 1 : 0)
    }
    return a.rank - b.rank
  })
  const standings = primaryContest?.standings
  const standingsRows = normalizeStandingsRows(standings)
  const distanceMetrics = primaryContest?.metrics?.distance_to_cash
  const distanceLookup = new Map<string, ContestMetricsDistanceToCash['per_vip'][number]>()
  for (const entry of distanceMetrics?.per_vip ?? []) {
    const key = resolveVipMetricMatchKey(entry)
    if (key) {
      distanceLookup.set(key, entry)
    }
  }
  const ownershipSummary = primaryContest?.metrics?.ownership_summary
  const ownershipSummaryLookup = buildPerVipIndex(ownershipSummary?.per_vip ?? [])
  const ownershipSummaryRows: OwnershipSummaryRow[] =
    primaryContest?.vip_lineups
      .map((lineup): OwnershipSummaryRow | null => {
        const key = resolveVipMetricMatchKey(lineup)
        if (!key) {
          return null
        }
      const summary = ownershipSummaryLookup.get(key)
      if (!summary) {
        return null
      }
        return {
          key,
          display_name: lineup.display_name,
          total_ownership_pct: summary.total_ownership_pct,
          ownership_in_play_pct: summary.ownership_in_play_pct,
          is_partial: summary.is_partial,
        }
      })
      .filter((row): row is OwnershipSummaryRow => row !== null) ?? []
  const cashLine = primaryContest?.live_metrics?.cash_line
  const cashLinePoints = cashLine?.points_cutoff
  const cashLineRank = cashLine?.rank_cutoff
  const threatMetrics = primaryContest?.metrics?.threat
  const topSwingPlayers = threatMetrics?.top_swing_players ?? []
  const vipLeverageRaw = threatMetrics?.vip_vs_field_leverage
  const vipLeverage = vipLeverageRaw ?? []
  const fieldRemainingScope =
    threatMetrics?.field_remaining_scope === 'contest_field' ? ' (contest field)' : ''
  const nonCashingMetrics = primaryContest?.metrics?.non_cashing
  const avgSalaryPerPlayerRemaining = primaryContest?.live_metrics?.avg_salary_per_player_remaining
  const topRemainingPlayers = Array.isArray(nonCashingMetrics?.top_remaining_players)
    ? nonCashingMetrics.top_remaining_players
    : null

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

  const selectionReason = formatSelectionReason(sportData.primary_contest.selection_reason)

  return (
    <section className="page page-stack">
      <h1 className="page-title">Live: {sport.toUpperCase()}</h1>
      <p className="page-meta">Snapshot at: {new Date(snapshot.snapshot_at).toLocaleString()}</p>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Primary contest</h2>
        <p className="meta-text">{primaryContest.name}</p>
        <p className="meta-text">Contest key: {primaryContest.contest_key}</p>
        <p className="meta-text">Contest id: {primaryContest.contest_id}</p>
        {selectionReason ? <p className="meta-text">Selection reason: {selectionReason}</p> : null}
        <p className="meta-text">
          Cash line:{' '}
          {cashLinePoints === null || cashLinePoints === undefined ? '—' : `${formatPoints(cashLinePoints)} pts`}
          {cashLineRank === null || cashLineRank === undefined ? '' : ` | Rank cutoff: ${cashLineRank}`}
        </p>
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">VIP board</h2>
        {primaryContest.vip_lineups.length === 0 ? (
          <p className="meta-text">No VIP lineups available for this contest or active filter.</p>
        ) : (
          <ul className="list-panel">
            {primaryContest.vip_lineups.map((lineup, lineupIndex) => {
              const lineupKey = lineup.entry_key || lineup.vip_entry_key || lineup.display_name
              const metricKey = resolveVipMetricMatchKey(lineup)
              const distanceEntry = metricKey ? distanceLookup.get(metricKey) : undefined
              const isCashing = resolveCashing(lineup, distanceEntry)
              const pointsDelta = distanceEntry?.points_delta
              const rankDelta = distanceEntry?.rank_delta
              const distanceLabel =
                pointsDelta === null || pointsDelta === undefined
                  ? 'Unavailable'
                  : formatSigned(pointsDelta, { suffix: ' pts' })
              const playersLive = Array.isArray(lineup.players_live) ? lineup.players_live : null
              const updatedAt = lineup.live?.updated_at
                ? new Date(lineup.live.updated_at).toLocaleString()
                : undefined

              return (
                <li key={`${lineupKey}-${lineupIndex}`} className="item-card page-stack-sm">
                  <div className="sport-contest-headline">
                    <p className="item-title">{lineup.display_name}</p>
                    <span className={`status ${isCashing ? 'status-ok' : 'status-error'}`}>
                      {isCashing ? 'Cashing' : 'Not cashing'}
                    </span>
                  </div>
                  <p className="meta-text">Distance to cash: {distanceLabel}</p>
                  {rankDelta === null || rankDelta === undefined ? null : (
                    <p className="meta-text">Rank delta: {formatSigned(rankDelta)}</p>
                  )}
                  {updatedAt ? <p className="meta-text">Last updated: {updatedAt}</p> : null}
                  {playersLive ? (
                    playersLive.length === 0 ? (
                      <p className="meta-text">No player live details available.</p>
                    ) : (
                      <table className="data-table vip-live-table">
                        <thead>
                          <tr>
                            <th>Pos</th>
                            <th>Name</th>
                            <th>Own</th>
                            <th>Salary</th>
                            <th>Pts</th>
                            <th>Value</th>
                            <th>RT Proj</th>
                            <th>Time</th>
                            <th>Stats</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playersLive.map((player, playerIndex) => (
                            <tr key={`${lineupKey}-${playerIndex}`}>
                              <td>{player.slot}</td>
                              <td>{player.player_name}</td>
                              <td>{formatValue(player.ownership_pct, { suffix: '%' })}</td>
                              <td>{formatCurrency(player.salary)}</td>
                              <td>{formatPoints(player.points)}</td>
                              <td>{renderValueBadge(player.value)}</td>
                              <td>{formatValue(player.rt_projection)}</td>
                              <td>{player.time_remaining_display ?? '—'}</td>
                              <td>{player.stats_text ?? '—'}</td>
                              <td>{player.game_status ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  ) : lineup.slots.length === 0 ? (
                    <p className="meta-text">Lineup slots unavailable.</p>
                  ) : (
                    <ul className="vip-slot-list">
                      {lineup.slots.map((slot, index) => {
                        const multiplier = slot.multiplier ? ` x${slot.multiplier}` : ''
                        return (
                          <li key={`${lineupKey}-${index}`}>
                            {slot.slot}: {slot.player_name}
                            {multiplier}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Player pool</h2>
        <div className="field-inline sport-player-search">
          <label htmlFor="live-player-search">Search players</label>
          <input
            id="live-player-search"
            type="text"
            value={playerSearch}
            onChange={(event) => setPlayerSearch(event.target.value)}
            placeholder="Search by player name"
          />
        </div>
        {filteredPlayers.length === 0 ? (
          <p className="meta-text">No matching players.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Position</th>
                <th>Player</th>
                <th>Team</th>
                <th>Matchup</th>
                <th>Salary</th>
                <th>Own%</th>
                <th>Points</th>
                <th>Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((player) => (
                <tr
                  key={player.key}
                  className={`team-accent team-accent--${resolveTeamStyleToken(sportKey, player.team)}`}
                >
                  <td>{player.position}</td>
                  <td>{player.name}</td>
                  <td>{player.team}</td>
                  <td>{player.matchup}</td>
                  <td>{formatCurrency(player.salary)}</td>
                  <td>{formatOwnership(player.ownershipPct)}</td>
                  <td>{formatPoints(player.points)}</td>
                  <td>{renderValueBadge(player.value)}</td>
                  <td>{player.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Threat & leverage</h2>
        {!threatMetrics ? (
          <p className="meta-text">Threat metrics unavailable for this contest.</p>
        ) : (
          <div className="page-stack-sm">
            <div className="panel-subtle page-stack-sm">
              <h3 className="subsection-title">Top swing players</h3>
              {topSwingPlayers.length === 0 ? (
                <p className="meta-text">No swing player data available.</p>
              ) : (
                <ul className="list-panel">
                  {topSwingPlayers.map((player, index) => {
                    const vipCount = player.vip_count ?? 0
                    return (
                      <li key={player.player_key ?? `${player.player_name}-${index}`} className="item-card">
                        <p className="item-title">{player.player_name}</p>
                        <p className="meta-text">
                          Own. remaining:{' '}
                          {formatValue(player.ownership_remaining_pct ?? player.remaining_ownership_pct, { suffix: '%' })}
                          {vipCount > 0 ? ` | VIP x${vipCount}` : ''}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
        <div className="panel-subtle page-stack-sm">
          <h3 className="subsection-title">VIP vs field leverage</h3>
          {!vipLeverageRaw ? (
            <FeedNotProvided />
          ) : (
            <>
              {typeof threatMetrics?.field_remaining_pct === 'number' ? (
                <p className="meta-text">
                  Field remaining{fieldRemainingScope}:{' '}
                  {formatValue(threatMetrics.field_remaining_pct, { suffix: '%' })}
                  {threatMetrics.field_remaining_is_partial ? ' (partial)' : ''}
                </p>
              ) : null}
              {vipLeverage.length === 0 ? (
                <p className="meta-text">No VIP leverage data available.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>VIP</th>
                      <th>VIP remaining</th>
                      <th>Field remaining</th>
                      <th>Uniqueness delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vipLeverage.map((entry, index) => (
                      <tr key={entry.vip_entry_key ?? entry.entry_key ?? `${entry.display_name}-${index}`}>
                        <td>{entry.display_name ?? entry.entry_key ?? '—'}</td>
                        <td>{formatValue(entry.vip_remaining_pct, { suffix: '%' })}</td>
                        <td>{formatValue(entry.field_remaining_pct, { suffix: '%' })}</td>
                        <td>
                          {entry.uniqueness_delta_pct === null || entry.uniqueness_delta_pct === undefined
                            ? '—'
                            : formatSigned(entry.uniqueness_delta_pct, { suffix: '%' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Ownership remaining</h2>
        <div className="panel-subtle page-stack-sm">
          <h3 className="subsection-title">VIP ownership summary</h3>
          {!ownershipSummary ? (
            <FeedNotProvided />
          ) : ownershipSummaryRows.length === 0 ? (
            <p className="meta-text">No ownership summary rows available for VIP lineups.</p>
          ) : (
            <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>VIP</th>
                  <th>Total Ownership</th>
                  <th>Ownership in play</th>
                  <th>Partial</th>
                </tr>
              </thead>
              <tbody>
                {ownershipSummaryRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.display_name}</td>
                    <td>{formatValue(row.total_ownership_pct, { suffix: '%' })}</td>
                    <td>{formatValue(row.ownership_in_play_pct, { suffix: '%' })}</td>
                    <td>{row.is_partial ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>
        {!ownershipWatchlist ? (
          <p className="meta-text">Ownership leaders unavailable for this contest.</p>
        ) : (
          <div className="panel-subtle page-stack-sm">
            <h3 className="subsection-title">Ownership leaders</h3>
            <p className="item-title">
              Ownership remaining total: {formatValue(ownershipWatchlist.ownership_remaining_total_pct, { suffix: '%' })}
            </p>
            <p className="meta-text">Top {topN}</p>
            {topEntries.length === 0 ? (
              <p className="meta-text">No Ownership leaders entries available.</p>
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
                  {topEntries.map((entry, entryIndex) => (
                    <tr key={entry.entry_key || `watch-${entryIndex}`}>
                      <td>{entry.display_name ?? entry.entry_key}</td>
                      <td>{formatValue(entry.ownership_remaining_pct, { suffix: '%' })}</td>
                      <td>{formatPmr(entry.pmr)}</td>
                      <td>{formatValue(entry.current_rank)}</td>
                      <td>{formatPoints(entry.current_points)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Non-cashing info</h2>
        <div className="panel-subtle page-stack-sm">
          <h3 className="subsection-title">Avg salary per player remaining</h3>
          {avgSalaryPerPlayerRemaining === undefined || avgSalaryPerPlayerRemaining === null ? (
            <FeedNotProvided />
          ) : (
            <p className="item-title">{formatCurrency(avgSalaryPerPlayerRemaining)}</p>
          )}
        </div>
        {!nonCashingMetrics ? (
          <div className="panel-subtle page-stack-sm">
            <h3 className="subsection-title">Entries not cashing</h3>
            <FeedNotProvided />
          </div>
        ) : (
          <>
            <p className="item-title">Entries not cashing: {formatValue(nonCashingMetrics.users_not_cashing)}</p>
            <p className="item-title">Avg PMR remaining: {formatPmr(nonCashingMetrics.avg_pmr_remaining)}</p>
            <div className="panel-subtle page-stack-sm">
              <h3 className="subsection-title">Top remaining players</h3>
              {topRemainingPlayers === null ? (
                <p className="meta-text">Top remaining players unavailable for this contest.</p>
              ) : topRemainingPlayers.length === 0 ? (
                <p className="meta-text">No top remaining players available.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Own. Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRemainingPlayers.map((entry, index) => (
                      <tr key={`${entry.player_name}-${index}`}>
                        <td>{entry.player_name}</td>
                        <td>{formatValue(entry.ownership_remaining_pct, { suffix: '%' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Train finder</h2>
        {!trainClusterRows.length ? (
          <p className="meta-text">Train data unavailable for this contest.</p>
        ) : (
          <>
            {trainsUpdatedAt ? (
              <p className="meta-text">Updated: {new Date(trainsUpdatedAt).toLocaleString()}</p>
            ) : null}
            {trainRule ? <p className="meta-text">Train rule: {trainRule}</p> : null}
            {sortedTrains.length === 0 ? (
              <p className="meta-text">No trains available.</p>
            ) : (
              <table className="data-table live-train-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Entries</th>
                    <th>Points</th>
                    <th>PMR</th>
                    <th>Lineup</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTrains.map((train) => {
                    const lineupSlots = parseLineupSignature(train.lineup_signature)
                    return (
                      <tr key={train.cluster_id}>
                        <td>{formatValue(train.rank)}</td>
                        <td>{train.user_count}</td>
                        <td>{formatPoints(train.points)}</td>
                        <td>{formatPmr(train.pmr)}</td>
                        <td>
                          {lineupSlots.length ? (
                            <ul className="live-train-lineup" aria-label="Lineup">
                              {lineupSlots.map((slot, slotIndex) => (
                                <li
                                  key={slotIndex}
                                  className={slot.locked ? 'live-train-chip live-train-chip-locked' : 'live-train-chip'}
                                >
                                  {slot.label}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div className="panel page-stack-sm live-secondary-panel">
        <h2 className="section-title">Standings</h2>
        <p className="meta-text">Secondary detail view.</p>
        {!standings ? (
          <p className="meta-text">Standings unavailable for this contest.</p>
        ) : (
          <>
            <p className="meta-text">Rows: {standingsRows.length}</p>
            {standingsRows.length === 0 ? (
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
                  {standingsRows.map((row, rowIndex) => (
                    <tr key={String(row.entry_key ?? `standings-${String(row.rank ?? 'row')}-${rowIndex}`)}>
                      <td>{String(row.username ?? row.entry_key ?? '—')}</td>
                      <td>{formatValue(typeof row.rank === 'number' ? row.rank : undefined)}</td>
                      <td>{formatPoints(typeof row.points === 'number' ? row.points : undefined)}</td>
                      <td>{formatPmr(typeof row.pmr === 'number' ? row.pmr : undefined)}</td>
                      <td>
                        {formatValue(
                          typeof row.ownership_remaining_total_pct === 'number'
                            ? row.ownership_remaining_total_pct
                            : undefined,
                          { suffix: '%' },
                        )}
                      </td>
                      <td>
                        {typeof row.payout_cents === 'number'
                          ? formatTrimmedNumber(row.payout_cents / 100, 2)
                          : '—'}
                      </td>
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
