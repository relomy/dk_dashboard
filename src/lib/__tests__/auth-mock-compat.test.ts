import { describe, expect, it, vi } from 'vitest'

vi.mock('../env', () => ({
  config: {
    apiBaseUrl: '',
    useMock: true,
    mockSnapshotOnly: true,
    mockSnapshotPath: 'snapshots/canonical-live-snapshot.v2.json',
  },
}))

describe('auth api mock compatibility', () => {
  it('returns a mock session user without backend auth requests', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('unexpected fetch call in mock mode')
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { fetchCurrentUser } = await import('../authApi')
    const user = await fetchCurrentUser()

    expect(user).toEqual({
      id: 'mock-user',
      username: 'mock',
      role: 'friend',
      must_change_password: false,
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('bypasses login/logout/password change calls in mock mode', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('unexpected fetch call in mock mode')
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { login, logout, changePassword } = await import('../authApi')

    await expect(login({ username: 'x', password: 'y' })).resolves.toEqual({
      id: 'mock-user',
      username: 'mock',
      role: 'friend',
      must_change_password: false,
    })
    await expect(logout()).resolves.toBeUndefined()
    await expect(changePassword({ newPassword: 'new-password-1234' })).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
