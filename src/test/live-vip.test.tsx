import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { contestOf, load, location, rail, renderLive, setVips, stubPhone, vipOf } from './liveHarness'
import { EMPIRE, FEED_ORDER, VIPS, chips, ownershipRow, stat, vipView } from './liveVipTestKit'

describe('rail', () => {
  it('lists each VIP with rank, PMR and signed distance to cash', async () => {
    await renderLive(load(), '/live/nfl')

    const empire = within(rail()).getByRole('link', { name: /EmpireMaker2/ })
    expect(empire).toHaveTextContent('#511')
    expect(empire).toHaveTextContent('360.0 PMR')
    expect(empire).toHaveTextContent('−0.3')

    const cubbies = within(rail()).getByRole('link', { name: /Cubbiesftw23/ })
    expect(cubbies).toHaveTextContent('#1014')
    expect(cubbies).toHaveTextContent('390.0 PMR')
    expect(cubbies).toHaveTextContent('−9.9')
  })

  it('lists every VIP in the feed, including the ones below the standings cut', async () => {
    await renderLive(load(), '/live/nfl')

    const names = within(rail())
      .getAllByRole('link')
      .map((link) => link.textContent ?? '')
      .filter((text) => FEED_ORDER.some((name) => text.includes(name)))
    expect(names).toHaveLength(FEED_ORDER.length)
    for (const name of FEED_ORDER)
      expect(within(rail()).getByRole('link', { name: new RegExp(name) })).toHaveTextContent(/#\d+/)
  })

  it('opens a VIP from its rail row and keeps them in the URL', async () => {
    const snapshot = load()
    await renderLive(snapshot, '/live/nfl')

    fireEvent.click(within(rail()).getByRole('link', { name: /Cubbiesftw23/ }))

    expect(location()).toBe(`${VIPS}&vip=${String(vipOf(snapshot, 'Cubbiesftw23').entry_key)}`)
    expect(screen.getByRole('heading', { name: 'Cubbiesftw23' })).toBeInTheDocument()
    expect(within(rail()).getByRole('link', { name: /Cubbiesftw23/ })).toHaveAttribute('aria-current', 'page')
    expect(within(rail()).getByRole('link', { name: /EmpireMaker2/ })).not.toHaveAttribute('aria-current')
  })

  it('still offers the VIPs view when the contest has no VIPs', async () => {
    // Every captured contest tracks VIPs, so this empties one.
    const snapshot = load()
    contestOf(snapshot).vip_lineups = []
    await renderLive(snapshot, '/live/nfl')

    fireEvent.click(within(rail()).getByRole('link', { name: /^vips/i }))

    expect(location()).toBe(VIPS)
    expect(screen.getByText(/no vips are tracked in this contest/i)).toBeInTheDocument()
  })
})

describe('VIP view focus', () => {
  it('focuses the first VIP when the URL names none', async () => {
    await renderLive(load(), VIPS)

    expect(screen.getByRole('heading', { name: FEED_ORDER[0] })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: EMPIRE })).not.toBeInTheDocument()
  })

  it('focuses the VIP named in the URL, as for a shared link or a reload', async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(screen.getByRole('heading', { name: EMPIRE })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: FEED_ORDER[0] })).not.toBeInTheDocument()
  })

  it('falls back to the first VIP for an unknown key', async () => {
    await renderLive(load(), `${VIPS}&vip=nobody`)

    expect(screen.getByRole('heading', { name: FEED_ORDER[0] })).toBeInTheDocument()
  })

  it('says so when the contest has no VIPs', async () => {
    const snapshot = load()
    contestOf(snapshot).vip_lineups = []
    await renderLive(snapshot, VIPS)

    expect(screen.getByText(/no vips are tracked in this contest/i)).toBeInTheDocument()
  })
})

