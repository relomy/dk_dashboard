import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AuthApiError } from '../lib/authApi'
import { useAuth } from '../hooks/useAuth'

function ChangePassword() {
  const navigate = useNavigate()
  const { status, user, changePassword, logout } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (status === 'loading') {
    return <p className="page">Loading session...</p>
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await changePassword(user.must_change_password ? undefined : currentPassword, newPassword)
      navigate('/latest', { replace: true })
    } catch (changeError) {
      if (changeError instanceof AuthApiError) {
        setError(changeError.message)
      } else {
        setError('Unable to change password.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page page-centered">
      <div className="key-gate panel">
        <h1 className="page-title">Change password</h1>
        <p className="page-meta">
          {user.must_change_password
            ? 'Your temporary password must be changed before continuing.'
            : 'Update your password for this account.'}
        </p>
        <form onSubmit={submit} className="form-grid">
          {!user.must_change_password ? (
            <>
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </>
          ) : null}

          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            minLength={12}
            required
          />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            minLength={12}
            required
          />
          {error ? <p className="error-text">{error}</p> : null}
          <div className="action-row">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save password'}
            </button>
            <button
              type="button"
              onClick={() => {
                void logout()
              }}
            >
              Sign out
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

export default ChangePassword
