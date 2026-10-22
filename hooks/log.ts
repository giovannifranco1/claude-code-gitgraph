import type { Commit, CommitDetail, FileStat, Ref } from '../types'

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
export function parseStatus(stdout: string): { head: string; branch: string; dirty: number } {
  const header = (name: string) => stdout.match(new RegExp(`^# branch\\.${name} (.+)$`, 'm'))?.[1] ?? ''
  const head = header('oid')
  const branch = header('head')
  return {
    head: head === '(initial)' ? '' : head,
    branch: branch === '(detached)' ? '' : branch,
    dirty: stdout.split('\n').filter(l => l !== '' && !l.startsWith('#')).length,
  }
}

// Remote names, read from `git for-each-ref` lines (`<oid> refs/remotes/<remote>/<branch>`).
export function remotesOf(forEachRef: string): string[] {
  const names = [...forEachRef.matchAll(/ refs\/remotes\/([^/\n]+)\//g)].map(m => m[1] ?? '')
  return [...new Set(names)]
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
