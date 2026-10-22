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

export function findByHash(hashes: string[], query: string): string | undefined {
  const prefix = query.toLowerCase()
  return hashes.find(h => h.startsWith(prefix))
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
