import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { DASH, formatPmr, formatPoints, formatSigned } from '../../lib/format'
import { lineupOwnershipHint, type LiveModel, type LiveVip } from '../../lib/liveModel'
import { formatOwnership } from '../../lib/playerPool'
import CashMeter from './CashMeter'
import LineupGroups from './LineupGroups'
import { vipColorClass, vipInitials } from './presentation'

/** Green when the VIP is cashing, red when not; neutral when the distance is missing. */
function distanceTone(vip: LiveVip): string | undefined {
  if (vip.distanceToCash.points === null) return 'text-muted-foreground'
  return vip.cashing ? 'text-cashing' : 'text-non-cashing'
}

function VipAvatar({ vip, index, className }: { vip: LiveVip; index: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center font-bold text-white', vipColorClass(index), className)}
    >
      {vipInitials(vip.name)}
    </span>
  )
}

/** The rail's VIP rows: avatar, "#rank · PMR" and the signed distance to cash, each linking to that VIP. */
export function VipRailRows({
  vips,
  activeKey,
  hrefFor,
}: {
  vips: LiveVip[]
  activeKey: string | null
  hrefFor: (vip: LiveVip) => string
}) {
  return (
    <>
      {vips.map((vip, index) => (
        <Link
          key={vip.key}
          to={{ search: hrefFor(vip) }}
          aria-current={vip.key === activeKey ? 'page' : undefined}
          className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-2 text-left',
            vip.key === activeKey ? 'bg-accent ring-1 ring-border' : 'hover:bg-card',
          )}
        >
          <VipAvatar vip={vip} index={index} className="size-7 rounded-md text-[10px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{vip.name}</span>
            <span className="block font-mono text-[11px] text-muted-foreground">
              {vip.rank === null ? DASH : `#${vip.rank}`} · {formatPmr(vip.pmr)} PMR
            </span>
          </span>
          <span className={cn('font-mono text-xs tabular-nums', distanceTone(vip))}>
            {formatSigned(vip.distanceToCash.points)}
          </span>
        </Link>
      ))}
    </>
  )
}

/** The phone's chip row for switching between VIPs. */
export function VipChips({
  vips,
  activeKey,
  hrefFor,
}: {
  vips: LiveVip[]
  activeKey: string
  hrefFor: (vip: LiveVip) => string
}) {
  return (
    <nav aria-label="VIPs" className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1">
      {vips.map((vip, index) => (
        <Link
          key={vip.key}
          to={{ search: hrefFor(vip) }}
          aria-current={vip.key === activeKey ? 'page' : undefined}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-xs',
            vip.key === activeKey ? 'border-ring bg-accent text-foreground' : 'text-muted-foreground',
          )}
        >
          <VipAvatar vip={vip} index={index} className="size-5 rounded-full text-[9px]" />
          {vip.name}
          <span className={cn('font-mono', distanceTone(vip))}>{vip.rank === null ? DASH : `#${vip.rank}`}</span>
        </Link>
      ))}
    </nav>
  )
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: string
}) {
  return (
    <div role="group" aria-label={label}>
      <div className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase" aria-hidden="true">
        {label}
      </div>
      <div className={cn('font-mono text-2xl font-semibold tabular-nums', tone)}>{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

/** The focused VIP: standing and lineup stats, the cash-line meter, and the lineup grouped by game status. */
export function VipView({ model, vip }: { model: LiveModel; vip: LiveVip }) {
  const hint = lineupOwnershipHint(vip.lineupOwnershipPct, vip.players.length)
  return (
    <>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="w-full sm:w-auto">
          <div className="text-xs text-muted-foreground">Following</div>
          <h2 className="text-2xl font-bold">{vip.name}</h2>
        </div>
        <Stat
          label="Rank"
          value={vip.rank === null ? DASH : `#${vip.rank}`}
          sub={model.fieldSize === null ? undefined : `of ${model.fieldSize}`}
        />
        <Stat
          label="Points"
          value={formatPoints(vip.points)}
          sub={vip.projectedPoints === null ? undefined : `proj ${formatPoints(vip.projectedPoints)}`}
        />
        <Stat
          label="vs cash"
          value={formatSigned(vip.distanceToCash.points)}
          tone={distanceTone(vip)}
          sub={vip.cashing ? 'cashing' : 'not cashing'}
        />
        <Stat
          label="PMR"
          value={formatPmr(vip.pmr)}
          sub={
            vip.ownershipRemainingPct === null
              ? 'own remaining unavailable'
              : `${formatOwnership(vip.ownershipRemainingPct)} own remaining`
          }
        />
        <Stat label="Lineup own" value={formatOwnership(vip.lineupOwnershipPct)} sub={hint ?? 'unavailable'} />
      </div>

      <CashMeter model={model} focusedKey={vip.key} />

      {vip.players.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No lineup players are available for this VIP.</p>
      ) : (
        <LineupGroups players={vip.players} />
      )}
    </>
  )
}

export function NoVips() {
  return <p className="text-sm text-muted-foreground">No VIPs are tracked in this contest.</p>
}
