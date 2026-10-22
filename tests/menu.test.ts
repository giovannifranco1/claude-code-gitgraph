import { expect, test } from 'claude-code/testing'

import { checkoutArgs, defaultPushRemotes, menuFor, pushRuns, renameArgs, splitRemote } from '../hooks/menu'

const ids = (items: { id: string }[]) => items.map(i => i.id)

test('GG-12 a local branch gets the full branch menu', async () => {
  const items = menuFor({ kind: 'branch', label: 'feat', remotes: ['origin'] }, ['origin'])
  expect(ids(items)).toEqual(['checkout', 'rename', 'push', 'merge', 'rebase', 'delete', 'copy'])
  const by = Object.fromEntries(items.map(i => [i.id, i]))
  expect(by.checkout?.runs?.[0]).toEqual(['checkout', 'feat'])
  expect(by.push?.label).toBe('Push branch…')
  expect(pushRuns(by.push!, ['origin'])).toEqual([['push', '-u', 'origin', 'feat']])
  expect(by.merge?.runs?.[0]).toEqual(['merge', 'feat'])
  expect(by.rebase?.runs?.[0]).toEqual(['rebase', 'feat'])
  expect(by.delete?.runs?.[0]).toEqual(['branch', '-d', 'feat'])
  expect(by.copy?.copy).toBe('feat')
})

test('GG-12 the checked-out branch cannot be checked out, merged, rebased or deleted', async () => {
  expect(ids(menuFor({ kind: 'head', label: 'main', remotes: [] }, ['up']))).toEqual(['rename', 'push', 'copy'])
  expect(pushRuns(menuFor({ kind: 'head', label: 'main', remotes: [] }, ['up']).find(i => i.id === 'push')!, ['up'])).toEqual([['push', '-u', 'up', 'main']])
})

test('GG-12 without remotes there is nothing to push to', async () => {
  expect(ids(menuFor({ kind: 'branch', label: 'feat', remotes: [] }, []))).not.toContain('push')
})

test('GG-12 a remote branch can be tracked, fetched, merged and deleted remotely', async () => {
  const items = menuFor({ kind: 'remote', label: 'my/remote/fix/x', remotes: [] }, ['origin', 'my/remote'])
  expect(ids(items)).toEqual(['checkout', 'fetch', 'merge', 'delete', 'copy'])
  const by = Object.fromEntries(items.map(i => [i.id, i]))
  expect(by.checkout?.runs?.[0]).toEqual(['switch', '--track', 'my/remote/fix/x'])
  expect(by.fetch?.runs?.[0]).toEqual(['fetch', 'my/remote', 'fix/x'])
  expect(by.merge?.runs?.[0]).toEqual(['merge', 'my/remote/fix/x'])
  expect(by.delete?.runs?.[0]).toEqual(['push', 'my/remote', '--delete', 'fix/x'])
})

test('GG-12 a tag can be pushed, deleted and copied', async () => {
  const items = menuFor({ kind: 'tag', label: 'v1.0', remotes: [] }, ['origin'])
  expect(ids(items)).toEqual(['push', 'delete', 'copy'])
  expect(pushRuns(items[0]!, ['origin'])).toEqual([['push', 'origin', 'refs/tags/v1.0']])
  expect(items[1]?.runs?.[0]).toEqual(['tag', '-d', 'v1.0'])
})

test('GG-12 a detached HEAD has no menu', async () => {
  expect(menuFor({ kind: 'detached', label: 'HEAD', remotes: [] }, ['origin'])).toEqual([])
})

test('GG-12 remote names are matched longest first', async () => {
  expect(splitRemote('origin/feat/x', ['origin'])).toEqual({ remote: 'origin', branch: 'feat/x' })
  expect(splitRemote('a/b/c', ['a', 'a/b'])).toEqual({ remote: 'a/b', branch: 'c' })
  expect(splitRemote('nope', ['origin'])).toEqual({ remote: '', branch: 'nope' })
})

test('GG-12 rename passes both names as their own arguments', async () => {
  expect(renameArgs('feat', 'feat-2')).toEqual(['branch', '-m', 'feat', 'feat-2'])
})

test('GG-12 one push item whatever the remotes; it runs one push per chosen remote', async () => {
  const items = menuFor({ kind: 'branch', label: 'feat', remotes: ['github'] }, ['github', 'origin'])
  expect(ids(items)).toEqual(['checkout', 'rename', 'push', 'merge', 'rebase', 'delete', 'copy'])
  const push = items.find(i => i.id === 'push')!
  expect(pushRuns(push, ['origin', 'github'])).toEqual([
    ['push', '-u', 'origin', 'feat'],
    ['push', '-u', 'github', 'feat'],
  ])
  expect(pushRuns(push, [])).toEqual([])
})

test('GG-12 the push starts with the remotes the branch tracks, else origin, else the first', async () => {
  expect(defaultPushRemotes({ kind: 'branch', label: 'f', remotes: ['github'] }, ['origin', 'github'])).toEqual(['github'])
  expect(defaultPushRemotes({ kind: 'branch', label: 'f', remotes: [] }, ['github', 'origin'])).toEqual(['origin'])
  expect(defaultPushRemotes({ kind: 'tag', label: 'v', remotes: [] }, ['up', 'down'])).toEqual(['up'])
  expect(defaultPushRemotes({ kind: 'tag', label: 'v', remotes: [] }, [])).toEqual([])
})

test('GG-14 a double click checks out a local branch, tracks a remote one, and leaves the rest', async () => {
  expect(checkoutArgs({ kind: 'branch', label: 'feat', remotes: ['origin'] })).toEqual(['checkout', 'feat'])
  expect(checkoutArgs({ kind: 'remote', label: 'origin/fix', remotes: [] })).toEqual(['switch', '--track', 'origin/fix'])
  expect(checkoutArgs({ kind: 'head', label: 'main', remotes: [] })).toBeNull()
  expect(checkoutArgs({ kind: 'tag', label: 'v1', remotes: [] })).toBeNull()
  expect(checkoutArgs({ kind: 'detached', label: 'HEAD', remotes: [] })).toBeNull()
})
