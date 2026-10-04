import { Link } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useProfiles } from '../context/ProfileContext'
import { useAuth } from '../hooks/useAuth'

const roleLabel = { owner: 'Owner', friend: 'Friend' } as const

/** `allContestsSport` is the sport "All contests" opens; null when the snapshot has no sports. */
function UserMenu({ allContestsSport }: { allContestsSport: string | null }) {
  const { profiles, activeProfileId, setActiveProfileId } = useProfiles()
  const { user, logout } = useAuth()
  const initials = (user?.username ?? '?').slice(0, 2).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="User menu"
          className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary font-mono text-[10px] font-bold text-secondary-foreground ring-1 ring-border hover:ring-ring"
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {user ? (
          <>
            <DropdownMenuLabel>
              {user.username} · {roleLabel[user.role]}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuLabel className="text-xs text-muted-foreground">Profile</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={activeProfileId} onValueChange={setActiveProfileId}>
          {profiles.map((profile) => (
            <DropdownMenuRadioItem key={profile.id} value={profile.id}>
              {profile.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {allContestsSport ? (
          <DropdownMenuItem asChild>
            <Link to={`/sport/${allContestsSport}`}>All contests</Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled>All contests</DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to="/history">History</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/health">Health</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">Settings</Link>
        </DropdownMenuItem>
        {user?.role === 'owner' ? (
          <DropdownMenuItem asChild>
            <Link to="/admin/users">Admin</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void logout()
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default UserMenu
