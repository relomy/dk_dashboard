import { createContext, useContext } from 'react'
import { apiTimelineHistory, createTimelineSource, type TimelineSource } from '../lib/timelineSource'

const defaultSource = createTimelineSource({ history: apiTimelineHistory })

/** The Timeline's data source; the default reads History over the app's API. Provide another to swap it. */
export const TimelineSourceContext = createContext<TimelineSource | null>(null)

export function useTimelineSource(): TimelineSource {
  return useContext(TimelineSourceContext) ?? defaultSource
}
