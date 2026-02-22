import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createAdminUser,
  deactivateAdminUser,
  listAdminUsers,
  reactivateAdminUser,
  resetAdminUserPassword,
} from '../lib/authApi'
import { useAuth } from '../hooks/useAuth'
import type { AdminUser, AuthRole } from '../lib/types'

function sortUsers(users: AdminUser[]): AdminUser[] {
  return [...users].sort((a, b) => a.username.localeCompare(b.username))
}

function AdminUsers() {
  const { user } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [role, setRole] = useState<AuthRole>('friend')
  const [tempPassword, setTempPassword] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await listAdminUsers()
        if (!cancelled) {
          setUsers(sortUsers(result))
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load users.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const statusMessage = useMemo(() => {
    if (generatedPassword) {
      return `Temporary password: ${generatedPassword}`
    }
    return null
  }, [generatedPassword])

  if (user?.role !== 'owner') {
    return (
      <section className="page page-stack">
        <h1 className="page-title">Admin users</h1>
        <p className="error-text">Owner access required.</p>
      </section>
    )
  }

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!username.trim()) {
      return
    }
    setError(null)
    setGeneratedPassword(null)

    try {
      const result = await createAdminUser({
        username: username.trim(),
        role,
        temporaryPassword: tempPassword.trim() ? tempPassword.trim() : undefined,
      })
      setUsers((prev) => sortUsers([...prev, result.user]))
      setGeneratedPassword(result.temporaryPassword || null)
      setUsername('')
      setTempPassword('')
      setRole('friend')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create user.')
    }
  }

  const onResetPassword = async (target: AdminUser) => {
    setError(null)
    setGeneratedPassword(null)
    try {
      const result = await resetAdminUserPassword(target.id)
      setUsers((prev) =>
        sortUsers(
          prev.map((item) =>
            item.id === target.id
              ? {
                  ...item,
                  must_change_password: true,
                }
              : item,
          ),
        ),
      )
      setGeneratedPassword(result.temporaryPassword || null)
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset password.')
    }
  }

  const onDeactivate = async (target: AdminUser) => {
    setError(null)
    try {
      await deactivateAdminUser(target.id)
      setUsers((prev) =>
        sortUsers(prev.map((item) => (item.id === target.id ? { ...item, is_active: false } : item))),
      )
    } catch (deactivateError) {
      setError(deactivateError instanceof Error ? deactivateError.message : 'Unable to deactivate user.')
    }
  }

  const onReactivate = async (target: AdminUser) => {
    setError(null)
    try {
      await reactivateAdminUser(target.id)
      setUsers((prev) =>
        sortUsers(prev.map((item) => (item.id === target.id ? { ...item, is_active: true } : item))),
      )
    } catch (reactivateError) {
      setError(reactivateError instanceof Error ? reactivateError.message : 'Unable to reactivate user.')
    }
  }

  return (
    <section className="page page-stack">
      <h1 className="page-title">Admin users</h1>
      <p className="page-meta">Create, reset, deactivate, and reactivate dashboard users.</p>
      {error ? <p className="error-text">{error}</p> : null}
      {statusMessage ? <p className="meta-text">{statusMessage}</p> : null}

      <form onSubmit={submitCreate} className="panel page-stack-sm">
        <h2 className="section-title">Create user</h2>
        <div className="form-grid">
          <label htmlFor="admin-create-username">Username</label>
          <input
            id="admin-create-username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </div>
        <div className="form-grid">
          <label htmlFor="admin-create-role">Role</label>
          <select id="admin-create-role" value={role} onChange={(event) => setRole(event.target.value as AuthRole)}>
            <option value="friend">friend</option>
            <option value="owner">owner</option>
          </select>
        </div>
        <div className="form-grid">
          <label htmlFor="admin-create-temp-password">Temporary password (optional)</label>
          <input
            id="admin-create-temp-password"
            type="text"
            value={tempPassword}
            onChange={(event) => setTempPassword(event.target.value)}
            placeholder="Auto-generate if empty"
          />
        </div>
        <button type="submit">Create user</button>
      </form>

      <section className="panel page-stack-sm">
        <h2 className="section-title">Users</h2>
        {loading ? (
          <p className="meta-text">Loading users...</p>
        ) : users.length === 0 ? (
          <p className="meta-text">No users found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Status</th>
                <th>Must change</th>
                <th>Last login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id}>
                  <td>{item.username}</td>
                  <td>{item.role}</td>
                  <td>{item.is_active ? 'active' : 'inactive'}</td>
                  <td>{item.must_change_password ? 'yes' : 'no'}</td>
                  <td>{item.last_login_at ?? '—'}</td>
                  <td>
                    <div className="action-row">
                      <button type="button" onClick={() => void onResetPassword(item)}>
                        Reset password
                      </button>
                      {item.is_active ? (
                        <button type="button" onClick={() => void onDeactivate(item)}>
                          Deactivate
                        </button>
                      ) : (
                        <button type="button" onClick={() => void onReactivate(item)}>
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  )
}

export default AdminUsers
