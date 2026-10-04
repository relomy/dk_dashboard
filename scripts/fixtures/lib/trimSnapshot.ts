// Trims a producer snapshot into a committed fixture by dropping array elements only.
// Kept elements are copied byte for byte from the producer's text, so no field is
// renamed, reshaped or reformatted (the producer writes floats such as `94.0`, which a
// JSON.parse/JSON.stringify round trip would rewrite).

export interface TrimOptions {
  /** Leading standings rows kept per contest. */
  standingsHead: number
  /** Most-owned players kept per sport, on top of the players the contest references. */
  mostOwned: number
}

export interface TrimCount {
  path: string
  before: number
  after: number
}

export interface TrimResult {
  text: string
  counts: TrimCount[]
}

export const DEFAULT_TRIM_OPTIONS: TrimOptions = { standingsHead: 25, mostOwned: 25 }

interface Span {
  start: number
  end: number
}

interface ArrayNode extends Span {
  kind: 'array'
  items: Node[]
}

interface ObjectNode extends Span {
  kind: 'object'
  fields: Map<string, Node>
}

interface LeafNode extends Span {
  kind: 'leaf'
}

type Node = ArrayNode | ObjectNode | LeafNode

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type JsonObject = { [key: string]: Json }

function scan(text: string): Node {
  let pos = 0

  const skipWhitespace = () => {
    while (pos < text.length && /\s/.test(text[pos])) pos += 1
  }

  const expect = (char: string) => {
    if (text[pos] !== char) throw new Error(`Expected "${char}" at offset ${pos}`)
    pos += 1
  }

  const scanString = (): string => {
    const start = pos
    expect('"')
    while (text[pos] !== '"') {
      if (pos >= text.length) throw new Error(`Unterminated string at offset ${start}`)
      pos += text[pos] === '\\' ? 2 : 1
    }
    pos += 1
    return JSON.parse(text.slice(start, pos)) as string
  }

  const scanValue = (): Node => {
    skipWhitespace()
    const start = pos
    const char = text[pos]
    if (char === '[') {
      pos += 1
      const items: Node[] = []
      skipWhitespace()
      if (text[pos] === ']') {
        pos += 1
        return { kind: 'array', start, end: pos, items }
      }
      for (;;) {
        items.push(scanValue())
        skipWhitespace()
        if (text[pos] === ',') {
          pos += 1
          continue
        }
        expect(']')
        return { kind: 'array', start, end: pos, items }
      }
    }
    if (char === '{') {
      pos += 1
      const fields = new Map<string, Node>()
      skipWhitespace()
      if (text[pos] === '}') {
        pos += 1
        return { kind: 'object', start, end: pos, fields }
      }
      for (;;) {
        skipWhitespace()
        const key = scanString()
        skipWhitespace()
        expect(':')
        fields.set(key, scanValue())
        skipWhitespace()
        if (text[pos] === ',') {
          pos += 1
          continue
        }
        expect('}')
        return { kind: 'object', start, end: pos, fields }
      }
    }
    if (char === '"') {
      scanString()
      return { kind: 'leaf', start, end: pos }
    }
    while (pos < text.length && !/[\s,\]}]/.test(text[pos])) pos += 1
    if (pos === start) throw new Error(`Unexpected character at offset ${start}`)
    return { kind: 'leaf', start, end: pos }
  }

  const root = scanValue()
  skipWhitespace()
  if (pos !== text.length) throw new Error(`Unexpected trailing content at offset ${pos}`)
  return root
}

function asObject(value: Json | undefined): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function asArray(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : []
}

function child(node: Node | undefined, key: string): Node | undefined {
  return node?.kind === 'object' ? node.fields.get(key) : undefined
}

function keepStandings(contest: JsonObject, options: TrimOptions): Set<number> {
  const rows = asArray(contest.standings).map((row) => asObject(row) ?? {})
  const keep = new Set<number>()
  rows.forEach((_, index) => {
    if (index < options.standingsHead) keep.add(index)
  })

  // The cash line: the last cashing row and the first row below it.
  const lastCashing = rows.map((row) => row.is_cashing === true).lastIndexOf(true)
  if (lastCashing >= 0) keep.add(lastCashing)
  const firstOut = rows.findIndex((row, index) => index > lastCashing && row.is_cashing === false)
  if (firstOut >= 0) keep.add(firstOut)

  // Every tracked VIP's row and every row the ownership watchlist references.
  const referenced = new Set<Json>()
  for (const lineup of asArray(contest.vip_lineups)) {
    referenced.add(asObject(lineup)?.entry_key ?? null)
    referenced.add(asObject(lineup)?.vip_entry_key ?? null)
  }
  for (const entry of asArray(asObject(contest.ownership_watchlist)?.entries)) {
    referenced.add(asObject(entry)?.entry_key ?? null)
  }
  referenced.delete(null)
  rows.forEach((row, index) => {
    if (row.is_vip === true || referenced.has(row.entry_key ?? null)) keep.add(index)
  })

  // Whole tie groups: a kept rank keeps every row sharing it.
  const keptRanks = new Set([...keep].map((index) => rows[index].rank))
  rows.forEach((row, index) => {
    if (row.rank !== undefined && keptRanks.has(row.rank)) keep.add(index)
  })

  return keep
}

