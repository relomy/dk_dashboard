import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { changePassword, fetchCurrentUser, login as loginRequest, logout as logoutRequest } from '../lib/authApi'
import type { AuthUser } from '../lib/types'

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  changePassword: (currentPassword: string | undefined, nextPassword: string) => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const currentUser = await fetchCurrentUser()
      if (!currentUser) {
        setUser(null)
        setStatus('unauthenticated')
        return
      }
      setUser(currentUser)
      setStatus('authenticated')
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : 'Unable to load session.'
      setError(message)
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    setError(null)
    const nextUser = await loginRequest({ username, password })
    setUser(nextUser)
    setStatus('authenticated')
  }, [])

  const logout = useCallback(async () => {
    setError(null)
    await logoutRequest()
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  const updatePassword = useCallback(async (currentPassword: string | undefined, nextPassword: string) => {
    setError(null)
    await changePassword({
      currentPassword,
      newPassword: nextPassword,
    })
    await refresh()
  }, [refresh])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      login,
      logout,
      changePassword: updatePassword,
      refresh,
    }),
    [status, user, error, login, logout, updatePassword, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider')
  }
  return context
}
