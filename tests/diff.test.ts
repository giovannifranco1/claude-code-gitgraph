import { expect, test } from 'claude-code/testing'

import { diffRuns, MAX_DIFF_LINES, parseDiff, sourceLabel } from '../hooks/diff'

test('DF-01 a commit file diffs against its first parent; a stash file against its base, or as a new file of the stash', async () => {
  expect(diffRuns({ kind: 'commit', hash: 'abc1234' }, 'src/a.ts')).toEqual([['show', '--format=', '--diff-merges=first-parent', '--no-color', '--no-ext-diff', 'abc1234', '--', 'src/a.ts']])
  expect(diffRuns({ kind: 'stash', name: 'stash@{1}' }, 'src/a.ts')).toEqual([
    ['diff', '--no-color', '--no-ext-diff', 'stash@{1}^1', 'stash@{1}', '--', 'src/a.ts'],
    ['show', '--format=', '--no-color', '--no-ext-diff', 'stash@{1}^3', '--', 'src/a.ts'],
  ])
  expect(sourceLabel({ kind: 'commit', hash: 'abc1234def' })).toBe('abc1234')
  expect(sourceLabel({ kind: 'stash', name: 'stash@{1}' })).toBe('stash@{1}')
})

test('DF-01 a diff is its hunks without git headers: hunk, added, removed and context lines', async () => {
  const out = [
    'diff --git a/src/a.ts b/src/a.ts',
    'index 1111111..2222222 100644',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,3 +1,3 @@ export function a() {',
    ' keep',
    '-old',
    '+new',
    '\\ No newline at end of file',
    '',
  ].join('\n')
  expect(parseDiff(out)).toEqual({
    lines: [
      { kind: 'hunk', text: '@@ -1,3 +1,3 @@ export function a() {' },
      { kind: 'ctx', text: ' keep' },
      { kind: 'del', text: '-old' },
      { kind: 'add', text: '+new' },
      { kind: 'note', text: '\\ No newline at end of file' },
    ],
    hidden: 0,
  })
})

test('DF-01 a binary file and an empty diff say so; a huge diff keeps its first lines and counts the rest', async () => {
  expect(parseDiff('diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n').lines).toEqual([{ kind: 'note', text: 'Binary file: no text diff to show' }])
  expect(parseDiff('').lines).toEqual([{ kind: 'note', text: 'No changes to show' }])
  const huge = ['@@ -1 +1 @@', ...Array.from({ length: MAX_DIFF_LINES + 9 }, (_, i) => `+line ${i}`)].join('\n')
  const { lines, hidden } = parseDiff(huge)
  expect(lines).toHaveLength(MAX_DIFF_LINES)
  expect(hidden).toBe(10)
})
