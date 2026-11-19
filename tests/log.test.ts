import { expect, test } from 'claude-code/testing'

import type { Commit } from '../types'
import { detailArgs, detailOf, isPseudoRow, localsOf, mergedArgs, parseChanges, parseDetail, parseMerged, parseStashes, parseTracks, REFS_ARGS, STASH_ARGS, TRACK_ARGS, parseSync, parseLog, parseRefs, parseStatus, remotesOf, UNCOMMITTED, withStashes, withUncommitted } from '../hooks/log'

const US = '\x1f'
const RS = '\x1e'
const line = (...f: string[]) => f.join(US) + RS + '\n'

test('GG-04 parses commits with parents, refs, author, time and subject', async () => {
  const out =
    line('a1', 'b1 c1', 'HEAD -> main, origin/main, tag: v1.0', 'Ana', '1700000000', 'Merge branch x') +
    line('b1', '', '', 'Bia', '1690000000', 'init: a | b')
  const commits = parseLog(out)
  expect(commits.length).toBe(2)
  expect(commits[0]).toEqual({
    hash: 'a1',
    parents: ['b1', 'c1'],
    refs: [
      { kind: 'head', name: 'main' },
      { kind: 'remote', name: 'origin/main' },
      { kind: 'tag', name: 'v1.0' },
    ],
    author: 'Ana',
    time: 1700000000,
    subject: 'Merge branch x',
  })
  expect(commits[1]?.parents).toEqual([])
  expect(commits[1]?.subject).toBe('init: a | b')
})

test('GG-04 parses empty output as no commits', async () => {
  expect(parseLog('')).toEqual([])
  expect(parseLog('\n')).toEqual([])
})

test('GG-04 tells local branches from remotes and detached HEAD', async () => {
  expect(parseRefs('HEAD, feature/x, origin/HEAD -> origin/main, upstream/dev', ['origin', 'upstream'])).toEqual([
    { kind: 'head', name: 'HEAD' },
    { kind: 'branch', name: 'feature/x' },
    { kind: 'remote', name: 'origin/main' },
    { kind: 'remote', name: 'upstream/dev' },
  ])
  expect(parseRefs('')).toEqual([])
})

test('GG-07 prepends an uncommitted pseudo-commit pointing at HEAD', async () => {
  const commits = parseLog(line('h', '', 'HEAD -> main', 'A', '1', 's'))
  const rows = withUncommitted(commits, 'h', 3)
  expect(rows.length).toBe(2)
  expect(rows[0]?.hash).toBe(UNCOMMITTED)
  expect(rows[0]?.parents).toEqual(['h'])
  expect(rows[0]?.subject).toBe('Uncommitted changes (3)')
  expect(withUncommitted(commits, 'h', 0)).toBe(commits)
  expect(withUncommitted(commits, '', 2)[0]?.parents).toEqual([])
})

test('GG-08 parses commit detail with numstat and binary files', async () => {
  const out =
    ['abc', 'Ana', 'ana@x.io', '1700000000', 'Subject\n\nBody line\n'].join(US) +
    RS +
    '\n\n3\t1\tsrc/a.ts\n-\t-\timg.png\n0\t5\tdocs/{old => new}.md\n'
  expect(parseDetail(out)).toEqual({
    hash: 'abc',
    author: 'Ana',
    email: 'ana@x.io',
    time: 1700000000,
    body: 'Subject\n\nBody line',
    files: [
      { path: 'src/a.ts', adds: 3, dels: 1 },
      { path: 'img.png', adds: null, dels: null },
      { path: 'docs/{old => new}.md', adds: 0, dels: 5 },
    ],
  })
})

test('GG-07 GF-06 porcelain v2 status gives HEAD, branch, the dirty count and the conflicts', async () => {
  const out = '# branch.oid abc123\n# branch.head main\n# branch.upstream origin/main\n1 .M N... 100644 100644 100644 x y src/a.ts\n? new.txt\n'
  expect(parseStatus(out)).toMatchObject({ head: 'abc123', branch: 'main', dirty: 2, conflicts: 0 })
  expect(parseStatus('# branch.oid (initial)\n# branch.head main\n')).toEqual({ head: '', branch: 'main', dirty: 0, staged: 0, conflicts: 0 })
  expect(parseStatus('# branch.oid abc\n# branch.head (detached)\n')).toEqual({ head: 'abc', branch: '', dirty: 0, staged: 0, conflicts: 0 })
  expect(parseStatus('# branch.head x\nu UU N... 100644 100644 100644 100644 a b c src/a.ts\n1 .M N... 100644 100644 100644 x y src/b.ts\n').conflicts).toBe(1)
})

