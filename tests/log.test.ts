import { expect, test } from 'claude-code/testing'

import { parseDetail, parseLog, parseRefs, parseStatus, remotesOf, UNCOMMITTED, withUncommitted } from '../hooks/log'

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
  expect(parseStatus(out)).toEqual({ head: 'abc123', branch: 'main', dirty: 2, conflicts: 0 })
  expect(parseStatus('# branch.oid (initial)\n# branch.head main\n')).toEqual({ head: '', branch: 'main', dirty: 0, conflicts: 0 })
  expect(parseStatus('# branch.oid abc\n# branch.head (detached)\n')).toEqual({ head: 'abc', branch: '', dirty: 0, conflicts: 0 })
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
