import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { formatPmr, formatPoints, formatRank, formatSigned } from '../../lib/format'
import type { LiveModel, LiveVip, LiveVipTrainOverlap } from '../../lib/liveModel'
import { lineupOwnershipHint } from '../../lib/livePresentation'
import { formatOwnership } from '../../lib/playerPool'
import CashMeter from './CashMeter'
import LineupGroups from './LineupGroups'
import { Stat, VipAvatar } from './atoms'
import ViewLink from './ViewLink'

/** Green when the VIP is cashing, red when not; neutral when the distance is missing. */
function distanceTone(vip: LiveVip): string | undefined {
  if (vip.distanceToCash.points === null) return 'text-muted-foreground'
  return vip.cashing ? 'text-cashing' : 'text-non-cashing'
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
        <ViewLink key={vip.key} search={hrefFor(vip)} active={vip.key === activeKey} variant="rail">
          <VipAvatar name={vip.name} index={index} className="size-7 rounded-md text-[10px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{vip.name}</span>
            <span className="block font-mono text-[11px] text-muted-foreground">
              {formatRank(vip.rank)} · {formatPmr(vip.pmr)} PMR
            </span>
          </span>
          <span className={cn('font-mono text-xs tabular-nums', distanceTone(vip))}>
            {formatSigned(vip.distanceToCash.points)}
          </span>
        </ViewLink>
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
    <nav aria-label="VIPs" className="-mx-3 -mt-1 mb-4 flex gap-2 overflow-x-auto px-3 py-1">
      {vips.map((vip, index) => (
        <ViewLink
          key={vip.key}
          search={hrefFor(vip)}
          active={vip.key === activeKey}
          variant="chip"
          className="pr-3 pl-1"
        >
          <VipAvatar name={vip.name} index={index} className="size-5 rounded-full text-[9px]" />
          {vip.name}
          <span className={cn('font-mono', distanceTone(vip))}>{formatRank(vip.rank)}</span>
        </ViewLink>
      ))}
    </nav>
  )
}

/** The focused VIP: standing and lineup stats, the cash-line meter, and the lineup grouped by game status. */
export function VipView({
  model,
  vip,
  trainHref,
}: {
  model: LiveModel
  vip: LiveVip
  /** The `search` of a link to a Train. */
  trainHref: (trainId: string) => string
}) {
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
          value={formatRank(vip.rank)}
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

      {vip.trainOverlap ? <TrainNotice overlap={vip.trainOverlap} href={trainHref(vip.trainOverlap.trainId)} /> : null}

      {vip.players.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No lineup players are available for this VIP.</p>
      ) : (
        <LineupGroups players={vip.players} />
      )}
    </>
  )
}

/** Points at the Train whose lineup this VIP's lineup shares the most players with. */
function TrainNotice({ overlap, href }: { overlap: LiveVipTrainOverlap; href: string }) {
  return (
    <Link
      to={{ search: href }}
      className="mt-4 flex w-full items-center gap-2 rounded-lg border bg-card/60 px-3 py-2 text-left text-xs text-muted-foreground hover:border-ring"
    >
      <span className="font-mono text-foreground">{`${overlap.shared}/${overlap.slotCount}`}</span>
      {`shared with a ×${overlap.entries} train`}
      {overlap.rank === null ? null : ` (best #${overlap.rank})`}
      <span aria-hidden="true" className="ml-auto">
        view →
      </span>
    </Link>
  )
}

export function NoVips() {
  return <p className="text-sm text-muted-foreground">No VIPs are tracked in this contest.</p>
}
