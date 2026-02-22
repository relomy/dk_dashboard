import { Link, NavLink, Outlet } from 'react-router-dom'
import { useProfiles } from '../context/ProfileContext'
import { useAuth } from '../hooks/useAuth'

const baseNavItems = [
  { to: '/latest', label: 'Latest' },
  { to: '/history', label: 'History' },
  { to: '/health', label: 'Health' },
  { to: '/settings', label: 'Settings' },
]

function AppShell() {
  const { profiles, activeProfileId, setActiveProfileId } = useProfiles()
  const { user, logout } = useAuth()
  const navItems = user?.role === 'owner' ? [...baseNavItems, { to: '/admin/users', label: 'Admin' }] : baseNavItems

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand-row">
          <Link className="brand" to="/latest">
            DK Dashboard
          </Link>
        </div>
        <nav className="topbar-nav" aria-label="Primary navigation">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="field-inline topbar-profile">
          <label htmlFor="active-profile">Active profile</label>
          <select
            id="active-profile"
            value={activeProfileId}
            onChange={(event) => setActiveProfileId(event.target.value)}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          {user ? <span className="meta-text">Signed in as {user.username} ({user.role})</span> : null}
          <button
            type="button"
            onClick={() => {
              void logout()
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}

export default AppShell
