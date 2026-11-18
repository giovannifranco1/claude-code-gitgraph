import { atom, read, update } from 'claude-code'
import type { ClientElements, Elements, EngineInterface, ProcessRunResult, Register, RenderChildren, RenderSurface } from 'claude-code'

import type { Badge, BadgeKind, BadgeStyle, Cell, Changelog, Columns, CommitDetail, ConfigScope, FileStat, FlowConfig, FlowConflict, FlowInfo, FlowInitForm, FlowKind, FlowOptions, FlowTopic, FlowView, Graph, GraphRow, Ref, RepoSettings, Repos, Screen, View } from '../types'
import { parseChangelog, versionOf } from './changelog'
import { badgeParts, badgesOf, diffBar, fitBadges } from './badges'
import { isBranchNameCandidate } from './detect'
import { absTime, fitGraph, HASH_W, relTime, short, truncate, truncateMiddle } from './format'
import { layout } from './lanes'
import { clampTop, findByHash, isHashQuery, topOf, visibleRange, widestIn, windowAt, wrapRows } from './virtual'
import { DETAIL_FORMAT, localsOf, LOG_FORMAT, parseDetail, parseLog, parseStatus, parseSync, remotesOf, UNCOMMITTED, withUncommitted } from './log'
import { defaultTagMessage, finishArgs, finishPushArgs, flowArgs, flowCliOf, nextVersion, parseFlowConfig, resumeArgs, topicFor, topicOf, typeOf } from './flow'
import { BRANCH_REFS_ARGS, branchNamesOf, DEFAULT_FORM, initArgs, initFormError, initFormFor, staleBaseArgs, trimForm } from './flowinit'
import { checkoutArgs, defaultPushRemotes, deleteBranchArgs, type MenuItem, menuFor, menuGroups, pushRuns, renameArgs } from './menu'
import { drawPill, type PillProps, type PillSegment, shade } from './pilldraw'
import { BRANCH_ARGS, FIND_ARGS, UPSTREAM_ARGS, parseBranch, parseUpstream, parseRepos, pickActive, branchColumn, repoLabel } from './repos'
import { addRemotePlan, isRemoteUrl, parseRemotes, userConfigArgs } from './settings'
import type { SpinnerProps } from './spinner'

