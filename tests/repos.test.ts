import { expect, test } from 'claude-code/testing'

import { BRANCH_ARGS, UPSTREAM_ARGS, parseUpstream, FIND_ARGS, parseBranch, parseRepos, pickActive, branchColumn } from '../hooks/repos'

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

test('MR-04 the branch column pads the option out to the pane edge, in brackets', async () => {
  // `  ● api` is 7 cells; in 30 columns the row ends one short of the edge, as the column titles.
  expect(branchColumn('  ● api', 'develop', 30)).toBe(' '.repeat(13) + '[develop]')
  expect(('  ● api' + branchColumn('  ● api', 'develop', 30)).length).toBe(29)
  expect(branchColumn('  ● api', 'detached', 30).endsWith('[detached]')).toBe(true)
  // Unknown branch: nothing on the right.
  expect(branchColumn('  ● api', undefined, 30)).toBe('')
  // Narrow pane: one space kept after the repo, the branch cut with an ellipsis.
  expect(branchColumn('  ● api', 'feature/very-long', 20)).toBe(' [feature/…]')
  expect(branchColumn('  ● api', 'develop', 9)).toBe('')
})

test('MR-04 a branch with an upstream on a remote shows it, as origin/<branch>', async () => {
  expect(UPSTREAM_ARGS('feature/x')).toEqual(['for-each-ref', '--format=%(upstream:short)%00%(upstream:track)', 'refs/heads/feature/x'])
  expect(parseUpstream({ exitCode: 0, stdout: 'origin/main\0\n' })).toBe('origin/main')
  expect(parseUpstream({ exitCode: 0, stdout: 'origin/main\0[ahead 2]\n' })).toBe('origin/main')
  // Not pushed yet, its remote branch deleted, or the read failed: no upstream.
  expect(parseUpstream({ exitCode: 0, stdout: '\0\n' })).toBeNull()
  expect(parseUpstream({ exitCode: 0, stdout: 'origin/old\0[gone]\n' })).toBeNull()
  expect(parseUpstream({ exitCode: 128, stdout: '' })).toBeNull()
})
