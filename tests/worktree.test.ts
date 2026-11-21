import { expect, test } from 'claude-code/testing'

import {
  addArgs,
  branchWorktrees,
  countChanges,
  worktreeDirArgs,
  formInput,
  formProblem,
  newForm,
  currentWorktree,
  excludeEntry,
  isInside,
  isValidSlug,

  parseWorktrees,
  pathWarning,
  relativeTo,
  removeArgs,
  resolvePath,
  slugOf,
  WORKTREE_ARGS,
  WORKTREE_DIR_KEY,
  worktreeDir,
  mainPath,
  createPrompt,
  formTarget,
  withExclude,
} from '../hooks/worktree'

const MAIN = '/Users/dev/www/app'

const PORCELAIN = [
  `worktree ${MAIN}`,
  'HEAD aaaaaaa1aaaaaaa1aaaaaaa1aaaaaaa1aaaaaaa1',
  'branch refs/heads/main',
  '',
  `worktree ${MAIN}/.claude/worktrees/login`,
  'HEAD bbbbbbb2bbbbbbb2bbbbbbb2bbbbbbb2bbbbbbb2',
  'branch refs/heads/feature/login',
  'locked',
  '',
  `worktree ${MAIN}/.claude/worktrees/spike`,
  'HEAD ccccccc3ccccccc3ccccccc3ccccccc3ccccccc3',
  'detached',
  'prunable gitdir file points to non-existent location',
  '',
].join('\n')

test('WT-01 the worktrees come from git worktree list, the first one the main worktree', async () => {
  expect(WORKTREE_ARGS).toEqual(['worktree', 'list', '--porcelain'])
  expect(parseWorktrees(PORCELAIN)).toEqual([
    { path: MAIN, head: 'aaaaaaa1aaaaaaa1aaaaaaa1aaaaaaa1aaaaaaa1', branch: 'main', isMain: true, isLocked: false, isPrunable: false },
    { path: `${MAIN}/.claude/worktrees/login`, head: 'bbbbbbb2bbbbbbb2bbbbbbb2bbbbbbb2bbbbbbb2', branch: 'feature/login', isMain: false, isLocked: true, isPrunable: false },
    { path: `${MAIN}/.claude/worktrees/spike`, head: 'ccccccc3ccccccc3ccccccc3ccccccc3ccccccc3', branch: null, isMain: false, isLocked: false, isPrunable: true },
  ])
  expect(parseWorktrees('')).toEqual([])
})

test('WT-01 a branch open in a worktree other than the current one is marked with where', async () => {
  const list = parseWorktrees(PORCELAIN)
  expect(branchWorktrees(list, MAIN)).toEqual({ 'feature/login': `${MAIN}/.claude/worktrees/login` })
  // from inside the login worktree, main is the one open elsewhere
  expect(branchWorktrees(list, `${MAIN}/.claude/worktrees/login`)).toEqual({ main: MAIN })
})

test('WT-02 a slug comes from the branch name and must be a lowercase name with inner dashes', async () => {
  expect(slugOf('feature/Login_Page')).toBe('feature-login-page')
  expect(slugOf('--hotfix//1.8.2--')).toBe('hotfix-1-8-2')
  expect(['login', 'feature-login', 'a1'].every(isValidSlug)).toBe(true)
  expect(['', '-login', 'login-', 'Login', 'a b', 'a/b'].some(isValidSlug)).toBe(false)
})

test('WT-02 the worktree folder is the one set in the local config, else .claude/worktrees', async () => {
  expect(WORKTREE_DIR_KEY).toBe('gitgraph.worktreeDir')
  expect(worktreeDir('')).toBe('.claude/worktrees')
  expect(worktreeDir('  ../trees/ ')).toBe('../trees')
})