const PANE = 'gitgraph'
const TITLE = 'Git Graph'
const PAGE = 300
const POLL_MS = 5_000
const GIT_TIMEOUT_MS = 15_000
const NETWORK_TIMEOUT_MS = 120_000
const MAX_FILES = 20
const PALETTE = ['#4fc1ff', '#c586c0', '#ce9178', '#4ec9b0', '#dcdcaa', '#f48771', '#b5cea8', '#d7ba7d']
const BADGE_FG = '#1e1e1e'
const BADGE_BG: Partial<Record<BadgeKind, string>> = { remote: '#9d9d9d', tag: '#e2c08d', detached: '#f48771' }
const SELECTED_BG = '#264f78'
const REMOTE_BG = BADGE_BG.remote ?? '#9d9d9d'
const ADD_COLOR = '#89d185'
const DEL_COLOR = '#f48771'
const AUTHOR_W = 12
const BODY_LINES = 8
const OVERSCAN = 15
const BAR_W = 8
const MIN_SUBJECT = 20
// A pill's caps (or padding) and its gap, around its name.
const PILL_PAD = 3
const EDGE_SAFETY = 1
const STATUS_ARGS = ['status', '--porcelain=v2', '--branch']
const REFS_ARGS = ['for-each-ref', '--format=%(objectname) %(refname)']
const DOUBLE_CLICK_MS = 450
const REFRESHED_MS = 1_500
// Nerd Font glyphs where one is installed, plain Unicode otherwise.
const ICONS = {
  nerd: {
    on: '\uf205',
    off: '\uf204',
    fetch: '\uf0ed',
    refresh: '\u{f0450}',
    settings: '\uf013',
    search: '\uf002',
    changelog: '\uf0ca',
    feature: '\uf0eb',
    bugfix: '\uf188',
    release: '\uf02b',
    hotfix: '\uf06d',
    actions: '\uf142',
    head: '\uf058',
    tag: '\uf02b',
    flow: '\uf126',
    // Material Design's ghost: Font Awesome's (\uf6e2) is not in Nerd Fonts 3.
    ghost: '\u{f02a0}',
  },
  plain: { on: '◉', off: '○', fetch: '☁', refresh: '↻', settings: '⚙', search: '⌕', changelog: '☰', feature: '✦', bugfix: '✱', release: '◆', hotfix: '▲', actions: '⋯', head: '✔', tag: '◆', flow: '⑂', ghost: '◌' },
}
// No git the pane runs opens an editor (merge, rebase or tag messages) or asks for a password.
const GIT_ENV = { GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' }
const FLOW_INSTALL = 'brew install gittower/tap/git-flow-next'
const FLOW_DEFAULTS = 'main · develop · feature/ bugfix/ release/ hotfix/'
// The engine runs git with repo hooks off by pointing them at /dev/null, where git-flow-next
// fails looking for its own hooks (`stat /dev/null/pre-flow-…: not a directory`). git flow
// gets this empty folder of the mod instead: still no hook runs, and git-flow-next finds none.
const NO_HOOKS = 'nohooks'
const NERD_FONT_CHECK = 'ls ~/Library/Fonts /Library/Fonts ~/.local/share/fonts ~/.fonts /usr/share/fonts 2>/dev/null | grep -qi nerd'

const DEFAULT_FLOW: FlowView = { starting: null, finishing: null, opts: { isNoFf: true, isPush: true, isKeep: true }, tagMessage: null, conflict: null, init: null, confirming: null, isMenuOpen: false }
const EMPTY_GRAPH: Graph = { status: 'idle', rows: [], head: '', branch: '', dirty: 0, conflicts: 0, remotes: [], hasMore: false }
const DEFAULT_VIEW: View = { scope: 'all', limit: PAGE, selected: null, confirm: null, menu: null, isRenaming: false, isDeleting: false, isForce: false, push: null, running: null, screen: 'graph', configScope: 'local', editingRemote: null, isAddingRemote: false, remoteDraft: '', scrollTo: null, isSearching: false, refresh: 'idle', isOpen: false, flow: DEFAULT_FLOW, isActionsOpen: false }

const graphState = atom({ plugin: 'gitgraph', key: 'graph' } as const, EMPTY_GRAPH)
// Bumped with every graph write: renders read this small number and keep the graph
// itself in `graphCache`, so a scroll step does not carry the whole graph across.
const versionState = atom({ plugin: 'gitgraph', key: 'graphVersion' } as const, 0)
// Tagged with the shape of View: a view an older version kept (without fields added
// since) reads as absent after an update, instead of breaking the render.
const viewState = atom({ plugin: 'gitgraph', key: 'view' } as const, DEFAULT_VIEW, { shape: 'view-11' })
const detailState = atom({ plugin: 'gitgraph', key: 'detail' } as const, null as CommitDetail | null)
const roundState = atom({ plugin: 'gitgraph', key: 'isRound' } as const, false)
const nerdState = atom({ plugin: 'gitgraph', key: 'hasNerdFont' } as const, false)
// The list's optional columns, loaded from the mod's store when a session starts or the pane opens.
const DEFAULT_COLUMNS: Columns = { isAuthor: true, isHash: true }
const columnsState = atom({ plugin: 'gitgraph', key: 'columns' } as const, DEFAULT_COLUMNS)
// The first graph row a docked terminal pane shows: the mod scrolls its rows itself there.
const scrollTopState = atom({ plugin: 'gitgraph', key: 'scrollTop' } as const, 0)
const settingsState = atom({ plugin: 'gitgraph', key: 'settings' } as const, null as RepoSettings | null)
// Loaded when the pane opens and after git flow actions, not with every graph load.
const flowState = atom({ plugin: 'gitgraph', key: 'flow' } as const, null as FlowInfo | null)
// Searched when the pane opens and on refresh; every git the pane runs runs in `active`.
// The mod's CHANGELOG.md and installed version, for its screen; null until read.
const changelogState = atom({ plugin: 'gitgraph', key: 'changelog' } as const, null as Changelog | null)
const reposState = atom({ plugin: 'gitgraph', key: 'repos' } as const, { list: [], active: '.', isPicking: false, branches: {} } as Repos, { shape: 'repos-2' })

// Everything transient a git action, a selection or a new menu closes.
const CLOSED = {
  confirm: null,
  menu: null,
  isRenaming: false,
  isDeleting: false,
  isForce: false,
  push: null,
  editingRemote: null,
  isAddingRemote: false,
  isActionsOpen: false,
} satisfies Partial<View>

// The git flow dialogs, closed when one opens another or a git flow action ends.
const FLOW_CLOSED = { starting: null, finishing: null, tagMessage: null, init: null, confirming: null, isMenuOpen: false } satisfies Partial<FlowView>

let generation = 0
// What a render derives from the graph, worked out once per graph version.
type GraphCache = { version: number; graph: Graph; maxCells: number; indexOf: Map<string, number> }
let graphCache: GraphCache | null = null
let signature = ''
let busy = false
// Set synchronously when an action starts, so a second press before the redraw is ignored.
let isRunning = false
// The window a docked terminal pane last drew (null elsewhere): where the `ui.scroll` hook
// moves it from, and whether a search centers its commit itself. Written by the render
// (only it knows the rows' geometry), read by that hook and by the search.
let ownScroll: { top: number; maxTop: number } | null = null
// The last left click on a pill, to tell a double click, and the commit selected before it.
let lastPillClick: { key: string; at: number; selected: string | null } = { key: '', at: 0, selected: null }

const firstLine = (text: string) => text.split('\n').find(l => l.trim() !== '') ?? 'unknown error'

// Runs git in a repo. Network commands may wait on a remote: a longer timeout.
const gitIn = ($: EngineInterface, cwd: string, args: string[], isNetwork = false) =>
  $.process.run(['git', ...args], { cwd, timeoutMs: isNetwork ? NETWORK_TIMEOUT_MS : GIT_TIMEOUT_MS, env: GIT_ENV })

// Runs in the repo the pane shows.
async function git($: EngineInterface, args: string[], isNetwork = false) {
  const { active } = await read($, reposState)
  return gitIn($, active, args, isNetwork)
}

// Lists the repos in the session folder and keeps the active one while it is still there;
// a failed search leaves the session folder alone. True when the active repo changed.
async function findRepos($: EngineInterface): Promise<boolean> {
  const list = await $.process.run(FIND_ARGS, { timeoutMs: GIT_TIMEOUT_MS }).then(out => parseRepos(out.stdout), (): string[] => [])
  const before = (await read($, reposState)).active
  const { active, isPicking } = await update($, reposState, r => ({ ...r, list, active: pickActive(list, before) }))
  // Only an open picker shows branches; read off the graph's critical path.
  if (isPicking) void loadBranches($, list)
  return active !== before
}

// The branch a repo is on, as its upstream (`origin/main`) when it tracks one on a remote.
async function headOf($: EngineInterface, path: string): Promise<string | null> {
  const branch = await gitIn($, path, BRANCH_ARGS).then(parseBranch, () => null)
  if (!branch || branch === 'detached') return branch
  return (await gitIn($, path, UPSTREAM_ARGS(branch)).then(parseUpstream, () => null)) ?? branch
}

// Reads the branch each repo is on, for the picker; a repo whose read fails shows none.
async function loadBranches($: EngineInterface, list: readonly string[]): Promise<void> {
  const heads = await Promise.all(list.map(path => headOf($, path)))
  const branches = Object.fromEntries(list.flatMap((path, i) => (heads[i] ? [[path, heads[i]]] : [])))
  await update($, reposState, r => ({ ...r, branches }))
}

async function togglePicker($: EngineInterface): Promise<void> {
  const { isPicking, list } = await update($, reposState, r => ({ ...r, isPicking: !r.isPicking }))
  if (isPicking) await loadBranches($, list)
}

// Shows another repo: what was open belonged to the last one.
async function showRepo($: EngineInterface): Promise<void> {
  const [view] = await Promise.all([
    update($, viewState, (v): View => ({ ...v, ...CLOSED, flow: { ...v.flow, ...FLOW_CLOSED, conflict: null }, selected: null, limit: PAGE, scrollTo: null })),
    update($, detailState, () => null),
  ])
  await Promise.all([load($), loadFlow($), view.screen === 'settings' ? loadSettings($) : undefined])
  try {
    await $.ui.scroll({ to: 'start', in: PANE })
  } catch {
    // no surface to scroll
  }
}

async function selectRepo($: EngineInterface, path: string): Promise<void> {
  const before = (await read($, reposState)).active
  await update($, reposState, r => ({ ...r, active: path, isPicking: false }))
  if (path !== before) await showRepo($)
}

// What changes when commits, refs, HEAD or the working tree change.
const signatureOf = (status: string, refs: string) => `${status}\0${refs}`

function cacheOf(version: number, graph: Graph): GraphCache {
  return {
    version,
    graph,
    maxCells: graph.rows.reduce((n, r) => Math.max(n, r.cells.length), 1),
    indexOf: new Map(graph.rows.map((r, i) => [r.commit.hash, i])),
  }
}

async function setGraph($: EngineInterface, change: (g: Graph) => Graph): Promise<void> {
  const graph = await update($, graphState, change)
  graphCache = cacheOf(await update($, versionState, n => n + 1), graph)
}

async function readCache($: EngineInterface): Promise<GraphCache> {
  const version = await read($, versionState)
  if (graphCache?.version !== version) graphCache = cacheOf(version, await read($, graphState))
  return graphCache
}

const readGraph = async ($: EngineInterface) => (await readCache($)).graph

type RepoState = { status: ProcessRunResult; refs: ProcessRunResult }

// `known` is a status and refs a caller has just read (the poll), so they are not run twice.
async function load($: EngineInterface, known?: RepoState): Promise<void> {
  const gen = ++generation
  const isCurrent = () => gen === generation
  const view = await read($, viewState)
  busy = true
  try {
    const [log, status, refs] = await Promise.all([
      git($, ['log', view.scope === 'all' ? '--all' : 'HEAD', '--date-order', `-n${view.limit + 1}`, LOG_FORMAT]),
      known?.status ?? git($, STATUS_ARGS),
      known?.refs ?? git($, REFS_ARGS),
    ])
    if (!isCurrent()) return
    if (status.exitCode !== 0) {
      await setGraph($, (): Graph => ({ ...EMPTY_GRAPH, status: 'no-repo' }))
      return
    }
    const { head, branch, dirty, conflicts } = parseStatus(status.stdout)
    const remotes = remotesOf(refs.stdout)
    const commits = parseLog(log.exitCode === 0 ? log.stdout : '', remotes)
    const shown = withUncommitted(commits.slice(0, view.limit), head, dirty)
    const cells = layout(shown)
    signature = signatureOf(status.stdout, refs.stdout)
    await setGraph($, (): Graph => ({
      status: 'ready',
      rows: shown.map((commit, i) => ({ commit, cells: cells[i] ?? [] })),
      head,
      branch,
      dirty,
      conflicts,
      remotes,
      locals: localsOf(refs.stdout),
      sync: parseSync(status.stdout),
      hasMore: commits.length > view.limit,
    }))
  } catch (err) {
    if (isCurrent()) await setGraph($, (g): Graph => ({ ...g, status: 'error', error: String(err) }))
  } finally {
    if (isCurrent()) busy = false
  }
}

// Reloads only when the repository changed since the last load.
async function poll($: EngineInterface): Promise<void> {
  if (busy || !(await read($, viewState)).isOpen) return
  busy = true
  let known: RepoState
  try {
    const [status, refs] = await Promise.all([git($, STATUS_ARGS), git($, REFS_ARGS)])
    if (signatureOf(status.stdout, refs.stdout) === signature) return
    known = { status, refs }
  } finally {
    busy = false
  }
  await load($, known)
}

async function select($: EngineInterface, hash: string): Promise<void> {
  const selected = (await read($, viewState)).selected === hash ? null : hash
  await update($, viewState, v => ({ ...v, ...CLOSED, selected }))
  await update($, detailState, () => null)
  if (selected) await loadDetail($, selected)
}

async function loadDetail($: EngineInterface, hash: string): Promise<void> {
  const out = await git($, ['show', '--numstat', '--diff-merges=first-parent', DETAIL_FORMAT, hash])
  if ((await read($, viewState)).selected !== hash) return
  await update($, detailState, () => (out.exitCode === 0 ? parseDetail(out.stdout) : null))
}

// Reloads everything on screen; the button shows it running, then `✓ updated` for a moment.
async function refreshAll($: EngineInterface): Promise<void> {
  if ((await read($, viewState)).refresh === 'running') return
  await update($, viewState, (v): View => ({ ...v, refresh: 'running' }))
  try {
    if (await findRepos($)) return await showRepo($)
    const view = await read($, viewState)
    await Promise.all([load($), view.selected ? loadDetail($, view.selected) : undefined, view.screen === 'settings' ? loadSettings($) : undefined, (await read($, flowState)) ? loadFlow($) : undefined])
  } finally {
    await update($, viewState, (v): View => ({ ...v, refresh: 'done' }))
    $.clock.after(REFRESHED_MS, () => void update($, viewState, (v): View => (v.refresh === 'done' ? { ...v, refresh: 'idle' } : v)))
  }
}

async function checkoutRef($: EngineInterface, badge: Badge): Promise<void> {
  const args = checkoutArgs(badge)
  if (args) await runAction($, args, `Checked out ${badge.label}`)
  else $.ui.toast(badge.kind === 'head' ? `Already on ${badge.label}` : `Nothing to check out for ${badge.label}`)
}

// Selects the loaded commit the hash starts, and scrolls the pane to it: the render
// draws the window around `scrollTo` so the row exists to be scrolled to.
async function searchCommit($: EngineInterface, value: string): Promise<void> {
  const query = value.trim()
  if (!isHashQuery(query)) {
    $.ui.toast('Invalid hash: use 4 to 40 hex digits')
    return
  }
  const graph = await readGraph($)
  const hash = findByHash(graph.rows.map(r => r.commit.hash).filter(h => h !== UNCOMMITTED), query)
  if (!hash) {
    const exists = (await git($, ['rev-parse', '--verify', '--quiet', `${query}^{commit}`])).exitCode === 0
    $.ui.toast(exists ? `Commit ${query} is not among the ${graph.rows.length} loaded: use "Load more"` : `No commit with hash ${query}`)
    return
  }
  await update($, viewState, v => ({ ...v, scrollTo: hash, menu: null, isSearching: false }))
  if ((await read($, viewState)).selected !== hash) await select($, hash)
  // A pane scrolling its own rows draws the commit centered until the next scroll.
  if (ownScroll) return
  // Scrolling is a convenience: where a surface cannot, the commit is still selected.
  try {
    await $.ui.scroll({ to: { key: hash }, in: PANE, block: 'center' })
  } catch {
    // no surface to scroll
  }
  await update($, viewState, v => ({ ...v, scrollTo: null }))
}

// Whether the open menu is this ref's, on this commit.
const isMenuOpen = (menu: View['menu'], hash: string, badge: Badge) => menu?.hash === hash && menu.badge.label === badge.label && menu.badge.kind === badge.kind

async function openMenu($: EngineInterface, hash: string, badge: Badge): Promise<void> {
  if ((await read($, flowState)) === null) await loadFlow($)
  await update($, viewState, (v): View => ({ ...v, ...CLOSED, menu: isMenuOpen(v.menu, hash, badge) ? null : { hash, badge } }))
}

async function runAction($: EngineInterface, args: string[], done: string, isNetwork = false): Promise<void> {
  await runActions($, [args], done, `Running git ${args[0]}…`, isNetwork)
}

// Holds the one-action-at-a-time lock while `work` runs: `running` replaces the action
// buttons with a spinner and the label. `work` returns the failures to report; the
// result is null when another action held the lock.
async function withRunning($: EngineInterface, label: string, done: string, work: () => Promise<string[]>): Promise<string[] | null> {
  if (isRunning) return null
  isRunning = true
  let failures: string[] = []
  try {
    await update($, viewState, v => ({ ...v, running: label, confirm: null }))
    failures = await work()
  } finally {
    isRunning = false
    await update($, viewState, v => ({ ...v, ...CLOSED, running: null }))
  }
  $.ui.toast(failures.length === 0 ? done : failures.join(' · '))
  await Promise.all([load($), (await read($, viewState)).screen === 'settings' ? loadSettings($) : undefined])
  return failures
}

// Runs each git command in turn, all of them even when one fails (a push to every
// remote), and names each failure by its command and target: `git push github: …`.
async function runActions($: EngineInterface, runs: string[][], done: string, label: string, isNetwork = false): Promise<void> {
  await withRunning($, label, done, async () => {
    const failures: string[] = []
    for (const args of runs) {
      const out = await git($, args, isNetwork)
      const target = args.filter(a => !a.startsWith('-')).slice(0, isNetwork ? 2 : 1).join(' ')
      if (out.exitCode !== 0) failures.push(`git ${target} failed: ${firstLine(out.stderr || out.stdout)}`)
    }
    return failures
  })
}

// A step of a git flow action; its failure reads `git flow feature start failed: …`
// unless `failed` says otherwise.
type FlowStep = { args: string[]; isNetwork?: boolean; failed?: string }

const stepName = (args: string[]) => (args[0] === 'flow' ? `git flow ${args.slice(1, 3).join(' ')}` : `git ${args[0]}`)

// Runs the steps in order and stops at the first that fails. When the stop left unmerged
// files, `conflict` is kept to continue or abort; any other outcome clears it.
async function runFlow($: EngineInterface, steps: FlowStep[], done: string, label: string, conflict?: FlowConflict): Promise<void> {
  // git flow gets the remote the pane pushes to: where the repo sets none and has no
  // origin, git-flow-next would look for an origin that is not there.
  const remote = (await readFlowConfig($))?.remote ?? 'origin'
  const flowEnv = ['-c', `core.hooksPath=${$.plugin.root}/${NO_HOOKS}`, '-c', `gitflow.origin=${remote}`]
  const failures = await withRunning($, label, done, async () => {
    for (const step of steps) {
      const out = await git($, step.args[0] === 'flow' ? [...flowEnv, ...step.args] : step.args, step.isNetwork)
      if (out.exitCode !== 0) return [`${step.failed ?? `${stepName(step.args)} failed`}: ${firstLine(out.stderr || out.stdout)}`]
    }
    return []
  })
  if (failures === null) return
  const stopped = failures.length > 0 && (await readGraph($)).conflicts > 0 ? (conflict ?? null) : null
  await setFlow($, f => ({ ...f, ...FLOW_CLOSED, conflict: stopped }))
  await loadFlow($)
}

const setFlow = ($: EngineInterface, fn: (f: FlowView) => FlowView) => update($, viewState, (v): View => ({ ...v, flow: fn(v.flow) }))

const readFlowConfig = async ($: EngineInterface) => (await read($, flowState))?.config ?? null

// What git flow knows here. The installed CLI is asked until one is found.
async function loadFlow($: EngineInterface): Promise<void> {
  const known = await read($, flowState)
  const [version, config, tags, remotes] = await Promise.all([
    known && known.cli !== 'none' ? undefined : git($, ['flow', 'version']),
    git($, ['config', '--get-regexp', '^gitflow\\.']),
    git($, ['tag', '--list']),
    git($, ['remote']),
  ])
  const cli = version ? flowCliOf(version.exitCode, version.stdout) : (known?.cli ?? 'none')
  const tagList = tags.stdout.split('\n').filter(Boolean)
  await update($, flowState, () => ({
    cli,
    config: cli === 'none' ? null : parseFlowConfig(config.stdout, remotes.stdout.split('\n').filter(Boolean)),
    next: { release: nextVersion(tagList, 'release'), hotfix: nextVersion(tagList, 'hotfix') },
  }))
}

async function startTopic($: EngineInterface, kind: FlowKind, value: string): Promise<void> {
  const config = await readFlowConfig($)
  const type = config && typeOf(config, kind)
  if (!type) return
  const topic = topicFor(type, value.trim())
  if (await branchName($, topic.branch))
    await runFlow($, [{ args: flowArgs('start', topic) }], `Started ${topic.branch} from ${type.startpoint} ✓`, `Starting ${topic.branch}…`)
}

async function finishTopic($: EngineInterface, topic: FlowTopic): Promise<void> {
  const [config, view, graph] = await Promise.all([readFlowConfig($), read($, viewState), readGraph($)])
  if (!config) return
  const { opts, tagMessage } = view.flow
  const canPush = opts.isPush && graph.remotes.includes(config.remote)
  const steps: FlowStep[] = [{ args: finishArgs(topic, config, opts, tagMessage), isNetwork: true }]
  if (canPush) steps.push({ args: finishPushArgs(topic, config), isNetwork: true, failed: `Finished ${topic.branch}, but the push to ${config.remote} failed` })
  const pushed = canPush ? `, pushed to ${config.remote}` : opts.isPush ? ` (no remote ${config.remote} to push to)` : ''
  await runFlow($, steps, `Finished ${topic.branch}${pushed} ✓`, `Finishing ${topic.branch}…`, { op: 'finish', topic })
}

async function updateTopic($: EngineInterface, topic: FlowTopic): Promise<void> {
  const config = await readFlowConfig($)
  const type = config && typeOf(config, topic.kind)
  if (type)
    await runFlow($, [{ args: flowArgs('update', topic) }], `${topic.branch} updated from ${type.parent} ✓`, `Updating ${topic.branch}…`, { op: type.strategy, topic })
}

async function publishTopic($: EngineInterface, topic: FlowTopic): Promise<void> {
  await runFlow($, [{ args: flowArgs('publish', topic), isNetwork: true }], `Published ${topic.branch} ✓`, `Publishing ${topic.branch}…`)
}

// Opens the dialog asking for an update or a publish; again on the same one, closes it.
async function toggleConfirm($: EngineInterface, action: 'update' | 'publish', topic: FlowTopic): Promise<void> {
  await update($, viewState, (v): View => {
    const isOpen = v.flow.confirming?.action === action && v.flow.confirming.topic.branch === topic.branch
    return { ...v, ...CLOSED, flow: { ...v.flow, ...FLOW_CLOSED, confirming: isOpen ? null : { action, topic } } }
  })
}

// Opens the finish dialog; again on the same branch, closes it.
async function toggleFinish($: EngineInterface, topic: FlowTopic): Promise<void> {
  await update($, viewState, (v): View => ({
    ...v,
    ...CLOSED,
    flow: { ...v.flow, ...FLOW_CLOSED, finishing: v.flow.finishing?.branch === topic.branch ? null : topic },
  }))
}

// Opens the init form: from the current config where git flow is set up (reconfigure), else
// from what the repo's branches suggest.
async function openInit($: EngineInterface): Promise<void> {
  const config = await readFlowConfig($)
  const form = config ? initFormFor([], config) : initFormFor(branchNamesOf((await git($, BRANCH_REFS_ARGS)).stdout), null)
  await update($, viewState, (v): View => ({ ...v, ...CLOSED, flow: { ...v.flow, ...FLOW_CLOSED, init: form } }))
}

const closeInit = ($: EngineInterface) => setFlow($, f => ({ ...f, init: null }))

const setInitField = ($: EngineInterface, key: keyof FlowInitForm, value: string) =>
  setFlow($, f => (f.init ? { ...f, init: { ...f.init, [key]: value } } : f))

// Sets git flow up with the form's names. Where it is set up already, this reconfigures it
// (`-f`), first dropping the sections of bases the new names leave behind.
async function runInit($: EngineInterface): Promise<void> {
  const [view, config] = await Promise.all([read($, viewState), readFlowConfig($)])
  if (!view.flow.init) return
  const form = trimForm(view.flow.init)
  const error = initFormError(form)
  if (error) {
    $.ui.toast(error)
    return
  }
  if (!(await branchName($, form.main)) || !(await branchName($, form.develop))) return
  const stale = config ? staleBaseArgs(config, form) : []
  const done = `Git flow ${config ? 'reconfigured' : 'set up'}: ${form.main}, ${form.develop} ✓`
  await runFlow($, [...stale.map(args => ({ args })), { args: initArgs(form, !!config) }], done, config ? 'Reconfiguring git flow…' : 'Setting up git flow…')
}

// The mod's files do not change while it is loaded: read once per load (a reload or an
// update loads the module again; the state, which outlives it, is rewritten on the next open).
let changelogRead: Promise<Changelog> | null = null

async function readChangelog($: EngineInterface): Promise<Changelog> {
  const readText = (path: string) => $.fs.read(`${$.plugin.root}/${path}`).then(text => (typeof text === 'string' ? text : ''), () => '')
  const [md, manifest] = await Promise.all([readText('CHANGELOG.md'), readText('.claude-plugin/plugin.json')])
  return { versions: parseChangelog(md), installed: versionOf(manifest) }
}

// Swaps the graph for the changelog, read on the first open since the mod loaded.
async function openChangelog($: EngineInterface): Promise<void> {
  const isFirst = !changelogRead
  changelogRead ??= readChangelog($)
  await Promise.all([update($, viewState, (v): View => ({ ...v, ...CLOSED, screen: 'changelog' })), isFirst && update($, changelogState, () => null)])
  const changelog = await changelogRead
  await update($, changelogState, () => changelog)
}

async function loadSettings($: EngineInterface): Promise<void> {
  const get = async (scope: ConfigScope, key: string) => (await git($, ['config', `--${scope}`, '--get', key])).stdout.trim()
  const [localName, localEmail, globalName, globalEmail, remotes] = await Promise.all([
    get('local', 'user.name'),
    get('local', 'user.email'),
    get('global', 'user.name'),
    get('global', 'user.email'),
    git($, ['remote', '-v']),
  ])
  await update($, settingsState, () => ({
    local: { name: localName, email: localEmail },
    global: { name: globalName, email: globalEmail },
    remotes: parseRemotes(remotes.stdout),
  }))
}

async function setUser($: EngineInterface, scope: ConfigScope, key: 'name' | 'email', value: string): Promise<void> {
  const args = userConfigArgs(scope, key, value)
  if (!args) {
    $.ui.toast(`Invalid email: "${truncate(value.trim(), 40)}"`)
    return
  }
  const where = scope === 'local' ? 'this repository' : 'global'
  await runAction($, args, value.trim() ? `user.${key} saved (${where})` : `user.${key} removed (${where})`)
}

async function setRemoteUrl($: EngineInterface, remote: string, value: string): Promise<void> {
  const url = value.trim()
  if (!isRemoteUrl(url)) {
    $.ui.toast(`Invalid URL: "${truncate(url, 40)}"`)
    return
  }
  await runAction($, ['remote', 'set-url', remote, url], `Updated ${remote} URL`)
}

async function addRemote($: EngineInterface, url: string): Promise<void> {
  const name = (await read($, viewState)).remoteDraft
  const existing = (await read($, settingsState))?.remotes.map(r => r.name) ?? []
  const plan = addRemotePlan(name, url, existing)
  if ('error' in plan) {
    $.ui.toast(plan.error)
    return
  }
  await runAction($, plan.args, `Remote ${plan.args[2]} added`)
}

// The trimmed name when it is a valid new branch name; a toast and null otherwise.
async function branchName($: EngineInterface, value: string): Promise<string | null> {
  const name = value.trim()
  if (isBranchNameCandidate(name) && (await git($, ['check-ref-format', '--branch', name])).exitCode === 0) return name
  $.ui.toast(`Invalid branch name: "${truncate(name, 40)}"`)
  return null
}

async function createBranch($: EngineInterface, hash: string, value: string): Promise<void> {
  const name = await branchName($, value)
  if (name) await runAction($, ['branch', name, hash], `Branch ${name} created at ${short(hash)}`)
}

async function renameBranch($: EngineInterface, from: string, value: string): Promise<void> {
  const name = await branchName($, value)
  if (name) await runAction($, renameArgs(from, name), `Branch ${from} renamed to ${name}`)
}

const laneColor = (cells: Cell[]) => PALETTE[(cells.find(c => c.ch === '●' || c.ch === '○')?.color ?? 0) % PALETTE.length] ?? '#4fc1ff'

function groupCells(cells: Cell[]): { text: string; color: number }[] {
  const groups: { text: string; color: number }[] = []
  for (const cell of cells) {
    const last = groups[groups.length - 1]
    if (last && (last.color === cell.color || cell.ch === ' ')) last.text += cell.ch
    else groups.push({ text: cell.ch, color: cell.color })
  }
  return groups
}

type Ctx = {
  els: ReturnType<EngineInterface['ui']['resolve']>
  graph: Graph
  view: View
  detail: CommitDetail | null
  flow: FlowInfo | null
  cols: number
  graphWidth: number
  now: number
  isRound: boolean
  icons: (typeof ICONS)['plain']
  repos: Repos
  // Fields where the surface has them (not mobile).
  Input: Elements['terminal']['Input'] | undefined
  // Only the terminal and the desktop draw a `Client` (vscode's table holds a stub); elsewhere pills are Text.
  Client: Elements['terminal']['Client'] | undefined
  // A docked terminal pane: the footer is pinned and the git flow dialog floats over the graph.
  isPinned: boolean
  columns: Columns
}

// The dark shade of a pill's color: its remotes' segment (light text) and its icon.
const SHADE = 0.45
const LIGHT_FG = '#f0f0f0'
// A ref's pill: a branch `[name][remotes]`, the checked-out one with a check before its
// name (two spaces after it: a Nerd Font icon is drawn two cells wide); a tag `[icon][version]`
// and a branch only on a remote (merged, deleted here) `[ghost][name]`, the name on the dark
// shade of the pill color. Icons are in that dark shade.
function pillProps({ isRound, icons }: Ctx, badge: Badge, lane: string): PillProps {
  const { name, remotes } = badgeParts(badge)
  const bg = BADGE_BG[badge.kind] ?? lane
  const isBold = badge.kind === 'head' || badge.kind === 'detached'
  const dark = shade(bg, SHADE)
  const lead = badge.kind === 'tag' ? icons.tag : badge.isGone ? icons.ghost : ''
  const segments: PillSegment[] = lead
    ? [{ text: '', bg, fg: BADGE_FG, icon: { text: lead, fg: dark } }, { text: name, bg: dark, fg: LIGHT_FG }]
    : [
        badge.kind === 'head' ? { text: `  ${name}`, bg, fg: BADGE_FG, isBold, icon: { text: icons.head, fg: dark } } : { text: name, bg, fg: BADGE_FG, isBold },
        ...(remotes ? [{ text: remotes, bg: dark, fg: LIGHT_FG }] : []),
      ]
  return { segments, isRound }
}

// The pill ./pill.tsx draws, for surfaces without `Client`.
const renderPill = ({ els: { Text } }: Ctx, p: PillProps) => drawPill(Text as ClientElements['Text'], p)

// A pill that names something other than a ref: a hash, the current branch, a remote, `+N`.
const plainPill = ({ isRound }: Ctx, name: string, bg: string, isBold = false): PillProps => ({ segments: [{ text: name, bg, fg: BADGE_FG, isBold }], isRound })

async function copyText($: EngineInterface, text: string, copied: string, surface: RenderSurface): Promise<void> {
  const res = await $.ui.copy({ text, surface })
  $.ui.toast(res.isCopied ? copied : 'Could not copy')
}


// A row's author and hash, the same width for the column header's `Author` and `Commit`;
// each only where settings show it, the author from 70 columns.
function metaOf({ cols, columns }: Ctx, author: string, hash: string): string {
  const gap = cols < 70 ? ' ' : '  '
  const parts = [
    ...(columns.isAuthor && cols >= 70 ? [truncate(author, AUTHOR_W).padEnd(AUTHOR_W)] : []),
    ...(columns.isHash ? [short(hash).padEnd(HASH_W)] : []),
  ]
  return parts.map(p => `${gap}${p}`).join('')
}

// One row of the pane, exactly one terminal row tall whatever it holds.
function line({ els: { Box } }: Ctx, children: RenderChildren, gap = 0, justify?: 'space-between', key?: string) {
  return (
    <Box key={key} height={1} overflow="hidden" flexDirection="row" gap={gap} justifyContent={justify}>
      {children}
    </Box>
  )
}

const rule = (ctx: Ctx, width = ctx.cols, key?: string) => line(ctx, <ctx.els.Text dimColor>{'─'.repeat(Math.max(0, width))}</ctx.els.Text>, 0, undefined, key)

const localBranch = (refs: Ref[]) => refs.find(r => (r.kind === 'head' && r.name !== 'HEAD') || r.kind === 'branch')?.name
const isCheckedOut = (refs: Ref[]) => refs.some(r => r.kind === 'head' && r.name !== 'HEAD')

const headName = (graph: Graph) => graph.branch || (graph.head ? short(graph.head) : '—')

// An on/off switch: the icon in green when on, the label dimmed when off.
function switchButton(ctx: Ctx, key: string, label: string, isOn: boolean, onPress: () => Promise<unknown>) {
  const { els: { Button, Text }, icons } = ctx
  // A Nerd Font icon is drawn two cells wide over the space after it: two spaces keep one.
  return (
    <Button key={key} plain onPress={onPress}>
      <Text color={isOn ? 'success' : undefined} dimColor={!isOn}>
        {isOn ? icons.on : icons.off}
      </Text>
      <Text dimColor={!isOn}>{' '.repeat(iconCells(ctx))}{label}</Text>
    </Button>
  )
}

const blank = (ctx: Ctx) => line(ctx, <ctx.els.Text> </ctx.els.Text>)

// An icon Button's label, a space each side so the click target is wider than the glyph.
// Ghostty and non-Mono Nerd Fonts draw a Nerd Font icon two cells wide over a space after
// it: a second space keeps it centered in the hover.
const iconLabel = (ctx: Ctx, glyph: string) => (ctx.icons === ICONS.nerd ? ` ${glyph}  ` : ` ${glyph} `)
// The cells an icon takes: a Nerd Font icon two, as above.
const iconCells = (ctx: Ctx) => (ctx.icons === ICONS.nerd ? 2 : 1)

// Header rows, each one row tall: toolbar, search (where fields exist), column titles, rule.
function renderHeader($: EngineInterface, ctx: Ctx) {
  const { els, graph, view, cols, graphWidth, icons } = ctx
  const { Box, Text, Button } = els
  const { Input, repos } = ctx
  const isAll = view.scope === 'all'
  const headRow = graph.rows.find(r => r.commit.hash === graph.head)
  const count = graph.rows.length - (graph.dirty ? 1 : 0)
  const head = headName(graph)
  const lines = [
    <Box height={1} overflow="hidden" flexDirection="row" justifyContent="space-between" columnGap={2}>
      {/* With several repos, the repo comes first: its options open as rows below the header's first row. */}
      {repos.list.length > 1 && (
        <Box flexShrink={0}>
          <Button key="repo" plain dimColor={!repos.isPicking} onPress={() => togglePicker($)}>
            {`repo: ${repoLabel(repos.active)} ${repos.isPicking ? '▴' : '▾'}`}
          </Button>
        </Box>
      )}
      <Box flexShrink={1} flexGrow={1} overflow="hidden">
        <Text wrap="truncate-end">
          {renderPill(ctx, plainPill(ctx, `⎇ ${head}`, headRow ? laneColor(headRow.cells) : PALETTE[0] ?? '#4fc1ff', true))}
          <Text dimColor>
            {' '}
            {count}
            {graph.hasMore ? '+' : ''} commits
          </Text>
          {graph.dirty > 0 && <Text color="warning">{`  ● ${graph.dirty} ${graph.dirty === 1 ? 'change' : 'changes'}`}</Text>}
        </Text>
      </Box>
      <Box flexDirection="row" gap={2} flexShrink={0}>
        {switchButton(ctx, 'scope', 'all branches', isAll, async () => {
          await update($, viewState, (v): View => ({ ...v, ...CLOSED, scope: v.scope === 'all' ? 'head' : 'all', limit: PAGE, selected: null }))
          await load($)
        })}
        <Box flexDirection="row">
          {Input && (
            <Button key="search-toggle" plain dimColor={!view.isSearching} onPress={() => update($, viewState, v => ({ ...v, isSearching: !v.isSearching }))}>
              {iconLabel(ctx, icons.search)}
            </Button>
          )}
          <Button key="settings" plain dimColor onPress={async () => {
            await update($, viewState, (v): View => ({ ...v, ...CLOSED, screen: 'settings', selected: null }))
            await loadSettings($)
          }}>
            {iconLabel(ctx, icons.settings)}
          </Button>
          <Button key="changelog" plain dimColor onPress={() => openChangelog($)}>
            {iconLabel(ctx, icons.changelog)}
          </Button>
          <Button key="fetch" plain dimColor onPress={() => runActions($, [['fetch', '--all']], 'Fetched all remotes ✓', 'Fetching all remotes…', true)}>
            {iconLabel(ctx, icons.fetch)}
          </Button>
          {view.refresh === 'running' && renderSpinner(ctx, 'refresh-spinner')}
          <Button key="refresh" plain dimColor={view.refresh === 'idle'} onPress={() => refreshAll($)}>
            {view.refresh === 'done' ? <Text color="success"> ✓ </Text> : <Text>{iconLabel(ctx, icons.refresh)}</Text>}
          </Button>
        </Box>
      </Box>
    </Box>,
  ]
  if (repos.isPicking)
    for (const path of repos.list) {
      const label = `  ${path === repos.active ? '●' : '○'} ${repoLabel(path)}`
      lines.push(
        line(
          ctx,
          // The branch goes inside the Button, as a dim Text child: a sibling of the Button on the row is not drawn.
          <Button key={`repo-option:${path}`} plain dimColor={path !== repos.active} onPress={() => selectRepo($, path)}>
            {label}
            <Text dimColor>{branchColumn(label, repos.branches[path], cols)}</Text>
          </Button>,
        ),
      )
    }
  if (Input && view.isSearching)
    lines.push(
      line(
        ctx,
        <Input key="search" label={`${icons.search} `} placeholder="find commit by hash" submitLabel="find" autoFocus onSubmit={value => searchCommit($, value)} />,
      ),
    )
  // As wide as a row (EDGE_SAFETY too), `Author` and `Commit` over the rows' meta; over
  // a graph narrower than its name, `Graph` keeps a space after it.
  const meta = metaOf(ctx, 'Author', 'Commit')
  const graphHead = 'Graph'.padEnd(Math.max(graphWidth + 1, 'Graph '.length))
  if (cols >= 70)
    lines.push(
      line(ctx, <Text dimColor>{`${graphHead}${'Description'.padEnd(Math.max(0, cols - EDGE_SAFETY - graphHead.length - meta.length))}${meta}`}</Text>),
    )
  lines.push(rule(ctx))
  return { node: <Box flexDirection="column">{lines}</Box>, height: lines.length }
}

function renderRow($: EngineInterface, ctx: Ctx, { commit, cells }: GraphRow) {
  const { els, view, cols, graphWidth } = ctx
  const { Box, Text, Button } = els
  const { Client } = ctx
  const fitted = fitGraph(cells, graphWidth)
  const graphText = groupCells(fitted).map(g => <Text color={PALETTE[g.color % PALETTE.length]}>{g.text}</Text>)
  const pad = ' '.repeat(graphWidth - fitted.length + 1)
  if (commit.hash === UNCOMMITTED)
    return line(
      ctx,
      <Text>
        {graphText}
        {pad}
        <Text italic color="warning">
          {commit.subject}
        </Text>
      </Text>,
    )
  const lane = laneColor(cells)
  const meta = metaOf(ctx, commit.author, commit.hash)
  // The first pill may fill the Description column; the others get what is left once the
  // subject keeps its minimum, the rest as `+N`.
  const fixed = graphWidth + 1 + meta.length + EDGE_SAFETY
  const { shown, hidden, width } = fitBadges(badgesOf(commit.refs, ctx.graph.locals), Math.max(0, cols - fixed - MIN_SUBJECT), Math.max(0, cols - fixed))
  const more = hidden > 0 ? `+${hidden}` : ''
  const room = Math.max(0, cols - fixed - width)
  const isSelected = view.selected === commit.hash
  // With `Client`, each pill is its own instance so a right click opens its menu.
  return (
    <Box height={1} overflow="hidden" flexDirection="row">
      <Box flexShrink={0}>
        <Text>
          {graphText}
          {pad}
        </Text>
      </Box>
      {shown.map((b, i) => (
        <Box flexShrink={0}>
          {Client ? (
            <Client key={`pill:${commit.hash}:${i}`} module="./pill.tsx" props={pillProps(ctx, b, lane)} />
          ) : (
            renderPill(ctx, pillProps(ctx, b, lane))
          )}
        </Box>
      ))}
      {more && (
        <Box flexShrink={0}>
          {renderPill(ctx, plainPill(ctx, more, REMOTE_BG))}
        </Box>
      )}
      <Button key={commit.hash} plain onPress={() => select($, commit.hash)}>
        <Text backgroundColor={isSelected ? SELECTED_BG : undefined} weight={isSelected ? 'bold' : undefined}>
          {truncate(commit.subject, room).padEnd(room)}
        </Text>
        <Text dimColor>{meta}</Text>
      </Button>
    </Box>
  )
}

// What a pressable item reads and does; open (its form showing) or armed, it is active.
type Entry = { label: string; isActive: boolean; onPress: (pe: { surface: RenderSurface }) => Promise<unknown> }

// A destructive action: the first press arms it (`Confirm: …?`), the second runs it.
function armedEntry($: EngineInterface, { view }: Ctx, armKey: string, label: string, run: () => Promise<unknown>): Entry {
  const isArmed = view.confirm === armKey
  return {
    label: isArmed ? `Confirm: ${label.replace(/…$/, '')}?` : label,
    isActive: isArmed,
    onPress: () => (isArmed ? run() : update($, viewState, v => ({ ...v, confirm: armKey }))),
  }
}

// An entry as a framed Button, primary while active.
const entryButton = ({ els: { Button } }: Ctx, key: string, { label, isActive, onPress }: Entry) => (
  <Button key={key} variant={isActive ? 'primary' : undefined} onPress={onPress}>
    {label}
  </Button>
)

function confirmButton($: EngineInterface, ctx: Ctx, key: string, armKey: string, label: string, run: () => Promise<void>) {
  return entryButton(ctx, key, armedEntry($, ctx, armKey, label, run))
}

// The spinner where the surface draws a `Client`, an hourglass elsewhere.
function renderSpinner({ els, Client }: Ctx, key = 'spinner') {
  const props: SpinnerProps = { color: '#4fc1ff' }
  return Client ? <Client key={key} module="./spinner.tsx" props={props} /> : <els.Text>⏳</els.Text>
}

function renderRunning(ctx: Ctx, key = 'spinner') {
  const { els, view } = ctx
  return line(
    ctx,
    <els.Box flexDirection="row">
      {renderSpinner(ctx, key)}
      <els.Text> {view.running}</els.Text>
    </els.Box>,
  )
}

function renderPushChooser($: EngineInterface, ctx: Ctx, badge: Badge, item: MenuItem) {
  const { els: { Text, Button }, graph, view } = ctx
  const chosen = graph.remotes.filter(r => view.push?.includes(r))
  const isAll = chosen.length === graph.remotes.length
  const setPush = (fn: (sel: string[]) => string[]) => update($, viewState, v => ({ ...v, push: fn(v.push ?? []) }))
  return [
    line(ctx, <Text dimColor>Push {badge.label} to:</Text>),
    line(
      ctx,
      [
        ...graph.remotes.map(r => (
          <Button key={`push-remote-${r}`} plain onPress={() => setPush(sel => (sel.includes(r) ? sel.filter(x => x !== r) : [...sel, r]))}>
            {chosen.includes(r) ? '☑' : '☐'} {r}
          </Button>
        )),
        graph.remotes.length > 1 && (
          <Button key="push-remote-all" plain onPress={() => setPush(() => (isAll ? [] : graph.remotes))}>
            {isAll ? '☑' : '☐'} all
          </Button>
        ),
      ],
      2,
    ),
    line(
      ctx,
      [
        chosen.length ? (
          <Button key="push-run" variant="primary" onPress={() =>
            runActions(
              $,
              pushRuns(item, chosen),
              `Pushed ${badge.label} to ${chosen.join(', ')} ✓`,
              `Pushing ${badge.label} to ${chosen.join(', ')}…`,
              true,
            )
          }>
            Push to {chosen.join(', ')}
          </Button>
        ) : (
          <Text dimColor>Select at least one remote</Text>
        ),
        <Button key="push-cancel" plain dimColor onPress={() => update($, viewState, v => ({ ...v, push: null }))}>
          cancel
        </Button>,
      ],
      2,
    ),
  ]
}


// A git flow item, the same in a branch's menu and in the footer: finish opens its form
// (whose Finish asks again); update and publish ask for a second press.
function flowEntry($: EngineInterface, ctx: Ctx, label: string, flow: NonNullable<MenuItem['flow']>): Entry {
  const { action, topic } = flow
  const { finishing, confirming } = ctx.view.flow
  if (action === 'finish') return { label, isActive: finishing?.branch === topic.branch, onPress: () => toggleFinish($, topic) }
  return { label, isActive: confirming?.action === action && confirming.topic.branch === topic.branch, onPress: () => toggleConfirm($, action, topic) }
}


// What a menu item reads and does.
function menuEntry($: EngineInterface, ctx: Ctx, badge: Badge, item: MenuItem): Entry {
  const { view, graph } = ctx
  const { flow, copy } = item
  if (flow) return flowEntry($, ctx, item.label, flow)
  if (copy !== undefined)
    return {
      label: item.label,
      isActive: false,
      onPress: async pe => {
        await copyText($, copy, `Copied "${copy}"`, pe.surface)
        await update($, viewState, v => ({ ...v, menu: null }))
      },
    }
  if (item.pushArgs)
    return {
      label: item.label,
      isActive: view.push !== null,
      onPress: () => update($, viewState, v => ({ ...v, push: v.push ? null : defaultPushRemotes(badge, graph.remotes), isRenaming: false, isDeleting: false, confirm: null })),
    }
  if (item.deleteBranch !== undefined)
    return {
      label: item.label,
      isActive: view.isDeleting,
      onPress: () => update($, viewState, v => ({ ...v, isDeleting: !v.isDeleting, isForce: false, isRenaming: false, push: null, confirm: null })),
    }
  if (item.isRename)
    return {
      label: item.label,
      isActive: view.isRenaming,
      onPress: () => update($, viewState, v => ({ ...v, isRenaming: !v.isRenaming, isDeleting: false, push: null, confirm: null })),
    }
  const runs = item.runs ?? []
  return armedEntry($, ctx, `menu:${item.id}:${badge.kind}:${badge.label}`, item.label, () =>
    runActions($, runs, `${item.label}: ${badge.label} ✓`, `${item.label}: ${badge.label}…`, item.isNetwork),
  )
}

// One row of a list of actions (a ref's menu, a commit's actions), flush left: the active
// one bold and colored, a `◂` after it, so no label moves.
function entryRow(ctx: Ctx, key: string, rowKey: string, { label, isActive, onPress }: Entry) {
  const { Button, Text } = ctx.els
  return line(
    ctx,
    <Button key={key} plain onPress={onPress}>
      <Text color={isActive ? 'warning' : undefined} weight={isActive ? 'bold' : undefined}>
        {label}
        {isActive ? ' ◂' : ''}
      </Text>
    </Button>,
    0,
    undefined,
    rowKey,
  )
}

// An entry of a list: its Button's key (`id` unless given), and rows under it (its form).
type ListItem = { id: string; key?: string; entry: Entry; after?: RenderChildren[] }

// A list's thin rule, flush left with the labels and as long as the longest one.
const listRule = (ctx: Ctx, width: number, key?: string) =>
  line(ctx, <ctx.els.Text dimColor>{'┈'.repeat(Math.max(0, Math.min(width, framedWidth(ctx))))}</ctx.els.Text>, 0, undefined, key)

// Rows `<prefix>-row-<id>` of entries in groups, a rule `<prefix>-rule-<n>` between groups.
function entryList(ctx: Ctx, prefix: string, groups: ListItem[][]): RenderChildren[] {
  const shown = groups.filter(g => g.length > 0)
  const width = Math.max(0, ...shown.flat().map(i => i.entry.label.length))
  return shown.flatMap((group, n) => [
    ...(n > 0 ? [listRule(ctx, width, `${prefix}-rule-${n}`)] : []),
    ...group.flatMap(({ id, key = id, entry, after }) => [entryRow(ctx, key, `${prefix}-row-${id}`, entry), ...(after ?? [])]),
  ])
}

// The room inside a framed box under the graph: its border and padding taken off.
const framedWidth = ({ cols, graphWidth }: Ctx) => cols - graphWidth - 1 - 4

// A framed box exactly `rows.length + 2` rows tall: the border, then one row each.
function framed({ els: { Box } }: Ctx, color: string, indent: number, rows: RenderChildren[]) {
  const height = rows.length + 2
  return {
    node: (
      <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1} marginLeft={indent} height={height} overflow="hidden" flexShrink={0}>
        {rows}
      </Box>
    ),
    height,
  }
}

