import { Link, NavLink, Outlet } from 'react-router-dom'
import { useProfiles } from '../context/ProfileContext'

const navItems = [
  { to: '/latest', label: 'Latest' },
  { to: '/history', label: 'History' },
  { to: '/health', label: 'Health' },
  { to: '/settings', label: 'Settings' },
]

function AppShell() {
  const { profiles, activeProfileId, setActiveProfileId } = useProfiles()

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/latest">
          DK Dashboard
        </Link>
        <nav>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div>
          <label htmlFor="active-profile">Active profile</label>{' '}
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
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}

export default AppShell
