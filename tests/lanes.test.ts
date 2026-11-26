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

test('SH-01 a stash is a diamond on a lane off its base commit', async () => {
  expect(draw(layout([c('a', 'b'), c('stash@{0}', 'b'), c('b')]))).toEqual(['●', '│ ◇', '●─╯'])
})

test('GG-07 the uncommitted pseudo-commit is a hollow dot', async () => {
  expect(draw(layout([c(UNCOMMITTED, 'h'), c('h')]))).toEqual(['○', '●'])
})

test('LC-01 a new lane never takes the color of a lane still open, even past the palette', async () => {
  // main (lane 0) stays open while eight short branches open and close one after another
  const commits: Commit[] = [c('m0', 'm1')]
  for (let i = 1; i <= 9; i++) commits.push(c(`b${i}`, `m${i}`), c(`m${i}`, `m${i + 1}`))
  commits.push(c('m10'))
  const rows = layout(commits, 8)
  const dot = (row: Cell[] | undefined) => (row ?? []).find(x => x.ch === '●')?.color
  const main = dot(rows[0])
  for (let i = 1; i <= 9; i++) {
    const branch = dot(rows[2 * i - 1])
    expect(branch).not.toBe(main)
    expect(branch).toBeLessThan(8)
  }
})

test('GG-03 the checked-out line keeps the first lane; a base moved on past it goes to the second and joins it below', async () => {
  // develop's d2 is newer than the checked-out f1, both off d1
  const commits = [c('d2', 'd1'), c('f1', 'd1'), c('d1', 'd0'), c('d0')]
  expect(draw(layout(commits))).toEqual(['●', '│ ●', '●─╯', '●'])
  expect(draw(layout(commits, 8, 'f1'))).toEqual(['  ●', '● │', '●─╯', '●'])
  // the uncommitted changes sit on the line too
  expect(draw(layout([c('d2', 'd1'), c(UNCOMMITTED, 'f1'), c('f1', 'd1'), c('d1')], 8, 'f1'))).toEqual(['  ●', '○ │', '● │', '●─╯'])
  // HEAD on top, or none here: as before
  expect(draw(layout(commits, 8, 'd2'))).toEqual(['●', '│ ●', '●─╯', '●'])
  expect(draw(layout(commits, 8, 'gone'))).toEqual(['●', '│ ●', '●─╯', '●'])
})

test('GG-03 a parent that is the line\'s next commit goes straight to the first lane; an older one waits for the commits above it', async () => {
  // develop's d2 merges the checked-out f1: f1 is next on the line
  expect(draw(layout([c('d2', 'd1', 'f1'), c('f1', 'd1'), c('d1')], 8, 'f1'))).toEqual(['╭─●', '● │', '●─╯'])
  // a branch off the checked-out tip
  expect(draw(layout([c('x1', 'f2'), c('f2', 'f1'), c('f1')], 8, 'f2'))).toEqual(['╭─●', '●', '●'])
  // d3 merges a1, and b1 is checked out: d1, d3's line's parent, is not next (b1 is), so it waits
  const rows = layout([c('d3', 'd2', 'a1'), c('a1', 'd1'), c('b1', 'd1'), c('d2', 'd1'), c('d1', 'd0'), c('d0')], 8, 'b1')
  expect(draw(rows)).toEqual(['  ●─╮', '  │ ●', '● │ │', '│ ● │', '●─┴─╯', '●'])
})
