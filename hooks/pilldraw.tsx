import type { ClientElements } from 'claude-code'

export type PillProps = { name: string; remotes: string; bg: string; fg: string; isBold: boolean; isRound: boolean }

// Nerd Font powerline caps: the rounded ends of a pill.
export const CAP_LEFT = ''
export const CAP_RIGHT = ''

// The remotes' segment after the name: a dark shade of the pill's own color, light text.
const REMOTE_SEG_SHADE = 0.45
const REMOTE_SEG_FG = '#f0f0f0'

// `#rrggbb` with each channel scaled by `factor`; any other color as given.
export function shade(color: string, factor: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color)
  if (!m) return color
  const n = parseInt(m[1] ?? '0', 16)
  const ch = (at: number) => Math.round(((n >> at) & 0xff) * factor).toString(16).padStart(2, '0')
  return `#${ch(16)}${ch(8)}${ch(0)}`
}

// A ref pill and its trailing gap, drawn the same by the hooks module and by ./pill.tsx.
// Round: the name's right pad goes where a remote segment follows, the cap closing it.
export function drawPill(Text: ClientElements['Text'], p: PillProps) {
  const hasRemotes = p.remotes !== ''
  const segBg = shade(p.bg, REMOTE_SEG_SHADE)
  const body = (
    <Text backgroundColor={p.bg} color={p.fg} weight={p.isBold ? 'bold' : undefined}>
      {p.isRound ? '' : ' '}
      {p.name}
      {!p.isRound || hasRemotes ? ' ' : ''}
    </Text>
  )
  const segment = hasRemotes && (
    <Text backgroundColor={segBg} color={REMOTE_SEG_FG}>
      {' '}
      {p.remotes}
      {p.isRound ? '' : ' '}
    </Text>
  )
  return p.isRound ? (
    <Text>
      <Text color={p.bg}>{CAP_LEFT}</Text>
      {body}
      {segment}
      <Text color={hasRemotes ? segBg : p.bg}>{CAP_RIGHT}</Text>{' '}
    </Text>
  ) : (
    <Text>
      {body}
      {segment}{' '}
    </Text>
  )
}