// A framed Button's chrome around its label, in cells.
const BUTTON_CHROME = 4
// The cells a framed Button takes.
const buttonWidth = (label: string) => label.length + BUTTON_CHROME

type BarItem = { node: RenderChildren; width: number }

const barText = (ctx: Ctx, text: string, color?: 'warning'): BarItem => ({
  node: (
    <ctx.els.Text color={color} dimColor={!color}>
      {text}
    </ctx.els.Text>
  ),
  width: text.length,
})

// Framed Buttons inside a framed box, on as many rows as its width needs, none cut off.
function buttonRows(ctx: Ctx, key: string, items: BarItem[]) {
  const { Box } = ctx.els
  return wrapRows(items.map(i => i.width), framedWidth(ctx), 1).map((row, n) => (
    <Box key={`${key}-${n}`} height={1} overflow="hidden" flexDirection="row" columnGap={1}>
      {row.map(i => items[i]?.node)}
    </Box>
  ))
}

// The form a menu item opened: the push's remotes, the delete's force, the new name.
function menuItemForm($: EngineInterface, ctx: Ctx, badge: Badge, item: MenuItem): RenderChildren[] {
  const { view, Input } = ctx
  if (item.pushArgs && view.push) return renderPushChooser($, ctx, badge, item)
  const branch = item.deleteBranch
  if (branch !== undefined && view.isDeleting)
    return [
      line(
        ctx,
        [
          switchButton(ctx, 'menu-opt-force', 'force (deletes unmerged work)', view.isForce, () => update($, viewState, v => ({ ...v, isForce: !v.isForce }))),
          confirmButton($, ctx, 'menu-delete-run', `delete-branch:${branch}`, `Delete ${branch}`, () => runAction($, deleteBranchArgs(branch, view.isForce), `Deleted ${branch}`)),
        ],
        2,
      ),
    ]
  if (item.isRename && view.isRenaming && Input)
    return [line(ctx, <Input key="rename" label="New name" value={badge.label} submitLabel="rename" autoFocus onSubmit={value => renameBranch($, badge.label, value)} />)]
  return []
}

