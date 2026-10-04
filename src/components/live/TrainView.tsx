import { formatPmr, formatPoints, formatRank } from '../../lib/format'
import type { LiveModel, LiveTrain } from '../../lib/liveModel'
import { trainClosenessLabel } from '../../lib/livePresentation'
import LineupGroups from './LineupGroups'
import { Stat, VipAvatar } from './atoms'
import ViewLink from './ViewLink'

/** The rail's Train rows: size badge, closeness label, best rank and PMR, each linking to that Train. */
export function TrainRailRows({
  trains,
  activeId,
  hrefFor,
}: {
  trains: LiveTrain[]
  activeId: string | null
  hrefFor: (train: LiveTrain) => string
}) {
  return (
    <>
      {trains.map((train) => {
        const closeness = trainClosenessLabel(train.closeness)
        return (
          <ViewLink key={train.id} search={hrefFor(train)} active={train.id === activeId} variant="rail">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted font-mono text-[11px] font-bold text-foreground">
              {`×${train.entries}`}
            </span>
            <span className="min-w-0 flex-1">
              {closeness ? <span className="block truncate text-sm font-medium">{closeness}</span> : null}
              <span className="block font-mono text-[11px] text-muted-foreground">
                {`best ${formatRank(train.rank)} · ${formatPmr(train.pmr)} PMR`}
              </span>
            </span>
          </ViewLink>
        )
      })}
    </>
  )
}

/** The phone's chip row for switching between Trains. */
export function TrainChips({
  trains,
  activeId,
  hrefFor,
}: {
  trains: LiveTrain[]
  activeId: string
  hrefFor: (train: LiveTrain) => string
}) {
  return (
    <nav aria-label="Trains" className="-mx-3 -mt-1 mb-4 flex gap-2 overflow-x-auto px-3 py-1">
      {trains.map((train) => (
        <ViewLink key={train.id} search={hrefFor(train)} active={train.id === activeId} variant="chip" className="px-3">
          <span className="font-mono">{`×${train.entries}`}</span>
          <span className="text-muted-foreground">{trainClosenessLabel(train.closeness)}</span>
        </ViewLink>
      ))}
    </nav>
  )
}

/** How many riding entries the line names before counting the rest. */
const RIDING_NAMES_SHOWN = 8

function RidingLine({ train }: { train: LiveTrain }) {
  const shown = train.ridingNames.slice(0, RIDING_NAMES_SHOWN)
  if (shown.length === 0) return null
  const more = train.entries - shown.length
  return (
    <p className="mt-6 text-xs text-muted-foreground">
      {`Riding it: ${shown.join(', ')}${more > 0 ? ` +${more} more` : ''}`}
    </p>
  )
}

/**
 * The focused Train: size and closeness, best rank, points and PMR, how many players each VIP shares
 * with it, its lineup grouped by game status, and a few of the entries riding it.
 */
export function TrainView({ model, train }: { model: LiveModel; train: LiveTrain }) {
  const closeness = trainClosenessLabel(train.closeness)
  return (
    <>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="w-full sm:w-auto">
          <div className="text-xs text-muted-foreground">Train</div>
          <h2 className="text-2xl font-bold">
            {`×${train.entries}`}
            {closeness ? <span className="text-muted-foreground">{` · ${closeness}`}</span> : null}
          </h2>
        </div>
        <Stat
          label="Best rank"
          value={formatRank(train.rank)}
          sub={model.fieldSize === null ? undefined : `of ${model.fieldSize}`}
        />
        <Stat label="Points" value={formatPoints(train.points)} />
        <Stat label="PMR" value={formatPmr(train.pmr)} />
      </div>

      {train.vipOverlaps.length === 0 ? null : (
        <ul aria-label="VIPs sharing this train" className="mt-4 flex flex-wrap gap-2">
          {train.vipOverlaps.map((overlap, index) => (
            <li
              key={overlap.key}
              className="flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs text-muted-foreground"
            >
              <VipAvatar name={overlap.name} index={index} className="size-5 rounded-full text-[9px]" />
              <span className="sr-only">{overlap.name}</span>
              shares{' '}
              <span className="font-mono text-foreground">{`${overlap.shared}/${train.players.length}`}</span>
            </li>
          ))}
        </ul>
      )}

      {train.players.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No lineup is available for this train.</p>
      ) : (
        <LineupGroups players={train.players} />
      )}

      <RidingLine train={train} />
    </>
  )
}

export function NoTrains({ unavailable }: { unavailable: boolean }) {
  return (
    <p className="text-sm text-muted-foreground">
      {unavailable ? 'Train data unavailable for this contest.' : 'No trains available.'}
    </p>
  )
}
