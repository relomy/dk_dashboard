import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Radar, Star, Table2, TrainFront, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useIsPhone } from '../../hooks/useMediaQuery'
import { formatPoints } from '../../lib/format'
import type { LiveModel, LiveTrain, LiveVip } from '../../lib/liveModel'
import TopBarSlot from '../TopBarSlot'
import LeveragePanel, { type LeverageFocus } from './LeveragePanel'
import { railTrains, resolveFocusedTrain, resolveFocusedVip, useLiveView, type LiveView } from './liveView'
import PlayersView from './PlayersView'
import { NoTrains, TrainChips, TrainRailRows, TrainView } from './TrainView'
import { NoVips, VipChips, VipRailRows, VipView } from './VipView'
import ViewLink from './ViewLink'

function formatSnapshotTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/** The cash line and snapshot time, rendered into the app shell's top bar. */
function TopBarReadout({ model }: { model: LiveModel }) {
  return (
    <>
      <span className="hidden max-w-xs truncate text-muted-foreground xl:block">{model.contest.name}</span>
      <span className="font-mono whitespace-nowrap text-muted-foreground">
        CASH <span className="text-cash-line">{formatPoints(model.cashLine.points)}</span>
        {/* Phones show the cash line only: the snapshot time does not fit beside the sport tabs at 375px. */}
        <span className="hidden sm:inline">
          {model.cashLine.rank === null ? null : <> · TOP {model.cashLine.rank}</>}
          {' · '}
          <time dateTime={model.snapshotAt} title={`Snapshot at ${new Date(model.snapshotAt).toLocaleString()}`}>
            {formatSnapshotTime(model.snapshotAt)}
          </time>
        </span>
      </span>
    </>
  )
}

function RailLink({
  to,
  active,
  icon: Icon,
  label,
  detail,
}: {
  to: string
  active: boolean
  icon: LucideIcon
  label: string
  detail: string
}) {
  return (
    <ViewLink search={to} active={active} variant="rail">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block font-mono text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </ViewLink>
  )
}

function RailHeading({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
      {children}
    </div>
  )
}

const TABS: Array<{ view: LiveView; label: string; icon: LucideIcon }> = [
  { view: 'players', label: 'Players', icon: Table2 },
  { view: 'vips', label: 'VIPs', icon: Star },
  { view: 'trains', label: 'Trains', icon: TrainFront },
  { view: 'leverage', label: 'Leverage', icon: Radar },
]

