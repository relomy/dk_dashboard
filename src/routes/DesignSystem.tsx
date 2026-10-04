import { MoreHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const BUTTON_VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'destructive'] as const

// Class names are written out in full so Tailwind can see them.
const MEANING_SWATCHES: Array<{ label: string; className: string }> = [
  { label: 'cashing', className: 'bg-cashing' },
  { label: 'non-cashing', className: 'bg-non-cashing' },
  { label: 'cash line', className: 'bg-cash-line' },
  { label: 'own 1', className: 'bg-own-1' },
  { label: 'own 2', className: 'bg-own-2' },
  { label: 'own 3', className: 'bg-own-3' },
  { label: 'own 4', className: 'bg-own-4' },
  { label: 'own 5', className: 'bg-own-5' },
  { label: 'value great', className: 'bg-value-great-bg text-value-great' },
  { label: 'value good', className: 'bg-value-good-bg text-value-good' },
  { label: 'value mid', className: 'bg-value-mid-bg text-value-mid' },
  { label: 'value poor', className: 'bg-value-poor-bg text-value-poor' },
  { label: 'vip 1', className: 'bg-vip-1' },
  { label: 'vip 2', className: 'bg-vip-2' },
  { label: 'vip 3', className: 'bg-vip-3' },
  { label: 'vip 4', className: 'bg-vip-4' },
  { label: 'vip 5', className: 'bg-vip-5' },
  { label: 'vip 6', className: 'bg-vip-6' },
  { label: 'pre-game', className: 'bg-game-pre-game text-background' },
  { label: 'in progress', className: 'bg-game-in-progress text-background' },
  { label: 'final', className: 'bg-game-final' },
  { label: 'focus', className: 'bg-focus text-background' },
]

/**
 * Development-only gallery of the design system (mounted at /dev/ui only when
 * running `vite dev`). It renders every primitive the app uses and every meaning
 * token, in the app shell and in a portaled menu. Not part of the production bundle.
 */
export default function DesignSystem() {
  return (
    <div className="space-y-8 rounded-lg p-6">
      <h1 className="text-2xl font-semibold">Design system</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Buttons</h2>
        <div className="flex flex-wrap gap-2">
          {BUTTON_VARIANTS.map((variant) => (
            <Button key={variant} variant={variant}>
              {variant}
            </Button>
          ))}
          <Button disabled>disabled</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Meaning colors</h2>
        <div className="flex flex-wrap gap-2">
          {MEANING_SWATCHES.map(({ label, className }) => (
            <span key={label} className={`rounded px-2 py-1 font-mono text-xs tabular-nums ${className}`}>
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Menu (portaled)</h2>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" aria-label="Open menu">
                <MoreHorizontal />
                Menu
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Settings</DropdownMenuItem>
              <DropdownMenuItem>History</DropdownMenuItem>
              <DropdownMenuItem variant="destructive">Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Inputs</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid w-56 gap-1.5">
            <Label htmlFor="ds-input">Name</Label>
            <Input id="ds-input" placeholder="Search by name" />
          </div>
          <div className="grid w-40 gap-1.5">
            <Label htmlFor="ds-select">Sport</Label>
            <NativeSelect id="ds-select" defaultValue="cfb">
              <option value="cfb">CFB</option>
              <option value="mlb">MLB</option>
            </NativeSelect>
          </div>
          <Badge>Badge</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
        </div>
      </section>

      <section className="max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Table</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Own</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Ashton Daniels</TableCell>
                  <TableCell className="text-right tabular-nums">12.4%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
