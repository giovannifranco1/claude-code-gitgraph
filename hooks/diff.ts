// A file's diff for the diff screen: what git is asked, and its output as lines to draw.
import type { DiffLine, DiffSource } from '../types'
import { short } from './format'

// Plain text whatever the user's config: no colors, no external diff tool.
const PLAIN = ['--no-color', '--no-ext-diff']

// The lines the screen draws at most: past them, it counts the rest.
export const MAX_DIFF_LINES = 1500

// The git runs for a file's diff, the first that prints something wins: a commit's against its
// first parent (a merge's too, as its diffstat); a stash's against the commit it was made on,
// or, for a file new in the stash (kept in its untracked commit), that file whole.
export function diffRuns(source: DiffSource, path: string): string[][] {
  if (source.kind === 'commit') return [['show', '--format=', '--diff-merges=first-parent', ...PLAIN, source.hash, '--', path]]
  return [
    ['diff', ...PLAIN, `${source.name}^1`, source.name, '--', path],
    ['show', '--format=', ...PLAIN, `${source.name}^3`, '--', path],
  ]
}

// Where the diff is from, as the screen names it.
export const sourceLabel = (source: DiffSource) => (source.kind === 'commit' ? short(source.hash) : source.name)

// Which file a diff is of: what tells the screen's lines from a run for another file.
export const diffKey = (source: DiffSource, path: string) => `${source.kind === 'commit' ? source.hash : source.name}\0${path}`

// The hunks of a diff, git's headers (`diff --git`, `index`, `---`, `+++`, modes) left out; the
// first MAX_DIFF_LINES of them, the rest only counted in `hidden`.
export function parseDiff(stdout: string): { lines: DiffLine[]; hidden: number } {
  const lines: DiffLine[] = []
  let hidden = 0
  let isInHunk = false
  const push = (kind: DiffLine['kind'], text: string) => (lines.length < MAX_DIFF_LINES ? lines.push({ kind, text }) : hidden++)
  for (const text of stdout.split('\n')) {
    if (text.startsWith('diff --git')) isInHunk = false
    else if (text.startsWith('@@')) {
      isInHunk = true
      push('hunk', text)
    } else if (!isInHunk) {
      if (text.startsWith('Binary files')) push('note', 'Binary file: no text diff to show')
    } else if (text.startsWith('+')) push('add', text)
    else if (text.startsWith('-')) push('del', text)
    else if (text.startsWith('\\')) push('note', text)
    else if (text !== '') push('ctx', text)
  }
  return lines.length ? { lines, hidden } : { lines: [{ kind: 'note', text: 'No changes to show' }], hidden: 0 }
}
