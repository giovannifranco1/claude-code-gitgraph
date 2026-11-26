// Git worktrees: reading them, naming and placing a new one, and the git runs that add and
// remove one. Pure: the pane wires these to git and to its screens.
import type { Worktree, WorktreeForm } from '../types'
import { countChanges } from './log'

export { countChanges }

export const WORKTREE_ARGS = ['worktree', 'list', '--porcelain']

// Where new worktrees go unless the repo's local config says otherwise (Claude Code's own folder).
export const DEFAULT_WORKTREE_DIR = '.claude/worktrees'
// The local config key holding the folder (Settings → Worktree folder).
export const WORKTREE_DIR_KEY = 'gitgraph.worktreeDir'

// `git worktree list --porcelain`: a block per worktree, blank-line separated; the first is
// the main worktree.
export function parseWorktrees(stdout: string): Worktree[] {
  return stdout
    .split(/\n\s*\n/)
    .map(block => block.split('\n').filter(Boolean))
    .filter(lines => lines[0]?.startsWith('worktree '))
    .map((lines, i) => {
      const value = (key: string) => lines.find(l => l === key || l.startsWith(`${key} `))
      const branch = value('branch')?.slice('branch '.length).replace(/^refs\/heads\//, '') ?? null
      return {
        path: lines[0]!.slice('worktree '.length),
        head: value('HEAD')?.slice('HEAD '.length) ?? '',
        branch,
        isMain: i === 0,
        isLocked: value('locked') !== undefined,
        isPrunable: value('prunable') !== undefined,
      }
    })
}

// Each branch open in a worktree other than `current` (the folder the pane shows), with where:
// what its badge marks, and why it gets no second worktree (git refuses one).
export function branchWorktrees(list: Worktree[], current: string): Record<string, string> {
  return Object.fromEntries(list.filter(w => w.branch && w.path !== current).map(w => [w.branch!, w.path]))
}

// The worktree the pane shows: the one on its branch (a branch is open in one worktree only),
// or, detached, the detached one on its commit.
export function currentWorktree(list: Worktree[], head: string, branch: string): Worktree | undefined {
  return list.find(w => w.branch === branch) ?? list.find(w => w.branch === null && w.head === head)
}

// The main worktree's folder: the first one git lists ('' before the first load).
export const mainPath = (list: Worktree[] | undefined) => list?.[0]?.path ?? ''

// A worktree's folder name from its branch: lowercase, every other character a dash.
export const slugOf = (branch: string) =>
  branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

// The same rule as a subdomain label, so a worktree's slug can name its environment later.
export const isValidSlug = (slug: string) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)

// A folder as typed: trimmed, without a trailing slash.
const normalizeDir = (dir: string) => dir.trim().replace(/\/+$/, '')

export const worktreeDir = (configured: string) => normalizeDir(configured) || DEFAULT_WORKTREE_DIR

// A path as typed, absolute: `~` from home, a relative one from the main worktree; `.` and
// `..` resolved, no trailing slash.
export function resolvePath(main: string, home: string, input: string): string {
  const raw = input.trim()
  const full = raw === '~' || raw.startsWith('~/') ? `${home}${raw.slice(1)}` : raw.startsWith('/') ? raw : `${main}/${raw}`
  const parts: string[] = []
  for (const part of full.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return `/${parts.join('/')}`
}


export const isInside = (main: string, path: string) => path === main || path.startsWith(`${main}/`)

// A path's last part, and the folder holding it.
export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)
export const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/'))

// For git a worktree works anywhere; outside the main worktree's folder the session (and, with
// a gitgraph.json, the project's environment) does not reach it. Null inside.
export function pathWarning(main: string, path: string, hasContract = false): string | null {
  if (isInside(main, path)) return null
  const env = hasContract ? "; the project's environment (gitgraph.json) won't serve it either" : ''
  return `Outside ${basename(main)}: Claude's session can't reach it until the folder is added to the session${env}.`
}

// The `.git/info/exclude` line that keeps a worktree inside the repo out of its status: the
// folder holding it, from the repo root.
export function excludeEntry(main: string, path: string): string {
  const parent = parentOf(path)
  return parent === main ? `/${basename(path)}/` : `/${parent.slice(main.length + 1)}/`
}