// A ref menu's rows: the spinner while an action runs, else its list in groups, an item's
// form right under it.
function menuBody($: EngineInterface, ctx: Ctx, badge: Badge): RenderChildren[] {
  if (ctx.view.running) return [renderRunning(ctx)]
  const items = menuFor(badge, ctx.graph.remotes, ctx.flow?.config ?? null)
  return entryList(
    ctx,
    'menu',
    menuGroups(items).map(group =>
      group.map((item): ListItem => ({ id: item.id, key: `menu-${item.id}`, entry: menuEntry($, ctx, badge, item), after: menuItemForm($, ctx, badge, item) })),
    ),
  )
}

const closeMenuButton = ($: EngineInterface, ctx: Ctx) => closeButton(ctx, 'menu-close', () => update($, viewState, v => ({ ...v, menu: null, isRenaming: false })))

// A ref's menu framed under its row (off a docked terminal pane): the pill and close, then the list.
function renderMenu($: EngineInterface, ctx: Ctx, { cells }: GraphRow, badge: Badge) {
  const lane = laneColor(cells)
  const head = line(ctx, [<ctx.els.Text>{renderPill(ctx, pillProps(ctx, badge, lane))}</ctx.els.Text>, closeMenuButton($, ctx)], 0, 'space-between')
  return framed(ctx, BADGE_BG[badge.kind] ?? lane, ctx.graphWidth + 1, [head, ...menuBody($, ctx, badge)])
}

