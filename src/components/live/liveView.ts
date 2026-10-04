import { useSearchParams } from 'react-router-dom'
import { largestTrains, type LiveTrain, type LiveVip } from '../../lib/liveModel'

/**
 * Live URL state: `?view=players|vips|trains|leverage&vip=<key>&train=<id>`.
 * Players is the default view and leaves `view` out of the URL. The focus params
 * (`vip`, `train`) are kept across view switches so a return to that view lands
 * on the same VIP or Train.
 */
export type LiveView = 'players' | 'vips' | 'trains' | 'leverage'

export const LIVE_VIEWS: readonly LiveView[] = ['players', 'vips', 'trains', 'leverage']

function isLiveView(value: string | null): value is LiveView {
  return value !== null && (LIVE_VIEWS as readonly string[]).includes(value)
}

/** The VIP the VIPs view follows: the one named in the URL, else the first VIP; null when there are none. */
export function resolveFocusedVip(vips: LiveVip[], vipKey: string | null): LiveVip | null {
  return vips.find((vip) => vip.key === vipKey) ?? vips[0] ?? null
}

/** The Train the Trains view follows: the one named in the URL, else the largest; null when there are none. */
export function resolveFocusedTrain(trains: LiveTrain[], trainId: string | null): LiveTrain | null {
  return trains.find((train) => train.id === trainId) ?? largestTrains(trains, 1)[0] ?? null
}

/** The rail and phone chips list this many of the largest Trains. */
export const RAIL_TRAIN_COUNT = 6

/** The largest Trains for the rail, plus the focused Train when it is not among them. */
export function railTrains(trains: LiveTrain[], focused: LiveTrain | null): LiveTrain[] {
  const largest = largestTrains(trains, RAIL_TRAIN_COUNT)
  return focused && !largest.includes(focused) ? [...largest, focused] : largest
}

export interface LiveViewState {
  view: LiveView
  vipKey: string | null
  trainId: string | null
  /** The `search` of a link to a view, optionally focusing a VIP or Train. */
  searchFor: (view: LiveView, focus?: { vip?: string; train?: string }) => string
}

export function useLiveView(): LiveViewState {
  const [params] = useSearchParams()
  const viewParam = params.get('view')

  const searchFor: LiveViewState['searchFor'] = (view, focus) => {
    const next = new URLSearchParams(params)
    if (view === 'players') next.delete('view')
    else next.set('view', view)
    if (focus?.vip) next.set('vip', focus.vip)
    if (focus?.train) next.set('train', focus.train)
    const search = next.toString()
    return search ? `?${search}` : ''
  }

  return {
    view: isLiveView(viewParam) ? viewParam : 'players',
    vipKey: params.get('vip'),
    trainId: params.get('train'),
    searchFor,
  }
}
