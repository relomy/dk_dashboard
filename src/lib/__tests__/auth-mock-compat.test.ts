import { afterEach, describe, expect, it, vi } from 'vitest'

const MOCK_ENV = {
  config: {
    apiBaseUrl: '',
    useMock: true,
    mockSnapshotOnly: true,
    mockSnapshotPath: 'snapshots/canonical-live-snapshot.v3.json',
  },
}

async function importAuthApiWithMockEnv() {
  vi.resetModules()
  vi.doMock('../env', () => MOCK_ENV)
  return import('../authApi')
}

afterEach(() => {
  vi.doUnmock('../env')
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('auth api mock compatibility', () => {
  it('returns a mock session user without backend auth requests', async () => {
    const fetchSpy = vi.fn(async () => {
      throw new Error('unexpected fetch call in mock mode')
    })
    vi.stubGlobal('fetch', fetchSpy)

    const { fetchCurrentUser } = await importAuthApiWithMockEnv()
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

    const { login, logout, changePassword } = await importAuthApiWithMockEnv()

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
