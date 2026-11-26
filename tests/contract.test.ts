import { expect, test } from 'claude-code/testing'

import { appendChunk, checkResult, CONTRACT_FILE, commandArgv, envArgv, envFor, envSlug, envVars, hostOf, linkUrls, parseCheck, parseContract, parseEnvStatus, stripAnsi } from '../hooks/contract'

const FULL = JSON.stringify({
  worktrees: {
    version: 1,
    dir: '.claude/worktrees',
    new: './worktree.sh new {slug} {branch} {base}',
    remove: './worktree.sh remove {slug}',
    up: './worktree.sh up {slug}',
    down: './worktree.sh down {slug}',
    logs: './worktree.sh logs {slug}',
    check: './worktree.sh check {slug}',
    status: './worktree.sh status {slug}',
    links: ['https://{slug}.app.test', 'https://{slug}--admin.app.test'],
  },
})

test('WE-01 the contract is the worktrees section of gitgraph.json at the main worktree', async () => {
  expect(CONTRACT_FILE).toBe('gitgraph.json')
  const { contract, problem } = parseContract(FULL)
  expect(problem).toBeNull()
  expect(contract?.dir).toBe('.claude/worktrees')
  expect(contract?.commands.up).toBe('./worktree.sh up {slug}')
  expect(contract?.links).toEqual(['https://{slug}.app.test', 'https://{slug}--admin.app.test'])
})

test('WE-01 no file, or a file without the section, is no contract and no problem', async () => {
  expect(parseContract(null)).toEqual({ contract: null, problem: null })
  expect(parseContract('{"other": 1}')).toEqual({ contract: null, problem: null })
})

test('WE-01 a missing dir is the default; only the declared commands are there', async () => {
  const { contract } = parseContract('{"worktrees":{"version":1,"up":"./wt up {slug}"}}')
  expect(contract).toEqual({ dir: '.claude/worktrees', commands: { up: './wt up {slug}' }, links: [] })
})

test('WE-01 a broken or wrong contract is a problem, and no contract', async () => {
  const problemOf = (text: string) => parseContract(text)
  expect(problemOf('{nope')).toMatchObject({ contract: null, problem: expect.stringContaining('not valid JSON') })
  expect(problemOf('{"worktrees":{"version":"1"}}')).toMatchObject({ contract: null, problem: expect.stringContaining('version') })
  expect(problemOf('{"worktrees":{"version":1,"up":3}}')).toMatchObject({ contract: null, problem: expect.stringContaining('up') })
  expect(problemOf('{"worktrees":{"version":1,"up":"./wt up"}}')).toMatchObject({ contract: null, problem: expect.stringContaining('{slug}') })
  expect(problemOf('{"worktrees":{"version":1,"links":"x"}}')).toMatchObject({ contract: null, problem: expect.stringContaining('links') })
  expect(problemOf('{"worktrees":{"version":1,"dir":2}}')).toMatchObject({ contract: null, problem: expect.stringContaining('dir') })
})

test('WE-01 a newer version than this gitgraph reads turns the contract off and says to update', async () => {
  expect(parseContract('{"worktrees":{"version":2}}')).toMatchObject({ contract: null, problem: expect.stringContaining('update gitgraph') })
})

test('WE-02 a command runs as its words, placeholders filled, empty ones dropped, no shell', async () => {
  expect(commandArgv('./worktree.sh new {slug} {branch} {base}', { slug: 'login', branch: 'feature/login', base: '' })).toEqual(['./worktree.sh', 'new', 'login', 'feature/login'])
  expect(commandArgv('./worktree.sh  up   {slug}', { slug: 'x' })).toEqual(['./worktree.sh', 'up', 'x'])
  // a name with shell characters is one argument, never run by a shell
  expect(commandArgv('./wt new {slug} {branch}', { slug: 'x', branch: 'a;rm -rf' })).toEqual(['./wt', 'new', 'x', 'a;rm -rf'])
  expect(commandArgv('./wt up {path}', { path: '/r/.claude/worktrees/x' })).toEqual(['./wt', 'up', '/r/.claude/worktrees/x'])
})

test('WE-02 a worktree has a slug only inside the contract folder: the folder name', async () => {
  expect(envSlug('/r', '.claude/worktrees', '/r/.claude/worktrees/login')).toBe('login')
  expect(envSlug('/r', '.claude/worktrees', '/r')).toBeNull()
  expect(envSlug('/r', '.claude/worktrees', '/elsewhere/login')).toBeNull()
  expect(envSlug('/r', '../trees', '/trees/x')).toBe('x')
})

