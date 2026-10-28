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
