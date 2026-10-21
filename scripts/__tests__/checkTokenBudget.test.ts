import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPT = fileURLToPath(new URL('../check-token-budget.sh', import.meta.url))

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
function write(file: string, bytes: number | Buffer) {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
  const content = typeof bytes === 'number' ? ('x'.repeat(79) + '\n').repeat(bytes / 80 + 1).slice(0, bytes) : bytes
  writeFileSync(path.join(repo, file), content)
}

function stage(file: string, bytes: number | Buffer) {
  write(file, bytes)
  git('add', '--', file)
}

function commit(file: string, bytes: number) {
  stage(file, bytes)
  git('commit', '--quiet', '--no-verify', '-m', `add ${file}`)
}

function check(...paths: string[]): { status: number; stderr: string } {
  try {
    execFileSync('sh', [SCRIPT, ...paths], { cwd: repo, env: ENV, encoding: 'utf8', stdio: 'pipe' })
    return { status: 0, stderr: '' }
  } catch (error) {
    const { status, stderr } = error as { status: number; stderr: string }
    return { status, stderr }
  }
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'token-budget-'))
  git('init', '--quiet')
  writeFileSync(
    path.join(repo, '.gitattributes'),
    ['generated/** linguist-generated', 'src/legacy.ts token-budget=6000', ''].join('\n'),
  )
  git('add', '.gitattributes')
  git('commit', '--quiet', '-m', 'init')
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

describe('check-token-budget', () => {
  it('passes instantly when nothing is staged', () => {
    expect(check()).toEqual({ status: 0, stderr: '' })
  })

  it('passes a file of exactly 5,000 tokens (20,000 bytes)', () => {
    stage('src/edge.ts', 20_000)

    expect(check().status).toBe(0)
  })

  it('fails an oversized file, naming its path, tokens, the limit and the overage', () => {
    stage('src/big.ts', 24_000)

    const result = check()

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('src/big.ts')
    expect(result.stderr).toMatch(/6,?000/)
    expect(result.stderr).toMatch(/5,?000/)
    expect(result.stderr).toMatch(/1,?000/)
    expect(result.stderr).toContain('docs/WORKFLOW.md#token-budget')
  })

  it('fails one token over the limit', () => {
    stage('src/edge.ts', 20_004)

    expect(check().status).not.toBe(0)
  })

  it('reports every oversized file, not just the first', () => {
    stage('src/one.ts', 24_000)
    stage('src/two.ts', 24_000)

    const { stderr } = check()

    expect(stderr).toContain('src/one.ts')
    expect(stderr).toContain('src/two.ts')
  })

  it.each([
    ['a TS module', 'src/lib/model.ts', /barrel/i, /describe/],
    ['a TSX module', 'src/components/Rail.tsx', /barrel/i, /describe/],
    ['a test file', 'src/lib/__tests__/model.test.ts', /describe/, /barrel/i],
    ['a TSX test file', 'src/test/route.test.tsx', /describe/, /barrel/i],
    ['a Markdown doc', 'docs/GUIDE.md', /H2|##/, /describe/],
  ])('tells how to split %s', (_kind, file, recipe, otherRecipe) => {
    stage(file, 24_000)

    const { status, stderr } = check()

    expect(status).not.toBe(0)
    expect(stderr).toMatch(recipe)
    expect(stderr).not.toMatch(otherRecipe)
  })

  it('measures the staged content, not the working tree', () => {
    stage('src/small.ts', 100)
    write('src/small.ts', 24_000)
    stage('src/shrunk.ts', 24_000)
    write('src/shrunk.ts', 100)

    const { status, stderr } = check()

    expect(status).not.toBe(0)
    expect(stderr).toContain('src/shrunk.ts')
    expect(stderr).not.toContain('src/small.ts')
  })

  it('skips files marked linguist-generated at any size', () => {
    stage('generated/types.ts', 100_000)

    expect(check().status).toBe(0)
  })

  it('skips binary files at any size', () => {
    stage('assets/image.bin', Buffer.alloc(100_000, 0))

    expect(check().status).toBe(0)
  })

  it('ignores a token-budget attribute: the file still fails above 5,000 tokens', () => {
    stage('src/legacy.ts', 24_000)

    const { status, stderr } = check()

    expect(status).not.toBe(0)
    expect(stderr).toContain('src/legacy.ts: 6000 tokens, budget 5000, over by 1000')
  })

  it('ignores deleted files', () => {
    commit('src/big.ts', 24_000)
    git('rm', '--quiet', '--', 'src/big.ts')

    expect(check().status).toBe(0)
  })

  it('handles paths with spaces', () => {
    stage('my dir/small file.ts', 100)
    stage('my dir/big file.ts', 24_000)

    const { status, stderr } = check()

    expect(status).not.toBe(0)
    expect(stderr).toContain('my dir/big file.ts')
    expect(stderr).not.toContain('my dir/small file.ts')
  })

  it('checks the given paths instead of the staged files', () => {
    commit('src/big.ts', 24_000)
    commit('src/small.ts', 100)
    stage('src/staged.ts', 24_000)

    expect(check('src/small.ts').status).toBe(0)

    const { status, stderr } = check('src/big.ts', 'src/small.ts')
    expect(status).not.toBe(0)
    expect(stderr).toContain('src/big.ts')
    expect(stderr).not.toContain('src/staged.ts')
  })
})
