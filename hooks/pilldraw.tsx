import type { ClientElements } from 'claude-code'

export type PillProps = { name: string; remotes: string; bg: string; fg: string; isBold: boolean; isRound: boolean }

// Nerd Font powerline caps: the rounded ends of a pill.
export const CAP_LEFT = ''
export const CAP_RIGHT = ''

// A ref pill and its trailing gap, drawn the same by the hooks module and by ./pill.tsx.
export function drawPill(Text: ClientElements['Text'], p: PillProps) {
  const body = (
    <Text backgroundColor={p.bg} color={p.fg} weight={p.isBold ? 'bold' : undefined}>
      {p.isRound ? '' : ' '}
      {p.name}
      <Text italic>{p.remotes}</Text>
      {p.isRound ? '' : ' '}
    </Text>
  )
  return p.isRound ? (
    <Text>
      <Text color={p.bg}>{CAP_LEFT}</Text>
      {body}
      <Text color={p.bg}>{CAP_RIGHT}</Text>{' '}
    </Text>
  ) : (
    <Text>
      {body}{' '}
    </Text>
  )
}