// A ref's menu as a dialog (on a docked terminal pane).
function menuDialog($: EngineInterface, ctx: Ctx, { cells }: GraphRow, badge: Badge): Dialog {
  const lane = laneColor(cells)
  return { title: <ctx.els.Text>{renderPill(ctx, pillProps(ctx, badge, lane))}</ctx.els.Text>, rows: menuBody($, ctx, badge), actions: line(ctx, closeMenuButton($, ctx)), color: BADGE_BG[badge.kind] ?? lane }
}

// A commit's actions as a dialog (on a docked terminal pane).
function actionsDialog($: EngineInterface, ctx: Ctx, { commit, cells }: GraphRow): Dialog {
  const close = closeButton(ctx, 'actions-close', () => update($, viewState, v => ({ ...v, isActionsOpen: false, confirm: null })))
  return { title: `Commit ${short(commit.hash)}`, rows: commitActions($, ctx, commit), actions: line(ctx, close), color: laneColor(cells) }
}

function renderFiles(ctx: Ctx, files: FileStat[]) {
  const { els: { Text }, cols } = ctx
  const adds = files.reduce((n, f) => n + (f.adds ?? 0), 0)
  const dels = files.reduce((n, f) => n + (f.dels ?? 0), 0)
  const pathRoom = Math.max(10, cols - ctx.graphWidth - 5 - 12 - BAR_W - 2)
  return [
    line(
      ctx,
      <Text>
        <Text weight="bold">{files.length} {files.length === 1 ? 'file' : 'files'}</Text>
        <Text color={ADD_COLOR}>{`  +${adds}`}</Text>
        <Text color={DEL_COLOR}>{` −${dels}`}</Text>
      </Text>,
    ),
    ...files.slice(0, MAX_FILES).map(f => {
      const bar = diffBar(f.adds, f.dels, BAR_W)
      return line(
        ctx,
        <Text>
          {truncate(f.path, pathRoom).padEnd(pathRoom)}
          {f.adds === null ? (
            <Text dimColor>{'bin'.padStart(12)}</Text>
          ) : (
            <Text>
              <Text color={ADD_COLOR}>{`+${f.adds}`.padStart(6)}</Text>
              <Text color={DEL_COLOR}>{` −${f.dels}`.padEnd(6)}</Text>
            </Text>
          )}{' '}
          <Text color={ADD_COLOR}>{'+'.repeat(bar.adds)}</Text>
          <Text color={DEL_COLOR}>{'−'.repeat(bar.dels)}</Text>
        </Text>,
      )
    }),
    ...(files.length > MAX_FILES ? [line(ctx, <Text dimColor>… and {files.length - MAX_FILES} more files</Text>)] : []),
  ]
}

// A framed button per ref of the commit, opening the menu a right click on its pill opens:
// the way in where the surface does not pass right clicks to the mod. The label is a single
// string (vscode drops nested children).
function refMenuRows($: EngineInterface, ctx: Ctx, hash: string, badges: Badge[]) {
  const { Button } = ctx.els
  if (!badges.length) return []
  const items: BarItem[] = [
    barText(ctx, 'Branch actions:'),
    ...badges.map((b, i) => {
      const label = `${b.label} ▾`
      return {
        node: (
          <Button key={`refmenu-${i}`} variant={isMenuOpen(ctx.view.menu, hash, b) ? 'primary' : undefined} onPress={() => openMenu($, hash, b)}>
            {label}
          </Button>
        ),
        width: buttonWidth(label),
      }
    }),
  ]
  return buttonRows(ctx, 'refmenu-row', items)
}

