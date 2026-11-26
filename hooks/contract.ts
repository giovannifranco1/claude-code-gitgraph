// The environment contract a project declares in gitgraph.json (phase WE): the commands that
// bring a worktree's environment up and down, check it, follow its logs, and its links.
import type { CheckLine, Contract, EnvCommand, EnvStatus } from '../types'
import { basename, parentOf, resolvePath, worktreeDir, type WorktreeTarget } from './worktree'

export const CONTRACT_FILE = 'gitgraph.json'

// The newest contract version this gitgraph reads.
const VERSION = 1

const COMMANDS: readonly EnvCommand[] = ['new', 'remove', 'up', 'down', 'logs', 'check', 'status']

type Parsed = { contract: Contract | null; problem: string | null }

const off = (problem: string): Parsed => ({ contract: null, problem: `${CONTRACT_FILE}: ${problem}` })

// The file's `worktrees` section as a contract; no file or no section is none and no problem;
// anything wrong is a problem, and the contract off (the basic worktrees go on).
export function parseContract(text: string | null): Parsed {
  if (text === null) return { contract: null, problem: null }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return off('not valid JSON')
  }
  const section = (json as { worktrees?: unknown } | null)?.worktrees
  if (section === undefined) return { contract: null, problem: null }
  if (typeof section !== 'object' || section === null) return off('"worktrees" must be an object')
  const s = section as Record<string, unknown>
  if (typeof s.version !== 'number') return off('"version" must be a number')
  if (s.version > VERSION) return off(`version ${s.version} is newer than this gitgraph reads (${VERSION}): update gitgraph`)
  if (s.dir !== undefined && typeof s.dir !== 'string') return off('"dir" must be a string')
  const commands: Contract['commands'] = {}
  for (const name of COMMANDS) {
    const value = s[name]
    if (value === undefined) continue
    if (typeof value !== 'string') return off(`"${name}" must be a string`)
    if (!value.includes('{slug}')) return off(`"${name}" must have {slug}`)
    commands[name] = value
  }
  if (s.links !== undefined && !(Array.isArray(s.links) && s.links.every(l => typeof l === 'string'))) return off('"links" must be a list of strings')
  return { contract: { dir: worktreeDir((s.dir as string | undefined) ?? ''), commands, links: (s.links as string[] | undefined) ?? [] }, problem: null }
}

// A command's words with its placeholders filled; a word left empty (an optional `{base}`) is
// dropped. Run as an argument vector, never by a shell.
export function commandArgv(template: string, vars: Record<string, string>): string[] {
  return template
    .split(/\s+/)
    .map(word => word.replace(/\{(\w+)\}/g, (all, name: string) => vars[name] ?? all))
    .filter(word => word !== '')
}

// A worktree's slug for the contract: its folder's name, when the folder is in the contract's.
export function envSlug(main: string, dir: string, path: string): string | null {
  return path.includes('/') && parentOf(path) === resolvePath(main, '', dir) ? basename(path) : null
}

// A worktree's environment under the contract: its slug, the commands declared and its links;
// null without a contract or outside the contract's folder (no environment actions there).
export type Env = { slug: string; path: string; commands: Contract['commands']; links: string[] }

export function envFor(contract: Contract | null | undefined, main: string, path: string): Env | null {
  const slug = contract && main ? envSlug(main, contract.dir, path) : null
  return contract && slug ? { slug, path, commands: contract.commands, links: linkUrls(contract.links, slug) } : null
}

// A declared command's argv for a worktree; null when the contract does not declare it.
// `remove` with force gets `--force` (the nano-worktree script's flag).
export function envArgv(env: Env, name: EnvCommand, isForce = false): string[] | null {
  const template = env.commands[name]
  if (!template) return null
  return [...commandArgv(template, { slug: env.slug, path: env.path }), ...(name === 'remove' && isForce ? ['--force'] : [])]
}

// The `new` command's placeholders for what the form creates.
export function envVars(slug: string, target: WorktreeTarget): Record<string, string> {
  return 'branch' in target ? { slug, path: target.path, branch: target.branch, base: '' } : { slug, path: target.path, branch: target.newBranch, base: target.commit }
}

// eslint-disable-next-line no-control-regex
export const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '')

// `status`: its first line, `up` or `down`; anything else, or a failed run, is unknown.
export function parseEnvStatus(out: { exitCode: number; stdout: string }): EnvStatus {
  const first = stripAnsi(out.stdout).split('\n')[0]?.trim()
  return out.exitCode === 0 && (first === 'up' || first === 'down') ? first : 'unknown'
}

const MARKS: Record<string, Exclude<CheckLine['mark'], 'info'>> = { '✓': 'ok', '✗': 'failed', '–': 'shared' }

// `check`: one line per item, `✓`, `✗` or `–` first; any other line is information.
export function parseCheck(stdout: string): CheckLine[] {
  return stripAnsi(stdout)
    .split('\n')
    .map(l => l.trim())
    .filter(l => l !== '')
    .map(l => {
      const mark = MARKS[l[0] ?? '']
      return mark ? { mark, text: l.slice(1).trim() } : { mark: 'info' as const, text: l }
    })
}

// A `check` run: exit 0 (all good) and 1 (problems found) are its lines; anything else failed.
export function checkResult(out: { exitCode: number; stdout: string }): CheckLine[] | null {
  return out.exitCode === 0 || out.exitCode === 1 ? parseCheck(out.stdout) : null
}

// A followed log with a piece of output added: colors out, the piece's last unfinished line
// held for the next one, the last `keep` lines kept.
export function appendChunk(log: { lines: string[]; partial: string }, text: string, keep: number): { lines: string[]; partial: string } {
  const parts = (log.partial + stripAnsi(text)).split('\n')
  const partial = parts.pop() ?? ''
  return { lines: parts.length ? [...log.lines, ...parts].slice(-keep) : log.lines, partial }
}

export const linkUrls = (links: readonly string[], slug: string) => links.map(l => l.replaceAll('{slug}', slug))

// A link as its button shows it: the host, or the text when it is not a URL.
export function hostOf(url: string): string {
  const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(url)
  return m?.[1] ?? url
}
