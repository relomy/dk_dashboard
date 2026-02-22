import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AppShell from './components/AppShell'
import { AuthProvider } from './context/AuthContext'
import { ProfileProvider } from './context/ProfileContext'
import { useAuth } from './hooks/useAuth'
import AdminUsers from './routes/AdminUsers'
import ChangePassword from './routes/ChangePassword'
import Health from './routes/Health'
import History from './routes/History'
import Latest from './routes/Latest'
import Live from './routes/Live'
import Login from './routes/Login'
import Settings from './routes/Settings'
import Sport from './routes/Sport'

function RequireAuthenticatedLayout() {
  const location = useLocation()
  const { status, user } = useAuth()

  if (status === 'loading') {
    return <p className="page">Loading session...</p>
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  return <AppShell />
}

function RequireOwner() {
  const { status, user } = useAuth()

  if (status === 'loading') {
    return <p className="page">Loading session...</p>
  }

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace />
  }

  if (user.role !== 'owner') {
    return <Navigate to="/latest" replace />
  }

  return <Outlet />
}

function App() {
  return (
    <AuthProvider>
      <ProfileProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/change-password" element={<ChangePassword />} />

          <Route element={<RequireAuthenticatedLayout />}>
            <Route path="/latest" element={<Latest />} />
            <Route path="/live/:sport" element={<Live />} />
            <Route path="/history" element={<History />} />
            <Route path="/history/:timestamp" element={<History />} />
            <Route path="/sport/:sport" element={<Sport />} />
            <Route path="/health" element={<Health />} />
            <Route path="/settings" element={<Settings />} />
            <Route element={<RequireOwner />}>
              <Route path="/admin/users" element={<AdminUsers />} />
            </Route>
            <Route path="*" element={<Navigate to="/latest" replace />} />
          </Route>
        </Routes>
      </ProfileProvider>
    </AuthProvider>
  )
}

export default App
