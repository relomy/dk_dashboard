// Pure-move check for a token-budget split (docs/WORKFLOW.md#token-budget): the head must hold the same tests and the
// same code lines as the merge base of BASE and head. Exit 0 for a pure move, 1 otherwise.
// Usage: npm run check:pure-move [-- <base> [<head>]]   (defaults: origin/main and HEAD; run from the repo root)
//   1. Test identity: `vitest list` on the test files the diff touches, at the merge base and at the head; the
//      multisets of `project|describe > it` names must be equal.
//   2. Code identity: each touched .ts/.tsx file is Prettier-formatted on both sides at an unbounded width (so a
//      reflow collapses), then the trimmed-line multisets must be equal, apart from glue: imports, re-exports,
//      `export` on a moved declaration, eslint-disable headers, closing brackets and `describe(` wrappers.
//      Unmatched comments are listed but don't fail.
//   3. Prints the before/after bytes/tokens table the burndown PR body asks for (tokens = ceil(bytes / 4)).
import { execFileSync, type ExecFileSyncOptions } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { format } from 'prettier'

type Bag = Map<string, number>

const base = process.argv[2] ?? 'origin/main'
const head = process.argv[3] ?? 'HEAD'
const run = (cmd: string, args: string[], opts: ExecFileSyncOptions = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 30, stdio: 'pipe', ...opts }) as string
const git = (...args: string[]) => run('git', args)
const root = git('rev-parse', '--show-toplevel').trim()
const mergeBase = git('merge-base', base, head).trim()
const changed = (filter: string, ...paths: string[]) =>
  git('diff', '--name-only', '--no-renames', `--diff-filter=${filter}`, mergeBase, head, '--', ...paths)
    .split('\n')
    .filter(Boolean)

function add(bag: Bag, key: string, n: number) {
  bag.set(key, (bag.get(key) ?? 0) + n)
}
const residue = (bag: Bag) => [...bag].filter(([, n]) => n !== 0)
const show = (rev: string, file: string) => {
  try {
    return git('show', `${rev}:${file}`)
  } catch {
    return null // absent on that side
  }
}

// Always pass --json=<file>: `vitest list --json <path>` treats <path> as the output file and overwrites it.
class ListError extends Error {}

function listTests(cwd: string, files: string[], bag: Bag, sign: number): number {
  if (!files.length) return 0
  const out = path.join(cwd, '..', `tests-${sign}.json`)
  const vitest = (these: string[]) =>
    run(path.join(root, 'node_modules/.bin/vitest'), ['list', `--json=${out}`, '--passWithNoTests', ...these], { cwd })
  try {
    vitest(files)
  } catch {
    // Vitest's own output is an ANSI stack trace; rerun file by file to name the culprit instead.
    const bad = files.find((f) => {
      try {
        vitest([f])
        return false
      } catch {
        return true
      }
    })
    throw new ListError(`vitest could not list ${bad ?? files.join(', ')} on the ${sign < 0 ? 'base' : 'head'} side`)
  }
  // Positional filters match by substring, so keep only the touched files themselves.
  const wanted = new Set(files.map((f) => path.join(cwd, f)))
  const tests = JSON.parse(readFileSync(out, 'utf8')) as { name: string; file: string; projectName?: string }[]
  const kept = tests.filter((t) => wanted.has(t.file))
  for (const t of kept) add(bag, `${t.projectName ?? ''}|${t.name}`, sign)
  return kept.length
}

