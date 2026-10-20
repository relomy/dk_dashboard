import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../check-budget-ratchet.sh', import.meta.url))
const BUDGET_SCRIPT = fileURLToPath(new URL('../check-token-budget.sh', import.meta.url))

// Inside a git hook, GIT_DIR and GIT_INDEX_FILE point at this repository; drop them so git works on the temp repo.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))

let repo: string

function git(...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], {
    cwd: repo,
    env: ENV,
    encoding: 'utf8',
  })
}

/** Writes a text file of exactly `bytes` bytes (one token per four bytes). */
function write(file: string, content: number | string) {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
  const text =
    typeof content === 'number' ? ('x'.repeat(79) + '\n').repeat(content / 80 + 1).slice(0, content) : content
  writeFileSync(path.join(repo, file), text)
}

function commit(message: string, files: Record<string, number | string>) {
  for (const [file, content] of Object.entries(files)) write(file, content)
  git('add', '-A')
  git('commit', '--quiet', '--no-verify', '-m', message)
}

function attributes(...lines: string[]): string {
  return [...lines, ''].join('\n')
}

function run(script: string, args: string[]): { status: number; stderr: string } {
  try {
    execFileSync('sh', [script, ...args], { cwd: repo, env: ENV, encoding: 'utf8', stdio: 'pipe' })
    return { status: 0, stderr: '' }
  } catch (error) {
    const { status, stderr } = error as { status: number; stderr: string }
    return { status, stderr }
  }
}

/** The ratchet step, as CI runs it: against the base commit. */
function ratchet(base: string | null = 'base') {
  return run(SCRIPT, base === null ? [] : [base])
}

