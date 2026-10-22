import { expect, test } from 'claude-code/testing'

import { badgesOf, badgeWidth, diffBar, fitBadges } from '../hooks/badges'
import { parseRefs } from '../hooks/log'

test('GG-04 a local branch and its remote share one badge, HEAD first, tags last', async () => {
  const refs = parseRefs('tag: v1.0, feat, HEAD -> main, origin/main, upstream/feat, upstream/main', ['origin', 'upstream'])
  expect(badgesOf(refs)).toEqual([
    { kind: 'head', label: 'main', remotes: ['origin', 'upstream'] },
    { kind: 'branch', label: 'feat', remotes: ['upstream'] },
    { kind: 'tag', label: 'v1.0', remotes: [] },
  ])
})

test('GG-04 remote-only branches and a detached HEAD get badges of their own', async () => {
  const refs = parseRefs('HEAD, origin/fix', ['origin'])
  expect(badgesOf(refs)).toEqual([
    { kind: 'detached', label: 'HEAD', remotes: [] },
    { kind: 'remote', label: 'origin/fix', remotes: [] },
  ])
  expect(badgesOf([])).toEqual([])
})

test('GG-04 a badge is as wide as its padded text', async () => {
  expect(badgeWidth({ kind: 'branch', label: 'feat', remotes: [] })).toBe(' feat '.length)
  expect(badgeWidth({ kind: 'head', label: 'main', remotes: ['origin'] })).toBe(' ● main ⇄ origin '.length)
  expect(badgeWidth({ kind: 'tag', label: 'v1', remotes: [] })).toBe(' ◆ v1 '.length)
})

test('GG-08 a diffstat bar splits its width between additions and deletions', async () => {
  expect(diffBar(3, 1, 8)).toEqual({ adds: 3, dels: 1 })
  expect(diffBar(300, 100, 8)).toEqual({ adds: 6, dels: 2 })
  expect(diffBar(0, 1, 8)).toEqual({ adds: 0, dels: 1 })
  expect(diffBar(1, 1000, 8)).toEqual({ adds: 1, dels: 7 })
  expect(diffBar(null, null, 8)).toEqual({ adds: 0, dels: 0 })
})

test('GG-11 pills past their width budget collapse into a +N count', async () => {
  const b = (label: string) => ({ kind: 'branch' as const, label, remotes: [] })
  const all = [b('main'), b('feature/long-name'), b('x')]
  expect(fitBadges(all, 100)).toEqual({ shown: all, hidden: 0 })
  // ' main ' + gap = 7, ' feature/long-name ' + gap = 20; '+2' pill is 5 wide
  expect(fitBadges(all, 14)).toEqual({ shown: [b('main')], hidden: 2 })
  expect(fitBadges(all, 3)).toEqual({ shown: [], hidden: 3 })
  expect(fitBadges([], 3)).toEqual({ shown: [], hidden: 0 })
})

test('GG-11 a pill that does not fit is shortened before it is counted away', async () => {
  const long = { kind: 'branch' as const, label: 'feature/long-name', remotes: [] }
  // ' feature/lon… ' + gap = 15
  expect(fitBadges([long], 15)).toEqual({ shown: [{ ...long, label: 'feature/lon…' }], hidden: 0 })
  // remotes go first: ' main ' + gap = 7 fits where ' main ⇄ origin ' + gap = 16 does not
  expect(fitBadges([{ kind: 'head', label: 'main', remotes: ['origin'] }], 12)).toEqual({
    shown: [{ kind: 'head', label: 'main', remotes: [] }],
    hidden: 0,
  })
  // under six letters of name it is not worth a pill
  expect(fitBadges([long], 9)).toEqual({ shown: [], hidden: 1 })
})