// The open commit's actions, as a list: checkout and cherry-pick, the copy, then the
// reset (it moves the branch) last.
function commitActions($: EngineInterface, ctx: Ctx, commit: GraphRow['commit']): RenderChildren[] {
  const { graph } = ctx
  const branch = localBranch(commit.refs)
  const head = headName(graph)
  const isHere = commit.hash === graph.head
  const item = (id: string, label: string, run: () => Promise<void>): ListItem => ({ id, entry: armedEntry($, ctx, `${id}:${commit.hash}`, label, run) })
  return entryList(ctx, 'detail', [
    [
      ...(isCheckedOut(commit.refs)
        ? []
        : [item('checkout', `Checkout ${branch ?? '(detached)'}`, () =>
            runAction($, (branch && checkoutArgs({ kind: 'branch', label: branch, remotes: [] })) || ['checkout', '--detach', commit.hash], `Checked out ${branch ?? short(commit.hash)}`),
          )]),
      ...(isHere ? [] : [item('pick', 'Cherry-pick', () => runAction($, ['cherry-pick', commit.hash], `Cherry-picked ${short(commit.hash)}`))]),
    ],
    [{ id: 'copy', entry: { label: 'Copy hash', isActive: false, onPress: pe => copyText($, commit.hash, `Copied hash ${short(commit.hash)}`, pe.surface) } }],
    // Moves the current branch here and keeps the changes staged; a commit left
    // behind stays in the graph while a ref (a pushed branch) keeps it, to reset back to.
    isHere ? [] : [item('reset', `Reset ${head} here (soft)`, () => runAction($, ['reset', '--soft', commit.hash], `Reset ${head} to ${short(commit.hash)}: changes kept staged`))],
  ])
}

function renderDetail($: EngineInterface, ctx: Ctx, { commit, cells }: GraphRow) {
  const { els, detail, view, icons } = ctx
  const { Text, Button } = els
  const { Input } = ctx
  const lane = laneColor(cells)
  const badges = badgesOf(commit.refs, ctx.graph.locals).filter(b => b.kind !== 'detached')
  const [subject = '', ...rest] = (detail?.body ?? commit.subject).split('\n')
  const body = rest.join('\n').trim().split('\n').filter((l, i, all) => l !== '' || (i > 0 && all[i - 1] !== ''))
  // The subject line ends with the actions icon; pressed, the list opens right under it.
  const rows: RenderChildren[] = [
    line(
      ctx,
      [
        <Text wrap="truncate-end">
          {renderPill(ctx, plainPill(ctx, short(commit.hash), lane, true))}
          <Text weight="bold">{subject}</Text>
        </Text>,
        <Button key="detail-actions-toggle" plain dimColor={!view.isActionsOpen} onPress={() => update($, viewState, v => ({ ...v, isActionsOpen: !v.isActionsOpen, confirm: null }))}>
          {iconLabel(ctx, icons.actions)}
        </Button>,
      ],
      1,
      'space-between',
    ),
  ]
  if (view.isActionsOpen && !view.running && !ctx.isPinned) rows.push(...commitActions($, ctx, commit), blank(ctx))
  if (detail === null) rows.push(line(ctx, <Text dimColor>Loading details…</Text>))
  else {
    rows.push(
      line(
        ctx,
        <Text dimColor wrap="truncate-end">
          {detail.author} &lt;{detail.email}&gt; · {absTime(detail.time)} ({relTime(ctx.now, detail.time)}) · {detail.hash}
        </Text>,
      ),
    )
    rows.push(...refMenuRows($, ctx, commit.hash, badges))
    if (body.length && body[0] !== '') {
      rows.push(blank(ctx), ...body.slice(0, BODY_LINES).map(l => line(ctx, <Text wrap="truncate-end">{l}</Text>)))
      if (body.length > BODY_LINES) rows.push(line(ctx, <Text dimColor>…</Text>))
    }
    rows.push(blank(ctx), ...renderFiles(ctx, detail.files))
  }
  rows.push(blank(ctx))
  if (view.running) rows.push(view.menu ? blank(ctx) : renderRunning(ctx))
  else if (Input)
    rows.push(line(ctx, <Input key="new-branch" label="New branch here" placeholder="branch-name" submitLabel="create" onSubmit={value => createBranch($, commit.hash, value)} />))
  return framed(ctx, lane, ctx.graphWidth + 1, rows)
}

// A screen's title, its way back to the graph, and a rule.
function screenHeader($: EngineInterface, ctx: Ctx, screen: Exclude<Screen, 'graph'>, title: string) {
  const { Box, Text, Button } = ctx.els
  return [
    <Box flexDirection="row" justifyContent="space-between">
      <Text weight="bold">{title}</Text>
      <Button key={`${screen}-back`} plain dimColor onPress={() => update($, viewState, (v): View => ({ ...v, screen: 'graph' }))}>
        ← graph
      </Button>
    </Box>,
    rule(ctx),
  ]
}

// The changelog screen: a box per version, newest first, the installed one marked.
function renderChangelog($: EngineInterface, ctx: Ctx, changelog: Changelog | null) {
  const { Box, Text } = ctx.els
  const body =
    !changelog ? (
      <Text dimColor>Loading…</Text>
    ) : changelog.versions.length === 0 ? (
      <Text dimColor>Could not read the mod's CHANGELOG.md</Text>
    ) : (
      changelog.versions.map(v => {
        const isInstalled = v.version === changelog.installed
        const title = [`v${v.version}`, v.date, isInstalled && 'your version'].filter(Boolean).join(' · ')
        return (
          <Box key={`changelog-${v.version}`} flexDirection="column" borderStyle="round" borderColor={isInstalled ? 'success' : undefined} borderDimColor={!isInstalled} paddingX={1}>
            <Text weight="bold" color={isInstalled ? 'success' : undefined}>
              {title}
            </Text>
            {v.groups.map(g => (
              <Box flexDirection="column" marginTop={1}>
                <Text weight="bold">{g.title}</Text>
                {g.items.map(item => (
                  <Text>{`• ${item}`}</Text>
                ))}
              </Box>
            ))}
          </Box>
        )
      })
    )
  return (
    <Box flexDirection="column">
      {screenHeader($, ctx, 'changelog', `${ctx.icons.changelog} Changelog`)}
      {body}
    </Box>
  )
}

function renderSettings($: EngineInterface, ctx: Ctx, settings: RepoSettings | null) {
  const { els, view, cols } = ctx
  const init = initRows($, ctx)
  const { Box, Text, Button } = els
  const { Input } = ctx
  const scopeButton = (scope: ConfigScope, label: string) => (
    <Button key={`scope-${scope}`} plain onPress={() => update($, viewState, v => ({ ...v, configScope: scope }))}>
      {view.configScope === scope ? '◉' : '○'} {label}
    </Button>
  )
  const both = (key: 'name' | 'email') =>
    `local: ${settings?.local[key] || '—'} · global: ${settings?.global[key] || '—'}`
  return (
    <Box flexDirection="column">
      {screenHeader($, ctx, 'settings', `${ctx.icons.settings} Repository settings`)}
      {settings === null ? (
        <Text dimColor>Loading…</Text>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text>
              <Text weight="bold">Columns</Text>
              <Text dimColor> · every repository</Text>
            </Text>
            <Box flexDirection="row" gap={2}>
              {switchButton(ctx, 'cfg-col-author', 'author', ctx.columns.isAuthor, () => toggleColumn($, 'isAuthor'))}
              {switchButton(ctx, 'cfg-col-hash', 'hash', ctx.columns.isHash, () => toggleColumn($, 'isHash'))}
            </Box>
          </Box>
          <Box flexDirection="column">
            <Text weight="bold">User</Text>
            <Text dimColor>name   {both('name')}</Text>
            <Text dimColor>email  {both('email')}</Text>
            <Box flexDirection="row" gap={2} marginTop={1}>
              <Text dimColor>Save to:</Text>
              {scopeButton('local', 'this repository')}
              {scopeButton('global', 'global')}
            </Box>
            {Input && !view.running && (
              <Box flexDirection="column">
                <Input key="cfg-name" label="Name" value={settings[view.configScope].name} submitLabel="save" onSubmit={value => setUser($, view.configScope, 'name', value)} />
                <Input key="cfg-email" label="Email" value={settings[view.configScope].email} submitLabel="save" onSubmit={value => setUser($, view.configScope, 'email', value)} />
              </Box>
            )}
          </Box>
          <Box flexDirection="column">
            <Text weight="bold">Remotes</Text>
            {settings.remotes.length === 0 && <Text dimColor>No remotes.</Text>}
            {settings.remotes.map(r => (
              <Box flexDirection="column">
                <Box height={1} overflow="hidden" flexDirection="row">
                  <Box flexShrink={0}>{renderPill(ctx, plainPill(ctx, r.name, REMOTE_BG, true))}</Box>
                  <Text dimColor>{truncateMiddle(r.fetchUrl, Math.max(10, cols - r.name.length - PILL_PAD))}</Text>
                </Box>
                {r.pushUrl && r.pushUrl !== r.fetchUrl && (
                  <Text dimColor>{`  push: ${truncateMiddle(r.pushUrl, Math.max(10, cols - 8))}`}</Text>
                )}
                {!view.running && (
                  <Box flexDirection="row" gap={1} marginLeft={2}>
                    <Button key={`remote-fetch-${r.name}`} plain dimColor onPress={() => runAction($, ['fetch', r.name], `Fetched ${r.name} ✓`, true)}>
                      fetch
                    </Button>
                    <Button key={`remote-edit-${r.name}`} plain dimColor onPress={() =>
                      update($, viewState, v => ({ ...v, editingRemote: v.editingRemote === r.name ? null : r.name }))
                    }>
                      edit URL
                    </Button>
                    {confirmButton($, ctx, `remote-delete-${r.name}`, `remote-delete:${r.name}`, 'Delete', () =>
                      runAction($, ['remote', 'remove', r.name], `Remote ${r.name} removed`),
                    )}
                  </Box>
                )}
                {Input && view.editingRemote === r.name && !view.running && (
                  <Input key={`remote-url-${r.name}`} label="New URL" value={r.fetchUrl} submitLabel="save" autoFocus onSubmit={value => setRemoteUrl($, r.name, value)} />
                )}
              </Box>
            ))}
            {view.running ? (
              renderRunning(ctx)
            ) : (
              <Box flexDirection="column" marginTop={1}>
                <Button key="remote-add" plain onPress={() =>
                  update($, viewState, v => ({ ...v, isAddingRemote: !v.isAddingRemote, remoteDraft: '' }))
                }>
                  + Add remote
                </Button>
                {Input && view.isAddingRemote && (
                  <Box flexDirection="column">
                    <Input
                      key="remote-new-name"
                      label="Name"
                      placeholder="origin"
                      submitLabel="next"
                      autoFocus
                      onInput={value => update($, viewState, v => ({ ...v, remoteDraft: value }))}
                      onSubmit={value => update($, viewState, v => ({ ...v, remoteDraft: value }))}
                    />
                    <Input key="remote-new-url" label={`URL for ${view.remoteDraft.trim() || 'origin'}:`} placeholder="git@github.com:user/repo.git" submitLabel="add" onSubmit={value => addRemote($, value)} />
                  </Box>
                )}
              </Box>
            )}
          </Box>
          {ctx.flow?.config && (
            <Box flexDirection="column">
              <Text weight="bold">Git Flow</Text>
              <Text dimColor wrap="truncate-end">{flowSummary(ctx.flow.config)}</Text>
              {view.running ? null : view.flow.init ? (
                <Box flexDirection="column">{init && [...init.fields, init.actions]}</Box>
              ) : (
                ctx.Input && (
                  <Button key="flow-reconfigure" plain onPress={() => openInit($)}>
                    Reconfigure…
                  </Button>
                )
              )}
            </Box>
          )}
        </Box>
      )}
    </Box>
  )
}

// The rows under the footer bar: only what an action in progress needs.
function flowFormRows($: EngineInterface, ctx: Ctx): RenderChildren[] {
  const { view } = ctx
  // An action started from a branch menu or a commit's details shows its spinner there; the
  // footer shows only the others', under a key of its own (a key drawn twice voids the pane).
  if (view.running) return view.menu || view.selected ? [] : [renderRunning(ctx, 'flow-spinner')]
  if (view.flow.conflict) return conflictRows($, ctx, view.flow.conflict)
  // Off a docked terminal pane the dialog's content closes the footer instead.
  const dialog = ctx.isPinned ? null : flowDialog($, ctx)
  return dialog ? dialogRows(ctx, dialog) : []
}

