// PROTOTYPE — Variant B "Ladder": light, standings-first. The contest leaderboard is the
// hero with the cash line drawn through it; VIPs are highlighted in place and open a sheet.
import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { PhaseDot, initials, vipColor } from './atoms'
import { fmt, type LiveModel, type LiveVip, type StandingRow } from './liveModel'

export const name = 'Ladder'

export default function VariantB({ model }: { model: LiveModel }) {
  const [openVip, setOpenVip] = useState<LiveVip | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const vipIndex = new Map(model.vips.map((v, i) => [v.key, i]))

  // Which ranks are "interesting": top 3, around the cash line, around each VIP.
  const visible = useMemo(() => {
    const keep = new Set<number>()
    const add = (center: number, radius: number) => {
      for (let r = center - radius; r <= center + radius; r++) keep.add(r)
    }
    add(2, 1)
    if (model.cashRank) add(model.cashRank, 2)
    for (const v of model.vips) if (v.rank) add(v.rank, 1)
    return keep
  }, [model])

  // Group standings into visible rows + collapsed gaps.
  const blocks: Array<{ type: 'row'; row: StandingRow } | { type: 'gap'; start: number; rows: StandingRow[] }> = []
  for (const row of model.standings) {
    if (visible.has(row.rank) || expanded.has(gapStartFor(row.rank))) {
      blocks.push({ type: 'row', row })
    } else {
      const last = blocks[blocks.length - 1]
      if (last?.type === 'gap') last.rows.push(row)
      else blocks.push({ type: 'gap', start: row.rank, rows: [row] })
    }
  }
  function gapStartFor(rank: number) {
    let r = rank
    while (r > 1 && !visible.has(r - 1)) r--
    return r
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24 font-sans text-stone-900">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-base font-black tracking-tight">dk·live</span>
            <nav className="hidden gap-4 text-sm sm:flex">
              {[...new Set([...model.sports, 'nfl', 'mlb'])].map((s) => (
                <Link
                  key={s}
                  to={`/live/${s}?variant=B`}
                  className={cn('uppercase', s === model.sport ? 'font-bold text-stone-900' : 'text-stone-400 hover:text-stone-700')}
                >
                  {s}
                </Link>
              ))}
            </nav>
          </div>
          <span className="text-xs text-stone-500">Updated {fmt.time(model.snapshotAt)}</span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-6">
        <div className="text-xs font-semibold tracking-widest text-stone-400 uppercase">{model.sport} · live</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{model.contestName}</h1>
        <p className="mt-1 text-sm text-stone-500">
          {fmt.money(model.prizePool)} prize pool · {model.fieldSize} entries · top {model.cashRank} paid
        </p>

        {/* VIP jump chips */}
        <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1">
          {model.vips.map((v, i) => (
            <button
              key={v.key}
              type="button"
              onClick={() => document.getElementById(`ladder-${v.key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="flex shrink-0 items-center gap-2 rounded-full border border-stone-200 bg-white py-1 pr-3 pl-1 text-sm shadow-sm hover:border-stone-400"
            >
              <span className={cn('grid size-6 place-items-center rounded-full text-[10px] font-bold text-white', vipColor(i))}>
                {initials(v.name)}
              </span>
              <span className="font-medium">{v.name}</span>
              <span className={cn('tabular-nums', v.cashing ? 'text-emerald-600' : 'text-rose-600')}>{fmt.ordinal(v.rank)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto mt-6 grid max-w-5xl gap-8 px-4 lg:grid-cols-[1fr_300px]">
        {/* The ladder */}
        <ol className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
          <li className="grid grid-cols-[3rem_1fr_4rem_5rem] gap-2 border-b border-stone-200 px-4 py-2 text-[11px] font-semibold tracking-wider text-stone-400 uppercase">
            <span>Rank</span>
            <span>Entry</span>
            <span className="text-right">PMR</span>
            <span className="text-right">Pts</span>
          </li>
          {blocks.map((b) =>
            b.type === 'gap' ? (
              <li key={`gap-${b.start}`}>
                <button
                  type="button"
                  onClick={() => setExpanded((s) => new Set(s).add(b.start))}
                  className="w-full border-b border-stone-100 py-1.5 text-center text-xs text-stone-400 hover:bg-stone-50 hover:text-stone-600"
                >
                  ··· {b.rows.length} more ···
                </button>
              </li>
            ) : (
              <Fragment key={b.row.key}>
                <LadderRow
                  row={b.row}
                  vip={b.row.vip ? model.vips[vipIndex.get(b.row.key) ?? 0] : undefined}
                  vipI={vipIndex.get(b.row.key) ?? 0}
                  onOpen={setOpenVip}
                />
                {b.row.rank === model.cashRank ? (
                  <li className="relative border-y-2 border-dashed border-amber-400 bg-amber-50 px-4 py-1.5 text-xs font-bold tracking-wider text-amber-700 uppercase">
                    Cash line · {fmt.pts(model.cashPoints)} pts
                  </li>
                ) : null}
              </Fragment>
            ),
          )}
        </ol>

        {/* Right rail: what's left */}
        <aside className="space-y-6">
          <section>
            <h2 className="text-sm font-bold">Still to play</h2>
            <p className="text-xs text-stone-500">Most-owned players whose games aren't over.</p>
            <ul className="mt-3 space-y-2">
              {model.swing.map((p) => (
                <li key={p.name} className="text-sm">
                  <div className="flex justify-between">
                    <span>{p.name}</span>
                    <span className="tabular-nums text-stone-500">{fmt.pct(p.ownLeft)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-stone-800" style={{ width: `${Math.min(100, p.ownLeft)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-stone-200 bg-white p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-stone-500">Not cashing</span>
              <span className="font-semibold tabular-nums">{model.notCashing}</span>
            </div>
            <div className="mt-2 flex justify-between">
              <span className="text-stone-500">Their avg PMR</span>
              <span className="font-semibold tabular-nums">{model.avgPmrNotCashing}</span>
            </div>
          </section>
        </aside>
      </div>

      <Sheet open={openVip != null} onOpenChange={(o) => !o && setOpenVip(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          {openVip ? (
            <>
              <SheetHeader>
                <SheetTitle>{openVip.name}</SheetTitle>
                <SheetDescription>
                  {fmt.ordinal(openVip.rank)} · {fmt.pts(openVip.points)} pts · {fmt.signed(openVip.delta)} vs cash · {openVip.pmr} PMR
                </SheetDescription>
              </SheetHeader>
              <ul className="divide-y divide-border overflow-y-auto px-4">
                {openVip.players.map((p) => (
                  <li key={p.slot + p.name} className="flex items-center gap-3 py-3 text-sm">
                    <span className="w-10 text-[11px] font-semibold text-muted-foreground">{p.slot}</span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{p.name}</div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <PhaseDot phase={p.phase} /> {p.clock}
                        {p.stats ? ` · ${p.stats}` : ''}
                      </div>
                    </div>
                    <span className="font-semibold tabular-nums">{fmt.pts(p.points)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function LadderRow({ row, vip, vipI, onOpen }: { row: StandingRow; vip?: LiveVip; vipI: number; onOpen: (v: LiveVip) => void }) {
  const content = (
    <>
      <span className="text-stone-400 tabular-nums">{row.rank}</span>
      <span className="flex min-w-0 items-center gap-2">
        {vip ? (
          <span className={cn('grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white', vipColor(vipI))}>
            {initials(row.name)}
          </span>
        ) : null}
        <span className="truncate">{row.name}</span>
      </span>
      <span className="text-right text-stone-400 tabular-nums">{row.pmr}</span>
      <span className="text-right font-semibold tabular-nums">{fmt.pts(row.points)}</span>
    </>
  )
  const cls = 'grid w-full grid-cols-[3rem_1fr_4rem_5rem] items-center gap-2 border-b border-stone-100 px-4 py-2 text-left text-sm'
  return (
    <li id={vip ? `ladder-${row.key}` : undefined}>
      {vip ? (
        <button type="button" onClick={() => onOpen(vip)} className={cn(cls, 'bg-violet-50 font-medium hover:bg-violet-100')}>
          {content}
        </button>
      ) : (
        <div className={cls}>{content}</div>
      )}
    </li>
  )
}
