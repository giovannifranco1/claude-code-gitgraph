import type { Cell, Commit } from '../types'
import { UNCOMMITTED } from './log'

const UP = 1
const DOWN = 2
const LEFT = 4
const RIGHT = 8

// The box-drawing glyph for the directions a lane cell connects to.
const GLYPH: Record<number, string> = {
  [UP]: '│', [DOWN]: '│', [UP | DOWN]: '│',
  [LEFT]: '─', [RIGHT]: '─', [LEFT | RIGHT]: '─',
  [UP | LEFT]: '╯', [UP | RIGHT]: '╰', [DOWN | LEFT]: '╮', [DOWN | RIGHT]: '╭',
  [UP | DOWN | LEFT]: '┤', [UP | DOWN | RIGHT]: '├',
  [UP | LEFT | RIGHT]: '┴', [DOWN | LEFT | RIGHT]: '┬',
  [UP | DOWN | LEFT | RIGHT]: '┼',
}

function free(lanes: (string | null)[], from: number): number {
  const i = lanes.indexOf(null, from)
  return i < 0 ? Math.max(lanes.length, from) : i
}

// One row of glyphs per commit, two characters per lane: the lane's glyph, then
// a horizontal or a space. Lanes hold the hash they expect next; each lane cell
// is drawn from the directions it connects to, so crossings need no special case.
export function layout(commits: Commit[]): Cell[][] {
  const lanes: (string | null)[] = []
  const colors: number[] = []
  let nextColor = 0
  const colorOf = (i: number) => colors[i] ?? 0

  return commits.map(commit => {
    const before = [...lanes]
    let col = lanes.indexOf(commit.hash)
    if (col < 0) {
      col = free(lanes, 0)
      lanes[col] = commit.hash
      colors[col] = nextColor++
    }

    // Lanes joined to the commit's dot by a horizontal: converging children, extra parents.
    const links: number[] = []
    lanes.forEach((hash, i) => {
      if (i !== col && hash === commit.hash) {
        lanes[i] = null
        links.push(i)
      }
    })
    lanes[col] = commit.parents[0] ?? null
    for (const parent of commit.parents.slice(1)) {
      let lane = lanes.indexOf(parent)
      if (lane < 0 || lane === col) {
        lane = free(lanes, col + 1)
        lanes[lane] = parent
        colors[lane] = nextColor++
      }
      links.push(lane)
    }

    const width = Math.max(lanes.length, before.length, col + 1)
    const dirs = Array.from({ length: width }, (_, i) => (before[i] != null ? UP : 0) | (lanes[i] != null ? DOWN : 0))
    const cells: Cell[] = Array.from({ length: width * 2 }, (_, p) => ({ ch: ' ', color: colorOf(p >> 1) }))
    for (const lane of links) {
      const [lo, hi] = lane < col ? [lane, col] : [col, lane]
      for (let i = lo; i <= hi; i++) dirs[i] = (dirs[i] ?? 0) | (i > lo ? LEFT : 0) | (i < hi ? RIGHT : 0)
      for (let p = lo * 2 + 1; p < hi * 2; p += 2) cells[p] = { ch: '─', color: colorOf(lane) }
    }
    dirs.forEach((d, i) => {
      if (d) cells[i * 2] = { ch: GLYPH[d] ?? ' ', color: colorOf(i) }
    })
    cells[col * 2] = { ch: commit.hash === UNCOMMITTED ? '○' : '●', color: colorOf(col) }

    while (cells.length && cells[cells.length - 1]?.ch === ' ') cells.pop()
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop()
    return cells
  })
}
