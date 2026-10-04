import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DASH, formatPmr, formatPoints, formatRank } from '../../lib/format'
import { haveOrFade, type LiveLineupPlayer, type LiveModel } from '../../lib/liveModel'
import { formatOwnership } from '../../lib/playerPool'
import { vipColorClass } from './presentation'

/** The lineup HAVE/FADE is measured against: the focused VIP, or the focused Train on the Trains view. */
export interface LeverageFocus {
  label: string
  /** The VIP's key when a VIP is in focus, so Leverage vs field can highlight them. */
  vipKey: string | null
  lineup: LiveLineupPlayer[]
}

function PanelSection({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-sm text-muted-foreground">{children}</p>
}

function SwingPlayers({ model, focus }: { model: LiveModel; focus: LeverageFocus | null }) {
  const { threat } = model
  return (
    <PanelSection title="Swing players">
      <p className="mt-1 text-xs text-muted-foreground">
        Unfinished, most owned
        {focus ? (
          <>
            {' '}
            — vs <span className="text-foreground">{focus.label}</span>
          </>
        ) : null}
      </p>
      {threat.status === 'unavailable' ? (
        <Note>Swing players are unavailable for this contest.</Note>
      ) : threat.data.swingPlayers.length === 0 ? (
        <Note>No swing players right now.</Note>
      ) : (
        <ul className="mt-3 space-y-1">
          {threat.data.swingPlayers.map((player) => {
            const mark = haveOrFade(focus?.lineup ?? null, player.name)
            return (
              <li key={player.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-card">
                {mark ? (
                  <span
                    className={cn(
                      'w-12 shrink-0 rounded px-1 text-center font-mono text-[10px] font-bold',
                      mark === 'have'
                        ? 'bg-cashing-muted text-cashing-foreground'
                        : 'bg-non-cashing-muted text-non-cashing-foreground',
                    )}
                  >
                    {mark === 'have' ? 'HAVE' : 'FADE'}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{player.name}</span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatOwnership(player.ownershipRemainingPct)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </PanelSection>
  )
}

function LeverageVsField({ model, focus }: { model: LiveModel; focus: LeverageFocus | null }) {
  const field = model.fieldOwnershipRemainingPct
  const max = Math.max(field ?? 0, ...model.vips.map((vip) => vip.ownershipRemainingPct ?? 0), 1)
  return (
    <PanelSection title="Leverage vs field">
      {model.vips.length === 0 ? (
        <Note>No VIPs to compare with the field.</Note>
      ) : (
        <div className="mt-3 space-y-3">
          {model.vips.map((vip, index) => {
            const own = vip.ownershipRemainingPct
            return (
              <div
                key={vip.key}
                role="group"
                aria-label={vip.name}
                className={cn('text-xs', vip.key === focus?.vipKey ? 'text-foreground' : 'text-muted-foreground')}
              >
                <div className="mb-1 flex justify-between gap-2">
                  <span className="truncate">{vip.name}</span>
                  <span className="font-mono tabular-nums">{own === null ? 'Unavailable' : formatOwnership(own)}</span>
                </div>
                <div className="relative h-2 rounded-full bg-muted">
                  {own === null ? null : (
                    <div
                      className={cn('h-full rounded-full', vipColorClass(index))}
                      style={{ width: `${(own / max) * 100}%` }}
                    />
                  )}
                  {field === null ? null : (
                    <div
                      aria-hidden="true"
                      className="absolute top-[-3px] h-[14px] w-0.5 bg-cash-line"
                      style={{ left: `${(field / max) * 100}%` }}
                    />
                  )}
                </div>
              </div>
            )
          })}
          <p className="text-[11px] text-muted-foreground">
            {field === null ? (
              'Field average unavailable.'
            ) : (
              <>
                <span aria-hidden="true" className="mr-1 inline-block h-2 w-0.5 bg-cash-line" />
                {`Field avg remaining ${formatOwnership(field)}`}
              </>
            )}
          </p>
        </div>
      )}
    </PanelSection>
  )
}

function OwnershipLeaders({ model }: { model: LiveModel }) {
  const leaders = model.ownershipLeaders
  return (
    <PanelSection title="Ownership leaders">
      {leaders.status === 'unavailable' ? (
        <Note>Ownership leaders are unavailable for this contest.</Note>
      ) : leaders.data.entries.length === 0 ? (
        <Note>No ownership leaders yet.</Note>
      ) : (
        <table className="mt-2 w-full font-mono text-xs tabular-nums">
          <thead className="text-[10px] tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="py-1 text-left font-normal">
                <span className="sr-only">Rank</span>#
              </th>
              <th className="py-1 text-left font-normal">Entry</th>
              <th className="py-1 text-right font-normal">
                <span className="sr-only">Ownership remaining</span>
                <span aria-hidden="true">Own left</span>
              </th>
              <th className="py-1 text-right font-normal">PMR</th>
              <th className="py-1 text-right font-normal">Pts</th>
            </tr>
          </thead>
          <tbody>
            {leaders.data.entries.map((entry) => (
              <tr key={entry.key} className="border-b border-border/50">
                <td className="py-1 text-muted-foreground">{formatRank(entry.rank)}</td>
                <td className="max-w-28 truncate py-1">{entry.name ?? DASH}</td>
                <td className="py-1 text-right">{formatOwnership(entry.ownershipRemainingPct)}</td>
                <td className="py-1 text-right text-muted-foreground">{formatPmr(entry.pmr)}</td>
                <td className="py-1 text-right">{formatPoints(entry.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PanelSection>
  )
}

/** Swing players marked HAVE/FADE against the lineup in focus, each VIP's leverage against the field, and the ownership leaders. */
function LeveragePanel({ model, focus }: { model: LiveModel; focus: LeverageFocus | null }) {
  return (
    <div className="space-y-6">
      <SwingPlayers model={model} focus={focus} />
      <LeverageVsField model={model} focus={focus} />
      <OwnershipLeaders model={model} />
    </div>
  )
}

export default LeveragePanel
