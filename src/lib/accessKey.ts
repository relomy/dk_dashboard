const LOCAL_KEY = 'dk_dashboard_api_key'
const SESSION_KEY = 'dk_dashboard_api_key_session'
const MODE_KEY = 'dk_dashboard_api_key_mode'

export type StorageMode = 'local' | 'session'

function canUseStorage(storage: Storage | undefined): storage is Storage {
  return Boolean(
    storage &&
      typeof storage.getItem === 'function' &&
      typeof storage.setItem === 'function' &&
      typeof storage.removeItem === 'function',
  )
}

function safeLocalStorage(): Storage | undefined {
  return canUseStorage(globalThis.localStorage as Storage | undefined)
    ? (globalThis.localStorage as Storage)
    : undefined
}

function safeSessionStorage(): Storage | undefined {
  return canUseStorage(globalThis.sessionStorage as Storage | undefined)
    ? (globalThis.sessionStorage as Storage)
    : undefined
}

export function getStoredKey(): string {
  return (
    safeSessionStorage()?.getItem(SESSION_KEY) ?? safeLocalStorage()?.getItem(LOCAL_KEY) ?? ''
  )
}

export function getStoredMode(): StorageMode {
  const value = safeLocalStorage()?.getItem(MODE_KEY)
  return value === 'session' ? 'session' : 'local'
}

export function storeKey(value: string, mode: StorageMode): void {
  safeLocalStorage()?.setItem(MODE_KEY, mode)

  if (mode === 'session') {
    safeLocalStorage()?.removeItem(LOCAL_KEY)
    safeSessionStorage()?.setItem(SESSION_KEY, value)
    return
  }

  safeSessionStorage()?.removeItem(SESSION_KEY)
  safeLocalStorage()?.setItem(LOCAL_KEY, value)
}

export function clearKey(): void {
  safeLocalStorage()?.removeItem(LOCAL_KEY)
  safeSessionStorage()?.removeItem(SESSION_KEY)
}
