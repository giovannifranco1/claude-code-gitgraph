import { expect, test } from 'claude-code/testing'

import { badgeParts, badgesOf, badgeWidth, diffBar, fitBadges } from '../hooks/badges'
import { parseRefs } from '../hooks/log'
import { shade } from '../hooks/pilldraw'

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
  expect(badgeWidth({ kind: 'head', label: 'main', remotes: ['origin'] })).toBe(' \uf058  main '.length + ' origin '.length)
  expect(badgeWidth({ kind: 'tag', label: 'v1', remotes: [] })).toBe(' \uf02b '.length + ' v1 '.length)
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
  expect(fitBadges(all, 100)).toEqual({ shown: all, hidden: 0, width: 7 + 20 + 4 })
  // ' main ' + gap = 7, ' feature/long-name ' + gap = 20; '+2' pill is 5 wide
  expect(fitBadges(all, 14)).toEqual({ shown: [b('main')], hidden: 2, width: 7 + 5 })
  expect(fitBadges(all, 3)).toEqual({ shown: [], hidden: 3, width: 5 })
  expect(fitBadges([], 3)).toEqual({ shown: [], hidden: 0, width: 0 })
})

test('GG-11 a pill that does not fit is shortened before it is counted away', async () => {
  const long = { kind: 'branch' as const, label: 'feature/long-name', remotes: [] }
  // ' feature/lon… ' + gap = 15
  expect(fitBadges([long], 15)).toEqual({ shown: [{ ...long, label: 'feature/lon…' }], hidden: 0, width: 15 })
  // a name too short to cut drops its remote segment: ' ✔ ' + ' main ' + gap = 10
  expect(fitBadges([{ kind: 'head', label: 'main', remotes: ['origin'] }], 12)).toEqual({
    shown: [{ kind: 'head', label: 'main', remotes: [] }],
    hidden: 0,
    width: 10,
  })
  // under six letters of name it is not worth a pill
  expect(fitBadges([long], 9)).toEqual({ shown: [], hidden: 1, width: 5 })
})

test('GG-04 a long branch keeps its remote segment, the name cut first, so a pushed branch still shows its remote', async () => {
  const hotfix = { kind: 'head' as const, label: 'hotfix/0.1.4', remotes: ['github'] }
  // ' ✔ ' + ' hotfix/0.1.4 ' + ' github ' + gap = 26
  expect(fitBadges([hotfix], 26).shown).toEqual([hotfix])
  expect(fitBadges([hotfix], 21)).toEqual({ shown: [{ ...hotfix, label: 'hotfix…' }], hidden: 0, width: 21 })
  // below six letters with the remote, the bare name is cut instead
  expect(fitBadges([hotfix], 16)).toEqual({ shown: [{ kind: 'head', label: 'hotfix/0.…', remotes: [] }], hidden: 0, width: 16 })
})

test('GG-04 the remotes are a segment of their own after the name', async () => {
  expect(badgeParts({ kind: 'branch', label: 'feat', remotes: ['origin', 'up'] })).toEqual({ lead: false, name: 'feat', remotes: 'origin up' })
  expect(badgeParts({ kind: 'branch', label: 'feat', remotes: [] }).remotes).toBe('')
  // the checked-out branch and a tag lead with an icon segment
  expect(badgeParts({ kind: 'head', label: 'main', remotes: [] }).lead).toBe(true)
  expect(badgeParts({ kind: 'tag', label: '0.1.4', remotes: [] })).toEqual({ lead: true, name: '0.1.4', remotes: '' })
})

test('GG-11 the first pill takes the whole column before it is cut; the others keep room for the subject', async () => {
  const long = { kind: 'head' as const, label: 'feature/phren-research', remotes: ['github'] }
  const tag = { kind: 'tag' as const, label: 'v1', remotes: [] }
  // ' ✔ ' + ' feature/phren-research ' + ' github ' + gap = 36: whole within a 40-wide column, past a 20 budget
  expect(fitBadges([long], 20, 40)).toEqual({ shown: [long], hidden: 0, width: 36 })
  // the next pill gets what the subject budget leaves: none here, so +1 (5 wide, in the column too)
  expect(fitBadges([long, tag], 20, 41)).toEqual({ shown: [long], hidden: 1, width: 36 + 5 })
  // without a column given, the budget is the same for all
  expect(fitBadges([long], 20)).toEqual({ shown: [{ ...long, label: 'feature/phren…', remotes: [] }], hidden: 0, width: 20 })
})

test('GG-04 the remote segment is a dark shade of the pill color', async () => {
  expect(shade('#4fc1ff', 0.45)).toBe('#245773')
  expect(shade('#9d9d9d', 0.5)).toBe('#4f4f4f')
  expect(shade('blue', 0.5)).toBe('blue')
})

test('GG-24 a remote branch with no local branch of its name anywhere is gone: it counts its ghost segment', async () => {
  const refs = parseRefs('origin/feature/gone, origin/feat', ['origin'])
  expect(badgesOf(refs, ['main', 'feat'])).toEqual([
    { kind: 'remote', label: 'origin/feature/gone', remotes: [], isGone: true },
    { kind: 'remote', label: 'origin/feat', remotes: [] },
  ])
  expect(badgeParts({ kind: 'remote', label: 'origin/feature/gone', remotes: [], isGone: true }).lead).toBe(true)
  expect(badgeParts({ kind: 'remote', label: 'origin/feat', remotes: [] }).lead).toBe(false)
  expect(badgeWidth({ kind: 'remote', label: 'origin/x', remotes: [], isGone: true })).toBe(' g '.length + ' origin/x '.length)
})