test('GG-04 remote names come from the remote-tracking refs', async () => {
  const refs = 'a refs/heads/main\nb refs/remotes/origin/main\nc refs/remotes/origin/HEAD\nd refs/remotes/up-stream/dev\ne refs/tags/v1\n'
  expect(remotesOf(refs)).toEqual(['origin', 'up-stream'])
  expect(remotesOf('')).toEqual([])
})

test('GG-04 symbolic remote HEADs are not refs of their own', async () => {
  expect(parseRefs('HEAD -> main, origin/main, github/main, origin/HEAD, github/HEAD', ['origin', 'github'])).toEqual([
    { kind: 'head', name: 'main' },
    { kind: 'remote', name: 'origin/main' },
    { kind: 'remote', name: 'github/main' },
  ])
})

test('GG-24 the local branch names, from the refs listing', async () => {
  expect(localsOf('a1 refs/heads/main\nb2 refs/heads/feature/x\nc3 refs/remotes/origin/main\nd4 refs/tags/v1\n')).toEqual(['main', 'feature/x'])
})

test('FD-07 the upstream of the branch and how far it is ahead of and behind it, from the status', async () => {
  expect(parseSync('# branch.head feature/x\n# branch.upstream github/feature/x\n# branch.ab +2 -1\n')).toEqual({ remote: 'github', ahead: 2, behind: 1 })
  expect(parseSync('# branch.head feature/x\n# branch.upstream origin/feature/x\n# branch.ab +0 -0\n')).toEqual({ remote: 'origin', ahead: 0, behind: 0 })
  expect(parseSync('# branch.head feature/x\n')).toBeNull()
})

test('GG-24 merged remotes come from git, into any base that exists here', async () => {
  expect(mergedArgs(['main', 'master', 'develop', 'dev'], ['main', 'develop', 'feat'])).toEqual([
    ...REFS_ARGS, '--merged=refs/heads/main', '--merged=refs/heads/develop', 'refs/remotes',
  ])
  expect(mergedArgs(['main'], ['trunk'])).toBeNull()
})

test('GG-24 a merged remote is dead; not a base, origin/HEAD, or one on a base tip (a branch just started)', async () => {
  const refs = 'd1 refs/heads/develop\nm1 refs/heads/main\nd1 refs/remotes/origin/develop\n'
  const merged = 'a1 refs/remotes/origin/feature/a\nd1 refs/remotes/origin/feature/new\nd1 refs/remotes/origin/develop\nm1 refs/remotes/origin/HEAD\nm1 refs/remotes/origin/main\n'
  expect(parseMerged(merged, refs, ['main', 'develop'])).toEqual(['origin/feature/a'])
  expect(parseMerged('', refs, ['main'])).toEqual([])
  // a remote branch merely ending in a base's name is not a base: its tip is no base tip
  expect(parseMerged('m1 refs/remotes/origin/feature/main\n', 'm1 refs/remotes/origin/feature/main\nz9 refs/heads/main\n', ['main'])).toEqual(['origin/feature/main'])
})

test('BS-01 each local branch is ahead of and behind its upstream, read on a load apart from the refs', async () => {
  const track = ['feat\tahead 2, behind 1', 'main\t', 'fix\tbehind 3', 'old\tgone', ''].join('\n')
  expect(parseTracks(track)).toEqual({ feat: { ahead: 2, behind: 1 }, fix: { ahead: 0, behind: 3 } })
  // the poll's refs stay a plain list; the count is its own query
  expect(REFS_ARGS).toEqual(['for-each-ref', '--format=%(objectname) %(refname)'])
  expect(TRACK_ARGS).toEqual(['for-each-ref', '--format=%(refname:short)%09%(upstream:track,nobracket)', 'refs/heads'])
})

const STATUS_V2 = [
  '# branch.oid abc',
  '# branch.head main',
  '1 M. N... 100644 100644 100644 a1 b1 hooks/staged one.ts',
  '1 .M N... 100644 100644 100644 a2 b2 hooks/register.tsx',
  '1 MM N... 100644 100644 100644 a3 b3 both.ts',
  '1 A. N... 000000 100644 100644 00 c4 new-added.ts',
  '1 .D N... 100644 100644 000000 a5 00 gone.ts',
  '2 R. N... 100644 100644 100644 a6 b6 R100 renamed.ts\told.ts',
  '? untracked.md',
  'u UU N... 100644 100644 100644 100644 a b c conflict.ts',
  '',
].join('\n')

