import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet,SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

afterEach(cleanup)

// Radix opens menus on pointerdown (not click) and renders overlays in a portal
// under <body>. These tests prove the jsdom shims in src/test/setup.ts are enough
// for later route tests to open menus, sheets and tooltips.
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

  it('opens a sheet in a portal and renders its content', () => {
    const { container } = render(
      <Sheet>
        <SheetTrigger asChild>
          <Button>Filters</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetTitle>Pick filters</SheetTitle>
          <SheetDescription>Choose what to show.</SheetDescription>
        </SheetContent>
      </Sheet>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))

    const dialog = screen.getByRole('dialog', { name: 'Pick filters' })
    expect(within(dialog).getByText('Choose what to show.')).toBeVisible()
    expect(container).not.toContainElement(dialog)
  })

  it('opens a select in a portal and lists its options', () => {
    render(
      <Select>
        <SelectTrigger aria-label="Sport">
          <SelectValue placeholder="Pick a sport" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="cfb">CFB</SelectItem>
          <SelectItem value="mlb">MLB</SelectItem>
        </SelectContent>
      </Select>,
    )

    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Sport' }), { button: 0, ctrlKey: false, pointerType: 'mouse' })

    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByRole('option', { name: 'CFB' })).toBeVisible()
    expect(within(listbox).getByRole('option', { name: 'MLB' })).toBeVisible()
  })

  it('shows a tooltip when its trigger receives focus', async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button>Hint</Button>
          </TooltipTrigger>
          <TooltipContent>Helpful hint</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )

    fireEvent.focus(screen.getByRole('button', { name: 'Hint' }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Helpful hint')
  })
})