// `.git/info/exclude` with the entry added at the end; null when it is already there.
export function withExclude(text: string, entry: string): string | null {
  if (text.split('\n').includes(entry)) return null
  return `${text}${text && !text.endsWith('\n') ? '\n' : ''}${entry}\n`
}

// What a new worktree is on: a branch that exists, or a new branch at a commit.
export type WorktreeTarget = { path: string; branch: string } | { path: string; newBranch: string; commit: string }

export function addArgs(target: WorktreeTarget): string[] {
  return 'branch' in target ? ['worktree', 'add', target.path, target.branch] : ['worktree', 'add', '-b', target.newBranch, target.path, target.commit]
}

export const removeArgs = (path: string, isForce: boolean) => ['worktree', 'remove', ...(isForce ? ['--force'] : []), path]

export const relativeTo = (main: string, path: string) => (path === main ? '.' : isInside(main, path) ? path.slice(main.length + 1) : path)

// A new worktree's form: on a branch, named after it; at a commit, named after the new branch
// once typed. The path is the folder's (`dir`) plus the name.
export type FormOn = { kind: 'branch'; branch: string } | { kind: 'commit'; hash: string } | { kind: 'head' }

export function newForm(target: FormOn, dir: string, home = ''): WorktreeForm {
  const slug = target.kind === 'branch' ? slugOf(target.branch) : ''
  return { ...target, newBranch: '', slug, path: `${dir}/${slug}`, dir, home, isSlugEdited: false, isPathEdited: false, error: null }
}

// A field typed: the name follows the new branch, and the path the name, each until typed itself.
export function formInput(form: WorktreeForm, field: 'newBranch' | 'slug' | 'path', value: string): WorktreeForm {
  if (field === 'path') return { ...form, path: value, isPathEdited: true, error: null }
  const next = field === 'slug' ? { ...form, slug: value, isSlugEdited: true } : { ...form, newBranch: value, ...(!form.isSlugEdited && { slug: slugOf(value) }) }
  return { ...next, ...(!form.isPathEdited && { path: `${form.dir}/${next.slug}` }), error: null }
}

// What stops the form (`error`), or the worktree's folder, resolved, and what it warns of
// before creating it (`warning`).
export function formProblem(form: WorktreeForm, main: string, hasContract = false): { error: string } | { path: string; warning?: string } {
  if (form.kind !== 'branch' && !form.newBranch.trim()) return { error: form.kind === 'commit' ? 'Name the new branch' : 'Name a branch, existing or new' }
  if (!isValidSlug(form.slug)) return { error: 'Name: lowercase letters, digits and inner dashes' }
  if (!form.path.trim()) return { error: 'Pick a path for the worktree' }
  const path = resolvePath(main, form.home, form.path)
  const warning = pathWarning(main, path, hasContract)
  return warning ? { path, warning } : { path }
}

// Saves the repo's worktree folder in its local config; an empty one unsets it (the default).
export const worktreeDirArgs = (value: string) => {
  const dir = normalizeDir(value)
  return dir ? ['config', '--local', WORKTREE_DIR_KEY, dir] : ['config', '--local', '--unset', WORKTREE_DIR_KEY]
}

// What asking Claude to create the form's worktree says: the native git run, and, inside the
// repo, keeping its folder out of the main worktree's status first.
export function createPrompt(target: WorktreeTarget, main: string): string {
  const exclude = isInside(main, target.path)
    ? ` Before it, if git does not ignore that folder, add \`${excludeEntry(main, target.path)}\` to .git/info/exclude, so the worktree stays out of the main worktree's status.`
    : ''
  return `Create a git worktree with git's own command: \`git ${addArgs(target).join(' ')}\`.${exclude} Tell me its path when it is done.`
}

// What the form adds: on its branch; at a commit, on the new branch; from the screen, on the
// branch typed when it exists locally, else on a new one off HEAD.
export function formTarget(form: WorktreeForm, path: string, locals: string[]): WorktreeTarget {
  if (form.kind === 'branch') return { path, branch: form.branch }
  const name = form.newBranch.trim()
  if (form.kind === 'head' && locals.includes(name)) return { path, branch: name }
  return { path, newBranch: name, commit: form.kind === 'commit' ? form.hash : 'HEAD' }
}
