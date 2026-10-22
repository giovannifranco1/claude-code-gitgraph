import type { ClientModule } from 'claude-code'

import { drawPill, type PillProps } from './pilldraw'

// One ref badge, drawn on the terminal side so it can tell a right click from
// a left one; it posts `{ button }` to the hooks module, which opens the menu.
const Pill: ClientModule<PillProps, true> = (p, surface) => {
  if (surface.state === undefined) {
    surface.onPointer(e => {
      if (e.type === 'down') surface.post({ button: e.button ?? 'left' })
    })
    surface.setState(true)
  }
  return drawPill(surface.elements.Text, p)
}

export default Pill
