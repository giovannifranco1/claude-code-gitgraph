import type { FlowConfig, FlowInitForm, FlowKind } from '../types'
import { isBranchNameCandidate } from './detect'
import { KINDS, typeOf } from './flow'

// Every local and remote branch, by name without its remote: the names a repo already uses.
export const BRANCH_REFS_ARGS = ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes']

export function branchNamesOf(stdout: string): string[] {
  return stdout.split('\n').flatMap(ref => {
    if (ref.startsWith('refs/heads/')) return [ref.slice('refs/heads/'.length)]
    const remote = /^refs\/remotes\/[^/]+\/(.+)$/.exec(ref)?.[1]
    return remote && remote !== 'HEAD' ? [remote] : []
  })
}

// The standard prefix of each type, and the short one some repos use instead.
const PREFIXES: Record<FlowKind, [long: string, short: string]> = {
  feature: ['feature/', 'feat/'],
  bugfix: ['bugfix/', 'fix/'],
  release: ['release/', 'rel/'],
  hotfix: ['hotfix/', 'hot/'],
}

const firstOf = (branches: string[], names: string[], fallback: string) => names.find(n => branches.includes(n)) ?? fallback

// The short prefix when branches use it and none uses the standard one.
function detectPrefix(branches: string[], kind: FlowKind): string {
  const [long, short] = PREFIXES[kind]
  const uses = (prefix: string) => branches.some(b => b.startsWith(prefix) && b.length > prefix.length)
  return uses(short) && !uses(long) ? short : long
}

// What the init form starts with: the current config when reconfiguring, else what the
// repo's branches suggest (main or master, develop or dev, short prefixes in use).
export function initFormFor(branches: string[], config: FlowConfig | null): FlowInitForm {
  const main = config?.bases.find(b => !b.parent)?.name ?? firstOf(branches, ['main', 'master'], 'main')
  const develop = config?.bases.find(b => b.parent === main)?.name ?? firstOf(branches, ['develop', 'dev'], 'develop')
  const prefixes = Object.fromEntries(KINDS.map(kind => [kind, (config && typeOf(config, kind))?.prefix ?? detectPrefix(branches, kind)])) as Record<FlowKind, string>
  return { main, develop, ...prefixes, tag: config?.tagPrefix ?? '' }
}

// The standard names, the form's placeholders.
export const DEFAULT_FORM = initFormFor([], null)

export const trimForm = (form: FlowInitForm) => Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()])) as FlowInitForm

const FIELD_NAMES: [keyof FlowInitForm, string][] = [['main', 'main branch'], ['develop', 'develop branch'], ...KINDS.map((k): [FlowKind, string] => [k, `${k} prefix`]), ['tag', 'tag prefix']]

// The first invalid field of a trimmed form, named for a toast; null when it can run. Only the
// tag prefix may be empty. Git has the last word on the branch names (`check-ref-format`).
export function initFormError(form: FlowInitForm): string | null {
  const bad = FIELD_NAMES.find(([key]) => !(key === 'tag' && form.tag === '') && !isBranchNameCandidate(form[key]))
  if (bad) return `Invalid ${bad[1]}: "${form[bad[0]]}"`
  return form.main === form.develop ? 'The develop branch must differ from the main branch' : null
}

// `git flow init -d` with a trimmed form's names; `-f` reconfigures a repo already set up.
export function initArgs(form: FlowInitForm, isForce: boolean): string[] {
  const args = ['flow', 'init', '-d', ...(isForce ? ['-f'] : []), '--main', form.main, '--develop', form.develop, ...KINDS.flatMap(kind => [`--${kind}`, form[kind]])]
  return form.tag ? [...args, '--tag', form.tag] : args
}

// `init -f` keeps the gitflow section of a base it no longer names: drop those first, or the
// old base would still read as one.
export const staleBaseArgs = (config: FlowConfig, form: FlowInitForm): string[][] =>
  config.bases.filter(b => b.name !== form.main && b.name !== form.develop).map(b => ['config', '--local', '--remove-section', `gitflow.branch.${b.name}`])
