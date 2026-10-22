import type { ClientModule } from 'claude-code'

export type SpinnerProps = { color: string }

const FRAMES = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
const FRAME_MS = 80

// A spinner that turns on the surface's own frame clock: no hook runs per frame.
const Spinner: ClientModule<SpinnerProps, number> = (p, surface) => {
  const { Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState(0)
    surface.every(FRAME_MS, () => surface.setState(((surface.state ?? 0) + 1) % FRAMES.length))
  }
  return <Text color={p.color}>{FRAMES[surface.state ?? 0]}</Text>
}

export default Spinner
