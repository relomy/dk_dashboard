import { Link, NavLink, Outlet } from 'react-router-dom'

const navItems = [
  { to: '/latest', label: 'Latest' },
  { to: '/history', label: 'History' },
  { to: '/health', label: 'Health' },
  { to: '/settings', label: 'Settings' },
]

function AppShell() {
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
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  )
}

export default AppShell
