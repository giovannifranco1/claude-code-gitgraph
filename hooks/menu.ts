import type { Badge } from '../types'

export type MenuItem = {
  id: string
  label: string
  // The git commands the item runs, in order (several for a push to every remote).
  runs?: string[][]
  isNetwork?: boolean
  copy?: string
  isRename?: boolean
  // A push: its argv with REMOTE where each chosen remote goes (see pushRuns).
  pushArgs?: string[]
}

export const REMOTE = '<remote>'

// `origin/feat/x` → remote `origin`, branch `feat/x`; the longest known remote wins.
export function splitRemote(ref: string, remotes: string[]): { remote: string; branch: string } {
  const remote = [...remotes].sort((a, b) => b.length - a.length).find(r => ref.startsWith(`${r}/`)) ?? ''
  return { remote, branch: remote ? ref.slice(remote.length + 1) : ref }
}

export const renameArgs = (from: string, to: string) => ['branch', '-m', from, to]

const act = (id: string, label: string, args: string[], isNetwork = false): MenuItem => ({
  id,
  label,
  runs: [args],
  isNetwork,
})

// The push of a branch or tag: one item; the remotes are chosen in the menu.
const pushItem = (remotes: string[], args: string[]): MenuItem[] =>
  remotes.length ? [{ id: 'push', label: 'Push branch…', pushArgs: args, isNetwork: true }] : []

// One push per chosen remote, in the order given.
export const pushRuns = (item: MenuItem, remotes: string[]): string[][] =>
  remotes.map(r => (item.pushArgs ?? []).map(a => (a === REMOTE ? r : a)))

// What the push starts with: the remotes the branch tracks, else origin, else the first.
export function defaultPushRemotes(badge: Badge, remotes: string[]): string[] {
  const tracked = badge.remotes.filter(r => remotes.includes(r))
  if (tracked.length) return tracked
  const first = remotes.includes('origin') ? 'origin' : remotes[0]
  return first ? [first] : []
}

// What checking the ref out runs: a local branch by name, a remote one as a new
// tracking branch; null where there is nothing to check out (the current branch, tags).
export function checkoutArgs(badge: Badge): string[] | null {
  if (badge.kind === 'branch') return ['checkout', badge.label]
  if (badge.kind === 'remote') return ['switch', '--track', badge.label]
  return null
}

// The ref's context menu, as the VS Code Git Graph offers it.
export function menuFor(badge: Badge, remotes: string[]): MenuItem[] {
  const name = badge.label
  const copy: MenuItem = { id: 'copy', label: 'Copy name', copy: name }
  switch (badge.kind) {
    case 'head':
    case 'branch': {
      const isHead = badge.kind === 'head'
      return [
        ...(isHead ? [] : [act('checkout', 'Checkout', checkoutArgs(badge) ?? [])]),
        { id: 'rename', label: 'Rename…', isRename: true },
        ...pushItem(remotes, ['push', '-u', REMOTE, name]),
        ...(isHead
          ? []
          : [
              act('merge', 'Merge into current branch', ['merge', name]),
              act('rebase', 'Rebase current branch on this', ['rebase', name]),
              act('delete', 'Delete', ['branch', '-d', name]),
            ]),
        copy,
      ]
    }
    case 'remote': {
      const { remote, branch } = splitRemote(name, remotes)
      return [
        act('checkout', 'Checkout (new local branch)', checkoutArgs(badge) ?? []),
        ...(remote ? [act('fetch', 'Fetch', ['fetch', remote, branch], true)] : []),
        act('merge', 'Merge into current branch', ['merge', name]),
        ...(remote ? [act('delete', `Delete on ${remote}`, ['push', remote, '--delete', branch], true)] : []),
        copy,
      ]
    }
    case 'tag':
      return [
        ...pushItem(remotes, ['push', REMOTE, `refs/tags/${name}`]).map(i => ({ ...i, label: 'Push tag…' })),
        act('delete', 'Delete tag', ['tag', '-d', name]),
        copy,
      ]
    default:
      return []
  }
}
