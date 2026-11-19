import { expect, test } from 'claude-code/testing'

import { cleanMessage, commitPrompt, commitRuns, contextArgs, MAX_DIFF, newFiles } from '../hooks/commit'

test('CM-02 a commit takes the chosen files only, new, deleted and renamed ones too', async () => {
  const files = [
    { path: 'a.ts', code: 'M' as const, isStaged: false },
    { path: 'new.ts', code: 'A' as const, isStaged: false },
    { path: 'b.ts', from: 'old.ts', code: 'R' as const, isStaged: true },
  ]
  expect(commitRuns('  feat(graph): add x  ', files)).toEqual([
    ['add', '-A', '--', 'a.ts', 'new.ts', 'b.ts', 'old.ts'],
    ['commit', '-m', 'feat(graph): add x', '--', 'a.ts', 'new.ts', 'b.ts', 'old.ts'],
  ])
  // what Claude reads: the diff of those files alone, the new ones named
  expect(contextArgs(files).diff).toEqual(['diff', 'HEAD', '--', 'a.ts', 'new.ts', 'b.ts', 'old.ts'])
  expect(contextArgs(files).stat).toEqual(['diff', 'HEAD', '--stat', '--', 'a.ts', 'new.ts', 'b.ts', 'old.ts'])
  expect(newFiles(files)).toBe('new.ts')
})

test('CM-01 the prompt carries the changes, the new files and the recent subjects, the diff capped', async () => {
  const prompt = commitPrompt({ stat: ' a.ts | 2 +-', diff: 'x'.repeat(MAX_DIFF + 50), untracked: 'new.ts\n', log: 'fix(pane): y\nfeat(graph): z\n' })
  expect(prompt).toContain('a.ts | 2 +-')
  expect(prompt).toContain('new.ts')
  expect(prompt).toContain('fix(pane): y')
  expect(prompt).toContain('[diff cut]')
  expect(prompt.length).toBeLessThan(MAX_DIFF + 2000)
  // no new files, no recent commits: those parts say so instead of leaving a blank
  const bare = commitPrompt({ stat: '', diff: 'd', untracked: '', log: '' })
  expect(bare).toContain('(none)')
})

test('CM-01 the reply is cleaned to its one message line', async () => {
  expect(cleanMessage('feat(graph): add x')).toBe('feat(graph): add x')
  expect(cleanMessage('```\nfeat(graph): add x\n```')).toBe('feat(graph): add x')
  expect(cleanMessage('"fix(pane): close on Escape"')).toBe('fix(pane): close on Escape')
  expect(cleanMessage('Commit message: chore: bump\n\nBecause.')).toBe('chore: bump')
  expect(cleanMessage('  \n ')).toBe('')
})
