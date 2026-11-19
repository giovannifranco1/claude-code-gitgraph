// Asking Claude, in the session's chat, to resolve the files a git operation left in conflict.
import type { FlowConflict } from '../types'

// The git flow operation that stopped on a conflict, as the request names it: an update rebases
// the branch on its base, or merges its base in, as the repo's git flow config says.
export function conflictOrigin({ op, topic }: FlowConflict): string {
  if (op === 'finish') return `git flow finish of ${topic.branch}`
  return op === 'rebase' ? `rebasing ${topic.branch} on its base (git flow update)` : `merging its base into ${topic.branch} (git flow update)`
}

// The request: the files, the operation that left them (when the pane knows it), the repo (when
// not the session folder), how to resolve them, and that committing and continuing stay with
// the pane, where Continue and Abort are.
export function conflictPrompt({ files, from, repo }: { files: string[]; from?: string; repo: string }): string {
  const where = repo === '.' ? 'this repository' : `the repository at ${repo}`
  return [
    `Resolve the git conflicts in ${where}${from ? `, left by ${from}` : ''}.`,
    `Conflicted files:\n${files.map(f => `- ${f}`).join('\n')}`,
    'For each file, read both sides (and the commits they come from when that helps), keep the changes both sides meant, remove the conflict markers, and stage it with `git add`.',
    'Do not commit, and do not continue or abort the operation: I will do that from the Git Graph pane once you are done.',
  ].join('\n\n')
}

export const conflictToast = (n: number) => `Asked Claude to resolve ${n} conflicted ${n === 1 ? 'file' : 'files'}`
