export type ValueTier = 'elite' | 'strong' | 'medium' | 'low' | 'unknown'

const NBA_TEAM_ALIASES: Record<string, string> = {
  GS: 'GSW',
  NO: 'NOP',
  PHO: 'PHX',
  SA: 'SAS',
}

const NBA_TEAM_TOKENS = new Set([
  'DAL',
  'GSW',
  'LAL',
  'NOP',
  'OKC',
  'PHX',
  'POR',
  'SAS',
  'UTA',
])

export function toFiniteNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

export function isRelevantPlayerRow(input: { ownershipPct?: unknown; points?: unknown; value?: unknown }): boolean {
  const ownership = toFiniteNumber(input.ownershipPct)
  const points = toFiniteNumber(input.points)
  const value = toFiniteNumber(input.value)
  return !(ownership <= 0 && points <= 0 && value <= 0)
}

export function normalizeTeamCode(sport: string, rawTeam: unknown): string | null {
  if (typeof rawTeam !== 'string') {
    return null
  }
  const team = rawTeam.trim().toUpperCase()
  if (!team) {
    return null
  }
  if (sport.toLowerCase() !== 'nba') {
    return team
  }
  return NBA_TEAM_ALIASES[team] ?? team
}

export function classifyValueTier(value: unknown): ValueTier {
  if (value === null || value === undefined) {
    return 'unknown'
  }
  if (typeof value === 'string' && !value.trim()) {
    return 'unknown'
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return 'unknown'
  }
  if (numeric >= 8) {
    return 'elite'
  }
  if (numeric >= 5) {
    return 'strong'
  }
  if (numeric >= 3) {
    return 'medium'
  }
  return 'low'
}

export function resolveTeamStyleToken(sport: string, rawTeam: unknown): string {
  const normalized = normalizeTeamCode(sport, rawTeam)
  if (!normalized) {
    return 'neutral'
  }

  if (sport.toLowerCase() !== 'nba') {
    return 'neutral'
  }

  if (!NBA_TEAM_TOKENS.has(normalized)) {
    return 'neutral'
  }

  return `nba-${normalized.toLowerCase()}`
}