test('CM-02 the staged files are counted, the changes listed with what changed, from the status the load reads', async () => {
  expect(parseStatus(STATUS_V2).staged).toBe(4)
  expect(parseChanges(STATUS_V2)).toEqual([
    { path: 'hooks/staged one.ts', code: 'M', isStaged: true },
    { path: 'hooks/register.tsx', code: 'M', isStaged: false },
    { path: 'both.ts', code: 'M', isStaged: true },
    { path: 'new-added.ts', code: 'A', isStaged: true },
    { path: 'gone.ts', code: 'D', isStaged: false },
    { path: 'renamed.ts', from: 'old.ts', code: 'R', isStaged: true },
    { path: 'untracked.md', code: 'A', isStaged: false },
    { path: 'conflict.ts', code: 'U', isStaged: false },
  ])
  expect(parseChanges('# branch.head main\n')).toEqual([])
})

const commit = (hash: string, time: number, ...parents: string[]): Commit => ({ hash, parents, refs: [], author: '', time, subject: hash })

test('SH-01 the stash list gives each stash its base commit, time, name and message', async () => {
  expect(STASH_ARGS).toEqual(['stash', 'list', '--format=%H%x1f%P%x1f%at%x1f%gd%x1f%s%x1e'])
  const out = line('s0', 'b1 i0 u0', '1700000300', 'stash@{0}', 'WIP on main: b1 two') + line('s1', 'b2 i1', '1700000100', 'stash@{1}', 'On main: wip a')
  expect(parseStashes(out)).toEqual([
    { hash: 's0', base: 'b1', time: 1700000300, name: 'stash@{0}', subject: 'WIP on main: b1 two' },
    { hash: 's1', base: 'b2', time: 1700000100, name: 'stash@{1}', subject: 'On main: wip a' },
  ])
  expect(parseStashes('')).toEqual([])
})

test('SH-01 a stash sits above its base, by date among the commits, off its base alone', async () => {
  const commits = [commit('c3', 400, 'c2'), commit('c2', 300, 'c1'), commit('c1', 200, 'c0'), commit('c0', 100)]
  const stashes = [
    { hash: 's0', base: 'c1', time: 350, name: 'stash@{0}', subject: 'newer' },
    { hash: 's1', base: 'c1', time: 250, name: 'stash@{1}', subject: 'older' },
    { hash: 's2', base: 'gone', time: 500, name: 'stash@{2}', subject: 'base not loaded' },
  ]
  // a stash's row goes by its name
  const rows = withStashes(commits, stashes)
  expect(rows.map(c => c.hash)).toEqual(['c3', 'stash@{0}', 'c2', 'stash@{1}', 'c1', 'c0'])
  expect(rows[1]).toEqual({ hash: 'stash@{0}', parents: ['c1'], refs: [], author: '', time: 350, subject: 'newer' })
})

test('SH-01 the uncommitted changes and the stashes are rows of no log commit; a stash details from git stash show', async () => {
  expect([UNCOMMITTED, 'stash@{3}', 'c1', null].map(isPseudoRow)).toEqual([true, true, false, false])
  expect(detailArgs('stash@{1}')).toEqual(['stash', 'show', '--numstat', '--include-untracked', 'stash@{1}'])
  expect(detailArgs('c1')[0]).toBe('show')
  const stash = commit('stash@{1}', 250, 'c1')
  expect(detailOf(stash, '2\t1\tsrc/a.ts\n-\t-\tlogo.png\n')).toEqual({ hash: 'stash@{1}', author: '', email: '', time: 250, body: 'stash@{1}', files: [{ path: 'src/a.ts', adds: 2, dels: 1 }, { path: 'logo.png', adds: null, dels: null }] })
})

test('SH-01 a stash newer than every commit above its base goes right above it, never below', async () => {
  const commits = [commit('c2', 300, 'c1'), commit('c1', 200)]
  // a stash dated after c2 but based on c1: on top, still above its base
  expect(withStashes(commits, [{ hash: 's0', base: 'c1', time: 900, name: 'stash@{0}', subject: 'x' }]).map(c => c.hash)).toEqual(['stash@{0}', 'c2', 'c1'])
  // dated before its base (a clock skew): right above the base
  expect(withStashes(commits, [{ hash: 's0', base: 'c2', time: 1, name: 'stash@{0}', subject: 'x' }]).map(c => c.hash)).toEqual(['stash@{0}', 'c2', 'c1'])
})