/** The size step, as CI runs it: on every tracked file. */
function sizeCheck() {
  const files = git('ls-files', '-z').split('\0').filter(Boolean)
  return run(BUDGET_SCRIPT, files)
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'budget-ratchet-'))
  git('init', '--quiet')
  commit('init', {
    '.gitattributes': attributes('# token-budget=<N> in a comment is not a budget', 'src/legacy.ts token-budget=6000'),
    'src/legacy.ts': 24_000,
    'src/other.ts': 100,
  })
  git('tag', 'base')
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('check-budget-ratchet', () => {
  it('passes an unchanged repository, with or without a base', () => {
    expect(ratchet()).toEqual({ status: 0, stderr: '' })
    expect(ratchet(null)).toEqual({ status: 0, stderr: '' })
  })

  it('lets a grandfathered file shrink, and its line go once it is within the limit', () => {
    commit('split', {
      'src/legacy.ts': 20_000,
      '.gitattributes': attributes('# token-budget=<N> in a comment is not a budget'),
    })

    expect(ratchet()).toEqual({ status: 0, stderr: '' })
  })

  describe('a budget added or raised in .gitattributes', () => {
    it('fails a raised budget', () => {
      commit('raise', {
        '.gitattributes': attributes('src/legacy.ts token-budget=9999'),
        'src/legacy.ts': 30_000,
      })

      const { status, stderr } = ratchet()

      expect(status).not.toBe(0)
      expect(stderr).toContain('src/legacy.ts token-budget=9999')
      expect(stderr).toContain('docs/WORKFLOW.md#grandfathered-files')
    })

    it('fails a new grandfathered file', () => {
      commit('grandfather', {
        '.gitattributes': attributes('src/legacy.ts token-budget=6000', 'src/new.ts token-budget=7000'),
        'src/new.ts': 28_000,
      })

      const { status, stderr } = ratchet()

      expect(status).not.toBe(0)
      expect(stderr).toContain('src/new.ts token-budget=7000')
    })

    it('passes a lowered budget', () => {
      commit('lower', { '.gitattributes': attributes('src/legacy.ts token-budget=5500'), 'src/legacy.ts': 22_000 })

      expect(ratchet()).toEqual({ status: 0, stderr: '' })
    })

    it('passes reordered lines whose budgets did not change', () => {
      commit('two files', {
        '.gitattributes': attributes('src/legacy.ts token-budget=6000', 'src/b.ts token-budget=7000'),
        'src/b.ts': 28_000,
      })
      git('tag', '--force', 'base')
      commit('reorder', {
        '.gitattributes': attributes('src/b.ts token-budget=7000', 'src/legacy.ts token-budget=6000'),
      })

      expect(ratchet()).toEqual({ status: 0, stderr: '' })
    })

    it('fails a renamed grandfathered file, which is a new path', () => {
      git('mv', 'src/legacy.ts', 'src/renamed.ts')
      commit('rename', { '.gitattributes': attributes('src/renamed.ts token-budget=6000') })

      const { status, stderr } = ratchet()

      expect(status).not.toBe(0)
      expect(stderr).toContain('src/renamed.ts token-budget=6000')
    })

    it('fails a raised budget on a path with spaces', () => {
      commit('two files', {
        '.gitattributes': attributes('"my dir/a b.ts" token-budget=6000'),
        'my dir/a b.ts': 24_000,
      })
      git('tag', '--force', 'base')
      commit('raise', { '.gitattributes': attributes('"my dir/a b.ts" token-budget=6500'), 'my dir/a b.ts': 26_000 })

      const { status, stderr } = ratchet()

      expect(status).not.toBe(0)
      expect(stderr).toContain('my dir/a b.ts token-budget=6500')
    })

    it('exits 2, not 0, when the base is not a revision', () => {
      const { status, stderr } = ratchet('nosuchref')

      expect(status).toBe(2)
      expect(stderr).toContain('nosuchref')
    })

    it('ignores the check without a base', () => {
      commit('raise', { '.gitattributes': attributes('src/legacy.ts token-budget=9999'), 'src/legacy.ts': 30_000 })

      expect(ratchet(null).status).toBe(0)
    })

    it('ignores a comment that mentions token-budget=', () => {
      commit('comment', {
        '.gitattributes': attributes(
          '# token-budget=<N> in a comment is not a budget',
          '# Never raise token-budget=6000 here',
          'src/legacy.ts token-budget=6000',
        ),
      })

      expect(ratchet()).toEqual({ status: 0, stderr: '' })
    })
  })

  describe('a stale budget line', () => {
    it('fails a file within 5,000 tokens that keeps its line', () => {
      commit('shrink', { 'src/legacy.ts': 20_000 })

      const { status, stderr } = ratchet()

      expect(status).not.toBe(0)
      expect(stderr).toContain('src/legacy.ts: 5000 tokens')
      expect(stderr).toContain('token-budget=6000')
    })

    it('fails even when the line was there before the base', () => {
      commit('shrink', { 'src/legacy.ts': 100 })
      git('tag', '--force', 'base')

      expect(ratchet().status).not.toBe(0)
      expect(ratchet(null).status).not.toBe(0)
    })

    it('passes a file one token over the limit that keeps its line', () => {
      commit('shrink', { 'src/legacy.ts': 20_004 })

      expect(ratchet()).toEqual({ status: 0, stderr: '' })
    })

    it('names every stale file, including paths with spaces', () => {
      commit('shrink', {
        '.gitattributes': attributes('src/legacy.ts token-budget=6000', '"my dir/a b.ts" token-budget=6000'),
        'src/legacy.ts': 100,
        'my dir/a b.ts': 100,
      })
      git('tag', '--force', 'base')

      const { status, stderr } = ratchet()

      expect(status).not.toBe(0)
      expect(stderr).toContain('src/legacy.ts: 25 tokens')
      expect(stderr).toContain('my dir/a b.ts: 25 tokens')
    })
  })
})

describe('the size check on every tracked file (CI)', () => {
  it('catches a file whose budget line was deleted in a PR that never touched it', () => {
    commit('split another file', { '.gitattributes': attributes() })

    expect(sizeCheck().status).not.toBe(0)
    expect(run(BUDGET_SCRIPT, ['src/other.ts']).status).toBe(0)
  })
})
