import type { FlowView, View } from '../types'

// Everything transient a git action, a selection or a new menu closes.
export const CLOSED = {
  confirm: null,
  menu: null,
  isRenaming: false,
  isDeleting: false,
  isForce: false,
  push: null,
  editingRemote: null,
  isAddingRemote: false,
  isActionsOpen: false,
} satisfies Partial<View>

// The git flow dialogs, closed when one opens another or a git flow action ends.
export const FLOW_CLOSED = { starting: null, finishing: null, tagMessage: null, init: null, confirming: null, isMenuOpen: false } satisfies Partial<FlowView>

const isOpen = <T extends object>(value: T, closed: Partial<T>) => Object.entries(closed).some(([k, v]) => value[k as keyof T] !== v)

// What Escape leaves: the view with its topmost modal closed (an action's notice, a git flow
// dialog, a ref's menu or a commit's actions with their forms, then the settings or changelog
// screen), or null when none is open.
export function dismissModal(view: View): View | null {
  if (!hasModal(view)) return null
  if (view.notice) return { ...view, notice: null }
  if (isOpen(view.flow, FLOW_CLOSED)) return { ...view, flow: { ...view.flow, ...FLOW_CLOSED } }
  if (isOpen(view, CLOSED)) return { ...view, ...CLOSED }
  return { ...view, screen: 'graph' }
}

// Whether a modal (or the settings or changelog screen) is open: what Escape would close.
export const hasModal = (view: View) => view.notice !== null || isOpen(view.flow, FLOW_CLOSED) || isOpen(view, CLOSED) || view.screen !== 'graph'
