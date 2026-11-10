import { expect, test } from 'claude-code/testing'

import { BRANCH_ARGS, FIND_ARGS, parseBranch, parseRepos, pickActive, repoOption } from '../hooks/repos'

test('MR-01 the search reaches repos three levels down and prunes heavy and hidden folders', async () => {
  expect(FIND_ARGS[0]).toBe('find')
  expect(FIND_ARGS.slice(FIND_ARGS.indexOf('-maxdepth'), FIND_ARGS.indexOf('-maxdepth') + 2)).toEqual(['-maxdepth', '4'])
  expect(FIND_ARGS).toContain('node_modules')
  expect(FIND_ARGS.join(' ')).toContain("-name .* ! -name .git ) ) -prune")
  // Only a .git directory is a repo: a submodule's or worktree's .git is a file.
  expect(FIND_ARGS.join(' ')).toContain('-type d -name .git -print')
})

test('MR-01 repos are listed by relative path, the session folder first, then alphabetically', async () => {
  expect(parseRepos('./web/.git\n./.git\n./api/.git\n./apps/mobile/app/.git\n')).toEqual(['.', 'api', 'apps/mobile/app', 'web'])
  expect(parseRepos('./b/.git\n./a/.git\n')).toEqual(['a', 'b'])
  expect(parseRepos('')).toEqual([])
})

test('MR-02 the active repo is kept while it exists, else the first one', async () => {
  expect(pickActive(['.', 'api'], 'api')).toBe('api')
  expect(pickActive(['.', 'api'], '.')).toBe('.')
  expect(pickActive(['api', 'web'], '.')).toBe('api')
  expect(pickActive(['.', 'web'], 'api')).toBe('.')
  // No repo found: the session folder, which shows "not a git repository" as before.
  expect(pickActive([], '.')).toBe('.')
})

test('MR-04 the branch a repo is on comes from its symbolic HEAD', async () => {
  expect(BRANCH_ARGS).toEqual(['symbolic-ref', '--short', '-q', 'HEAD'])
  expect(parseBranch({ exitCode: 0, stdout: 'feature/x\n' })).toBe('feature/x')
  // `symbolic-ref -q` exits 1, silent, on a detached HEAD; any other failure is unknown.
  expect(parseBranch({ exitCode: 1, stdout: '' })).toBe('detached')
  expect(parseBranch({ exitCode: 128, stdout: '' })).toBeNull()
})

test('MR-04 a picker option reads "<repo> - <branch>"', async () => {
  expect(repoOption('api', 'develop')).toBe('api - develop')
  expect(repoOption('.', 'main')).toBe('(this folder) - main')
  expect(repoOption('web', undefined)).toBe('web')
})
