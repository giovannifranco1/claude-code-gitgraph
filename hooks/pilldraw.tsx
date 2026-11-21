import type { ClientElements } from 'claude-code'

// One stretch of a pill in its own colors: an icon, a name, remotes; `icon` drawn in a color
// of its own, before the text (the checked-out branch's pin) or, `isAfter`, after it with a
// gap when there is text (the worktree mark).
export type PillSegment = { text: string; bg: string; fg: string; isBold?: boolean; icon?: { text: string; fg: string; isAfter?: boolean } }
export type PillProps = { segments: PillSegment[]; isRound: boolean }

// Nerd Font powerline caps: the rounded ends of a pill.
export const CAP_LEFT = ''
export const CAP_RIGHT = ''

// `#rrggbb` with each channel scaled by `factor`; any other color as given.
export function shade(color: string, factor: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const n = parseInt(m[1] ?? '0', 16)
  const ch = (at: number) => Math.round(((n >> at) & 0xff) * factor).toString(16).padStart(2, '0')
  return `#${ch(16)}${ch(8)}${ch(0)}`
}

// A ref pill and its trailing gap, drawn the same by the hooks module and by ./pill.tsx:
// its segments side by side, a cell each side of each text; round, the caps take the
// outer two, in the first and the last segment's colors.
export function drawPill(Text: ClientElements['Text'], { segments, isRound }: PillProps) {
  const last = segments.length - 1
  const body = segments.map((g, i) => (
    <Text backgroundColor={g.bg} color={g.fg} weight={g.isBold ? 'bold' : undefined}>
      {isRound && i === 0 ? '' : ' '}
      {g.icon && !g.icon.isAfter && <Text color={g.icon.fg}>{g.icon.text}</Text>}
      {g.text}
      {g.icon?.isAfter && <Text color={g.icon.fg}>{g.text ? `  ${g.icon.text}` : g.icon.text}</Text>}
      {isRound && i === last ? '' : ' '}
    </Text>
  ))
  return isRound ? (
    <Text>
      <Text color={segments[0]?.bg}>{CAP_LEFT}</Text>
      {body}
      <Text color={segments[last]?.bg}>{CAP_RIGHT}</Text>{' '}
    </Text>
  ) : (
    <Text>
      {body}{' '}
    </Text>
  )
}
