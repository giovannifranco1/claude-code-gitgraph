import type { Change, Commit, CommitDetail, FileStat, Merged, Ref, Stash, Track } from '../types'
import { branchOf } from './badges'

// Every ref with its commit, `<oid> <refname>` a line: what the poll compares, and the format the
// merged query reads too.
export const REFS_ARGS = ['for-each-ref', '--format=%(objectname) %(refname)']

// Each local branch and how far it is from its upstream (`<branch>\tahead 2, behind 1`; empty in
// step or without one). Read on a load only: counting is a walk the 5s poll must not pay.
export const TRACK_ARGS = ['for-each-ref', '--format=%(refname:short)%09%(upstream:track,nobracket)', 'refs/heads']

const US = '\x1f'
const RS = '\x1e'

export const LOG_FORMAT = '--format=%H%x1f%P%x1f%D%x1f%an%x1f%at%x1f%s%x1e'
export const DETAIL_FORMAT = '--format=%H%x1f%an%x1f%ae%x1f%at%x1f%B%x1e'
export const UNCOMMITTED = '*'

export function parseRefs(decorations: string, remotes: string[] = ['origin']): Ref[] {
  const refs: Ref[] = []
  for (const raw of decorations.split(', ')) {
    const part = raw.trim()
    if (!part) continue
    if (part.startsWith('tag: ')) refs.push({ kind: 'tag', name: part.slice(5) })
    else if (part === 'HEAD') refs.push({ kind: 'head', name: 'HEAD' })
    else if (part.startsWith('HEAD -> ')) refs.push({ kind: 'head', name: part.slice(8) })
    else if (part.includes(' -> ')) refs.push({ kind: 'remote', name: part.split(' -> ')[1] ?? part })
    else if (remotes.some(r => part === `${r}/HEAD`)) continue // a remote's default-branch pointer, not a branch
    else if (remotes.some(r => part.startsWith(`${r}/`))) refs.push({ kind: 'remote', name: part })
    else refs.push({ kind: 'branch', name: part })
  }
  return refs
}

export function parseLog(stdout: string, remotes?: string[]): Commit[] {
  const commits: Commit[] = []
  for (const record of stdout.split(RS)) {
    const fields = record.replace(/^\n/, '').split(US)
    const [hash, parents = '', refs = '', author = '', time = '0', subject = ''] = fields
    if (!hash || fields.length < 6) continue
    commits.push({
      hash,
      parents: parents.split(' ').filter(Boolean),
      refs: parseRefs(refs, remotes),
      author,
      time: Number(time),
      subject,
    })
  }
  return commits
}

// `git status --porcelain=v2 --branch`: headers start with `#`, every other line is a change.
// A `# branch.<name> <value>` header of `git status --porcelain=v2 --branch`; '' when absent.
const statusHeader = (stdout: string, name: string) => stdout.match(new RegExp(`^# branch\\.${name} (.+)$`, 'm'))?.[1] ?? ''

export function parseStatus(stdout: string): { head: string; branch: string; dirty: number; staged: number; conflicts: number } {
  const header = (name: string) => statusHeader(stdout, name)
  const head = header('oid')
  const branch = header('head')
  return {
    head: head === '(initial)' ? '' : head,
    branch: branch === '(detached)' ? '' : branch,
    dirty: countChanges(stdout),
    staged: parseChanges(stdout).filter(c => c.isStaged).length,
    conflicts: conflictedFiles(stdout).length,
  }
}

// The uncommitted changes, file by file, from `git status --porcelain=v2`: `1 XY … path` (X the
// index, Y the worktree; `.` unchanged), `2 XY … score path<TAB>from` (renamed), `? path`
// (untracked: new), `u XY … path` (unmerged).
export function parseChanges(stdout: string): Change[] {
  return stdout.split('\n').flatMap((line): Change[] => {
    const fields = line.split(' ')
    const [kind = '', xy = ''] = fields
    const x = xy[0] ?? '.'
    const y = xy[1] ?? '.'
    if (kind === '?') return [{ path: line.slice(2), code: 'A', isStaged: false }]
    if (kind === 'u') return [{ path: fields.slice(10).join(' '), code: 'U', isStaged: false }]
    if (kind === '2') {
      const [path = '', from = ''] = fields.slice(9).join(' ').split('\t')
      return [{ path, from, code: 'R', isStaged: x !== '.' }]
    }
    if (kind !== '1') return []
    const code = x === 'A' ? 'A' : x === 'D' || y === 'D' ? 'D' : 'M'
    return [{ path: fields.slice(8).join(' '), code, isStaged: x !== '.' }]
  })
}

