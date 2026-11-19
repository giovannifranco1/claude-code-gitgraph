// The tree row where list row `index` starts, rows counted from the list's top.
export function topOf(heights: number[], index: number): number {
  let top = 0
  for (let i = 0; i < index; i++) top += heights[i] ?? 0
  return top
}

// The list rows [from, to) that meet the window (`offset`..`offset + bodyRows`,
// widened by `overscan`) of a tree whose list starts at tree row `start`; `before`
// and `after` are the heights of the rows left out, drawn as spacers.
export function visibleRange(
  heights: number[],
  start: number,
  offset: number,
  bodyRows: number,
  overscan: number,
): { from: number; to: number; before: number; after: number } {
  const lo = offset - overscan
  const hi = offset + bodyRows + overscan
  let top = start
  let from = heights.length
  let to = heights.length
  let before = 0
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i] ?? 0
    if (from === heights.length && top + h > lo) from = i
    if (from !== heights.length && top >= hi) {
      to = i
      break
    }
    if (from === heights.length) before += h
    top += h
  }
  const drawn = topOf(heights, to) - topOf(heights, from)
  const total = topOf(heights, heights.length)
  return { from, to, before, after: total - before - drawn }
}

export const isHashQuery = (query: string) => /^[0-9a-fA-F]{4,40}$/.test(query)

// The commit a search lands on: the hash prefix (a term that looks like one), the message or
// the author, case apart; of several, the first below `after` (the selected one), in a loop.
// `index` is its place among the `count` that match, from 1.
export function findCommit(
  commits: { hash: string; subject: string; author: string }[],
  query: string,
  after?: string,
): { hash: string; index: number; count: number } | undefined {
  const term = query.trim().toLowerCase()
  if (!term) return undefined
  const isHash = isHashQuery(term)
  const matches = commits.flatMap((c, at) =>
    (isHash && c.hash.startsWith(term)) || c.subject.toLowerCase().includes(term) || c.author.toLowerCase().includes(term) ? [at] : [],
  )
  if (!matches.length) return undefined
  const from = after === undefined ? -1 : commits.findIndex(c => c.hash === after)
  const next = matches.findIndex(at => at > from)
  const pick = next < 0 ? 0 : next
  return { hash: commits[matches[pick]!]!.hash, index: pick + 1, count: matches.length }
}

// Items of the given widths laid out in rows of at most `cols`, `gap` apart, in order:
// the indices of each row. An item wider than a row gets a row of its own.
export function wrapRows(widths: number[], cols: number, gap: number): number[][] {
  const rows: number[][] = []
  let used = 0
  widths.forEach((w, i) => {
    const row = rows[rows.length - 1]
    if (row && used + gap + w <= cols) {
      row.push(i)
      used += gap + w
    } else {
      rows.push([i])
      used = w
    }
  })
  return rows
}

// The graph cells the rows `from` (inclusive) to `to` (exclusive) need, at least 1: the
// graph column follows the rows in the window, not a wide stretch far off in the history.
export function widestIn(rows: { cells: { length: number } }[], from: number, to: number): number {
  return rows.slice(from, to).reduce((n, r) => Math.max(n, r.cells.length), 1)
}

// The rows the window [top, top + rows) shows over rows of `heights`: `from` to `to`
// (exclusive), and `shift`, the rows of the first one above the window.
export function windowAt(heights: number[], top: number, rows: number): { from: number; to: number; shift: number } {
  let at = 0
  let from = heights.length
  let shift = 0
  for (let i = 0; i < heights.length; i++) {
    const h = heights[i] ?? 0
    if (from === heights.length && at + h > top) {
      from = i
      shift = top - at
    }
    at += h
    if (at >= top + rows) return { from: Math.min(from, i), to: i + 1, shift }
  }
  return from === heights.length ? { from: 0, to: heights.length, shift: 0 } : { from, to: heights.length, shift }
}

// A window's first row, kept inside a graph `total` rows tall shown `rows` at a time.
export const clampTop = (top: number, total: number, rows: number) => Math.max(0, Math.min(top, total - rows))
