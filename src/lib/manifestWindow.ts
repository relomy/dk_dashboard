import type { LatestResponse, ManifestSnapshotSummary } from './types'

/**
 * The manifest range History and the Timeline share: today's manifest plus yesterday's (UTC), as `/api/latest`
 * names them. Keeping the range here means both read the same window.
 */
export function manifestWindowPaths(latest: LatestResponse): { today: string; yesterday: string | undefined } {
  return { today: latest.manifest_today_path, yesterday: latest.manifest_yesterday_path || undefined }
}

/** The snapshots of several manifests merged, one per `snapshot_at` (the first listed wins), newest first. */
export function snapshotsNewestFirst(...lists: ManifestSnapshotSummary[][]): ManifestSnapshotSummary[] {
  const seen = new Set<string>()
  const unique: ManifestSnapshotSummary[] = []
  for (const item of lists.flat()) {
    if (seen.has(item.snapshot_at)) continue
    seen.add(item.snapshot_at)
    unique.push(item)
  }
  return unique.sort((a, b) => b.snapshot_at.localeCompare(a.snapshot_at))
}
