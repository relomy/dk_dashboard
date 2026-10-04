// Today's Live sections, hosted by the Trains and Leverage tabs until the
// redesigned views replace them (relomy/dk_dashboard#25, #26). Legacy markup:
// render inside a LegacySurface so the light legacy styles stay readable.
import type { ReactNode } from 'react'
import { formatPmr, formatPoints } from '../../lib/format'
import type { LiveModel } from '../../lib/liveModel'

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

/** Restores the legacy page look (ink color, stacked panels) inside the dark Live surface. */
export function LegacySurface({ children }: { children: ReactNode }) {
  return <div className="page-stack min-w-0 overflow-x-auto text-[color:var(--ink)]">{children}</div>
}

/** Primary contest details, threat and leverage, ownership remaining, non-cashing info and standings. */
export function LegacyLeverageSections({ model }: { model: LiveModel }) {
  const {
    contest,
    cashLine,
    threat,
    leverage,
    ownershipSummary,
    ownershipLeaders,
    nonCashing,
    avgSalaryPerPlayerRemaining,
    standings,
  } = model
  return (
    <>
      <div className="panel page-stack-sm">
        <h2 className="section-title">Primary contest</h2>
        <p className="meta-text">{contest.name}</p>
        <p className="meta-text">Contest key: {contest.contestKey}</p>
        <p className="meta-text">Contest id: {contest.contestId}</p>
        {contest.selectionReason ? <p className="meta-text">Selection reason: {contest.selectionReason}</p> : null}
        <p className="meta-text">
          Cash line: {cashLine.points === null ? '—' : `${formatPoints(cashLine.points)} pts`}
          {cashLine.rank === null ? '' : ` | Rank cutoff: ${cashLine.rank}`}
        </p>
      </div>

      <div className="panel page-stack-sm">
        <h2 className="section-title">Threat & leverage</h2>
        {threat.status === 'unavailable' ? (
          <p className="meta-text">Threat metrics unavailable for this contest.</p>
        ) : (
          <div className="page-stack-sm">
            <div className="panel-subtle page-stack-sm">
              <h3 className="subsection-title">Top swing players</h3>
              {threat.data.swingPlayers.length === 0 ? (
                <p className="meta-text">No swing player data available.</p>
              ) : (
                <ul className="list-panel">
                  {threat.data.swingPlayers.map((player) => (
                    <li key={player.key} className="item-card">
                      <p className="item-title">{player.name}</p>
                      <p className="meta-text">
                        Own. remaining: {formatValue(player.ownershipRemainingPct, { suffix: '%' })}
                        {player.vipCount > 0 ? ` | VIP x${player.vipCount}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <div className="panel-subtle page-stack-sm">
          <h3 className="subsection-title">VIP vs field leverage</h3>
          {leverage.status === 'unavailable' ? (
            <FeedNotProvided />
          ) : (
            <>
              {leverage.data.fieldRemaining ? (
                <p className="meta-text">
                  Field remaining{leverage.data.fieldRemaining.contestField ? ' (contest field)' : ''}:{' '}
                  {formatValue(leverage.data.fieldRemaining.pct, { suffix: '%' })}
                  {leverage.data.fieldRemaining.partial ? ' (partial)' : ''}
                </p>
              ) : null}
              {leverage.data.rows.length === 0 ? (
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
                    {leverage.data.rows.map((row) => (
                      <tr key={row.key}>
                        <td>{row.name ?? '—'}</td>
                        <td>{formatValue(row.vipRemainingPct, { suffix: '%' })}</td>
                        <td>{formatValue(row.fieldRemainingPct, { suffix: '%' })}</td>
                        <td>
                          {row.uniquenessDeltaPct === null
                            ? '—'
                            : formatSigned(row.uniquenessDeltaPct, { suffix: '%' })}
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
          {ownershipSummary.status === 'unavailable' ? (
            <FeedNotProvided />
          ) : ownershipSummary.data.length === 0 ? (
            <p className="meta-text">No ownership summary rows available for VIP lineups.</p>
          ) : (
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
                {ownershipSummary.data.map((row) => (
                  <tr key={row.key}>
                    <td>{row.name}</td>
                    <td>{formatValue(row.totalOwnershipPct, { suffix: '%' })}</td>
                    <td>{formatValue(row.ownershipInPlayPct, { suffix: '%' })}</td>
                    <td>{row.partial ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {ownershipLeaders.status === 'unavailable' ? (
          <p className="meta-text">Ownership leaders unavailable for this contest.</p>
        ) : (
          <div className="panel-subtle page-stack-sm">
            <h3 className="subsection-title">Ownership leaders</h3>
            <p className="item-title">
              Ownership remaining total: {formatValue(ownershipLeaders.data.totalPct, { suffix: '%' })}
            </p>
            <p className="meta-text">Top {ownershipLeaders.data.topN}</p>
            {ownershipLeaders.data.entries.length === 0 ? (
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
                  {ownershipLeaders.data.entries.map((entry) => (
                    <tr key={entry.key}>
                      <td>{entry.name}</td>
                      <td>{formatValue(entry.ownershipRemainingPct, { suffix: '%' })}</td>
                      <td>{formatPmr(entry.pmr)}</td>
                      <td>{formatValue(entry.rank)}</td>
                      <td>{formatPoints(entry.points)}</td>
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
          {avgSalaryPerPlayerRemaining.status === 'unavailable' ? (
            <FeedNotProvided />
          ) : (
            <p className="item-title">{formatCurrency(avgSalaryPerPlayerRemaining.data)}</p>
          )}
        </div>
        {nonCashing.status === 'unavailable' ? (
          <div className="panel-subtle page-stack-sm">
            <h3 className="subsection-title">Entries not cashing</h3>
            <FeedNotProvided />
          </div>
        ) : (
          <>
            <p className="item-title">Entries not cashing: {formatValue(nonCashing.data.entriesNotCashing)}</p>
            <p className="item-title">Avg PMR remaining: {formatPmr(nonCashing.data.avgPmrRemaining)}</p>
            <div className="panel-subtle page-stack-sm">
              <h3 className="subsection-title">Top remaining players</h3>
              {nonCashing.data.topRemainingPlayers.status === 'unavailable' ? (
                <p className="meta-text">Top remaining players unavailable for this contest.</p>
              ) : nonCashing.data.topRemainingPlayers.data.length === 0 ? (
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
                    {nonCashing.data.topRemainingPlayers.data.map((player, index) => (
                      <tr key={`${player.name}-${index}`}>
                        <td>{player.name}</td>
                        <td>{formatValue(player.ownershipRemainingPct, { suffix: '%' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      <div className="panel page-stack-sm live-secondary-panel">
        <h2 className="section-title">Standings</h2>
        <p className="meta-text">Secondary detail view.</p>
        {standings.status === 'unavailable' ? (
          <p className="meta-text">Standings unavailable for this contest.</p>
        ) : (
          <>
            <p className="meta-text">Rows: {standings.data.length}</p>
            {standings.data.length === 0 ? (
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
                  {standings.data.map((row) => (
                    <tr key={row.key}>
                      <td>{row.name ?? '—'}</td>
                      <td>{formatValue(row.rank)}</td>
                      <td>{formatPoints(row.points)}</td>
                      <td>{formatPmr(row.pmr)}</td>
                      <td>{formatValue(row.ownershipRemainingPct, { suffix: '%' })}</td>
                      <td>{row.payoutCents === null ? '—' : formatTrimmedNumber(row.payoutCents / 100, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </>
  )
}
