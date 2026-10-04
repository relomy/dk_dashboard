import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import AuthLayout, { AuthLoading } from '../components/AuthLayout'
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
    return <AuthLoading />
  }

  if (status === 'authenticated' && user) {
    if (user.must_change_password) {
      return <Navigate to="/change-password" replace />
    }
    return <Navigate to="/" replace />
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
      navigate(fromPath && fromPath !== '/login' ? fromPath : '/', { replace: true })
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
    <AuthLayout title="Sign in" description="Use your dashboard username and password.">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="auth-username">Username</Label>
          <Input
            id="auth-username"
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="auth-password">Password</Label>
          <Input
            id="auth-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </AuthLayout>
  )
}

export default Login
