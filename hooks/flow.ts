import type { FlowBase, FlowCli, FlowConfig, FlowConflict, FlowKind, FlowOptions, FlowStep, FlowTopic, FlowType } from '../types'
import type { MenuItem } from './menu'

// The base branches a merge goes into: git flow's, else the usual names (as `git flow init` offers).
const DEFAULT_BASES = ['main', 'master', 'develop', 'dev']
export const basesOf = (config: FlowConfig | null | undefined) => config?.bases.map(b => b.name) ?? DEFAULT_BASES

// The main branch: git flow's base with no parent, else `master` where there is no `main`.
export const mainOf = (config: FlowConfig | null | undefined, branches: string[]) =>
  config?.bases.find(b => !b.parent)?.name ?? (branches.includes('master') && !branches.includes('main') ? 'master' : 'main')

export const KINDS: FlowKind[] = ['feature', 'bugfix', 'release', 'hotfix']
const SEMVER = /^(v?)(\d+)\.(\d+)\.(\d+)$/

// `git flow version`: git-flow-next names itself; any other answer is another git flow.
export function flowCliOf(exitCode: number, stdout: string): FlowCli {
  if (exitCode !== 0) return 'none'
  return stdout.includes('git-flow-next') ? 'next' : 'other'
}

// The remote to push to when nothing names one: origin when the repo has one, else its
// first (a repo whose only remote is `github` pushes there).
export const preferredRemote = (remotes: string[]): string | undefined => (remotes.includes('origin') ? 'origin' : remotes[0])

// `git config --get-regexp ^gitflow\.` → the work types, the bases and the remote; null
// where no work type is set up. git-flow-next's own keys first, else git flow AVH's
// (`gitflow.prefix.<type>`), read the way git-flow-next reads them.
export function parseFlowConfig(stdout: string, remotes: string[] = []): FlowConfig | null {
  const values = new Map<string, string>()
  for (const line of stdout.split('\n')) {
    const at = line.indexOf(' ')
    if (at > 0) values.set(line.slice(0, at), line.slice(at + 1).trim())
  }
  const remote = values.get('gitflow.origin') || (preferredRemote(remotes) ?? 'origin')
  const get = (branch: string, key: string) => values.get(`gitflow.branch.${branch}.${key}`) ?? ''
  const types = KINDS.flatMap((kind): FlowType[] => {
    const prefix = get(kind, 'prefix')
    const parent = get(kind, 'parent')
    if (!prefix || !parent) return []
    return [{ kind, prefix, parent, startpoint: get(kind, 'startpoint') || parent, isTagged: get(kind, 'tag') === 'true', strategy: get(kind, 'downstreamstrategy') === 'rebase' ? 'rebase' : 'merge' }]
  })
  if (types.length) {
    const branches = new Set([...values.keys()].filter(k => k.startsWith('gitflow.branch.')).map(k => k.split('.')[2] ?? ''))
    const bases = [...branches]
      .filter(b => get(b, 'type') === 'base')
      .map((name): FlowBase => ({ name, parent: get(name, 'parent'), isAutoUpdate: get(name, 'autoupdate') === 'true' }))
    return { types, bases, remote, tagPrefix: get('release', 'tagprefix') || get('hotfix', 'tagprefix') }
  }
  return avhConfig(values, remote)
}

function avhConfig(values: Map<string, string>, remote: string): FlowConfig | null {
  const main = values.get('gitflow.branch.master') || 'main'
  const develop = values.get('gitflow.branch.develop') || 'develop'
  const shapes: Record<FlowKind, Omit<FlowType, 'kind' | 'prefix'>> = {
    feature: { parent: develop, startpoint: develop, isTagged: false, strategy: 'rebase' },
    bugfix: { parent: develop, startpoint: develop, isTagged: false, strategy: 'rebase' },
    release: { parent: main, startpoint: develop, isTagged: true, strategy: 'merge' },
    hotfix: { parent: main, startpoint: main, isTagged: true, strategy: 'rebase' },
  }
  const types = KINDS.flatMap((kind): FlowType[] => {
    const prefix = values.get(`gitflow.prefix.${kind}`)
    return prefix ? [{ kind, prefix, ...shapes[kind] }] : []
  })
  if (!types.length) return null
  return { types, bases: [{ name: main, parent: '', isAutoUpdate: false }, { name: develop, parent: main, isAutoUpdate: true }], remote, tagPrefix: values.get('gitflow.prefix.versiontag') ?? '' }
}

