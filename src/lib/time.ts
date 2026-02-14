export function parseHistoryTimestamp(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/.test(value)) {
    return value.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, 'T$1:$2:$3Z')
  }

  return decodeURIComponent(value)
}

export function getUtcManifestDate(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 10)
}
