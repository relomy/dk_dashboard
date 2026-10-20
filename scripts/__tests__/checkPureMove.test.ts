import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../check-pure-move.ts', import.meta.url))
const NODE_MODULES = fileURLToPath(new URL('../../node_modules', import.meta.url))

// Inside a git hook, GIT_DIR and GIT_INDEX_FILE point at this repository; drop them so git works on the temp repo.
// Drop this run's VITEST* variables too, so the script's own `vitest list` starts clean.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(GIT_|VITEST)/.test(key)))

let repo: string

function git(...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], {
    cwd: repo,
    env: ENV,
    encoding: 'utf8',
  })
}

function write(files: Record<string, string>) {
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(repo, file)
    mkdirSync(path.dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
}

function commit(files: Record<string, string>) {
  write(files)
  git('add', '--all')
  git('commit', '--quiet', '--no-verify', '-m', 'change')
}

function check(...refs: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('node', ['--import', 'tsx', SCRIPT, ...(refs.length ? refs : ['main'])], {
      cwd: repo,
      env: ENV,
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return { status: 0, stdout, stderr: '' }
  } catch (error) {
    const { status, stdout, stderr } = error as { status: number; stdout: string; stderr: string }
    return { status, stdout, stderr }
  }
}

const MATH = `export function add(a: number, b: number) {
  return a + b
}

export function double(a: number) {
  return add(a, a)
}
`

const lines = (...l: string[]) => l.join('\n') + '\n'

/** The base test file: a helper and two top-level describes. */
const MATH_TEST = lines(
  "import { describe, expect, it } from 'vitest'",
  "import { add, double } from './math'",
  '',
  'function twice(n: number) {',
  '  return [n, n] as const',
  '}',
  '',
  "describe('add', () => {",
  "  it('adds two numbers', () => {",
  '    expect(add(...twice(2))).toBe(4)',
  '  })',
  '})',
  '',
  "describe('double', () => {",
  "  it('doubles a number', () => {",
  '    expect(double(twice(3)[0])).toBe(6)',
  '  })',
  '})',
)

/** The split: `double`'s describe moves to its own file, the helper to a kit. */
const SPLIT = {
  'src/mathKit.ts': lines('export function twice(n: number) {', '  return [n, n] as const', '}'),
  'src/math.test.ts': lines(
    "import { describe, expect, it } from 'vitest'",
    "import { add } from './math'",
    "import { twice } from './mathKit'",
    '',
    "describe('add', () => {",
    "  it('adds two numbers', () => {",
    '    expect(add(...twice(2))).toBe(4)',
    '  })',
    '})',
  ),
  'src/double.test.ts': lines(
    "import { describe, expect, it } from 'vitest'",
    "import { double } from './math'",
    "import { twice } from './mathKit'",
    '',
    "describe('double', () => {",
    "  it('doubles a number', () => {",
    '    expect(double(twice(3)[0])).toBe(6)',
    '  })',
    '})',
  ),
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'pure-move-test-'))
  symlinkSync(NODE_MODULES, path.join(repo, 'node_modules'))
  git('init', '--quiet', '--initial-branch=main')
  commit({ '.gitignore': 'node_modules\n', 'src/math.ts': MATH, 'src/math.test.ts': MATH_TEST })
  git('checkout', '--quiet', '-b', 'split')
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('check-pure-move', { timeout: 60_000 }, () => {
  it('passes a clean split and prints the before/after table for every file touched', () => {
    commit({ ...SPLIT, '.gitignore': 'node_modules\ndist\n' })

    const { status, stdout } = check()

    expect(stdout).toContain('pure move')
    expect(stdout).not.toContain('NOT a pure move')
    expect(status).toBe(0)
    expect(stdout).toContain('tests: 2 before, 2 after')
    expect(stdout).toContain('| `src/math.test.ts` | 351 / 88 | 212 / 53 |')
    expect(stdout).toContain('| `src/double.test.ts` | - | 221 / 56 |')
    expect(stdout).toContain('| `.gitignore` | 13 / 4 | 18 / 5 |')
  })

  it('checks an explicit head ref instead of the checked-out commit', () => {
    commit(SPLIT)
    git('branch', 'good')
    commit({ 'src/double.test.ts': SPLIT['src/double.test.ts'].replace('.toBe(6)', '.toBeTruthy()') })

    expect(check('main', 'good').status).toBe(0)
    expect(check('main', 'HEAD').status).toBe(1)
    expect(check('main', 'good').stdout).toContain('check: good against merge base')
  })

  it('names the file and side when Vitest cannot collect a touched test file', () => {
    commit({ ...SPLIT, 'src/double.test.ts': "describe('double', () => {\n" })

    const { status, stdout, stderr } = check()

    expect(status).toBe(1)
    expect(stdout).not.toContain('pure move\n')
    expect(stderr).toMatch(/^pure-move: vitest could not list src\/double\.test\.ts on the head side\n$/)
  })

  it('fails a split that weakens a moved assertion, showing both sides of it', () => {
    const weakened = SPLIT['src/double.test.ts'].replace('.toBe(6)', '.toBeTruthy()')
    commit({ ...SPLIT, 'src/double.test.ts': weakened })

    const { status, stdout } = check()

    expect(status).toBe(1)
    expect(stdout).toContain('NOT a pure move')
    expect(stdout).toContain('code: 2 unmatched line(s), 2 touching tests or assertions')
    expect(stdout).toMatch(/ADDED +x1 +expect\(double\(twice\(3\)\[0\]\)\)\.toBeTruthy\(\)/)
    expect(stdout).toMatch(/DROPPED x1 +expect\(double\(twice\(3\)\[0\]\)\)\.toBe\(6\)/)
  })

  it('fails a split that duplicates a helper instead of moving it to a kit', () => {
    const helper = lines('function twice(n: number) {', '  return [n, n] as const', '}')
    const withHelper = (file: string) => file.replace("import { twice } from './mathKit'\n", `\n${helper}`)
    commit({
      'src/math.test.ts': withHelper(SPLIT['src/math.test.ts']),
      'src/double.test.ts': withHelper(SPLIT['src/double.test.ts']),
    })

    const { status, stdout } = check()

    expect(status).toBe(1)
    expect(stdout).toContain('tests: 2 before, 2 after')
    expect(stdout).toContain('code: 2 unmatched line(s), 0 touching tests or assertions')
    expect(stdout).toMatch(/ADDED +x1 +function twice\(n: number\) \{/)
    expect(stdout).toMatch(/ADDED +x1 +return \[n, n\] as const/)
  })

  it('fails a split that moves a test where Vitest no longer collects it', () => {
    const { 'src/double.test.ts': moved, ...rest } = SPLIT
    commit({ ...rest, 'src/doubleCases.ts': moved })

    const { status, stdout } = check()

    expect(status).toBe(1)
    expect(stdout).toContain('tests: 2 before, 1 after')
    expect(stdout).toMatch(/LOST +x1 +\|double > doubles a number/)
    expect(stdout).toContain('code: 0 unmatched line(s)')
  })

  it('passes a module split whose added `export` reflows a long signature', () => {
    // 116 columns as written; `export ` pushes it past Prettier's usual 120, so Prettier wraps it on HEAD.
    const signature =
      'function scaleAll(values: readonly number[], multiplyingFactor: number, offsetAddedToEachOfTheInputValues: number)'
    const scale = (prefix: string, head: string) =>
      lines(
        `${prefix}${head} {`,
        '  return values.map((v) => v * multiplyingFactor + offsetAddedToEachOfTheInputValues)',
        '}',
      )
    expect(`${signature} {`).toHaveLength(116)
    commit({ 'src/math.ts': MATH + '\n' + scale('', signature) })
    git('branch', '--force', 'main')
    const reflowed = signature.replace('(', '(\n  ').replace(/, /g, ',\n  ').replace(/\)$/, ',\n)')

    commit({
      'src/math.ts': MATH + "export { scaleAll } from './scale'\n",
      'src/scale.ts': scale('export ', reflowed),
    })

    const { status, stdout } = check()

    expect(stdout).toContain('code: 0 unmatched line(s)')
    expect(status).toBe(0)
  })
})