function conflictRows($: EngineInterface, ctx: Ctx, conflict: FlowConflict) {
  const { Text, Button } = ctx.els
  return [
    line(ctx, <Text color="warning">{`Conflict in ${conflict.op} of ${conflict.topic.branch}: resolve the files, then`}</Text>),
    line(
      ctx,
      [
        <Button key="flow-continue" variant="primary" onPress={() => runFlow($, [{ args: resumeArgs(conflict, '--continue') }], 'Continued ✓', 'Continuing…', conflict)}>
          Continue
        </Button>,
        confirmButton($, ctx, 'flow-abort', 'flow-abort', 'Abort', () => runFlow($, [{ args: resumeArgs(conflict, '--abort') }], 'Aborted', 'Aborting…')),
      ],
      1,
    ),
  ]
}

const INIT_FIELDS: [keyof FlowInitForm, string][] = [
  ['main', 'Main branch'],
  ['develop', 'Develop branch'],
  ['feature', 'Feature prefix'],
  ['bugfix', 'Bugfix prefix'],
  ['release', 'Release prefix'],
  ['hotfix', 'Hotfix prefix'],
  ['tag', 'Tag prefix'],
]

// The init form: a field per name, then the run (asks for a second press) and cancel.
function initRows($: EngineInterface, ctx: Ctx): { fields: RenderChildren[]; actions: RenderChildren } | null {
  const { els: { Button }, view, flow, Input } = ctx
  const init = view.flow.init
  if (!init || !Input) return null
  const set = (key: keyof FlowInitForm) => (value: string) => setInitField($, key, value)
  const label = flow?.config ? 'Reconfigure' : 'Initialize'
  return {
    fields: INIT_FIELDS.map(([key, text]) =>
      line(ctx, <Input key={`flow-init-${key}`} label={text} value={init[key]} placeholder={DEFAULT_FORM[key] || 'none'} submitLabel="set" onInput={set(key)} onSubmit={set(key)} />),
    ),
    actions: line(
      ctx,
      [
        confirmButton($, ctx, 'flow-init-run', 'flow-init-run', label, () => runInit($)),
        <Button key="flow-init-cancel" plain dimColor onPress={() => closeInit($)}>
          cancel
        </Button>,
      ],
      2,
    ),
  }
}

// The names a git flow config uses, in one line: `main · develop · feature/ bugfix/ …`.
const flowSummary = (config: FlowConfig) =>
  [config.bases.map(b => b.name).join(' · '), config.types.map(t => t.prefix).join(' ')].filter(Boolean).join(' · ')

// A dialog: its title (a string drawn bold, or a node), body rows, buttons row and frame color.
type Dialog = { title: RenderChildren; rows: RenderChildren[]; actions: RenderChildren; color?: string }

// The dialog's rows: its title, a blank row, its body, a blank row, its buttons.
const dialogRows = (ctx: Ctx, { title, rows, actions }: Dialog): RenderChildren[] => [
  line(ctx, typeof title === 'string' ? <ctx.els.Text weight="bold">{title}</ctx.els.Text> : title),
  blank(ctx),
  ...rows,
  blank(ctx),
  actions,
]

// A dialog's dim close (or cancel) button.
const closeButton = ({ els: { Button } }: Ctx, key: string, onPress: () => Promise<unknown>, label = 'close') => (
  <Button key={key} plain dimColor onPress={onPress}>
    {label}
  </Button>
)

// What the git flow dialog shows: the Git Flow menu, the set-up form, start's name field,
// finish's switches and tag message, or the update or publish it asks about; null when
// none is open. Its button runs at once: the dialog is the confirmation.
function flowDialog($: EngineInterface, ctx: Ctx): Dialog | null {
  const { els: { Button, Text }, view, flow, Input } = ctx
  const config = flow?.config ?? null
  const { starting, finishing, confirming, opts, tagMessage } = view.flow
  const close = () => setFlow($, f => ({ ...f, ...FLOW_CLOSED }))
  if (view.flow.isMenuOpen) return { title: 'Git Flow', rows: flowMenuRows($, ctx), actions: line(ctx, closeButton(ctx, 'flow-menu-close', close)) }
  const init = config ? null : initRows($, ctx)
  if (init) return { title: 'Set up git flow', rows: init.fields, actions: init.actions }
  if (!config) return null
  const actions = (run: RenderChildren, key: string) => line(ctx, [run, closeButton(ctx, key, close, 'cancel')], 2)
  const start = starting && typeOf(config, starting)
  if (start && Input)
    return {
      title: `New ${start.kind}`,
      rows: [line(ctx, <Input key="flow-name" label={start.prefix} value={flow?.next[start.kind] ?? ''} placeholder="name" submitLabel="start" autoFocus onSubmit={value => startTopic($, start.kind, value)} />)],
      actions: actions(null, 'flow-start-cancel'),
    }
  const finish = finishing && typeOf(config, finishing.kind)
  if (finishing && finish) {
    const flip = (key: keyof FlowOptions) => () => setFlow($, f => ({ ...f, opts: { ...f.opts, [key]: !f.opts[key] } }))
    const setTag = (value: string) => setFlow($, f => ({ ...f, tagMessage: value }))
    const option = (key: string, label: string, flag: keyof FlowOptions) => line(ctx, switchButton(ctx, key, label, opts[flag], flip(flag)), 0, undefined, `${key}-row`)
    return {
      title: `Finish ${finishing.branch}`,
      rows: [
        option('flow-opt-noff', 'merge commit (--no-ff)', 'isNoFf'),
        option('flow-opt-push', `push to ${config.remote}`, 'isPush'),
        option('flow-opt-keep', 'keep branch', 'isKeep'),
        ...(finish.isTagged && Input
          ? [line(ctx, <Input key="flow-tag" label="Tag message" value={tagMessage ?? defaultTagMessage(finishing)} submitLabel="set" onInput={setTag} onSubmit={setTag} />)]
          : []),
      ],
      actions: actions(
        <Button key="flow-finish-run" variant="primary" onPress={() => finishTopic($, finishing)}>
          Finish
        </Button>,
        'flow-finish-cancel',
      ),
    }
  }
  const type = confirming && typeOf(config, confirming.topic.kind)
  if (confirming && type) {
    const { action, topic } = confirming
    const isRebase = type.strategy === 'rebase'
    const [verb, question] =
      action === 'publish'
        ? ['Publish', `Publish ${topic.branch} to ${config.remote}?`]
        : isRebase
          ? ['Rebase', `Rebase ${topic.branch} on ${type.parent}?`]
          : ['Merge', `Merge ${type.parent} into ${topic.branch}?`]
    return {
      title: `${verb} ${topic.branch}`,
      rows: [line(ctx, <Text>{question}</Text>)],
      actions: actions(
        <Button key="flow-confirm-run" variant="primary" onPress={() => (action === 'publish' ? publishTopic($, topic) : updateTopic($, topic))}>
          {verb}
        </Button>,
        'flow-confirm-cancel',
      ),
    }
  }
  return null
}

// A dialog floating over the graph on a docked terminal pane (git flow, a branch's menu, a
// commit's actions): framed, centered in the window above the footer, over a blank layer
// so the rows beneath do not show through.
const DIALOG_W = 60

function renderDialog(ctx: Ctx, key: string, dialog: Dialog, top: number, room: number) {
  const { Box, Text } = ctx.els
  const rows = dialogRows(ctx, dialog)
  const width = Math.max(20, Math.min(DIALOG_W, ctx.cols - 2))
  const height = rows.length + 2
  const left = Math.max(0, Math.floor((ctx.cols - width) / 2))
  return (
    <Box key={key} position="absolute" top={top + Math.max(0, Math.floor((room - height) / 2))} left={left} width={width} height={height} flexDirection="column">
      <Box position="absolute" top={0} left={0} flexDirection="column">
        {Array.from({ length: height }, () => (
          <Text>{' '.repeat(width)}</Text>
        ))}
      </Box>
      <Box flexDirection="column" borderStyle="round" borderColor={dialog.color ?? PALETTE[0]} paddingX={1} width={width} height={height} overflow="hidden">
        {rows}
      </Box>
    </Box>
  )
}

// The Git Flow dialog's rows: a row per type, its start and, on a branch of that type, its
// update (rebase or merge) and finish; or why git flow cannot be used here, and its set-up.
function flowMenuRows($: EngineInterface, ctx: Ctx): RenderChildren[] {
  const { els: { Text, Button }, graph, flow, icons } = ctx
  const say = (text: string, color?: 'warning') => line(ctx, <Text color={color} dimColor={!color}>{text}</Text>)
  if (flow === null) return [say('git flow…')]
  if (flow.cli === 'none') return [say('git flow is not installed:', 'warning'), say(FLOW_INSTALL)]
  if (flow.cli === 'other') return [say('Git Flow actions need git-flow-next:', 'warning'), say(FLOW_INSTALL)]
  const config = flow.config
  // Not set up: a form for the repo's own names, or the standard ones (`git flow init -d`).
  if (!config)
    return [
      line(
        ctx,
        [
          ctx.Input && (
            <Button key="flow-init-open" onPress={() => openInit($)}>
              Set up git flow…
            </Button>
          ),
          confirmButton($, ctx, 'flow-init', 'flow-init', 'Use defaults', () => runFlow($, [{ args: ['flow', 'init', '-d'] }], 'Git flow started: main, develop ✓', 'Starting git flow…')),
        ],
        2,
      ),
      say(FLOW_DEFAULTS),
    ]
  const topic = topicOf(graph.branch, config)
  const labelWidth = iconCells(ctx) + 1 + Math.max(...config.types.map(t => t.kind.length))
  return config.types.map(t => {
    const here = topic?.kind === t.kind ? topic : null
    return line(
      ctx,
      [
        <Text>{`${icons[t.kind]}${' '.repeat(iconCells(ctx))}${t.kind}`.padEnd(labelWidth)}</Text>,
        <Button key={`flow-start-${t.kind}`} plain onPress={() => setFlow($, f => ({ ...f, ...FLOW_CLOSED, starting: t.kind }))}>
          start
        </Button>,
        here && (
          <Button key="flow-update" plain onPress={() => toggleConfirm($, 'update', here)}>
            {t.strategy === 'rebase' ? 'rebase' : 'merge'}
          </Button>
        ),
        here && (
          <Button key="flow-finish" plain onPress={() => toggleFinish($, here)}>
            finish
          </Button>
        ),
      ],
      2,
      undefined,
      `flow-row-${t.kind}`,
    )
  })
}

// The git flow footer: a rule over the button that opens the Git Flow dialog;
// then a running action's spinner, a conflict's continue and abort, or (off a docked
// terminal pane) an open dialog.
// Where git flow stands, after the footer's button: the work branch checked out, the base it
// came from and how it stands with its upstream; or why git flow is off here; nothing on
// another branch.
function flowContext({ flow, graph }: Ctx): string {
  if (flow === null) return ''
  if (flow.cli === 'none') return 'not installed'
  if (flow.cli === 'other') return 'needs git-flow-next'
  if (!flow.config) return 'not set up'
  const topic = topicOf(graph.branch, flow.config)
  const type = topic && typeOf(flow.config, topic.kind)
  if (!topic || !type) return ''
  const { sync } = graph
  const counts = sync ? [sync.ahead ? `↑${sync.ahead}` : '', sync.behind ? `↓${sync.behind}` : ''].filter(Boolean).join(' ') : ''
  const state = !sync ? 'not published' : counts ? `${counts} ${sync.remote}` : `in sync with ${sync.remote}`
  return [topic.branch, `from ${type.startpoint}`, state].join(' · ')
}

function renderFlow($: EngineInterface, ctx: Ctx) {
  const { els: { Box, Button, Text }, view, icons } = ctx
  const context = flowContext(ctx)
  const open = (
    <Button key="flow-open" plain dimColor={!view.flow.isMenuOpen} onPress={() => setFlow($, f => ({ ...f, ...FLOW_CLOSED, isMenuOpen: !f.isMenuOpen }))}>
      <Text>{`${icons.flow}${' '.repeat(iconCells(ctx))}Git Flow${context ? ` · ${context}` : ''}`}</Text>
    </Button>
  )
  const rows = [
    rule(ctx),
    line(ctx, open),
    ...flowFormRows($, ctx),
  ]
  return { node: <Box flexDirection="column">{rows}</Box>, height: rows.length }
}

