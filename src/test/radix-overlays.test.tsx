import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

afterEach(cleanup)

// Radix opens menus on pointerdown (not click) and renders overlays in a portal
// under <body>. This proves the jsdom shims in src/test/setup.ts are enough for
// route tests to open the dropdown menu, the only overlay primitive the app uses.
describe('shadcn overlays in jsdom', () => {
  it('opens a dropdown menu in a portal and renders its items', () => {
    const { container } = render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Account</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuItem>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Account' }), { button: 0, ctrlKey: false })

    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Settings' })).toBeVisible()
    expect(within(menu).getByRole('menuitem', { name: 'Sign out' })).toBeVisible()
    // Portaled: rendered under <body>, outside the component's own container.
    expect(container).not.toContainElement(menu)
    expect(document.body).toContainElement(menu)
  })
})