function checkTests(): boolean {
  // Real path: Vitest reports each test's file by its real path (macOS's /tmp is a symlink).
  const tmp = realpathSync(mkdtempSync(path.join(tmpdir(), 'pure-move-')))
  const tests: Bag = new Map()
  let before = 0
  let after = 0
  try {
    // Each side's tree, extracted without touching .git/worktrees or the checkout, sharing this checkout's
    // node_modules. The head is extracted too, so it needn't be the checked-out commit.
    const extract = (rev: string, name: string) => {
      const dir = path.join(tmp, name)
      mkdirSync(dir)
      run('tar', ['-x', '-C', dir], { input: execFileSync('git', ['archive', rev], { maxBuffer: 1 << 30 }) })
      symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'))
      return dir
    }
    const isTest = (f: string) => /\.(test|spec)\.tsx?$/.test(f)
    before = listTests(extract(mergeBase, 'base'), changed('MD').filter(isTest), tests, -1)
    after = listTests(extract(head, 'head'), changed('MA').filter(isTest), tests, 1)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  console.log(`tests: ${before} before, ${after} after (in the touched test files)`)
  for (const [name, n] of residue(tests)) console.log(`  ${n > 0 ? 'NEW ' : 'LOST'} x${Math.abs(n)}  ${name}`)
  return residue(tests).length === 0
}

const GLUE = [/^$/, /^import\b/, /^export (type )?\{.*\}( from .*)?$/, /^export \* from /, /^\/\* eslint-disable/]
const BRACKETS = /^[})\],;]*$/
// A top-level describe repeated as a wrapper in a split file is structure; the test-name check covers it.
const STRUCTURE = /^describe\((['"`]).*\1, \(\) => \{$/
const norm = (line: string) => line.replace(/^export (?=(async )?(function|const|let|class|interface|type|enum) )/, '')

async function checkCode(): Promise<boolean> {
  const code: Bag = new Map()
  const notes: Bag = new Map()
  for (const file of changed('ACDMT', '*.ts', '*.tsx')) {
    for (const [rev, sign] of [[mergeBase, -1] as const, [head, 1] as const]) {
      const text = show(rev, file)
      if (text === null) continue
      const flat = await format(text, { filepath: file, printWidth: 1e6, semi: false, singleQuote: true })
      for (const raw of flat.split('\n').map((l) => l.trim())) {
        if (GLUE.some((re) => re.test(raw)) || BRACKETS.test(raw)) continue
        const line = norm(raw)
        if (STRUCTURE.test(line)) continue
        add(/^(\/\/|\/\*|\*)/.test(line) ? notes : code, line, sign)
      }
    }
  }
  const unmatched = residue(code)
  const critical = unmatched.filter(([l]) => /\b(expect|it|test|describe)(\.\w+)*\(/.test(l))
  console.log(`code: ${unmatched.length} unmatched line(s), ${critical.length} touching tests or assertions`)
  for (const [l, n] of unmatched) console.log(`  ${n > 0 ? 'ADDED  ' : 'DROPPED'} x${Math.abs(n)}  ${l}`)
  for (const [l, n] of residue(notes)) console.log(`  comment ${n > 0 ? 'added' : 'dropped'} (not failed): ${l}`)
  return unmatched.length === 0
}

function printTable() {
  const size = (rev: string, file: string) => {
    try {
      return Number(git('cat-file', '-s', `${rev}:${file}`))
    } catch {
      return null // absent on that side
    }
  }
  const cell = (b: number | null) =>
    b === null ? '-' : `${b.toLocaleString('en')} / ${Math.ceil(b / 4).toLocaleString('en')}`
  console.log('| File | Before (bytes / tokens) | After (bytes / tokens) |\n| --- | --- | --- |')
  for (const f of changed('ACDMT')) console.log(`| \`${f}\` | ${cell(size(mergeBase, f))} | ${cell(size(head, f))} |`)
  console.log()
}

async function main(): Promise<boolean> {
  printTable()
  const testsOk = checkTests()
  const codeOk = await checkCode()
  console.log(testsOk && codeOk ? 'pure move' : 'NOT a pure move')
  return testsOk && codeOk
}

process.chdir(root)
console.log(`pure-move check: ${head} against merge base ${mergeBase.slice(0, 7)} with ${base}\n`)
try {
  process.exit((await main()) ? 0 : 1)
} catch (error) {
  if (!(error instanceof ListError)) throw error
  console.error(`pure-move: ${error.message}`)
  process.exit(1)
}
