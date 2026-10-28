import { atom, read, update } from 'claude-code'
import type { ClientElements, Elements, EngineInterface, ProcessRunResult, Register, RenderChildren } from 'claude-code'

import type { Badge, BadgeKind, BadgeStyle, Cell, CommitDetail, ConfigScope, FileStat, FlowConfig, FlowConflict, FlowInfo, FlowKind, FlowOptions, FlowTopic, FlowView, Graph, GraphRow, Ref, RepoSettings, View } from '../types'
import { badgeParts, badgesOf, diffBar, fitBadges } from './badges'
import { isBranchNameCandidate } from './detect'
import { absTime, fitGraph, relTime, short, truncate, truncateMiddle } from './format'
import { layout } from './lanes'
import { findByHash, isHashQuery, topOf, visibleRange, wrapRows } from './virtual'
import { DETAIL_FORMAT, LOG_FORMAT, parseDetail, parseLog, parseStatus, remotesOf, UNCOMMITTED, withUncommitted } from './log'
import { defaultTagMessage, finishArgs, finishPushArgs, flowArgs, flowCliOf, flowMenuFor, nextVersion, parseFlowConfig, resumeArgs, topicFor, typeOf } from './flow'
import { checkoutArgs, defaultPushRemotes, deleteBranchArgs, type MenuItem, menuFor, pushRuns, renameArgs } from './menu'
import { drawPill, type PillProps } from './pilldraw'
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
    flow: '\ue725',
    feature: '\uf0eb',
    bugfix: '\uf188',
    release: '\uf02b',
    hotfix: '\uf06d',
  },
  plain: { on: '◉', off: '○', fetch: '☁', refresh: '↻', settings: '⚙', search: '⌕', flow: '⎇', feature: '✦', bugfix: '✱', release: '◆', hotfix: '▲' },
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

const DEFAULT_FLOW: FlowView = { starting: null, finishing: null, opts: { isNoFf: true, isPush: true, isKeep: true }, tagMessage: null, conflict: null }
const EMPTY_GRAPH: Graph = { status: 'idle', rows: [], head: '', branch: '', dirty: 0, conflicts: 0, remotes: [], hasMore: false }
const DEFAULT_VIEW: View = { scope: 'all', limit: PAGE, selected: null, confirm: null, menu: null, isRenaming: false, isDeleting: false, isForce: false, push: null, running: null, isSettings: false, configScope: 'local', editingRemote: null, isAddingRemote: false, remoteDraft: '', scrollTo: null, refresh: 'idle', isOpen: false, flow: DEFAULT_FLOW }

const graphState = atom({ plugin: 'gitgraph', key: 'graph' } as const, EMPTY_GRAPH)
// Bumped with every graph write: renders read this small number and keep the graph
// itself in `graphCache`, so a scroll step does not carry the whole graph across.
const versionState = atom({ plugin: 'gitgraph', key: 'graphVersion' } as const, 0)
// Tagged with the shape of View: a view an older version kept (without fields added
// since) reads as absent after an update, instead of breaking the render.
const viewState = atom({ plugin: 'gitgraph', key: 'view' } as const, DEFAULT_VIEW, { shape: 'view-6' })
const detailState = atom({ plugin: 'gitgraph', key: 'detail' } as const, null as CommitDetail | null)
const roundState = atom({ plugin: 'gitgraph', key: 'isRound' } as const, false)
const nerdState = atom({ plugin: 'gitgraph', key: 'hasNerdFont' } as const, false)
const settingsState = atom({ plugin: 'gitgraph', key: 'settings' } as const, null as RepoSettings | null)
// Loaded when the pane opens and after git flow actions, not with every graph load.
const flowState = atom({ plugin: 'gitgraph', key: 'flow' } as const, null as FlowInfo | null)

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
} satisfies Partial<View>

// The git flow forms under the footer bar, closed when a git flow action ends.
const FLOW_CLOSED = { starting: null, finishing: null, tagMessage: null } satisfies Partial<FlowView>

let generation = 0
// What a render derives from the graph, worked out once per graph version.
type GraphCache = { version: number; graph: Graph; maxCells: number; indexOf: Map<string, number> }
let graphCache: GraphCache | null = null
let signature = ''
let busy = false
// Set synchronously when an action starts, so a second press before the redraw is ignored.
let isRunning = false
// The last left click on a pill, to tell a double click.
let lastPillClick = { key: '', at: 0 }

const firstLine = (text: string) => text.split('\n').find(l => l.trim() !== '') ?? 'unknown error'