test('WE-02 the new command gets the branch and base of what the form creates', async () => {
  expect(envVars('x', { path: '/p', branch: 'develop' })).toEqual({ slug: 'x', path: '/p', branch: 'develop', base: '' })
  expect(envVars('x', { path: '/p', newBranch: 'spike', commit: 'abc1234' })).toEqual({ slug: 'x', path: '/p', branch: 'spike', base: 'abc1234' })
})

test('WE-02 status is the first line: up, down, or unknown for anything else', async () => {
  expect(parseEnvStatus({ exitCode: 0, stdout: 'up\n' })).toBe('up')
  expect(parseEnvStatus({ exitCode: 0, stdout: 'down\nvite stopped\n' })).toBe('down')
  expect(parseEnvStatus({ exitCode: 0, stdout: 'unknown\n' })).toBe('unknown')
  expect(parseEnvStatus({ exitCode: 2, stdout: 'up\n' })).toBe('unknown')
  expect(parseEnvStatus({ exitCode: 0, stdout: '\u001b[32mup\u001b[0m\n' })).toBe('up')
})

test('WE-02 check is one line per item: ok, failed or shared; other lines are info', async () => {
  expect(parseCheck('✓ banco isolado\n✗ redis: igual ao principal\n– cache: compartilhado\nresumo\n')).toEqual([
    { mark: 'ok', text: 'banco isolado' },
    { mark: 'failed', text: 'redis: igual ao principal' },
    { mark: 'shared', text: 'cache: compartilhado' },
    { mark: 'info', text: 'resumo' },
  ])
  expect(parseCheck('\u001b[31m✗ x\u001b[0m\n')).toEqual([{ mark: 'failed', text: 'x' }])
})

test('WE-02 each link is the slug filled in, shown by its host', async () => {
  expect(linkUrls(['https://{slug}.app.test/', 'http://localhost:8{slug}'], 'login')).toEqual(['https://login.app.test/', 'http://localhost:8login'])
  expect(hostOf('https://login.app.test/admin?x=1')).toBe('login.app.test')
  expect(hostOf('not a url')).toBe('not a url')
})

test('WE-02 colors are taken out of a command output', async () => {
  expect(stripAnsi('\u001b[1;32mok\u001b[0m done')).toBe('ok done')
})

test('WE-01 the contract folder is trimmed of a trailing slash, as Settings does', async () => {
  expect(parseContract('{"worktrees":{"version":1,"dir":" trees/ "}}').contract?.dir).toBe('trees')
})

test('WE-02 a worktree environment is its slug, commands and links; none outside the folder or without a contract', async () => {
  const { contract } = parseContract(FULL)
  const env = envFor(contract, '/r', '/r/.claude/worktrees/login')
  expect(env?.slug).toBe('login')
  expect(env?.links).toEqual(['https://login.app.test', 'https://login--admin.app.test'])
  expect(envFor(contract, '/r', '/r')).toBeNull()
  expect(envFor(null, '/r', '/r/.claude/worktrees/login')).toBeNull()
  expect(envArgv(env!, 'up')).toEqual(['./worktree.sh', 'up', 'login'])
  expect(envArgv(env!, 'remove', true)).toEqual(['./worktree.sh', 'remove', 'login', '--force'])
  expect(envArgv(env!, 'up', true)).toEqual(['./worktree.sh', 'up', 'login'])
  expect(envArgv({ ...env!, commands: {} }, 'up')).toBeNull()
})

test('WE-02 a check that exits 0 or 1 is its lines; any other exit is a failed run', async () => {
  expect(checkResult({ exitCode: 1, stdout: '✗ x\n' })).toEqual([{ mark: 'failed', text: 'x' }])
  expect(checkResult({ exitCode: 0, stdout: '' })).toEqual([])
  expect(checkResult({ exitCode: 2, stdout: '✓ x\n' })).toBeNull()
})

test('WE-02 a log piece adds its finished lines, holds the unfinished one, keeps the last ones', async () => {
  let log = appendChunk({ lines: [], partial: '' }, 'a\nlis', 3)
  expect(log).toEqual({ lines: ['a'], partial: 'lis' })
  log = appendChunk(log, 'ten\n\u001b[32mb\u001b[0m\nc\nd\n', 3)
  expect(log).toEqual({ lines: ['b', 'c', 'd'], partial: '' })
})
