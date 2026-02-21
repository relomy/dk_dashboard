export interface PerVipKeyed {
  vip_entry_key?: string | null
  entry_key?: string | null
}

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function resolveVipMetricMatchKey(value: PerVipKeyed): string | null {
  return nonEmpty(value.vip_entry_key) ?? nonEmpty(value.entry_key) ?? null
}

export function buildPerVipIndex<T extends PerVipKeyed>(rows: T[]): Map<string, T> {
  const lookup = new Map<string, T>()
  for (const row of rows) {
    const key = resolveVipMetricMatchKey(row)
    if (!key) {
      continue
    }
    lookup.set(key, row)
  }
  return lookup
}
