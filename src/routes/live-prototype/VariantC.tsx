// PROTOTYPE — Variant C "Command center": dark, dense split panes. The rail picks what fills
// the center — the player ownership table (default, mirrors the friends' Google Sheet), a VIP,
// or a train — and the right column compares to the field. On phones the rail becomes a
// bottom tab bar: Players · VIPs · Trains · Field.
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Radar, Star, Table2, TrainFront } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PhaseDot, initials, vipColor } from './atoms'
import { fmt, heat, type GamePhase, type LiveModel, type LivePlayer } from './liveModel'

export const name = 'Command center'

type Tab = 'players' | 'vips' | 'trains' | 'field'

const GROUPS: Array<{ phase: GamePhase; label: string }> = [
  { phase: 'live', label: 'Playing now' },
  { phase: 'pre', label: 'Yet to play' },
  { phase: 'final', label: 'Done' },
]

function overlap(a: string[], b: string[]) {
  const set = new Set(b)
  return a.filter((n) => set.has(n)).length
}

export default function VariantC({ model }: { model: LiveModel }) {
  const [tab, setTab] = useState<Tab>('players')
  const [vipI, setVipI] = useState(0)
  const [trainI, setTrainI] = useState(0)
  const vip = model.vips[vipI]
  const train = model.trains[trainI]

  // HAVE/FADE in the field panel is relative to whatever lineup is in focus.
  const focus =
    tab === 'trains' && train
      ? { label: `${train.entries}-entry train`, names: train.players }
      : { label: vip?.name ?? '', names: vip?.players.map((p) => p.name) ?? [] }

  const openVip = (i: number) => {
    setVipI(i)
    setTab('vips')
  }
  const openTrain = (i: number) => {
    setTrainI(i)
    setTab('trains')
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-36 font-sans text-zinc-100 md:pb-24">
      {/* Thin status bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-2 text-xs">
          <span className="font-mono font-bold text-lime-400">DK/LIVE</span>
          <div className="flex gap-1">
            {[...new Set([...model.sports, 'nfl', 'mlb'])].map((s) => (
              <Link
                key={s}
                to={`/live/${s}?variant=C`}
                className={cn('rounded px-2 py-0.5 font-mono uppercase', s === model.sport ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300')}
              >
                {s}
              </Link>
            ))}
          </div>
          <span className="hidden flex-1 truncate text-zinc-400 lg:block">{model.contestName}</span>
          <span className="ml-auto font-mono whitespace-nowrap text-zinc-500 lg:ml-0">
            CASH <span className="text-amber-300">{fmt.pts(model.cashPoints)}</span>
            <span className="hidden sm:inline"> · TOP {model.cashRank} · {fmt.time(model.snapshotAt)}</span>
          </span>
        </div>
      </header>

      <div className="grid md:grid-cols-[220px_1fr] xl:h-[calc(100vh-37px)] xl:grid-cols-[220px_1fr_320px]">
        {/* Left rail (tablet/desktop) */}
        <aside className="hidden flex-col gap-1 border-r border-zinc-800 p-2 md:flex xl:overflow-y-auto">
          <RailButton active={tab === 'players'} onClick={() => setTab('players')}>
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-zinc-800 text-zinc-300">
              <Table2 className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Players</span>
              <span className="block font-mono text-[11px] text-zinc-500">{model.pool.length} · ownership</span>
            </span>
          </RailButton>

          <RailHeading>VIPs</RailHeading>
          {model.vips.map((v, i) => (
            <RailButton key={v.key} active={tab === 'vips' && vipI === i} onClick={() => openVip(i)}>
              <span className={cn('grid size-7 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white', vipColor(i))}>
                {initials(v.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{v.name}</span>
                <span className="block font-mono text-[11px] text-zinc-500">
                  #{v.rank} · {v.pmr} PMR
                </span>
              </span>
              <span className={cn('font-mono text-[11px] tabular-nums', v.cashing ? 'text-lime-400' : 'text-rose-400')}>
                {fmt.pts(Math.abs(v.delta ?? 0))} {v.cashing ? 'in' : 'out'}
              </span>
            </RailButton>
          ))}

          <RailHeading>Trains</RailHeading>
          {model.trains.map((t, i) => (
            <RailButton key={t.key} active={tab === 'trains' && trainI === i} onClick={() => openTrain(i)}>
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-zinc-800 font-mono text-[11px] font-bold text-zinc-300">
                ×{t.entries}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.entries} identical</span>
                <span className="block font-mono text-[11px] text-zinc-500">
                  best #{t.bestRank} · {t.avgPmr} PMR
                </span>
              </span>
            </RailButton>
          ))}
        </aside>

        {/* Center */}
        <main className="min-w-0 p-3 md:p-6 xl:overflow-y-auto">
          {tab === 'players' ? <PlayersView model={model} onVip={openVip} /> : null}

          {tab === 'vips' && vip ? (
            <>
              <ChipRow>
                {model.vips.map((v, i) => (
                  <Chip key={v.key} active={i === vipI} onClick={() => setVipI(i)}>
                    <span className={cn('grid size-5 place-items-center rounded-full text-[9px] font-bold text-white', vipColor(i))}>
                      {initials(v.name)}
                    </span>
                    {v.name}
                    <span className={cn('font-mono', v.cashing ? 'text-lime-400' : 'text-rose-400')}>#{v.rank}</span>
                  </Chip>
                ))}
              </ChipRow>
              <VipView model={model} index={vipI} onTrain={openTrain} />
            </>
          ) : null}

          {tab === 'trains' && train ? (
            <>
              <ChipRow>
                {model.trains.map((t, i) => (
                  <Chip key={t.key} active={i === trainI} onClick={() => setTrainI(i)}>
                    <span className="pl-2 font-mono">×{t.entries}</span>
                    <span className="text-zinc-500">best #{t.bestRank}</span>
                  </Chip>
                ))}
              </ChipRow>
              <TrainView model={model} index={trainI} />
            </>
          ) : null}

          {tab === 'field' ? <FieldPanel model={model} focus={focus} /> : null}
        </main>

        {/* Right — field context (tablet: below, desktop: column) */}
        <aside className="hidden border-t border-zinc-800 p-4 md:col-span-2 md:block xl:col-span-1 xl:overflow-y-auto xl:border-t-0 xl:border-l">
          <FieldPanel model={model} focus={focus} />
        </aside>
      </div>

      {/* Phone bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {(
          [
            ['players', 'Players', Table2],
            ['vips', 'VIPs', Star],
            ['trains', 'Trains', TrainFront],
            ['field', 'Field', Radar],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px]', tab === key ? 'text-lime-400' : 'text-zinc-500')}
          >
            <Icon className="size-5" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

/* ───────────────────────── Players (the sheet, upgraded) ───────────────────────── */

type SortKey = 'own' | 'points' | 'value' | 'salary' | 'name'
type Filter = 'all' | 'left' | 'vip'

function PlayersView({ model, onVip }: { model: LiveModel; onVip: (i: number) => void }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'own', dir: -1 })
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return model.pool
      .filter((p) => (q ? p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q) : true))
      .filter((p) => (filter === 'left' ? p.phase !== 'final' : filter === 'vip' ? p.vipIdx.length > 0 : true))
      .sort((a, b) => {
        const av = a[sort.key]
        const bv = b[sort.key]
        return (typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number)) * sort.dir
      })
  }, [model.pool, sort, filter, query])

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 }))
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir < 0 ? ' ↓' : ' ↑') : '')

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-bold md:text-xl">Players</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player or team"
          className="h-8 w-full rounded-md bg-zinc-900 px-3 text-sm ring-1 ring-zinc-800 outline-none placeholder:text-zinc-600 focus:ring-zinc-600 sm:w-56"
        />
        <div className="flex rounded-md bg-zinc-900 p-0.5 text-xs ring-1 ring-zinc-800">
          {(
            [
              ['all', 'All'],
              ['left', 'Still to play'],
              ['vip', 'On a VIP'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn('rounded px-2.5 py-1', filter === key ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop/tablet table */}
      <div className="hidden overflow-x-auto rounded-lg border border-zinc-800 md:block">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-[11px] tracking-wider text-zinc-500 uppercase">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Pos</th>
              <SortTh label="Player" k="name" arrow={arrow} onSort={toggleSort} active={sort.key === 'name'} align="left" />
              <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Game</th>
              <SortTh label="Salary" k="salary" arrow={arrow} onSort={toggleSort} active={sort.key === 'salary'} className="hidden lg:table-cell" />
              <SortTh label="Own" k="own" arrow={arrow} onSort={toggleSort} active={sort.key === 'own'} />
              <SortTh label="Pts" k="points" arrow={arrow} onSort={toggleSort} active={sort.key === 'points'} />
              <SortTh label="Value" k="value" arrow={arrow} onSort={toggleSort} active={sort.key === 'value'} />
              <th className="px-3 py-2 text-left font-semibold">VIPs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.name} className="border-t border-zinc-900 hover:bg-zinc-900/60">
                <td className="px-3 py-1.5 font-mono text-[11px] text-zinc-500">{p.pos}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <TeamChip team={p.team} />
                    <span className={cn('whitespace-nowrap', p.phase === 'final' && 'text-zinc-400')}>{p.name}</span>
                    <span>{heat(p.value, p.phase)}</span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-xs whitespace-nowrap text-zinc-400" title={p.clock}>
                  <span className="flex items-center gap-1.5">
                    <PhaseDot phase={p.phase} />
                    <span className="hidden lg:inline">{p.clock}</span>
                  </span>
                </td>
                <td className="hidden px-3 py-1.5 text-right font-mono text-xs text-zinc-400 tabular-nums lg:table-cell">{fmt.money(p.salary)}</td>
                <td className="px-1 py-1">
                  <OwnCell own={p.own} />
                </td>
                <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">{fmt.pts(p.points)}</td>
                <td className="px-3 py-1.5 text-right">
                  <ValuePill value={p.value} phase={p.phase} />
                </td>
                <td className="px-3 py-1.5">
                  <VipDots idx={p.vipIdx} model={model} onVip={onVip} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone list */}
      <ul className="divide-y divide-zinc-900 overflow-hidden rounded-lg border border-zinc-800 md:hidden">
        <li className="grid grid-cols-[1fr_4rem_3.25rem_3rem] gap-2 bg-zinc-900 px-3 py-1.5 text-[10px] tracking-wider text-zinc-500 uppercase">
          <button type="button" onClick={() => toggleSort('name')} className="text-left uppercase">
            Player{arrow('name')}
          </button>
          <button type="button" onClick={() => toggleSort('own')} className="text-right uppercase">
            Own{arrow('own')}
          </button>
          <button type="button" onClick={() => toggleSort('points')} className="text-right uppercase">
            Pts{arrow('points')}
          </button>
          <button type="button" onClick={() => toggleSort('value')} className="text-right uppercase">
            Val{arrow('value')}
          </button>
        </li>
        {rows.map((p) => (
          <li key={p.name}>
            <button
              type="button"
              onClick={() => setExpanded((e) => (e === p.name ? null : p.name))}
              className="grid w-full grid-cols-[1fr_4rem_3.25rem_3rem] items-center gap-2 px-3 py-2 text-left"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className={cn('truncate text-sm', p.phase === 'final' && 'text-zinc-400')}>{p.name}</span>
                  <span className="text-xs">{heat(p.value, p.phase)}</span>
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <PhaseDot phase={p.phase} />
                  {p.pos} · {p.team}
                  {p.vipIdx.length ? <VipDots idx={p.vipIdx} model={model} small /> : null}
                </span>
              </span>
              <OwnCell own={p.own} />
              <span className="text-right font-mono text-sm font-semibold tabular-nums">{fmt.pts(p.points)}</span>
              <span className="text-right">
                <ValuePill value={p.value} phase={p.phase} />
              </span>
            </button>
            {expanded === p.name ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
                <span>{fmt.money(p.salary)}</span>
                <span>{p.matchup}</span>
                <span>{p.clock}</span>
                {p.vipIdx.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    On:
                    {p.vipIdx.map((i) => (
                      <button key={i} type="button" onClick={() => onVip(i)} className="text-zinc-200 underline underline-offset-2">
                        {model.vips[i].name}
                      </button>
                    ))}
                  </span>
                ) : (
                  <span className="text-zinc-600">No VIPs</span>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SortTh({
  label,
  k,
  arrow,
  onSort,
  active,
  align = 'right',
  className,
}: {
  label: string
  k: SortKey
  arrow: (k: SortKey) => string
  onSort: (k: SortKey) => void
  active: boolean
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <th className={cn('px-3 py-2 font-semibold whitespace-nowrap', align === 'right' ? 'text-right' : 'text-left', className)}>
      <button type="button" onClick={() => onSort(k)} className={cn('uppercase', active && 'text-zinc-200')}>
        {label}
        {arrow(k)}
      </button>
    </th>
  )
}

function OwnCell({ own }: { own: number }) {
  return (
    <span
      className="block rounded px-2 py-1 text-right font-mono text-xs tabular-nums"
      style={{ backgroundColor: `rgba(251, 191, 36, ${Math.min(0.6, (own / 100) * 0.6)})` }}
    >
      {fmt.pct(own)}
    </span>
  )
}

function ValuePill({ value, phase }: { value: number | null; phase: GamePhase }) {
  if (value == null || phase === 'pre') return <span className="font-mono text-xs text-zinc-600">—</span>
  const tone =
    value >= 6
      ? 'bg-sky-500/25 text-sky-200'
      : value >= 4
        ? 'bg-emerald-500/20 text-emerald-200'
        : value >= 2.5
          ? 'bg-zinc-700/60 text-zinc-300'
          : 'bg-rose-500/20 text-rose-200'
  return <span className={cn('inline-block min-w-10 rounded px-1.5 py-0.5 text-center font-mono text-xs tabular-nums', tone)}>{value.toFixed(1)}</span>
}

function TeamChip({ team }: { team: string }) {
  let h = 0
  for (const c of team) h = (h * 31 + c.charCodeAt(0)) % 360
  return (
    <span className="w-9 shrink-0 rounded-sm px-1 text-center font-mono text-[10px] font-bold text-white" style={{ backgroundColor: `hsl(${h} 55% 35%)` }}>
      {team}
    </span>
  )
}

function VipDots({ idx, model, onVip, small }: { idx: number[]; model: LiveModel; onVip?: (i: number) => void; small?: boolean }) {
  return (
    <span className="flex -space-x-1">
      {idx.map((i) => {
        const cls = cn(
          'grid place-items-center rounded-full font-bold text-white ring-2 ring-zinc-950',
          small ? 'size-3.5 text-[6px]' : 'size-5 text-[8px]',
          vipColor(i),
        )
        return onVip ? (
          <button key={i} type="button" title={model.vips[i].name} onClick={() => onVip(i)} className={cls}>
            {initials(model.vips[i].name)}
          </button>
        ) : (
          <span key={i} title={model.vips[i].name} className={cls}>
            {small ? '' : initials(model.vips[i].name)}
          </span>
        )
      })}
    </span>
  )
}

/* ───────────────────────── VIP + Train ───────────────────────── */

function VipView({ model, index, onTrain }: { model: LiveModel; index: number; onTrain: (i: number) => void }) {
  const vip = model.vips[index]
  const closest = model.trains
    .map((t, i) => ({ t, i, shared: overlap(vip.players.map((p) => p.name), t.players) }))
    .sort((a, b) => b.shared - a.shared || b.t.entries - a.t.entries)[0]

  return (
    <>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="w-full sm:w-auto">
          <div className="text-xs text-zinc-500">Following</div>
          <h1 className="text-2xl font-bold">{vip.name}</h1>
        </div>
        <Big label="Rank" value={`#${vip.rank}`} sub={`of ${model.fieldSize}`} />
        <Big label="Points" value={fmt.pts(vip.points)} sub={`proj ${fmt.pts(vip.projected)}`} />
        <Big
          label="Cash line"
          value={fmt.pts(Math.abs(vip.delta ?? 0))}
          tone={vip.cashing ? 'text-lime-400' : 'text-rose-400'}
          sub={vip.cashing ? 'pts in' : 'pts out'}
        />
        <Big label="PMR" value={String(vip.pmr ?? '—')} sub={`${fmt.pct(vip.ownLeft)} own left`} />
      </div>

      <CashMeter model={model} rank={vip.rank} />

      {closest && closest.shared >= 4 ? (
        <button
          type="button"
          onClick={() => onTrain(closest.i)}
          className="mt-4 flex w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left text-xs text-zinc-400 hover:border-zinc-700"
        >
          <span className="font-mono text-zinc-200">
            {closest.shared}/{vip.players.length}
          </span>
          shared with a {closest.t.entries}-entry train (best #{closest.t.bestRank})
          <span className="ml-auto text-zinc-500">view →</span>
        </button>
      ) : null}

      <LineupGroups players={vip.players} />

      {/* Sheet-style footer row */}
      <div className="mt-4 flex justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 font-mono text-xs">
        <span>
          <span className="text-zinc-500">rank</span> {vip.rank}
        </span>
        <span>
          <span className="text-zinc-500">salary</span> {fmt.money(vip.totalSalary)}
        </span>
        <span>
          <span className="text-zinc-500">pts</span> {fmt.pts(vip.points)}
        </span>
      </div>
    </>
  )
}

function TrainView({ model, index }: { model: LiveModel; index: number }) {
  const train = model.trains[index]
  return (
    <>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div className="w-full sm:w-auto">
          <div className="text-xs text-zinc-500">Train</div>
          <h1 className="text-2xl font-bold">{train.entries} identical lineups</h1>
        </div>
        <Big label="Best rank" value={`#${train.bestRank}`} sub={`of ${model.fieldSize}`} />
        <Big label="Best pts" value={fmt.pts(train.bestPoints)} />
        <Big label="Avg PMR" value={String(train.avgPmr ?? '—')} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {model.vips.map((v, i) => (
          <span key={v.key} className="flex items-center gap-1.5 rounded-full border border-zinc-800 py-0.5 pr-2.5 pl-0.5 text-xs text-zinc-400">
            <span className={cn('grid size-5 place-items-center rounded-full text-[9px] font-bold text-white', vipColor(i))}>{initials(v.name)}</span>
            shares{' '}
            <span className="font-mono text-zinc-200">
              {overlap(v.players.map((p) => p.name), train.players)}/{train.players.length}
            </span>
          </span>
        ))}
      </div>

      <LineupGroups players={train.lineup} />

      {train.samples.length ? (
        <p className="mt-6 text-xs text-zinc-500">
          Riding it: {train.samples.slice(0, 8).join(', ')}
          {train.samples.length > 8 ? ` +${train.samples.length - 8} more` : ''}
        </p>
      ) : null}
    </>
  )
}

function LineupGroups({ players: all }: { players: LivePlayer[] }) {
  return (
    <div className="mt-6 space-y-6">
      {GROUPS.map((g) => {
        const players = all.filter((p) => p.phase === g.phase)
        if (!players.length) return null
        return (
          <section key={g.phase}>
            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-widest text-zinc-500 uppercase">
              <PhaseDot phase={g.phase} /> {g.label} · {players.length}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {players.map((p) => (
                <div key={p.slot + p.name} className={cn('rounded-lg border border-zinc-800 bg-zinc-900 p-3', g.phase === 'final' && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] text-zinc-500">{p.slot}</div>
                      <div className="truncate font-medium">
                        {p.name} <span className="text-sm">{heat(p.value, p.phase)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-lg font-semibold tabular-nums">{fmt.pts(p.points)}</div>
                      {p.proj != null && g.phase !== 'final' ? <div className="font-mono text-[10px] text-zinc-500">→ {fmt.pts(p.proj)}</div> : null}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[11px] text-zinc-500">
                    <span>{p.clock}</span>
                    <span className="flex items-center gap-2">
                      {fmt.pct(p.own)} own
                      <ValuePill value={p.value} phase={p.phase} />
                    </span>
                  </div>
                  {p.stats ? <div className="mt-1 truncate text-[11px] text-zinc-400">{p.stats}</div> : null}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/* ───────────────────────── Field panel ───────────────────────── */

function FieldPanel({ model, focus }: { model: LiveModel; focus: { label: string; names: string[] } }) {
  const owned = new Set(focus.names)
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">Swing players</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Unfinished, most owned — vs <span className="text-zinc-300">{focus.label}</span>
        </p>
        <ul className="mt-3 space-y-1">
          {model.swing.map((p) => {
            const has = owned.has(p.name)
            return (
              <li key={p.name} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-zinc-900">
                <span
                  className={cn(
                    'w-12 rounded px-1 text-center font-mono text-[10px] font-bold',
                    has ? 'bg-lime-400/15 text-lime-300' : 'bg-rose-400/15 text-rose-300',
                  )}
                >
                  {has ? 'HAVE' : 'FADE'}
                </span>
                <span className="flex-1 truncate">{p.name}</span>
                <span className="font-mono text-xs text-zinc-400 tabular-nums">{fmt.pct(p.ownLeft)}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">Leverage vs field</h2>
        <div className="mt-3 space-y-3">
          {model.vips.map((v, i) => {
            const fieldLeft = model.fieldOwnLeft ?? 0
            const max = Math.max(fieldLeft, ...model.vips.map((x) => x.ownLeft ?? 0), 1)
            return (
              <div key={v.key} className={cn('text-xs', v.name === focus.label ? 'text-zinc-100' : 'text-zinc-500')}>
                <div className="mb-1 flex justify-between">
                  <span>{v.name}</span>
                  <span className="font-mono">{fmt.pct(v.ownLeft)}</span>
                </div>
                <div className="relative h-2 rounded-full bg-zinc-800">
                  <div className={cn('h-full rounded-full', vipColor(i))} style={{ width: `${((v.ownLeft ?? 0) / max) * 100}%` }} />
                  <div className="absolute top-[-3px] h-[14px] w-0.5 bg-amber-300" style={{ left: `${(fieldLeft / max) * 100}%` }} />
                </div>
              </div>
            )
          })}
          <p className="text-[11px] text-zinc-500">
            <span className="mr-1 inline-block h-2 w-0.5 bg-amber-300" />
            Field avg remaining {fmt.pct(model.fieldOwnLeft)}
          </p>
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">Ownership leaders</h2>
        <table className="mt-2 w-full font-mono text-xs">
          <tbody>
            {model.leaders.slice(0, 8).map((l) => (
              <tr key={l.name} className="border-b border-zinc-900">
                <td className="py-1 text-zinc-500">#{l.rank}</td>
                <td className="max-w-28 truncate py-1">{l.name}</td>
                <td className="py-1 text-right text-zinc-400">{l.pmr}</td>
                <td className="py-1 text-right">{fmt.pts(l.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

/* ───────────────────────── bits ───────────────────────── */

function RailHeading({ children }: { children: ReactNode }) {
  return <div className="px-2 pt-3 pb-1 text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">{children}</div>
}

function RailButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex items-center gap-2 rounded-lg px-2 py-2 text-left', active ? 'bg-zinc-800 ring-1 ring-zinc-700' : 'hover:bg-zinc-900')}
    >
      {children}
    </button>
  )
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1 md:hidden">{children}</div>
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-xs',
        active ? 'border-zinc-600 bg-zinc-800 text-white' : 'border-zinc-800 text-zinc-400',
      )}
    >
      {children}
    </button>
  )
}

function Big({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">{label}</div>
      <div className={cn('font-mono text-2xl font-semibold tabular-nums', tone)}>{value}</div>
      {sub ? <div className="text-[11px] text-zinc-500">{sub}</div> : null}
    </div>
  )
}

function CashMeter({ model, rank }: { model: LiveModel; rank: number | null }) {
  if (!rank || !model.cashRank) return null
  const pos = (r: number) => `${((r - 1) / Math.max(1, model.fieldSize - 1)) * 100}%`
  return (
    <div className="mt-6">
      <div className="relative h-3 overflow-hidden rounded-full bg-zinc-800">
        <div className="absolute inset-y-0 left-0 bg-lime-500/25" style={{ width: pos(model.cashRank) }} />
        {model.vips.map((v, i) =>
          v.rank ? (
            <div
              key={v.key}
              className={cn('absolute top-0 h-full w-1.5 -translate-x-1/2 rounded-full', vipColor(i), v.rank !== rank && 'opacity-40')}
              style={{ left: pos(v.rank) }}
            />
          ) : null,
        )}
      </div>
      <div className="relative mt-1 flex justify-between font-mono text-[10px] text-zinc-500">
        <span>1st</span>
        <span style={{ left: pos(model.cashRank) }} className="absolute -translate-x-1/2 text-amber-300">
          cash {model.cashRank}
        </span>
        <span>{model.fieldSize}th</span>
      </div>
    </div>
  )
}
