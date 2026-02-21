export function isEnvelopeSnapshot(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return false
  }

  const payload = raw as Record<string, unknown>

  if (typeof payload.schema_version !== 'number') {
    return false
  }
  if (typeof payload.snapshot_at !== 'string' || typeof payload.generated_at !== 'string') {
    return false
  }

  const legacyRootKeys = ['contest', 'selection', 'vip_lineups', 'standings', 'cash_line']
  if (legacyRootKeys.some((key) => key in payload)) {
    return false
  }

  const sports = payload.sports
  if (!sports || typeof sports !== 'object' || Array.isArray(sports)) {
    return false
  }

  for (const sportPayload of Object.values(sports as Record<string, unknown>)) {
    if (!sportPayload || typeof sportPayload !== 'object' || Array.isArray(sportPayload)) {
      return false
    }
    const sport = sportPayload as Record<string, unknown>
    if (!Array.isArray(sport.players) || !Array.isArray(sport.contests)) {
      return false
    }
  }

  return true
}
