import { useMemo } from 'react'
import { useLatest } from './useLatest'

export function useHealth() {
  const { latestQuery, snapshotQuery } = useLatest()

  const snapshotAgeSeconds = useMemo(() => {
    if (!snapshotQuery.data) {
      return null
    }

    const generatedAtMs = new Date(snapshotQuery.data.generated_at).getTime()
    const nowMs = Date.now()

    if (Number.isNaN(generatedAtMs)) {
      return null
    }

    return Math.max(0, Math.floor((nowMs - generatedAtMs) / 1000))
  }, [snapshotQuery.data])

  const sports = useMemo(() => {
    if (!snapshotQuery.data) {
      return []
    }

    return Object.entries(snapshotQuery.data.sports).map(([sport, details]) => ({
      sport,
      status: details.status,
      updatedAt: details.updated_at,
      error: details.error,
    }))
  }, [snapshotQuery.data])

  return {
    latestQuery,
    snapshotQuery,
    snapshotAgeSeconds,
    sports,
  }
}
