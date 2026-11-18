import { expect, test } from 'claude-code/testing'

import { clampTop, findByHash, isHashQuery, topOf, visibleRange, widestIn, windowAt, wrapRows } from '../hooks/virtual'

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

test('GF-01 bar items wrap onto the next row when the pane is too narrow', async () => {
  expect(wrapRows([1, 9, 8], 30, 2)).toEqual([[0, 1, 2]])
  expect(wrapRows([1, 9, 8, 9, 8], 25, 2)).toEqual([[0, 1, 2], [3, 4]])
  expect(wrapRows([1, 40, 3], 20, 2)).toEqual([[0], [1], [2]])
  expect(wrapRows([], 20, 2)).toEqual([])
})

test('GG-20 the graph column is as wide as the rows in the window need, not the widest loaded', async () => {
  const rows = [3, 3, 9, 9, 3, 2].map(n => ({ cells: Array.from({ length: n }) }))
  expect(widestIn(rows, 0, 2)).toBe(3)
  expect(widestIn(rows, 1, 4)).toBe(9)
  expect(widestIn(rows, 4, 6)).toBe(3)
  expect(widestIn([], 0, 0)).toBe(1)
})

test('GG-21 the rows a window over the graph shows, and how far its first row is scrolled into', async () => {
  const heights = [1, 1, 5, 1, 1]
  expect(windowAt(heights, 0, 3)).toEqual({ from: 0, to: 3, shift: 0 })
  // a tall row (an open commit) cut at the top: two of its rows above the window
  expect(windowAt(heights, 4, 3)).toEqual({ from: 2, to: 3, shift: 2 })
  expect(windowAt(heights, 6, 3)).toEqual({ from: 2, to: 5, shift: 4 })
  expect(windowAt([], 0, 3)).toEqual({ from: 0, to: 0, shift: 0 })
})

test('GG-21 a scroll keeps the window inside the graph', async () => {
  expect(clampTop(-3, 20, 5)).toBe(0)
  expect(clampTop(7, 20, 5)).toBe(7)
  expect(clampTop(30, 20, 5)).toBe(15)
  expect(clampTop(4, 3, 5)).toBe(0)
})