export const typeOf = (config: FlowConfig, kind: FlowKind) => config.types.find(t => t.kind === kind)

export const topicFor = (type: FlowType, name: string): FlowTopic => ({ kind: type.kind, name, branch: `${type.prefix}${name}` })

// The work branch a branch name is, by its type's prefix.
export function topicOf(branch: string, config: FlowConfig): FlowTopic | undefined {
  const type = config.types.find(t => branch.startsWith(t.prefix) && branch.length > t.prefix.length)
  return type && topicFor(type, branch.slice(type.prefix.length))
}

// The version a new release (minor + 1) or hotfix (patch + 1) gets, after the highest
// semver tag; empty for the types not named after a version.
export function nextVersion(tags: string[], kind: FlowKind): string {
  if (kind !== 'release' && kind !== 'hotfix') return ''
  const versions = tags.flatMap(t => {
    const m = SEMVER.exec(t)
    return m ? [{ v: m[1] ?? '', n: [Number(m[2]), Number(m[3]), Number(m[4])] as const }] : []
  })
  const top = versions.sort((a, b) => b.n[0] - a.n[0] || b.n[1] - a.n[1] || b.n[2] - a.n[2])[0]
  const [major, minor, patch] = top?.n ?? [0, 0, 0]
  return kind === 'release' ? `${top?.v ?? ''}${major}.${minor + 1}.0` : `${top?.v ?? ''}${major}.${minor}.${patch + 1}`
}

// The tag's message: its version alone, as the tag is named (git flow needs one for an annotated tag).
export const defaultTagMessage = ({ name }: FlowTopic) => name

export const updateLabel = (type: FlowType) => (type.strategy === 'rebase' ? `Rebase on ${type.parent}` : `Merge ${type.parent} in`)

export const flowArgs = (verb: 'start' | 'update', { kind, name }: FlowTopic) => ['flow', kind, verb, name]

// A tagged type always gets `-m`: without it git flow would open an editor for the tag.
export function finishArgs(topic: FlowTopic, config: FlowConfig, opts: FlowOptions, tagMessage: string | null): string[] {
  const args = ['flow', topic.kind, 'finish', topic.name, opts.isNoFf ? '--no-ff' : '--ff', opts.isKeep ? '--keep' : '--no-keep']
  if (typeOf(config, topic.kind)?.isTagged) args.push('-m', tagMessage?.trim() || defaultTagMessage(topic))
  return args
}

// `-D` deletes a branch whose work is merged nowhere; `-d` refuses to.
export const deleteBranchArgs = (name: string, isForce: boolean) => ['branch', isForce ? '-D' : '-d', name]

// A branch's delete, here and then on each remote given: run in order, stopping at the first
// failure (a local branch git keeps leaves its remotes as they are).
export const deleteBranchSteps = (name: string, isForce: boolean, remotes: string[]): FlowStep[] => [
  { args: deleteBranchArgs(name, isForce), failed: `Deleting ${name} failed` },
  ...remotes.map((r): FlowStep => ({ args: ['push', r, '--delete', name], isNetwork: true, failed: `Deleting ${name} on ${r} failed` })),
]

// What the repo knows when a finish starts: the local branches not yet merged into the type's
// parent (an open release: one finished and kept is merged, so not open), whether the remote has
// the work branch (to delete it there), and whether the finish pushes.
export type FinishHere = { unmerged: string[]; isOnRemote: boolean; canPush: boolean }

// The query for those branches: the local ones git has not merged into `parent`.
export const unmergedArgs = (parent: string) => ['for-each-ref', '--format=%(refname:short)', `--no-merged=refs/heads/${parent}`, 'refs/heads']

