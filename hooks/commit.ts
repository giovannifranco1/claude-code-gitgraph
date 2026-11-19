// Committing chosen uncommitted changes from the pane, with a message Claude suggests: what git
// is asked about them, the prompt, the reply's cleanup and the commit itself.
import type { Change } from '../types'

// The paths a change touches: a renamed one, its old path too.
const pathsOf = (files: Change[]) => files.flatMap(f => (f.from ? [f.path, f.from] : [f.path]))

// What a suggestion reads of the chosen files: their stat and diff against HEAD, and the recent
// subjects, whose style it follows.
export const contextArgs = (files: Change[]) => ({
  stat: ['diff', 'HEAD', '--stat', '--', ...pathsOf(files)],
  diff: ['diff', 'HEAD', '--', ...pathsOf(files)],
  log: ['log', '-n15', '--format=%s'],
})

// The chosen files that are new: a diff against HEAD leaves an untracked one out, so it is named.
export const newFiles = (files: Change[]) => files.filter(f => f.code === 'A').map(f => f.path).join('\n')

// The diff's characters a prompt carries at most: enough for the gist, cheap to send.
export const MAX_DIFF = 12_000

export const COMMIT_SYSTEM =
  'You write git commit messages. Reply with the message only: one line, at most 72 characters, ' +
  'no quotes, no code fences, no explanation. Follow the style of the recent commits (their ' +
  'language, prefix and scopes, as Conventional Commits when they use it), in the imperative.'

export function commitPrompt(context: { stat: string; diff: string; untracked: string; log: string }): string {
  const or = (text: string) => text.trim() || '(none)'
  const diff = context.diff.length > MAX_DIFF ? `${context.diff.slice(0, MAX_DIFF)}\n[diff cut]` : context.diff
  return [
    `Recent commit subjects:\n${or(context.log)}`,
    `Changed files:\n${or(context.stat)}`,
    `New files:\n${or(context.untracked)}`,
    `Diff:\n${or(diff)}`,
    'Write the commit message for all of these changes.',
  ].join('\n\n')
}

// The reply's message: its first line with text, without fences, quotes or a "Commit message:" label.
export function cleanMessage(reply: string): string {
  const line = reply
    .split('\n')
    .map(l => l.trim())
    .find(l => l !== '' && !l.startsWith('```')) ?? ''
  return line.replace(/^commit message:\s*/i, '').replace(/^["'`](.*)["'`]$/, '$1').trim()
}

// The chosen files staged (new and deleted ones too), then committed alone: `commit -- <paths>`
// leaves out anything else that was staged.
export const commitRuns = (message: string, files: Change[]) => [
  ['add', '-A', '--', ...pathsOf(files)],
  ['commit', '-m', message.trim(), '--', ...pathsOf(files)],
]