test('WT-02 a path is resolved from the main worktree, ~ from home; a worktree goes in its folder by slug', async () => {
  expect(resolvePath(MAIN, '/Users/dev', '.claude/worktrees/login')).toBe(`${MAIN}/.claude/worktrees/login`)
  expect(resolvePath(MAIN, '/Users/dev', '~/trees/x')).toBe('/Users/dev/trees/x')
  expect(resolvePath(MAIN, '/Users/dev', '/tmp/x/')).toBe('/tmp/x')
  expect(resolvePath(MAIN, '/Users/dev', '../other/./x')).toBe('/Users/dev/www/other/x')
  expect(mainPath(parseWorktrees(PORCELAIN))).toBe(MAIN)
  expect(mainPath([])).toBe('')
})

test('WT-02 a path outside the main worktree warns what does not work there', async () => {
  expect(isInside(MAIN, `${MAIN}/.claude/worktrees/x`)).toBe(true)
  expect(isInside(MAIN, `${MAIN}-other/x`)).toBe(false)
  expect(pathWarning(MAIN, `${MAIN}/.claude/worktrees/x`)).toBeNull()
  const warning = pathWarning(MAIN, '/Users/dev/trees/x') ?? ''
  expect(warning).toContain('Outside app')
  expect(warning).toContain("Claude's session can't reach it")
  expect(warning).not.toContain('gitgraph.json')
  expect(pathWarning(MAIN, '/Users/dev/trees/x', true)).toContain('gitgraph.json')
})

test('WT-02 the exclude entry is the folder holding the worktree, from the repo root, added once', async () => {
  expect(excludeEntry(MAIN, `${MAIN}/.claude/worktrees/login`)).toBe('/.claude/worktrees/')
  expect(excludeEntry(MAIN, `${MAIN}/login`)).toBe('/login/')
  expect(withExclude('# comment', '/.claude/worktrees/')).toBe('# comment\n/.claude/worktrees/\n')
  expect(withExclude('', '/x/')).toBe('/x/\n')
  expect(withExclude('a\n/x/\n', '/x/')).toBeNull()
})

test('WT-02 WT-03 a worktree is added on a branch or on a new branch at a commit, and removed (forced when changed)', async () => {
  expect(addArgs({ path: '/p', branch: 'feature/x' })).toEqual(['worktree', 'add', '/p', 'feature/x'])
  expect(addArgs({ path: '/p', newBranch: 'spike', commit: 'abc1234' })).toEqual(['worktree', 'add', '-b', 'spike', '/p', 'abc1234'])
  expect(removeArgs('/p', false)).toEqual(['worktree', 'remove', '/p'])
  expect(removeArgs('/p', true)).toEqual(['worktree', 'remove', '--force', '/p'])
})

test('WT-01 a worktree shows relative to the main one', async () => {
  const [main, login] = parseWorktrees(PORCELAIN)
  expect(relativeTo(MAIN, login?.path ?? '')).toBe('.claude/worktrees/login')
  expect(relativeTo(MAIN, main?.path ?? '')).toBe('.')
  expect(relativeTo(MAIN, '/tmp/x')).toBe('/tmp/x')

})

test('WT-01 the worktree the pane shows is the one on its branch, or on its commit while detached', async () => {
  const list = parseWorktrees(PORCELAIN)
  expect(currentWorktree(list, 'aaaaaaa1aaaaaaa1aaaaaaa1aaaaaaa1aaaaaaa1', 'main')?.path).toBe(MAIN)
  expect(currentWorktree(list, 'ccccccc3ccccccc3ccccccc3ccccccc3ccccccc3', '(detached)')?.path).toBe(`${MAIN}/.claude/worktrees/spike`)
  expect(currentWorktree(list, 'zzz', 'other')).toBeUndefined()
})

test('WT-03 a worktree changes are the lines of its status, headers left out', async () => {
  expect(countChanges(' M src/a.ts\n?? new.ts\n')).toBe(2)
  expect(countChanges('# branch.oid a1\n1 .M N... src/a.ts\n')).toBe(1)
  expect(countChanges('')).toBe(0)
})

