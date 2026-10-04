/**
 * The unread-field detector (#37, #42): which of a JSON feed's leaf paths a reader never reads.
 *
 * A path names a field by its keys, joined with dots, with every array index collapsed to `[]`
 * (`sports.nfl.contests[].vip_lineups[].pts`), so a per-row field is one path. A leaf is a
 * primitive, null, or an empty array or object.
 */

function join(path: string, key: string): string {
  return path ? `${path}.${key}` : key
}

function isContainer(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function addLeafPaths(value: unknown, path: string, paths: Set<string>): void {
  if (Array.isArray(value)) {
    if (value.length === 0) paths.add(path)
    for (const item of value) addLeafPaths(item, `${path}[]`, paths)
    return
  }
  if (isContainer(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0) paths.add(path)
    for (const [key, item] of entries) addLeafPaths(item, join(path, key), paths)
    return
  }
  paths.add(path)
}

/** Every leaf path in `value`, indices collapsed. */
export function leafPaths(value: unknown): Set<string> {
  const paths = new Set<string>()
  addLeafPaths(value, '', paths)
  return paths
}

/** The path of the first recording proxy inside `value`, if any. */
function findProxy(value: unknown, proxyPaths: WeakMap<object, string>, seen = new Set<object>()): string | undefined {
  if (!isContainer(value) || seen.has(value)) return undefined
  seen.add(value)
  const path = proxyPaths.get(value)
  if (path !== undefined) return path
  for (const item of Object.values(value)) {
    const found = findProxy(item, proxyPaths, seen)
    if (found !== undefined) return found
  }
  return undefined
}

/**
 * Runs `read` on a recording copy of `value` and returns every path it read. A read is a property
 * get of a field the value has: array indices count (collapsed to `[]`), `length`, prototype members
 * (`map`, `constructor`) and absent fields do not. Listing keys (`Object.keys`, `in`) is not a read;
 * anything that gets the values (`Object.entries`, a spread, `JSON.stringify`) reads them all.
 *
 * Only reads made while `read` runs count. So that none happen later, `read` must not return any
 * part of the value (an object or array from it); it throws, naming the path, if it does.
 */
export function readPaths<T>(value: T, read: (value: T) => unknown): Set<string> {
  const paths = new Set<string>()
  const proxies = new WeakMap<object, object>()
  const proxyPaths = new WeakMap<object, string>()
  let recording = true

  function wrap<V>(target: V, path: string): V {
    if (!isContainer(target)) return target
    const cached = proxies.get(target)
    if (cached) return cached as V
    const proxy = new Proxy(target, {
      get(object, key, receiver) {
        const item: unknown = Reflect.get(object, key, receiver)
        if (!recording || typeof key !== 'string' || !Object.hasOwn(object, key)) return item
        if (Array.isArray(object)) {
          if (!/^\d+$/.test(key)) return item
          paths.add(`${path}[]`)
          return wrap(item, `${path}[]`)
        }
        const itemPath = join(path, key)
        paths.add(itemPath)
        return wrap(item, itemPath)
      },
    })
    proxies.set(target, proxy)
    proxyPaths.set(proxy, path)
    return proxy
  }

  const result = read(wrap(structuredClone(value), ''))
  recording = false
  const leaked = findProxy(result, proxyPaths)
  if (leaked !== undefined) {
    throw new Error(`The reader returned the feed's own ${leaked || 'root'}; reads of it after the reader returns go unrecorded`)
  }
  return paths
}

/** The leaf paths of `value` that `read` never reads, sorted. */
export function unreadPaths<T>(value: T, read: (value: T) => unknown): string[] {
  const readSet = readPaths(value, read)
  return [...leafPaths(value)].filter((path) => !readSet.has(path)).sort()
}

/** Unread paths a consumer deliberately ignores, each with a one-line reason. */
export type UnreadAllowlist = Readonly<Record<string, string>>

/** The unread paths the allowlist lacks: each one is a field nothing reads and nobody decided to ignore. */
export function unallowlistedPaths(unread: readonly string[], allowlist: UnreadAllowlist): string[] {
  return unread.filter((path) => !Object.hasOwn(allowlist, path))
}

/**
 * Allowlist entries that no input leaves unread (no input emits the path any more, or the consumer
 * reads it now), sorted. Judge staleness over every input together: a path one input lacks may be
 * another's.
 */
export function staleAllowlistEntries(unreadPerInput: Iterable<readonly string[]>, allowlist: UnreadAllowlist): string[] {
  const unread = new Set<string>()
  for (const paths of unreadPerInput) for (const path of paths) unread.add(path)
  return Object.keys(allowlist)
    .filter((path) => !unread.has(path))
    .sort()
}
