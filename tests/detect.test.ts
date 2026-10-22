import { expect, test } from 'claude-code/testing'

import { isBranchNameCandidate } from '../hooks/detect'
import { fitGraph, relTime, short, truncate } from '../hooks/format'

test('GG-10 a branch name is pre-checked before git validates it', async () => {
  expect(isBranchNameCandidate('feature/login')).toBe(true)
  expect(isBranchNameCandidate('fix-123')).toBe(true)
  expect(isBranchNameCandidate('')).toBe(false)
  expect(isBranchNameCandidate('   ')).toBe(false)
  expect(isBranchNameCandidate('-D')).toBe(false)
  expect(isBranchNameCandidate('--force')).toBe(false)
  expect(isBranchNameCandidate('a b')).toBe(false)
  expect(isBranchNameCandidate('a;rm -rf')).toBe(false)
  expect(isBranchNameCandidate('x\ny')).toBe(false)
  expect(isBranchNameCandidate('x'.repeat(256))).toBe(false)
})

test('GG-04 relative dates', async () => {
  const now = 1700481600 // 2023-11-20 12:00 UTC
  expect(relTime(now, now - 20)).toBe('now')
  expect(relTime(now, now - 5 * 60)).toBe('5m')
  expect(relTime(now, now - 3 * 3600)).toBe('3h')
  expect(relTime(now, now - 2 * 86400)).toBe('2d')
  expect(relTime(now, 1696852800)).toBe('Oct 9') // 2023-10-09 12:00 UTC
  expect(relTime(now + 365 * 86400, 1696852800)).toBe('Oct 9 2023')
})

test('GG-03 the graph is cut with an ellipsis past its room', async () => {
  const cells = '●─┼─╮'.split('').map(ch => ({ ch, color: 1 }))
  expect(fitGraph(cells, 10)).toBe(cells)
  expect(fitGraph(cells, 3).map(c => c.ch).join('')).toBe('●─…')
})

test('GG-04 text is truncated with an ellipsis', async () => {
  expect(truncate('hello', 10)).toBe('hello')
  expect(truncate('hello world', 6)).toBe('hello…')
  expect(truncate('hello', 0)).toBe('')
})

test('GG-04 hashes are shown short', async () => {
  expect(short('0123456789abcdef')).toBe('0123456')
})
