import { MoreHorizontal } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

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
]

/**
 * Development-only gallery of the design system (mounted at /dev/ui only when
 * running `vite dev`). It renders primitives inside the legacy app shell and
 * behind portaled overlays, which is the place to eyeball that legacy element
 * styles do not leak into the new UI. Not part of the production bundle.
 */
export default function DesignSystem() {
  return (
    <TooltipProvider>
      <div className="app-ui space-y-8 rounded-lg p-6">
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
          <h2 className="text-sm font-medium text-muted-foreground">Overlays (portaled)</h2>
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

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="secondary">Open sheet</Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Sheet</SheetTitle>
                  <SheetDescription>A portaled overlay with form controls inside.</SheetDescription>
                </SheetHeader>
                <div className="space-y-3 p-4">
                  <Label htmlFor="ds-sheet-input">Name</Label>
                  <Input id="ds-sheet-input" placeholder="Type here" />
                  <Button>Save</Button>
                </div>
              </SheetContent>
            </Sheet>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost">Open dialog</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dialog</DialogTitle>
                  <DialogDescription>Centered overlay.</DialogDescription>
                </DialogHeader>
              </DialogContent>
            </Dialog>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline">Hover me</Button>
              </TooltipTrigger>
              <TooltipContent>Tooltip text</TooltipContent>
            </Tooltip>

            <Select defaultValue="cfb">
              <SelectTrigger aria-label="Sport" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cfb">CFB</SelectItem>
                <SelectItem value="mlb">MLB</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Inputs</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Input className="w-56" placeholder="Search by name" />
            <ToggleGroup type="single" defaultValue="all" variant="outline">
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              <ToggleGroupItem value="left">Still to play</ToggleGroupItem>
            </ToggleGroup>
            <Badge>Badge</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Avatar>
              <AvatarFallback>AL</AvatarFallback>
            </Avatar>
          </div>
        </section>

        <Separator />

        <section className="grid gap-4 md:grid-cols-2">
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
          <Card>
            <CardHeader>
              <CardTitle>Tabs and skeleton</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Tabs defaultValue="a">
                <TabsList>
                  <TabsTrigger value="a">Players</TabsTrigger>
                  <TabsTrigger value="b">VIPs</TabsTrigger>
                </TabsList>
                <TabsContent value="a">Players tab</TabsContent>
                <TabsContent value="b">VIPs tab</TabsContent>
              </Tabs>
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
        </section>
      </div>
    </TooltipProvider>
  )
}
