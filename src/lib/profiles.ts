export interface ProfileMatchRules {
  contains?: string
  exact?: string
  username?: string
}

export interface Profile {
  id: string
  name: string
  rules: ProfileMatchRules
}

const PROFILES_KEY = 'dk_dashboard_profiles'
const ACTIVE_PROFILE_KEY = 'dk_dashboard_active_profile_id'

const fallbackStore = new Map<string, string>()

function getStorage(): Storage | null {
  const candidate = globalThis.localStorage as Storage | undefined
  if (
    candidate &&
    typeof candidate.getItem === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function'
  ) {
    return candidate
  }

  return null
}

function getItem(key: string): string | null {
  const storage = getStorage()
  if (storage) {
    return storage.getItem(key)
  }

  return fallbackStore.get(key) ?? null
}

function setItem(key: string, value: string): void {
  const storage = getStorage()
  if (storage) {
    storage.setItem(key, value)
    return
  }

  fallbackStore.set(key, value)
}

function removeItem(key: string): void {
  const storage = getStorage()
  if (storage) {
    storage.removeItem(key)
    return
  }

  fallbackStore.delete(key)
}

export function createDefaultProfile(): Profile {
  return {
    id: 'me',
    name: 'Me',
    rules: {},
  }
}

export function createProfileId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `profile_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function loadProfiles(): Profile[] {
  const raw = getItem(PROFILES_KEY)
  if (!raw) {
    return [createDefaultProfile()]
  }

  try {
    const parsed = JSON.parse(raw) as Profile[]
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [createDefaultProfile()]
    }

    return parsed
  } catch {
    return [createDefaultProfile()]
  }
}

export function saveProfiles(profiles: Profile[]): void {
  setItem(PROFILES_KEY, JSON.stringify(profiles))
}

export function loadActiveProfileId(): string | null {
  return getItem(ACTIVE_PROFILE_KEY)
}

export function saveActiveProfileId(profileId: string): void {
  setItem(ACTIVE_PROFILE_KEY, profileId)
}

export function clearProfileData(): void {
  removeItem(PROFILES_KEY)
  removeItem(ACTIVE_PROFILE_KEY)
}
