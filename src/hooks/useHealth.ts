import { useMemo } from 'react'
import { useLatestSnapshot } from './useSnapshot'

export function useHealth() {
  const outcome = useLatestSnapshot()
  const snapshot = outcome.kind === 'ready' ? outcome.snapshot : undefined

  const snapshotAgeSeconds = useMemo(() => {
    if (!snapshot) {
      return null
    }

    const generatedAtMs = new Date(snapshot.generated_at).getTime()
    // The age is intentionally sampled once per snapshot (and on mount), not on every render.
    // eslint-disable-next-line react-hooks/purity
    const nowMs = Date.now()

    if (Number.isNaN(generatedAtMs)) {
      return null
    }

    return Math.max(0, Math.floor((nowMs - generatedAtMs) / 1000))
  }, [snapshot])

  const sports = useMemo(() => {
    if (!snapshot) {
      return []
    }

    return Object.entries(snapshot.sports).map(([sport, details]) => ({
      sport,
      status: details.status,
      updatedAt: details.updated_at,
    }))
  }, [snapshot])

  return { outcome, snapshotAgeSeconds, sports }
}