test('WT-02 a form on a branch starts named after it; on a commit, the name follows the new branch; the path follows the name until edited', async () => {
  const onBranch = newForm({ kind: 'branch', branch: 'feature/login' }, '.claude/worktrees')
  expect([onBranch.slug, onBranch.path]).toEqual(['feature-login', '.claude/worktrees/feature-login'])
  let form = newForm({ kind: 'commit', hash: 'abc1234' }, '.claude/worktrees')
  expect([form.slug, form.path]).toEqual(['', '.claude/worktrees/'])
  form = formInput(form, 'newBranch', 'spike/Try')
  expect([form.slug, form.path]).toEqual(['spike-try', '.claude/worktrees/spike-try'])
  form = formInput(form, 'slug', 'try')
  expect(form.path).toBe('.claude/worktrees/try')
  // the name, once typed, no longer follows the branch
  expect(formInput(form, 'newBranch', 'other').slug).toBe('try')
  form = formInput(form, 'path', '~/trees/try')
  expect(formInput(form, 'slug', 'again').path).toBe('~/trees/try')
})

test('WT-02 a form names what is missing or wrong; outside the main worktree it warns', async () => {
  // the form carries the home `~` stands for; a form that can go returns its path, resolved
  const branch = newForm({ kind: 'branch', branch: 'feat' }, '.claude/worktrees', '/Users/dev')
  expect(formProblem(branch, MAIN)).toEqual({ path: `${MAIN}/.claude/worktrees/feat` })
  expect(formProblem({ ...branch, slug: 'Bad Name' }, MAIN)).toMatchObject({ error: expect.stringContaining('Name') })
  expect(formProblem({ ...branch, path: ' ' }, MAIN)).toMatchObject({ error: expect.stringContaining('path') })
  expect(formProblem(newForm({ kind: 'commit', hash: 'a1' }, '.claude/worktrees'), MAIN)).toMatchObject({ error: expect.stringContaining('branch') })
  expect(formProblem({ ...branch, path: '~/trees/feat' }, MAIN)).toMatchObject({ path: '/Users/dev/trees/feat', warning: expect.stringContaining('Outside app') })
})

test('WT-05 the worktree folder is saved in the local config; empty, unset', async () => {
  expect(worktreeDirArgs(' trees/ ')).toEqual(['config', '--local', 'gitgraph.worktreeDir', 'trees'])
  expect(worktreeDirArgs('  ')).toEqual(['config', '--local', '--unset', 'gitgraph.worktreeDir'])
})

test('WT-02 asking Claude to create names the native git run, the folder and the branch', async () => {
  const onBranch = createPrompt({ path: `${MAIN}/.claude/worktrees/login`, branch: 'feature/login' }, MAIN)
  expect(onBranch).toContain(`git worktree add ${MAIN}/.claude/worktrees/login feature/login`)
  expect(onBranch).toContain('.git/info/exclude')
  const onCommit = createPrompt({ path: '/elsewhere/spike', newBranch: 'spike', commit: 'abc1234' }, MAIN)
  expect(onCommit).toContain('git worktree add -b spike /elsewhere/spike abc1234')
  // outside the repo there is nothing to exclude
  expect(onCommit).not.toContain('.git/info/exclude')
})

test('WT-06 from the worktrees screen, a typed branch that exists gets the worktree; a new name becomes a branch off HEAD', async () => {
  let form = newForm({ kind: 'head' }, '.claude/worktrees')
  expect(formProblem(form, MAIN)).toMatchObject({ error: expect.stringContaining('branch') })
  form = formInput(form, 'newBranch', 'feat')
  expect(form.path).toBe('.claude/worktrees/feat')
  expect(formTarget(form, '/p', ['main', 'feat'])).toEqual({ path: '/p', branch: 'feat' })
  expect(formTarget(formInput(form, 'newBranch', 'spike'), '/p', ['main', 'feat'])).toEqual({ path: '/p', newBranch: 'spike', commit: 'HEAD' })
  // the other kinds as before
  expect(formTarget(newForm({ kind: 'branch', branch: 'feat' }, 'd'), '/p', [])).toEqual({ path: '/p', branch: 'feat' })
  expect(formTarget(formInput(newForm({ kind: 'commit', hash: 'abc' }, 'd'), 'newBranch', 'x'), '/p', ['x'])).toEqual({ path: '/p', newBranch: 'x', commit: 'abc' })
})
