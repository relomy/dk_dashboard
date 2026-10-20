import { createTimelineSource, type TimelineHistory } from '../timelineSource'

export const noYield = async () => {}
export const sourceOf = (history: TimelineHistory, extra: Partial<Parameters<typeof createTimelineSource>[0]> = {}) =>
  createTimelineSource({ history, now: () => 1_000, yieldToMain: noYield, ...extra })
