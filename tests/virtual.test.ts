import { expect, test } from 'claude-code/testing'

import { findByHash, isHashQuery, topOf, visibleRange } from '../hooks/virtual'

const ones = (n: number) => Array.from({ length: n }, () => 1)

test('GG-15 only the rows in the window and its overscan are drawn; spacers keep the rest', async () => {
  expect(visibleRange(ones(100), 3, 0, 10, 5)).toEqual({ from: 0, to: 12, before: 0, after: 88 })
  expect(visibleRange(ones(100), 3, 50, 10, 5)).toEqual({ from: 42, to: 62, before: 42, after: 38 })
  expect(visibleRange(ones(100), 3, 500, 10, 5)).toEqual({ from: 100, to: 100, before: 100, after: 0 })
  expect(visibleRange([], 3, 0, 10, 5)).toEqual({ from: 0, to: 0, before: 0, after: 0 })
})

test('GG-15 a tall expanded row counts with its whole height', async () => {
  const heights = [1, 1, 30, 1, 1, 1]
  // rows start at tree row 0; window 10..20 falls inside the 30-row detail of row 2
  expect(visibleRange(heights, 0, 10, 10, 0)).toEqual({ from: 2, to: 3, before: 2, after: 3 })
  expect(topOf(heights, 3)).toBe(32)
})

test('GG-16 a hash search takes 4 to 40 hex digits only', async () => {
  for (const ok of ['abcd', 'ABCD12', 'f46e232', '0123456789abcdef0123456789abcdef01234567']) expect({ ok, v: isHashQuery(ok) }).toEqual({ ok, v: true })
  for (const bad of ['', 'abc', 'xyz1', '--all', 'HEAD', 'a b c d', '0'.repeat(41)]) expect({ bad, v: isHashQuery(bad) }).toEqual({ bad, v: false })
})

test('GG-16 a hash prefix finds the first loaded commit it starts', async () => {
  const hashes = ['aaaa1111', 'f46e2320', 'f46e9999']
  expect(findByHash(hashes, 'F46E')).toBe('f46e2320')
  expect(findByHash(hashes, 'f46e99')).toBe('f46e9999')
  expect(findByHash(hashes, 'dead')).toBeUndefined()
})
