import type { Commit, CommitDetail, FileStat, Ref } from '../types'
import { branchOf } from './badges'

// Every ref with its commit, `<oid> <refname>` a line; the merged query reads the same format.
export const REFS_ARGS = ['for-each-ref', '--format=%(objectname) %(refname)']

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

export function parseStatus(stdout: string): { head: string; branch: string; dirty: number; conflicts: number } {
  const header = (name: string) => statusHeader(stdout, name)
  const head = header('oid')
  const branch = header('head')
  return {
    head: head === '(initial)' ? '' : head,
    branch: branch === '(detached)' ? '' : branch,
    dirty: stdout.split('\n').filter(l => l !== '' && !l.startsWith('#')).length,
    conflicts: stdout.split('\n').filter(l => l.startsWith('u ')).length,
  }
}

// The checked-out branch's upstream remote and the commits it is ahead of and behind it, from
// `git status --porcelain=v2 --branch`; null where it has no upstream (not published).
export function parseSync(stdout: string): { remote: string; ahead: number; behind: number } | null {
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

// The dead remotes in that query's output (`<oid> refs/remotes/<remote>/<branch>`): not a base,
// not `<remote>/HEAD`, and not on a base's tip (a branch just started is merged, not dead).
// `refs` is the `for-each-ref` of every ref, for the bases' tips.
export function parseMerged(stdout: string, refs: string, bases: string[]): string[] {
  const isBase = (ref: string) => bases.some(b => ref === `refs/heads/${b}` || (ref.startsWith('refs/remotes/') && branchOf(ref.slice('refs/remotes/'.length)) === b))
  const lines = (text: string) => text.split('\n').flatMap(l => { const at = l.indexOf(' '); return at > 0 ? [[l.slice(0, at), l.slice(at + 1)] as const] : [] })
  const tips = new Set(lines(refs).filter(([, ref]) => isBase(ref)).map(([oid]) => oid))
  return lines(stdout).flatMap(([oid, ref]) => {
    const name = ref.replace(/^refs\/remotes\//, '')
    const branch = branchOf(name)
    return bases.includes(branch) || branch === 'HEAD' || tips.has(oid) ? [] : [name]
  })
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

export function parseDetail(stdout: string): CommitDetail | null {
  const cut = stdout.indexOf(RS)
  if (cut < 0) return null
  const [hash = '', author = '', email = '', time = '0', ...body] = stdout.slice(0, cut).split(US)
  const files = stdout
    .slice(cut + 1)
    .split('\n')
    .map(stat)
    .filter((f): f is FileStat => f !== null)
  return { hash, author, email, time: Number(time), body: body.join(US).trim(), files }
}