// A finish, as classic git flow does it. The branch goes into its type's parent, through git
// flow (with the tag); where bases follow that parent (develop follows main), the branch itself
// is merged into them too, as `Merge branch 'hotfix/x' into develop`, where git-flow-next would
// merge the parent into them instead; a hotfix goes into an open release in place of develop,
// and the release takes it to develop when it finishes. git flow runs with those bases'
// autoupdate off, keeping the branch for those merges; the branch is deleted (here and on the
// remote) after the push, unless kept. With no base following (a feature), git flow alone.
export function finishSteps(topic: FlowTopic, config: FlowConfig, opts: FlowOptions, tagMessage: string | null, here: FinishHere): FlowStep[] {
  const parent = typeOf(config, topic.kind)?.parent ?? ''
  const followers = config.bases.filter(b => b.parent === parent && b.isAutoUpdate).map(b => b.name)
  const release = typeOf(config, 'release')
  const open = topic.kind === 'hotfix' && release ? here.unmerged.find(b => b.startsWith(release.prefix) && b.length > release.prefix.length) : undefined
  const targets = followers.length && open ? [open] : followers
  const off = followers.flatMap(b => ['-c', `gitflow.branch.${b}.autoupdate=false`])
  const push: FlowStep[] = here.canPush
    ? [{ args: ['push', '--follow-tags', config.remote, parent, ...targets], isNetwork: true, failed: `Finished ${topic.branch}, but the push to ${config.remote} failed` }]
    : []
  if (!targets.length) return [{ args: finishArgs(topic, config, opts, tagMessage), isNetwork: true, stops: { op: 'finish', topic } }, ...push]
  return [
    { args: finishArgs(topic, config, { ...opts, isKeep: true }, tagMessage), config: off, isNetwork: true, stops: { op: 'finish', topic, config: off } },
    ...targets.flatMap((into): FlowStep[] => [
      { args: ['checkout', into], isFlow: true, failed: `Finished ${topic.branch} into ${parent}, but checking out ${into} failed` },
      {
        args: ['merge', opts.isNoFf ? '--no-ff' : '--ff', '-m', `Merge branch '${topic.branch}' into ${into}`, topic.branch],
        isFlow: true,
        failed: `Finished ${topic.branch} into ${parent}, but the merge into ${into} stopped`,
        stops: { op: 'merge', topic, into },
      },
    ]),
    ...push,
    ...(opts.isKeep ? [] : deleteBranchSteps(topic.branch, false, here.isOnRemote ? [config.remote] : [])),
  ]
}

// A stopped finish goes on through git flow (with the `-c` settings it ran with, see
// resumeStep); a stopped update, or a classic finish's merge into a base, through git's own
// merge or rebase.
export const resumeArgs = ({ op, topic }: FlowConflict, flag: '--continue' | '--abort') =>
  op === 'finish' ? ['flow', topic.kind, 'finish', flag, topic.name] : [op, flag]

// The step that goes on with a stopped one, or aborts it: a finish's own git (its git flow, its
// merge into a base) runs as git flow is run; continuing, it may stop again.
export function resumeStep(conflict: FlowConflict, flag: '--continue' | '--abort'): FlowStep {
  const { then: _then, ...stops } = conflict
  return { args: resumeArgs(conflict, flag), config: conflict.config, isFlow: conflict.op === 'finish' || conflict.into !== undefined, ...(flag === '--continue' && { stops }) }
}

// The git flow items a work branch's menu leads with; none for other branches.
export function flowMenuFor(branch: string, config: FlowConfig | null): MenuItem[] {
  const topic = config && topicOf(branch, config)
  const type = topic && typeOf(config, topic.kind)
  if (!topic || !type) return []
  return [
    { id: 'flow-finish', label: `Finish ${topic.kind}`, flow: { action: 'finish', topic } },
    { id: 'flow-update', label: updateLabel(type), flow: { action: 'update', topic } },
  ]
}
