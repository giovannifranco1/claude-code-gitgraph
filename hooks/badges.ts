import type { Badge, BadgeKind, Ref } from '../types'

const ORDER: BadgeKind[] = ['head', 'detached', 'branch', 'remote', 'tag']

// One badge per local branch, its remote-tracking refs folded into it as the
// VS Code Git Graph does (`main ⇄ origin`); remotes without a local stand alone.
export function badgesOf(refs: Ref[]): Badge[] {
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
    const local = locals.get(ref.name.slice(cut + 1))
    if (cut > 0 && local) local.remotes.push(ref.name.slice(0, cut))
    else badges.push({ kind: 'remote', label: ref.name, remotes: [] })
  }
  return badges.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
}

// The badge's text, split so the remotes can be drawn dimmer than the name.
export function badgeParts(badge: Badge): { name: string; remotes: string } {
  const icon = badge.kind === 'head' ? '● ' : badge.kind === 'tag' ? '◆ ' : ''
  return { name: ` ${icon}${badge.label}`, remotes: badge.remotes.length ? ` ⇄ ${badge.remotes.join(' ')}` : '' }
}

export function badgeWidth(badge: Badge): number {
  const { name, remotes } = badgeParts(badge)
  return name.length + remotes.length + 1
}

// Six letters and an ellipsis: shorter than that a pill no longer names its ref.
const MIN_LABEL = 7

// The badge drawn within `room` columns (gap included): remotes dropped first,
// then the name cut with an ellipsis; null when even that does not fit.
function shrink(badge: Badge, room: number): Badge | null {
  if (badgeWidth(badge) + 1 <= room) return badge
  const bare = { ...badge, remotes: [] }
  const keep = bare.label.length - (badgeWidth(bare) + 1 - room)
  if (keep >= bare.label.length) return bare
  return keep < MIN_LABEL ? null : { ...bare, label: `${bare.label.slice(0, keep - 1)}…` }
}

// The pills that fit `max` columns, shortened where needed; the rest counted for a `+N` pill.
// `width` is what they take, the `+N` pill and every gap included.
export function fitBadges(badges: Badge[], max: number): { shown: Badge[]; hidden: number; width: number } {
  const plus = (n: number) => (n > 0 ? `+${n}`.length + 3 : 0)
  const shown: Badge[] = []
  let used = 0
  for (const badge of badges) {
    const fitted = shrink(badge, max - used - plus(badges.length - shown.length - 1))
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