describe('VIP stats', () => {
  it('shows rank out of the field size, for a VIP below the standings cut', async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('Rank').getByText('#511')).toBeInTheDocument()
    expect(stat('Rank').getByText('of 1136')).toBeInTheDocument()
  })

  it('shows points, with no projection when the feed has none', async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('Points').getByText('30.94')).toBeInTheDocument()
    expect(stat('Points').queryByText(/^proj/)).not.toBeInTheDocument()
  })

  it('shows a VIP below the line as a signed distance labelled "not cashing"', async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('vs cash').getByText('−0.3')).toBeInTheDocument()
    expect(stat('vs cash').getByText('not cashing')).toBeInTheDocument()
  })

  it('shows a cashing VIP as a green signed distance labelled "cashing"', async () => {
    // No captured VIP is cashing, so one is given a distance above the line.
    const snapshot = load()
    setVips(snapshot, [{ key: 'vip-a', name: 'First VIP', rank: 12, points: 140.5, pmr: 88.5, delta: 50.25 }])
    await renderLive(snapshot, VIPS)

    expect(stat('vs cash').getByText('+50.25')).toBeInTheDocument()
    expect(stat('vs cash').getByText('cashing')).toBeInTheDocument()
  })

  it('shows a dash for distance when the feed has none, and still says whether they are cashing', async () => {
    const snapshot = load()
    delete contestOf(snapshot).metrics.distance_to_cash
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('vs cash').getByText('—')).toBeInTheDocument()
    expect(stat('vs cash').getByText('not cashing')).toBeInTheDocument()
  })

  it('uses the matched standings cashing flag when the feed has no distance to cash', async () => {
    const snapshot = load()
    delete contestOf(snapshot).metrics.distance_to_cash
    contestOf(snapshot).standings.push({ entry_key: vipOf(snapshot, EMPIRE).entry_key, is_cashing: true })
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('vs cash').getByText('cashing')).toBeInTheDocument()
  })

  it('never says "in the money" or "pts in/out"', async () => {
    await renderLive(load(), VIPS)

    expect(screen.queryByText(/in the money/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/pts? in\b|pts? out\b/i)).not.toBeInTheDocument()
  })

  it('shows PMR and ownership remaining', async () => {
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('PMR').getByText('360.0')).toBeInTheDocument()
    expect(stat('PMR').getByText('373.51% own remaining')).toBeInTheDocument()
  })

  it('says ownership remaining and PMR are unavailable when the feed omits them', async () => {
    const snapshot = load()
    delete contestOf(snapshot).metrics.threat.vip_vs_field_leverage
    delete vipOf(snapshot, EMPIRE).pmr
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('PMR').getByText('—')).toBeInTheDocument()
    expect(stat('PMR').getByText(/own remaining unavailable/i)).toBeInTheDocument()
  })

  it('shows lineup ownership with its hint', async () => {
    // 373.51% over nine slots averages 41% a slot.
    const snapshot = load()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('Lineup own').getByText('373.51%')).toBeInTheDocument()
    expect(stat('Lineup own').getByText('balanced')).toBeInTheDocument()
  })

  it('hints chalky and contrarian from the average ownership per slot', async () => {
    // The captured lineups all average 29-42% a slot, so two of them are given heavier and lighter ownership.
    const snapshot = load()
    ownershipRow(snapshot, 'cglenn91').total_ownership_pct = 500
    ownershipRow(snapshot, EMPIRE).total_ownership_pct = 100
    await renderLive(snapshot, VIPS)
    expect(stat('Lineup own').getByText('chalky')).toBeInTheDocument()

    cleanup()
    await renderLive(snapshot, vipView(snapshot, EMPIRE))
    expect(stat('Lineup own').getByText('contrarian')).toBeInTheDocument()
  })

  it('reads lineup ownership from the producer summary', async () => {
    const snapshot = load()
    const row = ownershipRow(snapshot, EMPIRE)
    row.total_ownership_pct = 301.5
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('Lineup own').getByText('301.5%')).toBeInTheDocument()
  })

  it('says lineup ownership is unavailable when the feed omits it', async () => {
    const snapshot = load()
    delete ownershipRow(snapshot, EMPIRE).total_ownership_pct
    await renderLive(snapshot, vipView(snapshot, EMPIRE))

    expect(stat('Lineup own').getByText('—')).toBeInTheDocument()
    expect(stat('Lineup own').getByText('unavailable')).toBeInTheDocument()
  })
})

describe('cash-line meter', () => {
  it('marks the cash line and places every VIP on the field', async () => {
    await renderLive(load(), VIPS)

    const meter = screen.getByRole('img', { name: /cash line/i })
    expect(meter).toHaveAccessibleName(/cash line at rank 500 of 1136/i)
    expect(meter).toHaveAccessibleName(/EmpireMaker2 #511/)
    expect(meter).toHaveAccessibleName(/Cubbiesftw23 #1014/)
    for (const name of FEED_ORDER) expect(meter).toHaveAccessibleName(new RegExp(`${name} #\\d+`))
    expect(screen.getByText('cash 500')).toBeInTheDocument()
  })

  it('says the meter is unavailable when the feed has no cash line rank', async () => {
    const snapshot = load()
    delete contestOf(snapshot).live_metrics.cash_line.rank_cutoff
    await renderLive(snapshot, VIPS)

    expect(screen.queryByRole('img', { name: /cash line/i })).not.toBeInTheDocument()
    expect(screen.getByText(/cash-line meter unavailable/i)).toBeInTheDocument()
  })
})

describe('on a phone', () => {
  it('replaces the rail with a chip row that switches VIPs', async () => {
    stubPhone()
    const snapshot = load()
    await renderLive(snapshot, VIPS)

    expect(screen.queryByRole('navigation', { name: /live views/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: FEED_ORDER[0] })).toBeInTheDocument()
    expect(within(chips()).getByRole('link', { name: new RegExp(FEED_ORDER[0]) })).toHaveAttribute(
      'aria-current',
      'page',
    )

    fireEvent.click(within(chips()).getByRole('link', { name: /EmpireMaker2/ }))

    expect(location()).toBe(vipView(snapshot, EMPIRE))
    expect(screen.getByRole('heading', { name: EMPIRE })).toBeInTheDocument()
    expect(within(chips()).getByRole('link', { name: /EmpireMaker2/ })).toHaveAttribute('aria-current', 'page')
  })

  it('shows each chip with the VIP rank', async () => {
    stubPhone()
    await renderLive(load(), VIPS)

    expect(within(chips()).getByRole('link', { name: /EmpireMaker2/ })).toHaveTextContent('#511')
    expect(within(chips()).getByRole('link', { name: /Cubbiesftw23/ })).toHaveTextContent('#1014')
  })
})
