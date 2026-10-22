import type { ClientModule } from 'claude-code'

export type PillProps = { name: string; remotes: string; bg: string; fg: string; isBold: boolean; isRound: boolean }

// Nerd Font powerline caps: the rounded ends of a pill.
const CAP_LEFT = ''
const CAP_RIGHT = ''

// One ref badge, drawn on the terminal side so it can tell a right click from
// a left one; it posts `{ button }` to the hooks module, which opens the menu.
const Pill: ClientModule<PillProps, true> = (p, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.onPointer(e => {
      if (e.type === 'down') surface.post({ button: e.button ?? 'left' })
    })
    surface.setState(true)
  }
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

export default Pill
