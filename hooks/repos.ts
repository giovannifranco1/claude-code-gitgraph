import { truncate } from './format'

// Folders never searched for repos: dependencies and build output (hidden ones, as .venv,
// are pruned by name).
const PRUNED = ['node_modules', 'vendor', 'dist', 'build', 'target']

// Finds the .git directories of the session folder and of repos up to three levels
// below it (a repo at ./a/b/c has its .git at depth 4). A .git file, as a submodule's or
// a worktree's, is not a repo. `-mindepth 1` keeps `.` itself from matching `.*`.
export const FIND_ARGS = [
  'find', '.', '-mindepth', '1', '-maxdepth', '4',
  '(', '-type', 'd', '(', ...PRUNED.flatMap(name => ['-name', name, '-o']), '(', '-name', '.*', '!', '-name', '.git', ')', ')', '-prune', ')',
  '-o', '-type', 'd', '-name', '.git', '-print', '-prune',
]

// `./api/.git` lines to repo paths relative to the session folder: `.` (the folder itself)
// first, then alphabetically.
export function parseRepos(stdout: string): string[] {
  return stdout
    .split('\n')
    .filter(l => l.endsWith('/.git'))
    .map(l => l.slice('./'.length, -'/.git'.length) || '.')
    .sort((a, b) => (a === '.' ? -1 : b === '.' ? 1 : a.localeCompare(b)))
}

// The repo the pane shows: the current one while it still exists, else the first found;
// with none, the session folder (which shows "not a git repository").
export function pickActive(list: readonly string[], current: string): string {
  return list.includes(current) ? current : (list[0] ?? '.')
}

// The branch a repo's HEAD points at. `-q` makes a detached HEAD exit 1 without a message.
export const BRANCH_ARGS = ['symbolic-ref', '--short', '-q', 'HEAD']

// The branch from BRANCH_ARGS' output: `detached` off a branch, null when it could not be read.
export function parseBranch(out: { exitCode: number; stdout: string }): string | null {
  if (out.exitCode === 1) return 'detached'
  return out.exitCode === 0 ? out.stdout.trim() || null : null
}

// The remote branch a local branch tracks, and whether it is gone from the remote.
export const UPSTREAM_ARGS = (branch: string) => ['for-each-ref', '--format=%(upstream:short)%00%(upstream:track)', `refs/heads/${branch}`]

// The upstream from UPSTREAM_ARGS' output (`origin/main`); null when none, gone, or unread.
export function parseUpstream(out: { exitCode: number; stdout: string }): string | null {
  if (out.exitCode !== 0) return null
  const [upstream = '', track = ''] = out.stdout.trim().split('\0')
  return upstream && !track.includes('gone') ? upstream : null
}

export const repoLabel = (path: string) => (path === '.' ? '(this folder)' : path)

// A picker option's right column: spaces out to one cell short of the pane edge, then the
// branch its repo is on in brackets, cut to fit; nothing when unknown or no room. Padded by
// hand: a flex row in the header does not stretch to the pane, so it cannot push it there.
export function branchColumn(label: string, branch: string | undefined, cols: number): string {
  const room = cols - 1 - label.length - 1
  if (!branch || room < 3) return ''
  const tag = `[${truncate(branch, room - 2)}]`
  return ' '.repeat(room - tag.length + 1) + tag
}
