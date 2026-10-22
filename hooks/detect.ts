const READ_ONLY = new Set([
  'status', 'log', 'diff', 'show', 'blame', 'rev-parse', 'rev-list', 'ls-files', 'ls-tree', 'cat-file', 'grep',
  'describe', 'config', 'remote', 'reflog', 'shortlog', 'help', 'version', 'check-ignore', 'check-ref-format',
  'for-each-ref', 'show-ref', 'whatchanged', 'name-rev', 'merge-base',
])
const VALUED_GLOBALS = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace'])
const GH_MUTATIONS = new Set(['pr merge', 'pr checkout', 'repo sync'])

function segments(command: string): string[][] {
  return command
    .split(/&&|\|\||[;|\n]/)
    .map(s => s.trim().split(/\s+/).map(t => t.replace(/^["']|["']$/g, '')).filter(Boolean))
    .map(tokens => {
      let i = tokens[0] === 'env' ? 1 : 0
      while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i] ?? '')) i++
      return tokens.slice(i)
    })
    .filter(tokens => tokens.length > 0)
}

function gitMutates(args: string[]): boolean {
  let i = 0
  while ((args[i] ?? '').startsWith('-')) i += VALUED_GLOBALS.has(args[i] ?? '') ? 2 : 1
  const verb = args[i]
  const rest = args.slice(i + 1)
  if (!verb || READ_ONLY.has(verb)) return false
  if (verb === 'branch') return rest.some(t => !t.startsWith('-')) || rest.some(t => /^-(d|D|m|M|c|C|f)$|^--(delete|move|copy|force|set-upstream-to|unset-upstream)/.test(t))
  if (verb === 'tag') return rest.some(t => !t.startsWith('-')) && !rest.some(t => /^(-l|--list|-n\d*|--contains|--points-at|-v|--verify)$/.test(t))
  if (verb === 'stash') return !['list', 'show'].includes(rest[0] ?? '')
  return true
}

// True when a shell command runs a git (or gh) command that may change commits,
// refs, HEAD or the working tree: the graph should be reloaded after it.
export function mutatesRepo(command: string): boolean {
  return segments(command).some(tokens => {
    const head = tokens[0]?.split('/').pop()
    if (head === 'git') return gitMutates(tokens.slice(1))
    if (head === 'gh') return GH_MUTATIONS.has(`${tokens[1] ?? ''} ${tokens[2] ?? ''}`)
    return false
  })
}

// A cheap pre-check before `git check-ref-format --branch` has the last word:
// never a flag, never whitespace or control characters.
export function isBranchNameCandidate(name: string): boolean {
  return name.length > 0 && name.length <= 255 && !name.startsWith('-') && !/[\s\x00-\x1f\x7f;&|$`]/.test(name)
}
