// Comparing two points of the graph (commits or branches): what git is asked, and its answers.

// Two points as git's symmetric range: what a comparison (and a file diff of it) goes by.
export const rangeKey = (from: string, to: string) => `${from}...${to}`

// How many commits each side has that the other lacks, and the files from one to the other.
export const compareRuns = (from: string, to: string) => ({
  count: ['rev-list', '--left-right', '--count', rangeKey(from, to)],
  files: ['diff', '--numstat', '--no-color', '--no-ext-diff', from, to],
})

// `<left>\t<right>`: left only in `from` (what `to` is behind), right only in `to` (ahead).
export function parseCount(stdout: string): { ahead: number; behind: number } {
  const [behind = 0, ahead = 0] = stdout.trim().split(/\s+/).map(Number)
  return { ahead: ahead || 0, behind: behind || 0 }
}