function PhoneTabBar({ view, searchFor }: { view: LiveView; searchFor: (view: LiveView) => string }) {
  return (
    <nav
      aria-label="Live tabs"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      {TABS.map(({ view: tab, label, icon: Icon }) => (
        <Link
          key={tab}
          to={{ search: searchFor(tab) }}
          aria-current={view === tab ? 'page' : undefined}
          className={cn(
            // The bar sits on the screen's bottom edge, so the focus ring is drawn inside.
            'flex flex-col items-center gap-0.5 py-2 text-[11px] [--focus-offset:-2px]',
            view === tab ? 'text-cashing' : 'text-muted-foreground',
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  )
}

/**
 * The Live Command center: a rail (tablet and up) or bottom tab bar (phones) picks what fills
 * the main area, and the view (and focused VIP or Train) lives in the URL. Players is the default.
 * The Leverage panel sits beside (desktop) or below (tablet) the main area, and is its own tab on phones.
 */
function CommandCenter({ model, title }: { model: LiveModel; title: ReactNode }) {
  const isPhone = useIsPhone()
  const { view, vipKey, trainId, searchFor } = useLiveView()
  const trainRows = model.trains.availability === 'available' ? model.trains.data.rows : null
  const focusedVip = resolveFocusedVip(model.vips, vipKey)
  const focusedTrain = trainRows ? resolveFocusedTrain(trainRows, trainId) : null
  const listedTrains = trainRows ? railTrains(trainRows, focusedTrain) : []
  const vipHref = (vip: LiveVip) => searchFor('vips', { vip: vip.key })
  const trainHref = (train: LiveTrain) => searchFor('trains', { train: train.id })
  // HAVE/FADE follow the focused Train on the Trains view and the focused VIP (the URL's, else the first) everywhere else.
  const leverageFocus: LeverageFocus | null =
    view === 'trains' && focusedTrain
      ? { label: `×${focusedTrain.entries} train`, vipKey: null, lineup: focusedTrain.players }
      : focusedVip
        ? { label: focusedVip.name, vipKey: focusedVip.key, lineup: focusedVip.players }
        : null
  const leveragePanel = <LeveragePanel model={model} focus={leverageFocus} />

  const main =
    view === 'vips' ? (
      focusedVip ? (
        <>
          {isPhone ? <VipChips vips={model.vips} activeKey={focusedVip.key} hrefFor={vipHref} /> : null}
          <VipView model={model} vip={focusedVip} trainHref={(id) => searchFor('trains', { train: id })} />
        </>
      ) : (
        <NoVips />
      )
    ) : view === 'trains' ? (
      focusedTrain ? (
        <>
          {isPhone ? <TrainChips trains={listedTrains} activeId={focusedTrain.id} hrefFor={trainHref} /> : null}
          <TrainView model={model} train={focusedTrain} />
        </>
      ) : (
        <NoTrains unavailable={trainRows === null} />
      )
    ) : view === 'leverage' ? (
      leveragePanel
    ) : (
      <PlayersView model={model} isPhone={isPhone} vipHref={(key) => searchFor('vips', { vip: key })} />
    )

  return (
    <div className={cn('min-h-[calc(100vh-37px)]', isPhone && 'pb-20')}>
      <h1 className="sr-only">{title}</h1>
      <TopBarSlot>
        <TopBarReadout model={model} />
      </TopBarSlot>

      <div className="grid md:grid-cols-[220px_minmax(0,1fr)] xl:h-[calc(100vh-37px)] xl:grid-cols-[220px_minmax(0,1fr)_320px]">
        {isPhone ? null : (
          <nav aria-label="Live views" className="flex flex-col gap-1 border-r p-2 xl:overflow-y-auto">
            <RailLink
              to={searchFor('players')}
              active={view === 'players'}
              icon={Table2}
              label="Players"
              detail={`${model.pool.length} · ownership`}
            />
            {model.vips.length === 0 ? (
              <RailLink to={searchFor('vips')} active={view === 'vips'} icon={Star} label="VIPs" detail="none tracked" />
            ) : (
              <>
                <RailHeading>VIPs</RailHeading>
                <VipRailRows vips={model.vips} activeKey={view === 'vips' ? focusedVip?.key ?? null : null} hrefFor={vipHref} />
              </>
            )}
            {focusedTrain ? (
              <>
                <RailHeading>Trains</RailHeading>
                <TrainRailRows
                  trains={listedTrains}
                  activeId={view === 'trains' ? focusedTrain.id : null}
                  hrefFor={trainHref}
                />
              </>
            ) : (
              <RailLink
                to={searchFor('trains')}
                active={view === 'trains'}
                icon={TrainFront}
                label="Trains"
                detail={trainRows === null ? 'unavailable' : 'none'}
              />
            )}
          </nav>
        )}

        <div className="min-w-0 p-3 md:p-6 xl:overflow-y-auto">{main}</div>

        {isPhone || view === 'leverage' ? null : (
          <aside
            aria-label="Leverage"
            className="min-w-0 border-t p-4 md:col-span-2 xl:col-span-1 xl:overflow-y-auto xl:border-t-0 xl:border-l"
          >
            {leveragePanel}
          </aside>
        )}
      </div>

      {isPhone ? <PhoneTabBar view={view} searchFor={(tab) => searchFor(tab)} /> : null}
    </div>
  )
}

export default CommandCenter
