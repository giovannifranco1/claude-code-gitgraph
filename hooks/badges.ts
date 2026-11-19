import type { Badge, BadgeKind, Ref, Track } from '../types'

const ORDER: BadgeKind[] = ['head', 'detached', 'branch', 'remote', 'tag']

// One badge per local branch, its remote-tracking refs folded into it as the
// VS Code Git Graph does (`main` with an `origin` segment); remotes without a local stand alone,
// gone where no local branch of their name is anywhere (`branches`, when given). Without
// `hasRemotes` (all branches off) a remote only marks its local branch: no pill of its own.
// A remote in `dead` (merged into a base, see parseMerged) is gone too: alone, or with its local branch
// on its commit, which then is one gone pill with it.
// `origin/feat/x` → `feat/x`: the branch a remote-tracking ref follows.
export const branchOf = (remoteRef: string) => remoteRef.slice(remoteRef.indexOf('/') + 1)

export function badgesOf(refs: Ref[], branches?: string[], hasRemotes = true, dead?: Set<string>): Badge[] {
  const badges: Badge[] = []
  const locals = new Map<string, Badge>()
  for (const ref of refs) {
    if (ref.kind === 'head' && ref.name === 'HEAD') badges.push({ kind: 'detached', label: 'HEAD', remotes: [] })
    else if (ref.kind === 'head' || ref.kind === 'branch') {
      const badge: Badge = { kind: ref.kind, label: ref.name, remotes: [] }
      locals.set(ref.name, badge)
      badges.push(badge)
    }
  }
  for (const ref of refs) {
    if (ref.kind === 'tag') badges.push({ kind: 'tag', label: ref.name, remotes: [] })
    if (ref.kind !== 'remote') continue
    const cut = ref.name.indexOf('/')
    const branch = branchOf(ref.name)
    const local = cut > 0 ? locals.get(branch) : undefined
    const isGone = dead?.has(ref.name) || (branches !== undefined && cut > 0 && !branches.includes(branch))
    if (local) {
      local.remotes.push(ref.name.slice(0, cut))
      if (isGone) local.isGone = true
    } else if (hasRemotes) badges.push({ kind: 'remote', label: ref.name, remotes: [], ...(isGone && { isGone: true as const }) })
  }
  return badges.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

// The badge's parts: an icon before the name (`lead`: the checked-out branch, a tag, a
// gone branch), the name, then its remotes and how far it is from its upstream (`origin ↑2 ↓1`).
export function badgeParts(badge: Badge): { lead: boolean; name: string; remotes: string } {
  const sync = syncText(badge)
  return { lead: badge.kind === 'head' || badge.kind === 'tag' || badge.isGone === true, name: badge.label, remotes: [...badge.remotes, ...(sync ? [sync] : [])].join(' ') }
}

// `↑2 ↓1`: how far a branch is from its upstream, each side only when not 0; '' in step.
export const syncText = ({ ahead, behind }: Partial<Track>) => [...(ahead ? [`↑${ahead}`] : []), ...(behind ? [`↓${behind}`] : [])].join(' ')

// The local branches' badges with how far each is from its upstream (`tracks`, by branch).
export function withSync(badges: Badge[], tracks: Record<string, Track>): Badge[] {
  return badges.map(b => {
    const t = (b.kind === 'head' || b.kind === 'branch') && tracks[b.label]
    return t ? { ...b, ...(t.ahead && { ahead: t.ahead }), ...(t.behind && { behind: t.behind }) } : b
  })
}

// Each segment is its text with a cell each side (round caps take the outer two); an icon
// takes 3 more: a tag's or a remote-only branch's ` ◆ ` segment, or the check and two spaces
// before a checked-out name.
export function badgeWidth(badge: Badge): number {
  const { lead, name, remotes } = badgeParts(badge)
  return (lead ? 3 : 0) + name.length + 2 + (remotes ? remotes.length + 2 : 0)
}

// Six letters and an ellipsis: shorter than that a pill no longer names its ref.
const MIN_LABEL = 7

// The badge within `room` columns (gap included), its name cut with an ellipsis where
// needed; null when that leaves fewer than MIN_LABEL letters.
function cut(badge: Badge, room: number): Badge | null {
  const over = badgeWidth(badge) + 1 - room
  if (over <= 0) return badge
  const keep = badge.label.length - over
  return keep < MIN_LABEL ? null : { ...badge, label: `${badge.label.slice(0, keep - 1)}…` }
}

// The badge drawn within `room` columns: its name cut first while the remote segment
// stays (a pushed branch still shows its remote), then the remotes dropped; null when
// even the bare name cannot be kept.
function shrink(badge: Badge, room: number): Badge | null {
  return cut(badge, room) ?? (badge.remotes.length ? cut({ ...badge, remotes: [] }, room) : null)
}

// Branch pills (local or remote) a row draws at most; tags do not count. The rest go in `+N`.
const MAX_BRANCH_PILLS = 2

// The pills (at most MAX_BRANCH_PILLS branches, and the tags) that fit `max` columns, shortened
// where needed; the rest counted for a `+N` pill. The first may take the whole `column` (the
// subject then gets less) before it is cut: a branch shows its full name. `width` is what they
// take, the `+N` pill and every gap included.
// A pill of one plain segment (`+N`, a stash's name) and its gap, in cells.
export const plainPillWidth = (text: string) => text.length + 3

export function fitBadges(badges: Badge[], max: number, column = max): { shown: Badge[]; hidden: number; width: number } {
  const plus = (n: number) => (n > 0 ? plainPillWidth(`+${n}`) : 0)
  const shown: Badge[] = []
  let used = 0
  const isTag = (b: Badge) => b.kind === 'tag'
  const candidates = [...badges.filter(b => !isTag(b)).slice(0, MAX_BRANCH_PILLS), ...badges.filter(isTag)]
  for (const badge of candidates) {
    const room = shown.length === 0 ? Math.max(max, column) : max
    const fitted = shrink(badge, room - used - plus(badges.length - shown.length - 1))
    if (!fitted) break
    shown.push(fitted)
    used += badgeWidth(fitted) + 1
  }
  const hidden = badges.length - shown.length
  return { shown, hidden, width: used + plus(hidden) }
}

// A diffstat bar of at most `width` cells, each non-zero side keeping one.
export function diffBar(adds: number | null, dels: number | null, width: number): { adds: number; dels: number } {
  const a = adds ?? 0
  const d = dels ?? 0
  if (a + d <= width) return { adds: a, dels: d }
  const scaled = Math.min(width - (d > 0 ? 1 : 0), Math.max(a > 0 ? 1 : 0, Math.round((a / (a + d)) * width)))
  return { adds: scaled, dels: width - scaled }
}
