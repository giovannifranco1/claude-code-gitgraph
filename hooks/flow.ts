import type { FlowBase, FlowCli, FlowConfig, FlowConflict, FlowKind, FlowOptions, FlowTopic, FlowType } from '../types'
import type { MenuItem } from './menu'

const KINDS: FlowKind[] = ['feature', 'bugfix', 'release', 'hotfix']
const SEMVER = /^(v?)(\d+)\.(\d+)\.(\d+)$/

const title = (kind: FlowKind) => kind[0]?.toUpperCase() + kind.slice(1)

// `git flow version`: git-flow-next names itself; any other answer is another git flow.
export function flowCliOf(exitCode: number, stdout: string): FlowCli {
  if (exitCode !== 0) return 'none'
  return stdout.includes('git-flow-next') ? 'next' : 'other'
}

// `git config --get-regexp ^gitflow\.` → the work types, the bases and the remote; null
// where no work type is set up. git-flow-next's own keys first, else git flow AVH's
// (`gitflow.prefix.<type>`), read the way git-flow-next reads them.
export function parseFlowConfig(stdout: string): FlowConfig | null {
  const values = new Map<string, string>()
  for (const line of stdout.split('\n')) {
    const at = line.indexOf(' ')
    if (at > 0) values.set(line.slice(0, at), line.slice(at + 1).trim())
  }
  const remote = values.get('gitflow.origin') || 'origin'
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
    return { types, bases, remote }
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
  return { types, bases: [{ name: main, parent: '', isAutoUpdate: false }, { name: develop, parent: main, isAutoUpdate: true }], remote }
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

export const defaultTagMessage = ({ kind, name }: FlowTopic) => `${title(kind)} ${name}`

export const updateLabel = (type: FlowType) => (type.strategy === 'rebase' ? `Rebase on ${type.parent}` : `Merge ${type.parent} in`)

export const flowArgs = (verb: 'start' | 'update' | 'publish', { kind, name }: FlowTopic) => ['flow', kind, verb, name]

// A tagged type always gets `-m`: without it git flow would open an editor for the tag.
export function finishArgs(topic: FlowTopic, config: FlowConfig, opts: FlowOptions, tagMessage: string | null): string[] {
  const args = ['flow', topic.kind, 'finish', topic.name, opts.isNoFf ? '--no-ff' : '--ff', opts.isKeep ? '--keep' : '--no-keep']
  if (typeOf(config, topic.kind)?.isTagged) args.push('-m', tagMessage?.trim() || defaultTagMessage(topic))
  return args
}

// What a finish merged into: the type's parent and the bases kept up to date from it
// (a release lands on main, then develop follows main).
export function finishPushArgs(topic: FlowTopic, config: FlowConfig): string[] {
  const parent = typeOf(config, topic.kind)?.parent ?? ''
  const followers = config.bases.filter(b => b.parent === parent && b.isAutoUpdate).map(b => b.name)
  return ['push', '--follow-tags', config.remote, parent, ...followers]
}

// A stopped finish goes on through git flow; a stopped update through git's own merge or rebase.
export const resumeArgs = ({ op, topic }: FlowConflict, flag: '--continue' | '--abort') =>
  op === 'finish' ? ['flow', topic.kind, 'finish', flag, topic.name] : [op, flag]

// The git flow items a work branch's menu leads with; none for other branches.
export function flowMenuFor(branch: string, config: FlowConfig | null): MenuItem[] {
  const topic = config && topicOf(branch, config)
  const type = topic && typeOf(config, topic.kind)
  if (!topic || !type) return []
  return [
    { id: 'flow-finish', label: `Finish ${topic.kind}`, flow: { action: 'finish', topic } },
    { id: 'flow-update', label: updateLabel(type), flow: { action: 'update', topic } },
    { id: 'flow-publish', label: 'Publish', isNetwork: true, flow: { action: 'publish', topic } },
  ]
}
