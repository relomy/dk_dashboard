// PROTOTYPE — Variant A "Scoreboard": dark, phone-first. Sticky contest bar, a stack of
// VIP scorecards (the hero), and everything else tucked behind tabs below.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { PhaseDot, initials, vipColor } from './atoms'
import { fmt, type LiveModel, type LiveVip } from './liveModel'

export const name = 'Scoreboard'

function VipCard({ vip, index, model }: { vip: LiveVip; index: number; model: LiveModel }) {
  const [open, setOpen] = useState(index === 0)
  const live = vip.players.filter((p) => p.phase === 'live').length
  const pre = vip.players.filter((p) => p.phase === 'pre').length
  const pmrPct = vip.pmr == null ? 0 : (vip.pmr / model.maxPmr) * 100

  return (
    <div className={cn('overflow-hidden rounded-2xl border bg-card', vip.cashing ? 'border-emerald-500/30' : 'border-rose-500/30')}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full p-4 text-left">
        <div className="flex items-center gap-3">
          <span className={cn('grid size-9 place-items-center rounded-full text-xs font-bold text-white', vipColor(index))}>
            {initials(vip.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{vip.name}</div>
            <div className="text-xs text-muted-foreground">
              {live} live · {pre} yet to play · {vip.pmr ?? '—'} PMR
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl leading-none font-bold tabular-nums">{fmt.ordinal(vip.rank)}</div>
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">of {model.fieldSize}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Points" value={fmt.pts(vip.points)} />
          <Stat
            label="vs cash"
            value={fmt.signed(vip.delta)}
            tone={vip.delta == null ? undefined : vip.delta >= 0 ? 'good' : 'bad'}
          />
          <Stat label="Proj" value={fmt.pts(vip.projected)} />
        </div>

        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
            <span>Minutes remaining</span>
            <span className="tabular-nums">{Math.round(pmrPct)}%</span>
          </div>
          <Progress value={pmrPct} className="h-1.5" />
        </div>
      </button>

      {open ? (
        <ul className="divide-y divide-border border-t bg-muted/30">
          {vip.players.map((p) => (
            <li key={p.slot + p.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-10 shrink-0 text-[11px] font-medium text-muted-foreground">{p.slot}</span>
              <PhaseDot phase={p.phase} />
              <div className="min-w-0 flex-1">
                <div className={cn('truncate', p.phase === 'final' && 'text-muted-foreground')}>{p.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {p.clock}
                  {p.own != null ? ` · ${fmt.pct(p.own)} owned` : ''}
                </div>
              </div>
              <div className="text-right tabular-nums">
                <div className="font-semibold">{fmt.pts(p.points)}</div>
                {p.phase !== 'final' && p.proj != null ? (
                  <div className="text-[11px] text-muted-foreground">proj {fmt.pts(p.proj)}</div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl bg-muted/50 px-2 py-2">
      <div
        className={cn(
          'text-lg leading-tight font-semibold tabular-nums',
          tone === 'good' && 'text-emerald-400',
          tone === 'bad' && 'text-rose-400',
        )}
      >
        {value}
      </div>
      <div className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</div>
    </div>
  )
}

export default function VariantA({ model }: { model: LiveModel }) {
  const cashingCount = model.vips.filter((v) => v.cashing).length

  return (
    <div className="min-h-screen bg-background pb-24 font-sans text-foreground">
      {/* Top bar: sport switcher + avatar */}
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl lg:max-w-5xl items-center gap-2 px-4 py-2.5">
          <span className="mr-1 text-sm font-black tracking-tight">DK</span>
          <div className="flex flex-1 gap-1 overflow-x-auto">
            {[...new Set([...model.sports, 'nfl', 'mlb'])].map((s) => (
              <Link
                key={s}
                to={`/live/${s}?variant=A`}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-semibold uppercase',
                  s === model.sport ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {s}
              </Link>
            ))}
          </div>
          <span className="grid size-7 place-items-center rounded-full bg-muted text-[10px] font-bold">AL</span>
        </div>

        {/* Contest strip */}
        <div className="mx-auto flex max-w-2xl lg:max-w-5xl items-center gap-3 px-4 pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <PhaseDot phase={model.state === 'live' ? 'live' : 'final'} />
              <span className="truncate text-sm font-semibold">{model.contestName}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {fmt.money(model.prizePool)} pool · {model.fieldSize} entries · updated {fmt.time(model.snapshotAt)}
            </div>
          </div>
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-right">
            <div className="text-[10px] font-semibold tracking-wider text-amber-300 uppercase">Cash line</div>
            <div className="text-base leading-tight font-bold tabular-nums">{fmt.pts(model.cashPoints)}</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 pt-4 lg:max-w-5xl">
        <div className="flex items-baseline justify-between">
          <h1 className="text-lg font-bold">VIPs</h1>
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-emerald-400">{cashingCount}</span> of {model.vips.length} cashing
          </span>
        </div>
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {model.vips.map((vip, i) => (
            <VipCard key={vip.key} vip={vip} index={i} model={model} />
          ))}
        </div>

        <Tabs defaultValue="field" className="pt-4">
          <TabsList className="w-full">
            <TabsTrigger value="field">Field</TabsTrigger>
            <TabsTrigger value="standings">Standings</TabsTrigger>
            <TabsTrigger value="trains">Trains</TabsTrigger>
          </TabsList>

          <TabsContent value="field" className="space-y-4 pt-2">
            <section>
              <h2 className="mb-2 text-sm font-semibold">Still to play — most owned</h2>
              <ul className="space-y-1.5">
                {model.swing.map((p) => (
                  <li key={p.name} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.vipCount > 0 ? (
                      <Badge variant="secondary" className="text-[10px]">
                        {p.vipCount} VIP{p.vipCount > 1 ? 's' : ''}
                      </Badge>
                    ) : null}
                    <span className="w-14 text-right tabular-nums text-muted-foreground">{fmt.pct(p.ownLeft)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-2 text-sm font-semibold">Ownership leaders</h2>
              <ul className="space-y-1.5">
                {model.leaders.slice(0, 5).map((l) => (
                  <li key={l.name} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                    <span className="w-10 text-muted-foreground tabular-nums">{fmt.ordinal(l.rank)}</span>
                    <span className="flex-1 truncate">{l.name}</span>
                    <span className="tabular-nums text-muted-foreground">{l.pmr} PMR</span>
                  </li>
                ))}
              </ul>
            </section>
          </TabsContent>

          <TabsContent value="standings" className="pt-2">
            <ul className="divide-y divide-border rounded-xl border">
              {model.standings.slice(0, 60).map((r) => (
                <li
                  key={r.key}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 text-sm',
                    r.vip && 'bg-violet-500/15 font-semibold',
                    r.rank === model.cashRank && 'border-b-2 border-b-amber-400',
                  )}
                >
                  <span className="w-8 text-muted-foreground tabular-nums">{r.rank}</span>
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">{r.pmr}</span>
                  <span className="w-16 text-right tabular-nums">{fmt.pts(r.points)}</span>
                </li>
              ))}
            </ul>
          </TabsContent>

          <TabsContent value="trains" className="space-y-2 pt-2">
            {model.trains.map((t) => (
              <div key={t.key} className="rounded-xl border p-3 text-sm">
                <div className="flex justify-between font-semibold">
                  <span>{t.entries} identical entries</span>
                  <span className="text-muted-foreground tabular-nums">best {fmt.ordinal(t.bestRank)}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{t.players.join(' · ')}</div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