// How many files a status changed: its lines, headers (`#`) left out.
export const countChanges = (stdout: string) => stdout.split('\n').filter(l => l.trim() !== '' && !l.startsWith('#')).length

// The files a merge, rebase or apply left in conflict (unmerged, `u` lines of the status).
export const conflictedFiles = (stdout: string) => parseChanges(stdout).filter(c => c.code === 'U').map(c => c.path)

// The checked-out branch's upstream remote and the commits it is ahead of and behind it, from
// `git status --porcelain=v2 --branch`; null where it has no upstream (not published).
export function parseSync(stdout: string): (Track & { remote: string }) | null {
  const upstream = statusHeader(stdout, 'upstream')
  if (!upstream) return null
  const ab = /^\+(\d+) -(\d+)$/.exec(statusHeader(stdout, 'ab'))
  return { remote: upstream.split('/')[0] ?? '', ahead: Number(ab?.[1] ?? 0), behind: Number(ab?.[2] ?? 0) }
}

// Local branch names, read from `git for-each-ref` lines (`<oid> refs/heads/<branch>`).
export function localsOf(forEachRef: string): string[] {
  return [...forEachRef.matchAll(/ refs\/heads\/(.+)$/gm)].map(m => m[1] ?? '')
}

// Remote names, read from `git for-each-ref` lines (`<oid> refs/remotes/<remote>/<branch>`).
export function remotesOf(forEachRef: string): string[] {
  const names = [...forEachRef.matchAll(/ refs\/remotes\/([^/\n]+)\//g)].map(m => m[1] ?? '')
  return [...new Set(names)]
}

// The query for the remote branches merged into a base (`--merged`s are an OR), over the bases
// that exist here (git refuses an unknown one); null with none.
export function mergedArgs(bases: string[], locals: string[]): string[] | null {
  const here = bases.filter(b => locals.includes(b))
  return here.length ? [...REFS_ARGS, ...here.map(b => `--merged=refs/heads/${b}`), 'refs/remotes'] : null
}

// The merged remotes in that query's output (`<oid> refs/remotes/<remote>/<branch>`), by name to
// their tip: not a base, not `<remote>/HEAD`; and the bases' tips (local and remote), from `refs`,
// the `for-each-ref` of every ref. Which of them are dead is deadOf's call, over the loaded rows.
export function parseMerged(stdout: string, refs: string, bases: string[]): Merged {
  const isBase = (ref: string) => bases.some(b => ref === `refs/heads/${b}` || (ref.startsWith('refs/remotes/') && branchOf(ref.slice('refs/remotes/'.length)) === b))
  const lines = (text: string) => text.split('\n').flatMap(l => { const at = l.indexOf(' '); return at > 0 ? [[l.slice(0, at), l.slice(at + 1)] as const] : [] })
  const tips = [...new Set(lines(refs).filter(([, ref]) => isBase(ref)).map(([oid]) => oid))]
  const remotes = Object.fromEntries(lines(stdout).flatMap(([oid, ref]) => {
    const name = ref.replace(/^refs\/remotes\//, '')
    const branch = branchOf(name)
    return bases.includes(branch) || branch === 'HEAD' ? [] : [[name, oid] as const]
  }))
  return { remotes, tips }
}

// Adds to `line` the loaded commits from `start` down its first parents, stopping at one already
// there or not loaded.
export function firstParentLine(byHash: Map<string, Commit>, start: string, line: Set<string>): Set<string> {
  for (let at: string | undefined = start; at && byHash.has(at) && !line.has(at); at = byHash.get(at)?.parents[0]) line.add(at)
  return line
}

// The merged remotes that are dead: finished into a base, their tip off every base's first-parent
// line. One started on a base and pushed with no commit of its own sits on that line: merged
// (its tip is in the base), but not finished, so not dead, however far the base has moved on.
// A finish (git flow, --no-ff) leaves the tip a second parent of the base's merge commit, off the
// line. The line is walked over the loaded rows: a tip past them has no row to draw on anyway.
export function deadOf(merged: Merged | undefined, rows: Commit[]): Set<string> {
  if (!merged || Object.keys(merged.remotes).length === 0) return new Set()
  const byHash = new Map(rows.map(c => [c.hash, c]))
  const line = new Set<string>()
  for (const tip of merged.tips) firstParentLine(byHash, tip, line)
  return new Set(Object.entries(merged.remotes).flatMap(([name, oid]) => (line.has(oid) ? [] : [name])))
}

// How far each local branch is ahead of and behind its upstream, from TRACK_ARGS: only the
// branches off by some (in step, gone or without one are left out).
export function parseTracks(stdout: string): Record<string, Track> {
  const tracks: Record<string, Track> = {}
  for (const line of stdout.split('\n')) {
    const [branch = '', track = ''] = line.split('\t')
    const count = (word: string) => Number(new RegExp(`${word} (\\d+)`).exec(track)?.[1] ?? 0)
    const ahead = count('ahead')
    const behind = count('behind')
    if (branch && (ahead || behind)) tracks[branch] = { ahead, behind }
  }
  return tracks
}

// Every stash: its commit, parents (the first is the commit it was made on), time, name, message.
export const STASH_ARGS = ['stash', 'list', '--format=%H%x1f%P%x1f%at%x1f%gd%x1f%s%x1e']

export function parseStashes(stdout: string): Stash[] {
  const stashes: Stash[] = []
  for (const record of stdout.split(RS)) {
    const fields = record.replace(/^\n/, '').split(US)
    const [hash, parents = '', time = '0', name = '', subject = ''] = fields
    const base = parents.split(' ')[0]
    if (!hash || !base || fields.length < 5) continue
    stashes.push({ hash, base, time: Number(time), name, subject })
  }
  return stashes
}

// A stash's row goes by its name (`stash@{0}`), so it is told from a commit by its hash alone.
export const isStashRow = (hash: string) => hash.startsWith('stash@{')

// The rows of no log commit, the uncommitted changes and the stashes: they have no `git show`,
// and on a docked terminal pane they float as a dialog.
export const isPseudoRow = (hash: string | null) => hash !== null && (hash === UNCOMMITTED || isStashRow(hash))

// Each stash as a row off its base commit alone (its index and untracked commits are git's
// bookkeeping): among the commits by date, never below its base; left out while its base is not
// loaded. Of those at one place, the newer (lower `stash@{N}`) goes above.
export function withStashes(commits: Commit[], stashes: Stash[]): Commit[] {
  const index = new Map(commits.map((c, i) => [c.hash, i]))
  const placed = stashes
    .flatMap((s, n) => {
      const base = index.get(s.base)
      if (base === undefined) return []
      let at = 0
      while (at < base && (commits[at]?.time ?? 0) > s.time) at++
      return [{ at, n, row: { hash: s.name, parents: [s.base], refs: [], author: '', time: s.time, subject: s.subject } }]
    })
    .sort((a, b) => a.at - b.at || a.n - b.n)
  const rows: Commit[] = []
  let next = 0
  commits.forEach((commit, i) => {
    for (; placed[next]?.at === i; next++) rows.push(placed[next]!.row)
    rows.push(commit)
  })
  return rows
}

export function withUncommitted(commits: Commit[], head: string, dirty: number): Commit[] {
  if (dirty <= 0) return commits
  const pseudo: Commit = {
    hash: UNCOMMITTED,
    parents: head ? [head] : [],
    refs: [],
    author: '',
    time: 0,
    subject: `Uncommitted changes (${dirty})`,
  }
  return [pseudo, ...commits]
}

function stat(line: string): FileStat | null {
  const [adds, dels, ...path] = line.split('\t')
  if (adds === undefined || dels === undefined || path.length === 0) return null
  const num = (s: string) => (s === '-' ? null : Number(s))
  return { path: path.join('\t'), adds: num(adds), dels: num(dels) }
}

// A stash's files with their counts, untracked ones too.
export const stashShowArgs = (name: string) => ['stash', 'show', '--numstat', '--include-untracked', name]

// `--numstat` lines as files.
export const parseNumstat = (stdout: string): FileStat[] => stdout.split('\n').map(stat).filter((f): f is FileStat => f !== null)

// What a row's detail reads: a commit's `git show`, a stash's `git stash show`.
export const detailArgs = (hash: string) => (isStashRow(hash) ? stashShowArgs(hash) : ['show', '--numstat', '--diff-merges=first-parent', DETAIL_FORMAT, hash])

// A row's detail from what `detailArgs` printed; a stash has no author line, its message the body.
export const detailOf = (commit: Commit, stdout: string): CommitDetail | null =>
  isStashRow(commit.hash) ? { hash: commit.hash, author: '', email: '', time: commit.time, body: commit.subject, files: parseNumstat(stdout) } : parseDetail(stdout)

export function parseDetail(stdout: string): CommitDetail | null {
  const cut = stdout.indexOf(RS)
  if (cut < 0) return null
  const [hash = '', author = '', email = '', time = '0', ...body] = stdout.slice(0, cut).split(US)
  const files = parseNumstat(stdout.slice(cut + 1))
  return { hash, author, email, time: Number(time), body: body.join(US).trim(), files }
}