// The one dialog a docked terminal pane floats over its graph: git flow's, a ref's menu or a
// commit's actions; none while an action runs (but the menu's, which shows its spinner).
function pinnedDialog($: EngineInterface, ctx: Ctx, menuRow: GraphRow | undefined, selectedRow: GraphRow | undefined): { key: string; dialog: Dialog } | null {
  const { view } = ctx
  const flowBox = view.running ? null : flowDialog($, ctx)
  if (flowBox) return { key: 'flow-dialog', dialog: flowBox }
  if (menuRow && view.menu) return { key: 'menu-dialog', dialog: menuDialog($, ctx, menuRow, view.menu.badge) }
  if (selectedRow && view.isActionsOpen && !view.running) return { key: 'actions-dialog', dialog: actionsDialog($, ctx, selectedRow) }
  return null
}

type PaneScroll = { offset: number; bodyRows: number }

// The header, the open menu and details, and every row's height.
function layoutPane($: EngineInterface, ctx: Ctx, indexOf: Map<string, number>) {
  const { graph, view } = ctx
  const header = renderHeader($, ctx)
  const rowOf = (hash: string | null | undefined) => (hash ? graph.rows[indexOf.get(hash) ?? -1] : undefined)
  const menuRow = rowOf(view.menu?.hash)
  const menuBox = menuRow && view.menu && !ctx.isPinned ? renderMenu($, ctx, menuRow, view.menu.badge) : undefined
  const selectedRow = rowOf(view.selected)
  const detailBox = selectedRow ? renderDetail($, ctx, selectedRow) : undefined
  const heights = graph.rows.map(r => 1 + (r === menuRow ? (menuBox?.height ?? 0) : 0) + (r === selectedRow ? (detailBox?.height ?? 0) : 0))
  // "Load more" is one row more at the end.
  if (graph.hasMore) heights.push(1)
  return { header, menuRow, menuBox, selectedRow, detailBox, heights }
}

// The rows to draw. Only the rows in the window are drawn, so a scroll step costs a window
// of rows, not the whole graph. Off a docked terminal pane the engine scrolls the tree and
// spacers stand for the rest. On one the mod scrolls itself: the tree holds still at the
// pane's height and the rows move under a fixed header and footer (an engine scroll would
// carry the footer off and back on each step), `top` the first row shown.
function rowsWindow(ctx: Ctx, heights: number[], headerRows: number, footerRows: number, scroll: PaneScroll, top: number, centered: number) {
  if (!ctx.isPinned) {
    const offset = centered >= 0 ? headerRows + topOf(heights, centered) - Math.floor(scroll.bodyRows / 2) : scroll.offset
    return { ...visibleRange(heights, headerRows, offset, scroll.bodyRows, OVERSCAN), shift: 0, viewport: 0, top: 0, maxTop: 0 }
  }
  const viewport = Math.max(1, scroll.bodyRows - headerRows - footerRows)
  const total = topOf(heights, heights.length)
  const at = clampTop(centered >= 0 ? topOf(heights, centered) - Math.floor(viewport / 2) : top, total, viewport)
  return { ...windowAt(heights, at, viewport), before: 0, after: 0, viewport, top: at, maxTop: Math.max(0, total - viewport) }
}

async function renderPane($: EngineInterface, els: Ctx['els'], surface: string, isDocked: boolean, cols: number, scroll: PaneScroll) {
  const { Box, Text, Button } = els
  const [cache, view, detail, isRound, hasNerd, flow, repos, columns] = await Promise.all([
    readCache($),
    read($, viewState),
    read($, detailState),
    read($, roundState),
    read($, nerdState),
    read($, flowState),
    read($, reposState),
    read($, columnsState),
  ])
  const { graph, indexOf } = cache
  if (graph.status === 'no-repo') return <Text dimColor>Not a git repository.</Text>
  if (graph.status === 'error') return <Text color="error">Could not read git: {graph.error ?? ''}</Text>

  const graphMax = Math.max(6, Math.min(40, Math.floor(cols / 3)))
  const base: Ctx = {
    els,
    graph,
    view,
    detail,
    flow,
    cols,
    graphWidth: Math.min(graphMax, cache.maxCells),
    now: Math.floor(Date.now() / 1000),
    isRound,
    icons: hasNerd ? ICONS.nerd : ICONS.plain,
    repos,
    Input: 'Input' in els ? (els.Input as Elements['terminal']['Input']) : undefined,
    Client: (surface === 'terminal' || surface === 'desktop') && 'Client' in els ? (els.Client as Elements['terminal']['Client']) : undefined,
    isPinned: surface === 'terminal' && isDocked,
    columns,
  }
  if (view.screen === 'changelog') return renderChangelog($, base, await read($, changelogState))
  if (view.screen === 'settings') return renderSettings($, base, await read($, settingsState))
  // The graph column is as wide as the rows in the window need: laid out once to find the
  // window, then again at that width (a wide stretch far off no longer widens it all).
  const top = await read($, scrollTopState)
  const centered = view.scrollTo ? (indexOf.get(view.scrollTo) ?? -1) : -1
  const footer = renderFlow($, base)
  const footerRows = footer.height
  const first = layoutPane($, base, indexOf)
  const firstWindow = rowsWindow(base, first.heights, first.header.height, footerRows, scroll, top, centered)
  const graphWidth = Math.min(graphMax, widestIn(graph.rows, firstWindow.from, firstWindow.to))
  const ctx = graphWidth === base.graphWidth ? base : { ...base, graphWidth }
  const laid = ctx === base ? first : layoutPane($, ctx, indexOf)
  const { header, menuRow, menuBox, selectedRow, detailBox } = laid
  const { from, to, before, after, shift, viewport, ...window } = ctx === base ? firstWindow : rowsWindow(ctx, laid.heights, header.height, footerRows, scroll, top, centered)
  // On a docked terminal pane the footer closes the pane, below the rows' window; elsewhere
  // (inline it would stretch the pane to its whole room) it closes the list.
  const { isPinned } = ctx
  ownScroll = isPinned ? { top: window.top, maxTop: window.maxTop } : null
  const dialog = isPinned ? pinnedDialog($, ctx, menuRow, selectedRow) : null

  const loadMore = (
    <Button key="more" plain dimColor onPress={async () => {
      await update($, viewState, v => ({ ...v, limit: v.limit + PAGE }))
      await load($)
    }}>
      Load {PAGE} more commits
    </Button>
  )
  const rows = graph.rows.slice(from, to).map(row => (
    <Box key={`row:${row.commit.hash}`} flexDirection="column" flexShrink={0}>
      {renderRow($, ctx, row)}
      {row === menuRow && menuBox?.node}
      {row === selectedRow && detailBox?.node}
    </Box>
  ))
  const empty = graph.rows.length === 0 && <Text dimColor>{graph.status === 'ready' ? 'No commits yet.' : 'Loading…'}</Text>

  if (isPinned)
    return (
      <Box flexDirection="column" height={scroll.bodyRows} overflow="hidden">
        {header.node}
        <Box key="rows-window" height={viewport} flexShrink={0} overflow="hidden">
          <Box position="absolute" top={-shift} left={0} width={cols} flexDirection="column">
            {empty}
            {rows}
            {graph.hasMore && to > graph.rows.length && loadMore}
          </Box>
        </Box>
        <Box key="flow-footer" height={footer.height} flexShrink={0} flexDirection="column">
          {footer.node}
        </Box>
        {dialog && renderDialog(ctx, dialog.key, dialog.dialog, header.height, viewport)}
      </Box>
    )
  return (
    <Box flexDirection="column">
      {header.node}
      {empty}
      {before > 0 && <Box key="space-before" height={before} flexShrink={0} />}
      {rows}
      {after > 0 && <Box key="space-after" height={after} flexShrink={0} />}
      {graph.hasMore && loadMore}
      {footer.node}
    </Box>
  )
}

async function hasNerdFont($: EngineInterface): Promise<boolean> {
  try {
    return (await $.process.run(['sh', '-c', NERD_FONT_CHECK], { timeoutMs: 3_000 })).exitCode === 0
  } catch {
    return false
  }
}

// The columns kept in the store; a value of another shape (none yet) reads as the default.
async function loadColumns($: EngineInterface): Promise<void> {
  const kept = await $.store.get('columns')
  const isBool = (v: unknown) => typeof v === 'boolean'
  const columns = kept && typeof kept === 'object' && isBool((kept as Columns).isAuthor) && isBool((kept as Columns).isHash) ? (kept as Columns) : DEFAULT_COLUMNS
  await update($, columnsState, () => ({ isAuthor: columns.isAuthor, isHash: columns.isHash }))
}

async function toggleColumn($: EngineInterface, key: keyof Columns): Promise<void> {
  const columns = await update($, columnsState, c => ({ ...c, [key]: !c[key] }))
  await $.store.set('columns', columns)
}

// At session start and again on each /gitgraph: a session the state was lost in
// (`/clear`, `/resume`) gets no new session.start and would draw square pills.
async function detectFont($: EngineInterface, style: BadgeStyle): Promise<void> {
  const hasNerd = await hasNerdFont($)
  await update($, nerdState, () => hasNerd)
  await update($, roundState, () => (style === 'auto' ? hasNerd : style === 'round'))
}

export const register: Register = (on, options) => {
  const style: BadgeStyle = options.badges === 'round' || options.badges === 'square' ? options.badges : 'auto'

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'gitgraph', description: 'Open Git Graph: the commit graph of this repository' })
    $.clock.every(POLL_MS, () => void poll($))
    await Promise.all([detectFont($, style), loadColumns($)])
    return next(e)
  })

  on('command.run', { command: 'gitgraph' }, async $ => {
    await update($, viewState, v => ({ ...v, isOpen: true }))
    await $.ui.open({ id: PANE, title: TITLE })
    await findRepos($)
    await Promise.all([load($), loadFlow($), detectFont($, style), loadColumns($)])
    const graph = await readGraph($)
    return { text: graph.status === 'no-repo' ? 'Git Graph: not a git repository.' : 'Git Graph opened.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, viewState, v => ({ ...v, isOpen: false }))
    return next(e)
  }).catch(($, e, next) => next(e))

  // A pill posts `{ button }`: right opens its ref's menu, left selects the commit at once,
  // and a second left click on the same pill within DOUBLE_CLICK_MS checks the ref out,
  // putting back the selection the first click changed: a double click leaves no details.
  on('ui.message', { requestId: PANE }, async ($, e, next) => {
    const [kind, hash = '', index = ''] = e.element.split(':')
    const button = (e.data as { button?: string } | null)?.button
    if (kind !== 'pill') return next(e)
    const graph = await readGraph($)
    const row = graph.rows.find(r => r.commit.hash === hash)
    const badge = row && badgesOf(row.commit.refs, graph.locals)[Number(index)]
    const now = Date.now()
    const isDouble = button === 'left' && lastPillClick.key === e.element && now - lastPillClick.at <= DOUBLE_CLICK_MS
    const before = lastPillClick.selected
    const { selected } = await read($, viewState)
    lastPillClick = button === 'left' && !isDouble ? { key: e.element, at: now, selected } : { key: '', at: 0, selected: null }
    if (badge && button === 'right') await openMenu($, hash, badge)
    else if (badge && isDouble) {
      // `select` toggles: selecting the clicked commit again closes what the first click opened.
      if (selected !== before) await select($, before ?? hash)
      await checkoutRef($, badge)
    } else if (button === 'left') await select($, hash)
    return next(e)
  }).catch(($, e, next) => next(e))

  // On a docked terminal pane the mod scrolls its own rows: the engine's window holds still
  // (no `next`), so the header and the footer never move. Elsewhere the engine scrolls.
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    if (!ownScroll) return next(e)
    const { top, maxTop } = ownScroll
    await update($, scrollTopState, () => Math.max(0, Math.min(top + (e.by ?? 0), maxTop)))
    // A search's centered commit lets go at the first scroll, from where it was drawn.
    if ((await read($, viewState)).scrollTo) await update($, viewState, v => ({ ...v, scrollTo: null }))
    return {}
  }).catch(($, e, next) => next(e))

  // Any Bash call may have committed, switched or edited: the signature check decides.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    await poll($)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => renderPane($, $.ui.resolve(e), e.surface, e.props.placement === 'dock', e.props.bodyColumns, e.props.scroll))
}
