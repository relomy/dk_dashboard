const ALLOWED_PREFIXES = ['snapshots/', 'manifest/'] as const

function decodePath(rawPath: string): string | null {
  let decoded = rawPath

  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) {
        break
      }
      decoded = next
    } catch {
      return null
    }
  }

  return decoded
}

export function validateSnapshotPath(path: string | null): string | null {
  if (!path) {
    return null
  }

  const trimmed = path.trim()
  if (!trimmed) {
    return null
  }

  const decoded = decodePath(trimmed)
  if (!decoded) {
    return null
  }

  if (decoded.includes('%')) {
    return null
  }

  if (decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\u0000')) {
    return null
  }

  if (decoded.includes('..')) {
    return null
  }

  const normalized = decoded.replace(/\/{2,}/g, '/')
  if (!ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return null
  }

  return normalized
}
