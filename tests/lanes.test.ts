import { expect, test } from 'claude-code/testing'

import type { Cell, Commit } from '../types'
import { layout } from '../hooks/lanes'
import { UNCOMMITTED } from '../hooks/log'

const c = (hash: string, ...parents: string[]): Commit => ({ hash, parents, refs: [], author: '', time: 0, subject: hash })
const draw = (rows: Cell[][]) => rows.map(r => r.map(x => x.ch).join(''))
const colorsOf = (row: Cell[] | undefined) => (row ?? []).filter(x => x.ch !== ' ').map(x => x.color)

test('GG-03 a linear history is one lane of dots', async () => {
  expect(draw(layout([c('a', 'b'), c('b', 'c'), c('c')]))).toEqual(['●', '●', '●'])
})

test('GG-03 a merge opens a lane to the right and the fork closes it', async () => {
  const rows = layout([c('m', 'a', 'b'), c('a', 'r'), c('b', 'r'), c('r')])
  expect(draw(rows)).toEqual(['●─╮', '● │', '│ ●', '●─╯'])
  expect(colorsOf(rows[0])).toEqual([0, 1, 1])
  expect(colorsOf(rows[3])).toEqual([0, 1, 1])
})

test('GG-03 two branch tips converge on their common parent', async () => {
  expect(draw(layout([c('x', 'r'), c('y', 'r'), c('r')]))).toEqual(['●', '│ ●', '●─╯'])
})

test('GG-03 a merge into a lane on the left crosses lanes between', async () => {
  const rows = layout([c('x', 'r'), c('y', 's'), c('m', 'a', 'r'), c('a', 'r'), c('s', 'r'), c('r')])
  expect(draw(rows)).toEqual(['●', '│ ●', '├─┼─●', '│ │ ●', '│ ● │', '●─┴─╯'])
})

test('GG-03 a lane that ends where a merge opens a new one is drawn as a junction', async () => {
  // t and w both sit on m; m merges h. Lane 1 brings w down into m and takes h onwards.
  const rows = layout([c('t', 'm'), c('w', 'm'), c('m', 'a', 'h'), c('h', 'a'), c('a')])
  expect(draw(rows)).toEqual(['●', '│ ●', '●─┤', '│ ●', '●─╯'])
})

test('GG-03 each lane keeps its color and a freed column gets a new one', async () => {
  const rows = layout([c('a'), c('b')])
  expect(draw(rows)).toEqual(['●', '●'])
  expect(colorsOf(rows[0])).toEqual([0])
  expect(colorsOf(rows[1])).toEqual([1])
})

test('GG-07 the uncommitted pseudo-commit is a hollow dot', async () => {
  expect(draw(layout([c(UNCOMMITTED, 'h'), c('h')]))).toEqual(['○', '●'])
})
