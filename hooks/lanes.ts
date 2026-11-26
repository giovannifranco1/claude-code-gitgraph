import type { Cell, Commit } from '../types'
import { firstParentLine, isStashRow, UNCOMMITTED } from './log'

// A row's node: a commit, the uncommitted changes, a stash.
export const NODES = new Set(['●', '○', '◇'])

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

// The checked-out line: the first-parent chain from HEAD over the commits given, from the
// uncommitted changes when they are a row (their parent is HEAD). Empty without a HEAD here.
function trunkOf(commits: Commit[], head: string): Set<string> {
  const byHash = new Map(commits.map(c => [c.hash, c]))
  return firstParentLine(byHash, byHash.has(UNCOMMITTED) ? UNCOMMITTED : head, new Set())
}

// One row of glyphs per commit, two characters per lane: the lane's glyph, then
// a horizontal or a space. Lanes hold the hash they expect next; each lane cell
// is drawn from the directions it connects to, so crossings need no special case.
// Colors are indexes into a palette of `size`: a new lane takes the next one in turn that
// no open lane holds, so a branch never shares the color of the one it forks from.
// With `head`, the checked-out line keeps the first lane, top to bottom (as VS Code's Git Graph
// draws it): its commits go nowhere else, the others start from the second lane, and a lane
// whose next commit is on the line joins it at that commit, as any lanes converge; a parent that
// is the line's next commit goes straight to the first lane (only that one: an older one there
// would take the lane before the commits above it).
export function layout(commits: Commit[], size = 8, head = ''): Cell[][] {
  const trunk = trunkOf(commits, head)
  const base = trunk.size > 0 ? 1 : 0
  const lanes: (string | null)[] = base ? [null] : []
  const line = commits.filter(c => trunk.has(c.hash)).map(c => c.hash)
  let next = 0
  const colors: number[] = []
  let nextColor = 0
  const colorOf = (i: number) => colors[i] ?? 0
  // Called before the new lane is set: the open ones are those still holding a hash.
  const pick = () => {
    const open = new Set(lanes.flatMap((hash, i) => (hash != null ? [colorOf(i)] : [])))
    let color = nextColor % size
    for (let n = 0; n < size && open.has(color); n++) color = (color + 1) % size
    nextColor = color + 1
    return color
  }

  const open = (lane: number, hash: string) => {
    colors[lane] = pick()
    lanes[lane] = hash
  }

  return commits.map(commit => {
    const before = [...lanes]
    // The first lane holds nothing but the line, so a commit of it is either expected there or opens it.
    let col = trunk.has(commit.hash) ? 0 : lanes.indexOf(commit.hash)
    if (col < 0) col = free(lanes, base)
    if (lanes[col] !== commit.hash) open(col, commit.hash)
    if (col === 0) next++
    // A parent the first lane waits for: the line's next commit, while nothing holds that lane.
    const toLine = (parent: string) => col !== 0 && parent === line[next] && lanes[0] == null

    // Lanes joined to the commit's dot by a horizontal: converging children, extra parents.
    const links: number[] = []
    lanes.forEach((hash, i) => {
      if (i !== col && hash === commit.hash) {
        lanes[i] = null
        links.push(i)
      }
    })
    const [first = null, ...rest] = commit.parents
    lanes[col] = first
    if (first !== null && toLine(first)) {
      lanes[col] = null
      open(0, first)
      links.push(0)
    }
    for (const parent of rest) {
      let lane = toLine(parent) ? 0 : lanes.indexOf(parent)
      if (lane === 0 && lanes[0] == null) open(0, parent)
      if (lane < 0 || lane === col) {
        lane = free(lanes, Math.max(col + 1, base))
        open(lane, parent)
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
    cells[col * 2] = { ch: commit.hash === UNCOMMITTED ? '○' : isStashRow(commit.hash) ? '◇' : '●', color: colorOf(col) }

    while (cells.length && cells[cells.length - 1]?.ch === ' ') cells.pop()
    while (lanes.length > base && lanes[lanes.length - 1] === null) lanes.pop()
    return cells
  })
}