// Network commands may wait on a remote: a longer timeout.
function git($: EngineInterface, args: string[], isNetwork = false) {
  return $.process.run(['git', ...args], { timeoutMs: isNetwork ? NETWORK_TIMEOUT_MS : GIT_TIMEOUT_MS, env: GIT_ENV })
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
    const view = await read($, viewState)
    await Promise.all([load($), view.selected ? loadDetail($, view.selected) : undefined, view.isSettings ? loadSettings($) : undefined, (await read($, flowState)) ? loadFlow($) : undefined])
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
  await update($, viewState, v => ({ ...v, scrollTo: hash, menu: null }))
  if ((await read($, viewState)).selected !== hash) await select($, hash)
  // Scrolling is a convenience: where a surface cannot, the commit is still selected.
  try {
    await $.ui.scroll({ to: { key: hash }, in: PANE, block: 'center' })
  } catch {
    // no surface to scroll
  }
  await update($, viewState, v => ({ ...v, scrollTo: null }))
}

async function openMenu($: EngineInterface, hash: string, badge: Badge): Promise<void> {
  if ((await read($, flowState)) === null) await loadFlow($)
  await update($, viewState, (v): View => {
    const isSame = v.menu?.hash === hash && v.menu.badge.label === badge.label && v.menu.badge.kind === badge.kind
    return { ...v, ...CLOSED, menu: isSame ? null : { hash, badge } }
  })
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
  await Promise.all([load($), (await read($, viewState)).isSettings ? loadSettings($) : undefined])
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
  const failures = await withRunning($, label, done, async () => {
    for (const step of steps) {
      const out = await git($, step.args[0] === 'flow' ? ['-c', `core.hooksPath=${$.plugin.root}/${NO_HOOKS}`, ...step.args] : step.args, step.isNetwork)
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
  const [version, config, tags] = await Promise.all([
    known && known.cli !== 'none' ? undefined : git($, ['flow', 'version']),
    git($, ['config', '--get-regexp', '^gitflow\\.']),
    git($, ['tag', '--list']),
  ])
  const cli = version ? flowCliOf(version.exitCode, version.stdout) : (known?.cli ?? 'none')
  const tagList = tags.stdout.split('\n').filter(Boolean)
  await update($, flowState, () => ({
    cli,
    config: cli === 'none' ? null : parseFlowConfig(config.stdout),
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

// Opens the finish form under the footer bar; again on the same branch, closes it.
async function toggleFinish($: EngineInterface, topic: FlowTopic): Promise<void> {
  await update($, viewState, (v): View => ({
    ...v,
    ...CLOSED,
    flow: { ...v.flow, ...FLOW_CLOSED, finishing: v.flow.finishing?.branch === topic.branch ? null : topic },
  }))
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

const localBranch = (refs: Ref[]) => refs.find(r => (r.kind === 'head' && r.name !== 'HEAD') || r.kind === 'branch')?.name
const isCheckedOut = (refs: Ref[]) => refs.some(r => r.kind === 'head' && r.name !== 'HEAD')
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
  graphMax: number
  graphWidth: number
  now: number
  isRound: boolean
  icons: (typeof ICONS)['plain']
  // Fields where the surface has them (not mobile).
  Input: Elements['terminal']['Input'] | undefined
  // Only the terminal and the desktop draw a `Client` (vscode's table holds a stub); elsewhere pills are Text.
  Client: Elements['terminal']['Client'] | undefined
}

function pillProps({ isRound }: Ctx, badge: Badge, lane: string): PillProps {
  const { name, remotes } = badgeParts(badge)
  return {
    name: name.slice(1),
    remotes,
    bg: BADGE_BG[badge.kind] ?? lane,
    fg: BADGE_FG,
    isBold: badge.kind === 'head' || badge.kind === 'detached',
    isRound,
  }
}

// The pill ./pill.tsx draws, for surfaces without `Client`.
const renderPill = ({ els: { Text } }: Ctx, p: PillProps) => drawPill(Text as ClientElements['Text'], p)

// A pill that names something other than a ref: a hash, the current branch, a remote, `+N`.
const plainPill = ({ isRound }: Ctx, name: string, bg: string, isBold = false): PillProps => ({
  name,
  remotes: '',
  bg,
  fg: BADGE_FG,
  isBold,
  isRound,
})

function copyButton($: EngineInterface, { els: { Button } }: Ctx, key: string, label: string, text: string, copied: string, close = false) {
  return (
    <Button key={key} onPress={async pe => {
      const res = await $.ui.copy({ text, surface: pe.surface })
      $.ui.toast(res.isCopied ? copied : 'Could not copy')
      if (close) await update($, viewState, v => ({ ...v, menu: null }))
    }}>
      {label}
    </Button>
  )
}

function metaOf({ cols }: Ctx, author: string, hash: string): string {
  if (cols < 70) return ` ${short(hash)}`
  return `  ${truncate(author, AUTHOR_W).padEnd(AUTHOR_W)}  ${short(hash)}`
}

// One row of the pane, exactly one terminal row tall whatever it holds.
function line({ els: { Box } }: Ctx, children: RenderChildren, gap = 0, justify?: 'space-between') {
  return (
    <Box height={1} overflow="hidden" flexDirection="row" gap={gap} justifyContent={justify}>
      {children}
    </Box>
  )
}

const rule = (ctx: Ctx) => line(ctx, <ctx.els.Text dimColor>{'─'.repeat(Math.max(0, ctx.cols))}</ctx.els.Text>)

const headName = (graph: Graph) => graph.branch || (graph.head ? short(graph.head) : '—')

// An on/off switch: the icon in green when on, the label dimmed when off.
function switchButton({ els: { Button, Text }, icons }: Ctx, key: string, label: string, isOn: boolean, onPress: () => Promise<unknown>) {
  return (
    <Button key={key} plain onPress={onPress}>
      <Text color={isOn ? 'success' : undefined} dimColor={!isOn}>
        {isOn ? icons.on : icons.off}
      </Text>
      <Text dimColor={!isOn}> {label}</Text>
    </Button>
  )
}

const blank = (ctx: Ctx) => line(ctx, <ctx.els.Text> </ctx.els.Text>)

// An icon Button's label, a space each side so the click target is wider than the glyph.
// Ghostty and non-Mono Nerd Fonts draw a Nerd Font icon two cells wide over a space after
// it: a second space keeps it centered in the hover.
const iconLabel = (ctx: Ctx, glyph: string) => (ctx.icons === ICONS.nerd ? ` ${glyph}  ` : ` ${glyph} `)

// Header rows, each one row tall: toolbar, search (where fields exist), column titles, rule.
function renderHeader($: EngineInterface, ctx: Ctx) {
  const { els, graph, view, cols, graphWidth, icons } = ctx
  const { Box, Text, Button } = els
  const { Input } = ctx
  const isAll = view.scope === 'all'
  const headRow = graph.rows.find(r => r.commit.hash === graph.head)
  const count = graph.rows.length - (graph.dirty ? 1 : 0)
  const head = headName(graph)
  const lines = [
    <Box height={1} overflow="hidden" flexDirection="row" justifyContent="space-between" columnGap={2}>
      <Box flexShrink={1} overflow="hidden">
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
          <Button key="settings" plain dimColor onPress={async () => {
            await update($, viewState, v => ({ ...v, ...CLOSED, isSettings: true, selected: null }))
            await loadSettings($)
          }}>
            {iconLabel(ctx, icons.settings)}
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
  if (Input)
    lines.push(
      line(
        ctx,
        <Input key="search" label={`${icons.search} `} placeholder="find commit by hash" submitLabel="find" onSubmit={value => searchCommit($, value)} />,
      ),
    )
  if (cols >= 70)
    lines.push(
      line(
        ctx,
        <Text dimColor>
          {'Graph'.padEnd(graphWidth + 1)}
          {'Description'.padEnd(Math.max(0, cols - graphWidth - 1 - metaOf(ctx, '', '').length))}
          {`  ${'Author'.padEnd(AUTHOR_W)}  Commit`}
        </Text>,
      ),
    )
  lines.push(rule(ctx))
  return { node: <Box flexDirection="column">{lines}</Box>, height: lines.length }
}

function renderRow($: EngineInterface, ctx: Ctx, { commit, cells }: GraphRow) {
  const { els, view, cols, graphMax, graphWidth } = ctx
  const { Box, Text, Button } = els
  const { Client } = ctx
  const fitted = fitGraph(cells, graphMax)
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
  // Pills get what is left once the subject keeps its minimum; the rest become `+N`.
  const fixed = graphWidth + 1 + meta.length + EDGE_SAFETY
  const { shown, hidden, width } = fitBadges(badgesOf(commit.refs), Math.max(0, cols - fixed - MIN_SUBJECT))
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

// A destructive action: the first press arms it, the second runs it.
function confirmButton($: EngineInterface, { els: { Button }, view }: Ctx, key: string, armKey: string, label: string, run: () => Promise<void>) {
  const armed = view.confirm === armKey
  return (
    <Button key={key} variant={armed ? 'primary' : undefined} onPress={async () => {
      if (armed) await run()
      else await update($, viewState, v => ({ ...v, confirm: armKey }))
    }}>
      {armed ? `Confirm: ${label.replace(/…$/, '')}?` : label}
    </Button>
  )
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

// The confirm key of a git flow item: arming it in the footer arms it in the menu too.
const flowArmKey = ({ action, topic }: NonNullable<MenuItem['flow']>) => `flow-${action}:${topic.branch}`

// A git flow item, the same in a branch's menu and in the footer: finish opens its form
// (whose Finish asks again); update and publish ask for a second press.
function renderFlowItem($: EngineInterface, ctx: Ctx, key: string, label: string, flow: NonNullable<MenuItem['flow']>) {
  const { action, topic } = flow
  if (action !== 'finish') return confirmButton($, ctx, key, flowArmKey(flow), label, () => (action === 'update' ? updateTopic($, topic) : publishTopic($, topic)))
  return (
    <ctx.els.Button key={key} variant={ctx.view.flow.finishing?.branch === topic.branch ? 'primary' : undefined} onPress={() => toggleFinish($, topic)}>
      {label}
    </ctx.els.Button>
  )
}

function renderMenuItem($: EngineInterface, ctx: Ctx, badge: Badge, item: MenuItem) {
  const { Button } = ctx.els
  const key = `menu-${item.id}`
  if (item.flow) return renderFlowItem($, ctx, key, item.label, item.flow)
  if (item.copy !== undefined) return copyButton($, ctx, key, item.label, item.copy, `Copied "${item.copy}"`, true)
  if (item.pushArgs)
    return (
      <Button key={key} variant={ctx.view.push ? 'primary' : undefined} onPress={() =>
        update($, viewState, v => ({ ...v, push: v.push ? null : defaultPushRemotes(badge, ctx.graph.remotes), isRenaming: false, confirm: null }))
      }>
        {item.label}
      </Button>
    )
  if (item.deleteBranch !== undefined)
    return (
      <Button key={key} variant={ctx.view.isDeleting ? 'primary' : undefined} onPress={() =>
        update($, viewState, v => ({ ...v, isDeleting: !v.isDeleting, isForce: false, isRenaming: false, push: null, confirm: null }))
      }>
        {item.label}
      </Button>
    )
  if (item.isRename)
    return (
      <Button key={key} onPress={() => update($, viewState, v => ({ ...v, isRenaming: !v.isRenaming, confirm: null }))}>
        {item.label}
      </Button>
    )
  const runs = item.runs ?? []
  return confirmButton($, ctx, key, `menu:${item.id}:${badge.kind}:${badge.label}`, item.label, () =>
    runActions($, runs, `${item.label}: ${badge.label} ✓`, `${item.label}: ${badge.label}…`, item.isNetwork),
  )
}

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

function renderMenu($: EngineInterface, ctx: Ctx, { cells }: GraphRow, badge: Badge) {
  const { els, graph, view } = ctx
  const { Box, Text, Button } = els
  const { Input } = ctx
  const lane = laneColor(cells)
  const items = menuFor(badge, graph.remotes, ctx.flow?.config ?? null)
  const push = items.find(i => i.pushArgs)
  const rows: RenderChildren[] = [
    line(
      ctx,
      [
        <Text>{renderPill(ctx, pillProps(ctx, badge, lane))}</Text>,
        <Button key="menu-close" plain dimColor onPress={() => update($, viewState, v => ({ ...v, menu: null, isRenaming: false }))}>
          close
        </Button>,
      ],
      0,
      'space-between',
    ),
  ]
  if (view.running) rows.push(renderRunning(ctx))
  else {
    // The items take as many rows as the menu's width needs, none hidden; an armed item
    // is measured with its longer `Confirm: …?`.
    const room = ctx.cols - ctx.graphWidth - 1 - 4
    const isArmed = (item: MenuItem) => (item.flow ? view.confirm === flowArmKey(item.flow) : view.confirm?.startsWith(`menu:${item.id}:`))
    const widths = items.map(item => (isArmed(item) ? `Confirm: ${item.label}?` : item.label).length + BUTTON_CHROME)
    for (const [n, row] of wrapRows(widths, room, 1).entries())
      rows.push(
        <Box key={`menu-items-${n}`} height={1} overflow="hidden" flexDirection="row" columnGap={1}>
          {row.map(i => items[i] && renderMenuItem($, ctx, badge, items[i]))}
        </Box>,
      )
    if (view.push && push) rows.push(...renderPushChooser($, ctx, badge, push))
    const branch = items.find(i => i.deleteBranch !== undefined)?.deleteBranch
    if (view.isDeleting && branch !== undefined)
      rows.push(
        line(
          ctx,
          [
            switchButton(ctx, 'menu-opt-force', 'force (deletes unmerged work)', view.isForce, () => update($, viewState, v => ({ ...v, isForce: !v.isForce }))),
            confirmButton($, ctx, 'menu-delete-run', `delete-branch:${branch}`, `Delete ${branch}`, () =>
              runAction($, deleteBranchArgs(branch, view.isForce), `Deleted ${branch}`),
            ),
          ],
          2,
        ),
      )
    if (view.isRenaming && Input)
      rows.push(
        line(ctx, <Input key="rename" label="New name:" value={badge.label} submitLabel="rename" autoFocus onSubmit={value => renameBranch($, badge.label, value)} />),
      )
  }
  return framed(ctx, BADGE_BG[badge.kind] ?? lane, ctx.graphWidth + 1, rows)
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

function renderDetail($: EngineInterface, ctx: Ctx, { commit, cells }: GraphRow) {
  const { els, detail, graph, view } = ctx
  const { Text, Button } = els
  const { Input } = ctx
  const branch = localBranch(commit.refs)
  const lane = laneColor(cells)
  const badges = badgesOf(commit.refs).filter(b => b.kind !== 'detached')
  const [subject = '', ...rest] = (detail?.body ?? commit.subject).split('\n')
  const body = rest.join('\n').trim().split('\n').filter((l, i, all) => l !== '' || (i > 0 && all[i - 1] !== ''))
  const rows: RenderChildren[] = [
    line(
      ctx,
      <Text wrap="truncate-end">
        {renderPill(ctx, plainPill(ctx, short(commit.hash), lane, true))}
        <Text weight="bold">{subject}</Text>
      </Text>,
    ),
  ]
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
    if (body.length && body[0] !== '') {
      rows.push(blank(ctx), ...body.slice(0, BODY_LINES).map(l => line(ctx, <Text wrap="truncate-end">{l}</Text>)))
      if (body.length > BODY_LINES) rows.push(line(ctx, <Text dimColor>…</Text>))
    }
    rows.push(blank(ctx), ...renderFiles(ctx, detail.files))
  }
  if (badges.length)
    rows.push(
      blank(ctx),
      line(
        ctx,
        [
          <Text dimColor>Refs:</Text>,
          ...badges.map((b, i) => (
            <Button key={`refmenu-${i}`} plain onPress={() => openMenu($, commit.hash, b)}>
              ⋯ {b.label}
            </Button>
          )),
        ],
        1,
      ),
    )
  rows.push(blank(ctx))
  if (view.running) rows.push(view.menu ? blank(ctx) : renderRunning(ctx))
  else {
    rows.push(
      line(
        ctx,
        [
          copyButton($, ctx, 'copy', 'Copy hash', commit.hash, `Copied hash ${short(commit.hash)}`),
          !isCheckedOut(commit.refs) &&
            confirmButton($, ctx, 'checkout', `checkout:${commit.hash}`, `Checkout ${branch ?? '(detached)'}`, () =>
              runAction($, (branch && checkoutArgs({ kind: 'branch', label: branch, remotes: [] })) || ['checkout', '--detach', commit.hash], `Checked out ${branch ?? short(commit.hash)}`),
            ),
          commit.hash !== graph.head &&
            confirmButton($, ctx, 'pick', `pick:${commit.hash}`, 'Cherry-pick', () =>
              runAction($, ['cherry-pick', commit.hash], `Cherry-picked ${short(commit.hash)}`),
            ),
        ],
        1,
      ),
    )
    if (Input)
      rows.push(line(ctx, <Input key="new-branch" label="New branch here:" placeholder="branch-name" submitLabel="create" onSubmit={value => createBranch($, commit.hash, value)} />))
  }
  return framed(ctx, lane, ctx.graphWidth + 1, rows)
}

function renderSettings($: EngineInterface, ctx: Ctx, settings: RepoSettings | null) {
  const { els, view, cols } = ctx
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
      <Box flexDirection="row" justifyContent="space-between">
        <Text weight="bold">{ctx.icons.settings} Repository settings</Text>
        <Button key="settings-back" plain dimColor onPress={() => update($, viewState, v => ({ ...v, isSettings: false }))}>
          ← graph
        </Button>
      </Box>
      {rule(ctx)}
      {settings === null ? (
        <Text dimColor>Loading…</Text>
      ) : (
        <Box flexDirection="column" gap={1}>
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
                <Input key="cfg-name" label="Name:" value={settings[view.configScope].name} submitLabel="save" onSubmit={value => setUser($, view.configScope, 'name', value)} />
                <Input key="cfg-email" label="Email:" value={settings[view.configScope].email} submitLabel="save" onSubmit={value => setUser($, view.configScope, 'email', value)} />
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
                  <Input key={`remote-url-${r.name}`} label="New URL:" value={r.fetchUrl} submitLabel="save" autoFocus onSubmit={value => setRemoteUrl($, r.name, value)} />
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
                      label="Name:"
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
        </Box>
      )}
    </Box>
  )
}

// The rows under the footer bar: only what an action in progress needs.
function flowFormRows($: EngineInterface, ctx: Ctx): RenderChildren[] {
  const { view, flow } = ctx
  const config = flow?.config
  // An action started from a branch menu or a commit's details shows its spinner there; the
  // footer shows only the others', under a key of its own (a key drawn twice voids the pane).
  if (view.running) return view.menu || view.selected ? [] : [renderRunning(ctx, 'flow-spinner')]
  if (!config) return []
  if (view.flow.conflict) return conflictRows($, ctx, view.flow.conflict)
  return [...startRows($, ctx, config), ...finishRows($, ctx, config)]
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

// The name field of the type whose start was pressed.
function startRows($: EngineInterface, ctx: Ctx, config: FlowConfig) {
  const { els: { Button }, view, flow } = ctx
  const { Input } = ctx
  const type = view.flow.starting && typeOf(config, view.flow.starting)
  if (!type || !Input) return []
  return [
    line(
      ctx,
      [
        <Input key="flow-name" label={`New ${type.prefix}`} value={flow?.next[type.kind] ?? ''} placeholder="name" submitLabel="start" autoFocus onSubmit={value => startTopic($, type.kind, value)} />,
        <Button key="flow-start-cancel" plain dimColor onPress={() => setFlow($, f => ({ ...f, starting: null }))}>
          cancel
        </Button>,
      ],
      1,
    ),
  ]
}

// The finish form: its switches, the tag message where the type tags, and the run.
function finishRows($: EngineInterface, ctx: Ctx, config: FlowConfig) {
  const { els: { Text, Button }, view } = ctx
  const { Input } = ctx
  const { finishing: topic, opts, tagMessage } = view.flow
  const type = topic && typeOf(config, topic.kind)
  if (!topic || !type) return []
  const flip = (key: keyof FlowOptions) => () => setFlow($, f => ({ ...f, opts: { ...f.opts, [key]: !f.opts[key] } }))
  const setTag = (value: string) => setFlow($, f => ({ ...f, tagMessage: value }))
  const rows = [
    line(
      ctx,
      [
        <Text weight="bold">{`Finish ${topic.branch}`}</Text>,
        switchButton(ctx, 'flow-opt-noff', 'no-ff', opts.isNoFf, flip('isNoFf')),
        switchButton(ctx, 'flow-opt-push', 'push', opts.isPush, flip('isPush')),
        switchButton(ctx, 'flow-opt-keep', 'keep branch', opts.isKeep, flip('isKeep')),
      ],
      2,
    ),
  ]
  if (type.isTagged && Input)
    rows.push(line(ctx, <Input key="flow-tag" label="Tag message:" value={tagMessage ?? defaultTagMessage(topic)} submitLabel="set" onInput={setTag} onSubmit={setTag} />))
  rows.push(
    line(
      ctx,
      [
        confirmButton($, ctx, 'flow-finish-run', `flow-finish-run:${topic.branch}`, 'Finish', () => finishTopic($, topic)),
        <Button key="flow-finish-cancel" plain dimColor onPress={() => setFlow($, f => ({ ...f, finishing: null }))}>
          cancel
        </Button>,
      ],
      2,
    ),
  )
  return rows
}

type BarItem = { node: RenderChildren; width: number; isSeparator?: boolean }

const barText = (ctx: Ctx, text: string, color?: 'warning'): BarItem => ({
  node: (
    <ctx.els.Text color={color} dimColor={!color}>
      {text}
    </ctx.els.Text>
  ),
  width: text.length,
})

// The footer bar's items: start a work branch of each type and, on one, finish, update
// and publish it; or why git flow cannot be used here.
function flowBar($: EngineInterface, ctx: Ctx): BarItem[] {
  const { els: { Text, Button }, view, graph, flow, icons } = ctx
  const mark: BarItem = { node: <Text weight="bold">{icons.flow}</Text>, width: 1 }
  if (flow === null) return [mark, barText(ctx, 'git flow…')]
  if (flow.cli === 'none') return [mark, barText(ctx, 'git flow is not installed:', 'warning'), barText(ctx, FLOW_INSTALL)]
  if (flow.cli === 'other') return [mark, barText(ctx, 'Git Flow actions need git-flow-next:', 'warning'), barText(ctx, FLOW_INSTALL)]
  const config = flow.config
  // Not set up: one button sets it up with the standard names (`git flow init -d`).
  if (!config) {
    const init = 'Start git flow'
    return [
      mark,
      {
        node: confirmButton($, ctx, 'flow-init', 'flow-init', init, () => runFlow($, [{ args: ['flow', 'init', '-d'] }], 'Git flow started: main, develop ✓', 'Starting git flow…')),
        width: view.confirm === 'flow-init' ? `Confirm: ${init}?`.length : init.length,
      },
      barText(ctx, FLOW_DEFAULTS),
    ]
  }
  const starts = config.types.map((t): BarItem => {
    const label = `${icons[t.kind]} ${t.kind}`
    return {
      node: (
        <Button key={`flow-start-${t.kind}`} plain onPress={() => setFlow($, f => ({ ...f, ...FLOW_CLOSED, starting: f.starting === t.kind ? null : t.kind }))}>
          <Text color={view.flow.starting === t.kind ? 'success' : undefined}>{label}</Text>
        </Button>
      ),
      width: label.length,
    }
  })
  const actions = flowMenuFor(graph.branch, config).flatMap((i): BarItem[] => {
    if (!i.flow) return []
    const update = typeOf(config, i.flow.topic.kind)?.strategy === 'rebase' ? 'rebase' : 'merge'
    const label = { 'flow-finish': 'finish', 'flow-update': update, 'flow-publish': 'publish' }[i.id] ?? i.label
    const isArmed = view.confirm === flowArmKey(i.flow)
    return [{ node: renderFlowItem($, ctx, i.id, label, i.flow), width: isArmed ? `Confirm: ${label}?`.length : label.length }]
  })
  const separator: BarItem = { node: <Text dimColor>│</Text>, width: 1, isSeparator: true }
  return [mark, ...starts, ...(actions.length ? [separator, ...actions] : [])]
}

const BAR_GAP = 2

// The git flow footer: a rule, the bar (on as many rows as the width needs; a separator
// that would open or close a row is left out), then the forms of an action in progress.
function renderFlow($: EngineInterface, ctx: Ctx) {
  const { Box } = ctx.els
  const items = flowBar($, ctx)
  const bar = wrapRows(items.map(i => i.width), ctx.cols, BAR_GAP)
    .map(row => row.map(i => items[i]).filter((item, at, all) => item && !(item.isSeparator && (at === 0 || at === all.length - 1))))
    .map(row => line(ctx, row.map(item => item?.node), BAR_GAP))
  const rows = [rule(ctx), ...bar, ...flowFormRows($, ctx)]
  return { node: <Box flexDirection="column">{rows}</Box>, height: rows.length }
}

async function renderPane($: EngineInterface, els: Ctx['els'], surface: string, isDocked: boolean, cols: number, scroll: { offset: number; bodyRows: number }) {
  const { Box, Text, Button } = els
  const [cache, view, detail, isRound, hasNerd, flow] = await Promise.all([
    readCache($),
    read($, viewState),
    read($, detailState),
    read($, roundState),
    read($, nerdState),
    read($, flowState),
  ])
  const { graph, indexOf } = cache
  if (graph.status === 'no-repo') return <Text dimColor>Not a git repository.</Text>
  if (graph.status === 'error') return <Text color="error">Could not read git: {graph.error ?? ''}</Text>

  const graphMax = Math.max(6, Math.min(40, Math.floor(cols / 3)))
  const ctx: Ctx = {
    els,
    graph,
    view,
    detail,
    flow,
    cols,
    graphMax,
    graphWidth: Math.min(graphMax, cache.maxCells),
    now: Math.floor(Date.now() / 1000),
    isRound,
    icons: hasNerd ? ICONS.nerd : ICONS.plain,
    Input: 'Input' in els ? (els.Input as Elements['terminal']['Input']) : undefined,
    Client: (surface === 'terminal' || surface === 'desktop') && 'Client' in els ? (els.Client as Elements['terminal']['Client']) : undefined,
  }
  if (view.isSettings) return renderSettings($, ctx, await read($, settingsState))
  const header = renderHeader($, ctx)

  // Only the rows in the window are drawn; spacers of the same height stand for the rest,
  // so a scroll step costs a window of rows, not the whole graph.
  const rowOf = (hash: string | null | undefined) => (hash ? graph.rows[indexOf.get(hash) ?? -1] : undefined)
  const menuRow = rowOf(view.menu?.hash)
  const menuBox = menuRow && view.menu ? renderMenu($, ctx, menuRow, view.menu.badge) : undefined
  const selectedRow = rowOf(view.selected)
  const detailBox = selectedRow ? renderDetail($, ctx, selectedRow) : undefined
  const heights = graph.rows.map(r => 1 + (r === menuRow ? (menuBox?.height ?? 0) : 0) + (r === selectedRow ? (detailBox?.height ?? 0) : 0))
  const pinned = view.scrollTo ? (indexOf.get(view.scrollTo) ?? -1) : -1
  const offset = pinned >= 0 ? header.height + topOf(heights, pinned) - Math.floor(scroll.bodyRows / 2) : scroll.offset
  const { from, to, before, after } = visibleRange(heights, header.height, offset, scroll.bodyRows, OVERSCAN)
  // A docked terminal pane re-renders on every scroll step, so the footer can be pinned
  // to the window's bottom: over a blank layer, so the rows beneath do not show through.
  // Elsewhere (inline it would stretch the pane to its whole room) it closes the list.
  const footer = renderFlow($, ctx)
  const isPinned = surface === 'terminal' && isDocked

  return (
    <Box flexDirection="column" minHeight={isPinned ? scroll.bodyRows : undefined}>
      {header.node}
      {graph.rows.length === 0 && <Text dimColor>{graph.status === 'ready' ? 'No commits yet.' : 'Loading…'}</Text>}
      {before > 0 && <Box key="space-before" height={before} flexShrink={0} />}
      {graph.rows.slice(from, to).map(row => (
        <Box key={`row:${row.commit.hash}`} flexDirection="column" flexShrink={0}>
          {renderRow($, ctx, row)}
          {row === menuRow && menuBox?.node}
          {row === selectedRow && detailBox?.node}
        </Box>
      ))}
      {after > 0 && <Box key="space-after" height={after} flexShrink={0} />}
      {graph.hasMore && (
        <Button key="more" plain dimColor onPress={async () => {
          await update($, viewState, v => ({ ...v, limit: v.limit + PAGE }))
          await load($)
        }}>
          Load {PAGE} more commits
        </Button>
      )}
      {isPinned ? <Box key="flow-space" height={footer.height} flexShrink={0} /> : footer.node}
      {isPinned && (
        <Box key="flow-footer" position="absolute" top={Math.max(0, offset) + scroll.bodyRows - footer.height} left={0} width={cols} height={footer.height} flexDirection="column">
          <Box position="absolute" top={0} left={0} flexDirection="column">
            {Array.from({ length: footer.height }, () => (
              <Text>{' '.repeat(cols)}</Text>
            ))}
          </Box>
          {footer.node}
        </Box>
      )}
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

export const register: Register = (on, options) => {
  const style: BadgeStyle = options.badges === 'round' || options.badges === 'square' ? options.badges : 'auto'

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'gitgraph', description: 'Open Git Graph: the commit graph of this repository' })
    $.clock.every(POLL_MS, () => void poll($))
    const hasNerd = await hasNerdFont($)
    await update($, nerdState, () => hasNerd)
    await update($, roundState, () => (style === 'auto' ? hasNerd : style === 'round'))
    return next(e)
  })

  on('command.run', { command: 'gitgraph' }, async $ => {
    await update($, viewState, v => ({ ...v, isOpen: true }))
    await $.ui.open({ id: PANE, title: TITLE })
    await Promise.all([load($), loadFlow($)])
    const graph = await readGraph($)
    return { text: graph.status === 'no-repo' ? 'Git Graph: not a git repository.' : 'Git Graph opened.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, viewState, v => ({ ...v, isOpen: false }))
    return next(e)
  }).catch(($, e, next) => next(e))

  // A pill posts `{ button }`: right opens its ref's menu, left selects the commit,
  // and a second left click on the same pill within DOUBLE_CLICK_MS checks the ref out.
  on('ui.message', { requestId: PANE }, async ($, e, next) => {
    const [kind, hash = '', index = ''] = e.element.split(':')
    const button = (e.data as { button?: string } | null)?.button
    if (kind !== 'pill') return next(e)
    const row = (await readGraph($)).rows.find(r => r.commit.hash === hash)
    const badge = row && badgesOf(row.commit.refs)[Number(index)]
    const now = Date.now()
    const isDouble = button === 'left' && lastPillClick.key === e.element && now - lastPillClick.at <= DOUBLE_CLICK_MS
    lastPillClick = button === 'left' && !isDouble ? { key: e.element, at: now } : { key: '', at: 0 }
    if (badge && button === 'right') await openMenu($, hash, badge)
    else if (badge && isDouble) await checkoutRef($, badge)
    else if (button === 'left') await select($, hash)
    return next(e)
  }).catch(($, e, next) => next(e))

  // Any Bash call may have committed, switched or edited: the signature check decides.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    await poll($)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => renderPane($, $.ui.resolve(e), e.surface, e.props.placement === 'dock', e.props.bodyColumns, e.props.scroll))
}
