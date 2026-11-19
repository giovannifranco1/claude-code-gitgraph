import { expect, test } from 'claude-code/testing'

import type { FlowView, View } from '../types'
import { dismissModal, hasModal } from '../hooks/dismiss'

const FLOW: FlowView = { starting: null, finishing: null, opts: { isNoFf: false, isPush: false, isKeep: false }, tagMessage: null, conflict: null, init: null, confirming: null, isMenuOpen: false }
const VIEW: View = { scope: 'all', limit: 200, selected: null, confirm: null, menu: null, isRenaming: false, isDeleting: false, isForce: false, push: null, running: null, screen: 'graph', configScope: 'local', editingRemote: null, isAddingRemote: false, remoteDraft: '', scrollTo: null, isSearching: false, search: '', commitDraft: '', isSuggesting: false, uncommittedForm: null, commitStep: 'files', commitFiles: [], refresh: 'idle', isOpen: true, flow: FLOW, isActionsOpen: false, notice: null }
const MENU: View['menu'] = { hash: 'aaaaaaa1', badge: { kind: 'branch', label: 'feat', remotes: [] } }

test('ESC-01 with no modal open there is nothing to dismiss', async () => {
  expect(dismissModal(VIEW)).toBeNull()
  expect(hasModal(VIEW)).toBe(false)
  expect(hasModal({ ...VIEW, selected: 'aaaaaaa1', isSearching: true })).toBe(false)
})

test('ESC-01 the notice dialog goes first, leaving what is under it', async () => {
  const view = { ...VIEW, notice: { label: 'Fetching', error: 'boom' }, menu: MENU }
  expect(dismissModal(view)).toEqual({ ...view, notice: null })
})

test('ESC-01 the git flow dialogs close together, keeping the conflict and the options', async () => {
  const flow = { ...FLOW, isMenuOpen: true, starting: 'feature' as const, conflict: { op: 'merge' as const, topic: { kind: 'feature' as const, name: 'x', branch: 'feature/x' } }, opts: { isNoFf: true, isPush: false, isKeep: false } }
  const view = { ...VIEW, flow, menu: MENU }
  expect(dismissModal(view)).toEqual({ ...view, flow: { ...flow, isMenuOpen: false, starting: null } })
  expect(hasModal({ ...VIEW, flow: { ...FLOW, finishing: { kind: 'hotfix', name: '1.0.1', branch: 'hotfix/1.0.1' } } })).toBe(true)
})

test('ESC-01 a ref menu closes with its forms', async () => {
  const view = { ...VIEW, menu: MENU, isDeleting: true, isForce: true, push: ['origin'] }
  expect(dismissModal(view)).toEqual(VIEW)
})

test('ESC-01 the commit actions close, keeping the commit open', async () => {
  const view = { ...VIEW, selected: 'aaaaaaa1', isActionsOpen: true, confirm: 'reset' }
  expect(dismissModal(view)).toEqual({ ...VIEW, selected: 'aaaaaaa1' })
})

test('ESC-01 the settings and changelog screens go back to the graph', async () => {
  expect(dismissModal({ ...VIEW, screen: 'settings', editingRemote: 'origin' })).toEqual({ ...VIEW, screen: 'settings' })
  expect(dismissModal({ ...VIEW, screen: 'settings' })).toEqual(VIEW)
  expect(dismissModal({ ...VIEW, screen: 'changelog' })).toEqual(VIEW)
})

test('ESC-01 the uncommitted changes dialog closes; a selected commit is no modal', async () => {
  expect(dismissModal({ ...VIEW, selected: '*' })).toEqual(VIEW)
  // a form of theirs goes back to their actions first
  expect(dismissModal({ ...VIEW, selected: '*', uncommittedForm: 'commit' })).toEqual({ ...VIEW, selected: '*' })
  expect(hasModal({ ...VIEW, selected: 'aaaaaaa1' })).toBe(false)
})

test('SH-02 a stash dialog closes on Escape, its armed drop first', async () => {
  expect(hasModal({ ...VIEW, selected: 'stash@{1}' })).toBe(true)
  expect(dismissModal({ ...VIEW, selected: 'stash@{1}' })).toEqual(VIEW)
  expect(dismissModal({ ...VIEW, selected: 'stash@{1}', confirm: 'stash-drop:stash@{1}' })).toEqual({ ...VIEW, selected: 'stash@{1}' })
})
