import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthApiError } from '../lib/authApi'
import { useAuth } from '../hooks/useAuth'

function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { status, user, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (status === 'loading') {
    return <p className="page">Loading session...</p>
  }

  if (status === 'authenticated' && user) {
    if (user.must_change_password) {
      return <Navigate to="/change-password" replace />
    }
    return <Navigate to="/latest" replace />
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!username.trim() || !password) {
      return
    }

    setSaving(true)
    setError(null)
    try {
      await login(username.trim(), password)
      const fromPath = (location.state as { from?: string } | null)?.from
      navigate(fromPath && fromPath !== '/login' ? fromPath : '/latest', { replace: true })
    } catch (loginError) {
      if (loginError instanceof AuthApiError) {
        setError(loginError.message)
      } else {
        setError('Unable to sign in. Please try again.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="page page-centered">
      <div className="key-gate panel">
        <h1 className="page-title">Sign in</h1>
        <p className="page-meta">Use your dashboard username and password.</p>
        <form onSubmit={submit} className="form-grid">
          <label htmlFor="auth-username">Username</label>
          <input
            id="auth-username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
          <label htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          {error ? <p className="error-text">{error}</p> : null}
          <button type="submit" disabled={saving}>
            {saving ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </section>
  )
}

export default Login
