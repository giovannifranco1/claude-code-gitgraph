import { expect, test } from 'claude-code/testing'

import { conflictOrigin, conflictPrompt, conflictToast } from '../hooks/conflict'

test('CR-01 the request names the files, where the conflict comes from and the repo, and leaves commit and continue to the pane', async () => {
  const text = conflictPrompt({ files: ['src/a.ts', 'src/b.ts'], from: 'git flow finish of feature/login', repo: 'apps/web' })
  expect(text).toContain('Resolve the git conflicts in the repository at apps/web, left by git flow finish of feature/login.')
  expect(text).toContain('- src/a.ts\n- src/b.ts')
  expect(text).toContain('remove the conflict markers')
  expect(text).toContain('git add')
  expect(text).toContain('Do not commit')
  expect(text).toContain('do not continue or abort')
})

test('CR-01 in the session folder, from an unknown operation, the request says neither', async () => {
  const text = conflictPrompt({ files: ['a.ts'], repo: '.' })
  expect(text).toContain('Resolve the git conflicts in this repository.')
  expect(conflictToast(1)).toBe('Asked Claude to resolve 1 conflicted file')
  expect(conflictToast(3)).toBe('Asked Claude to resolve 3 conflicted files')
})

test('CR-01 a git flow conflict names the operation that left it, as git flow runs it', async () => {
  const topic = { kind: 'feature', name: 'login', branch: 'feature/login' } as const
  expect(conflictOrigin({ op: 'finish', topic })).toBe('git flow finish of feature/login')
  expect(conflictOrigin({ op: 'rebase', topic })).toBe('rebasing feature/login on its base (git flow update)')
  expect(conflictOrigin({ op: 'merge', topic })).toBe('merging its base into feature/login (git flow update)')
})
