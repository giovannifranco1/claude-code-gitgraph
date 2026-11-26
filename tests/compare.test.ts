import { expect, test } from 'claude-code/testing'

import { compareRuns, parseCount } from '../hooks/compare'
import { diffKey, diffRuns, sourceLabel } from '../hooks/diff'
import { menuFor } from '../hooks/menu'

test('CP-02 a comparison counts each side past the other and lists the files from one to the other', async () => {
  expect(compareRuns('main', 'feat')).toEqual({
    count: ['rev-list', '--left-right', '--count', 'main...feat'],
    files: ['diff', '--numstat', '--no-color', '--no-ext-diff', 'main', 'feat'],
  })
  // left: only in main (feat is behind); right: only in feat (ahead)
  expect(parseCount('3\t1\n')).toEqual({ ahead: 1, behind: 3 })
  expect(parseCount('')).toEqual({ ahead: 0, behind: 0 })
})

test('CP-02 a file of a comparison diffs from one side to the other', async () => {
  const source = { kind: 'range', from: 'main', to: 'abc1234', label: 'main ↔ abc1234' } as const
  expect(diffRuns(source, 'src/a.ts')).toEqual([['diff', '--no-color', '--no-ext-diff', 'main', 'abc1234', '--', 'src/a.ts']])
  expect(sourceLabel(source)).toBe('main ↔ abc1234')
  expect(diffKey(source, 'a')).not.toBe(diffKey({ ...source, to: 'other' }, 'a'))
})

test('CP-01 a branch other than the current one, local or remote, compares with the current branch', async () => {
  const compareOf = (items: ReturnType<typeof menuFor>) => items.find(i => i.id === 'compare')
  expect(compareOf(menuFor({ kind: 'branch', label: 'feat', remotes: [] }, []))).toEqual({ id: 'compare', label: 'Compare with current branch', compare: 'feat' })
  expect(compareOf(menuFor({ kind: 'remote', label: 'origin/feat', remotes: [] }, ['origin']))?.compare).toBe('origin/feat')
  expect(compareOf(menuFor({ kind: 'head', label: 'main', remotes: [] }, []))).toBeUndefined()
})
