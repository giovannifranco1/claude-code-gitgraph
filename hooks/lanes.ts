import type { Cell, Commit } from '../types'
import { UNCOMMITTED } from './log'

type Link = { lane: number; kind: 'end' | 'new' | 'join'; color: number }

const CORNER = {
  end: { right: '╯', left: '╰', through: '┴' },
  new: { right: '╮', left: '╭', through: '┬' },
  join: { right: '┤', left: '├', through: '┼' },
}

function free(lanes: (string | null)[], from: number): number {
  const i = lanes.indexOf(null, from)
  return i < 0 ? Math.max(lanes.length, from) : i
}

// One row of glyphs per commit, two characters per lane: the lane's glyph, then
// a horizontal or a space. Lanes hold the hash they expect next.
export function layout(commits: Commit[]): Cell[][] {
  const lanes: (string | null)[] = []
  const colors: number[] = []
  let nextColor = 0
  const rows: Cell[][] = []

  for (const commit of commits) {
    const before = [...lanes]
    let col = lanes.indexOf(commit.hash)
    if (col < 0) {
      col = free(lanes, 0)
      lanes[col] = commit.hash
      colors[col] = nextColor++
    }

    const links: Link[] = []
    lanes.forEach((hash, i) => {
      if (i !== col && hash === commit.hash) {
        lanes[i] = null
        links.push({ lane: i, kind: 'end', color: colors[i] ?? 0 })
      }
    })
    lanes[col] = commit.parents[0] ?? null
    for (const parent of commit.parents.slice(1)) {
      const at = lanes.indexOf(parent)
      if (at >= 0 && at !== col) {
        links.push({ lane: at, kind: 'join', color: colors[at] ?? 0 })
        continue
      }
      const lane = free(lanes, col + 1)
      lanes[lane] = parent
      colors[lane] = nextColor++
      // A column freed by a lane that ended on this row already has a line from above.
      const endedHere = links.findIndex(l => l.lane === lane && l.kind === 'end')
      if (endedHere >= 0) links.splice(endedHere, 1)
      links.push({ lane, kind: endedHere >= 0 ? 'join' : 'new', color: colors[lane] ?? 0 })
    }

    const width = Math.max(lanes.length, before.length, col + 1)
    const cells: Cell[] = Array.from({ length: width * 2 }, () => ({ ch: ' ', color: 0 }))
    const ended = new Set(links.filter(l => l.kind === 'end').map(l => l.lane))
    before.forEach((hash, i) => {
      if (hash !== null && hash !== undefined && i !== col && !ended.has(i)) cells[i * 2] = { ch: '│', color: colors[i] ?? 0 }
    })
    cells[col * 2] = { ch: commit.hash === UNCOMMITTED ? '○' : '●', color: colors[col] ?? 0 }

    const covered = new Set<number>()
    for (const link of links) {
      const [lo, hi] = link.lane < col ? [link.lane, col] : [col, link.lane]
      for (let p = lo * 2 + 1; p < hi * 2; p++) {
        const lanePos = p % 2 === 0
        if (lanePos) covered.add(p / 2)
        cells[p] = { ch: lanePos && cells[p]?.ch === '│' ? '┼' : '─', color: link.color }
      }
    }
    for (const link of links) {
      const glyph = CORNER[link.kind]
      const ch = covered.has(link.lane) ? glyph.through : link.lane > col ? glyph.right : glyph.left
      cells[link.lane * 2] = { ch, color: link.color }
    }

    while (cells.length && cells[cells.length - 1]?.ch === ' ') cells.pop()
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop()
    rows.push(cells)
  }
  return rows
}