// Collects every player the sport's contests reference: `player_key` and `player_name`
// values anywhere in a contest (VIP lineups, metrics) and the names in train signatures.
function referencedPlayers(contests: Json[]): { keys: Set<string>; names: Set<string> } {
  const keys = new Set<string>()
  const names = new Set<string>()
  const visit = (value: Json) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const record = asObject(value)
    if (!record) return
    for (const [field, fieldValue] of Object.entries(record)) {
      if (typeof fieldValue === 'string') {
        if (field === 'player_key') keys.add(fieldValue)
        if (field === 'player_name') names.add(fieldValue.trim())
        if (field === 'lineup_signature') fieldValue.split('|').forEach((name) => names.add(name.trim()))
      } else {
        visit(fieldValue)
      }
    }
  }
  contests.forEach(visit)
  return { keys, names }
}

function keepPlayers(sport: JsonObject, options: TrimOptions): Set<number> {
  const players = asArray(sport.players).map((player) => asObject(player) ?? {})
  const { keys, names } = referencedPlayers(asArray(sport.contests))
  const keep = new Set<number>()
  players.forEach((player, index) => {
    const name = typeof player.name === 'string' ? player.name.trim() : undefined
    if (keys.has(String(player.player_key)) || (name !== undefined && names.has(name))) keep.add(index)
  })

  const ownership = (index: number) => {
    const value = players[index].ownership_pct
    return typeof value === 'number' ? value : -Infinity
  }
  players
    .map((_, index) => index)
    .sort((a, b) => ownership(b) - ownership(a) || a - b)
    .slice(0, options.mostOwned)
    .forEach((index) => keep.add(index))

  return keep
}

interface Replacement extends Span {
  text: string
}

function rebuildArray(text: string, node: ArrayNode, keep: Set<number>): string {
  const kept = node.items.filter((_, index) => keep.has(index))
  if (kept.length === node.items.length) return text.slice(node.start, node.end)
  if (kept.length === 0) return '[]'
  const first = node.items[0]
  const last = node.items[node.items.length - 1]
  const separator = node.items.length > 1 ? text.slice(node.items[0].end, node.items[1].start) : ''
  return (
    text.slice(node.start, first.start) +
    kept.map((item) => text.slice(item.start, item.end)).join(separator) +
    text.slice(last.end, node.end)
  )
}

export function trimSnapshot(text: string, options: TrimOptions = DEFAULT_TRIM_OPTIONS): TrimResult {
  const root = scan(text)
  const snapshot = asObject(JSON.parse(text) as Json) ?? {}
  const replacements: Replacement[] = []
  const counts: TrimCount[] = []

  const trimArray = (path: string, node: Node | undefined, keep: Set<number>) => {
    if (node?.kind !== 'array') return
    counts.push({ path, before: node.items.length, after: keep.size })
    replacements.push({ start: node.start, end: node.end, text: rebuildArray(text, node, keep) })
  }

  const sports = asObject(snapshot.sports) ?? {}
  for (const [sport, sportValue] of Object.entries(sports)) {
    const sportNode = child(child(root, 'sports'), sport)
    const contests = asArray(asObject(sportValue)?.contests)
    contests.forEach((contestValue, contestIndex) => {
      const contest = asObject(contestValue) ?? {}
      const contestNode = child(sportNode, 'contests')
      const contestItem = contestNode?.kind === 'array' ? contestNode.items[contestIndex] : undefined
      trimArray(
        `sports.${sport}.contests[${contestIndex}].standings`,
        child(contestItem, 'standings'),
        keepStandings(contest, options),
      )
    })
    trimArray(`sports.${sport}.players`, child(sportNode, 'players'), keepPlayers(asObject(sportValue) ?? {}, options))
  }

  replacements.sort((a, b) => b.start - a.start)
  let trimmed = text
  for (const replacement of replacements) {
    trimmed = trimmed.slice(0, replacement.start) + replacement.text + trimmed.slice(replacement.end)
  }
  return { text: trimmed, counts }
}
