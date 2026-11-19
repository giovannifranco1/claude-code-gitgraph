import { atom, read, update } from 'claude-code'
import type { ClientElements, Elements, EngineInterface, ProcessRunResult, Register, RenderChildren, RenderSurface } from 'claude-code'

import type { Badge, BadgeKind, BadgeStyle, Cell, Change, Changelog, Columns, CommitDetail, ConfigScope, FileStat, FlowConfig, FlowConflict, FlowInfo, FlowInitForm, FlowKind, FlowOptions, FlowTopic, FlowView, Graph, GraphRow, Ref, RepoSettings, Repos, Screen, View } from '../types'
import { parseChangelog, versionOf } from './changelog'
import { CLOSED, dismissModal, FLOW_CLOSED, hasModal } from './dismiss'
import { badgeParts, badgesOf, branchOf, diffBar, fitBadges, syncText, withSync } from './badges'
import { isBranchNameCandidate } from './detect'
import { absTime, fitGraph, HASH_W, relTime, short, truncate, truncateMiddle } from './format'
import { layout } from './lanes'
import { clampTop, findCommit, isHashQuery, topOf, visibleRange, widestIn, windowAt, wrapRows } from './virtual'
import { DETAIL_FORMAT, localsOf, LOG_FORMAT, mergedArgs, parseChanges, parseMerged, parseTracks, REFS_ARGS, TRACK_ARGS, parseDetail, parseLog, parseStatus, parseSync, remotesOf, UNCOMMITTED, withUncommitted } from './log'
import { basesOf, defaultTagMessage, finishArgs, mainOf, finishPushArgs, flowArgs, flowCliOf, nextVersion, parseFlowConfig, resumeArgs, topicFor, topicOf, typeOf } from './flow'
import { BRANCH_REFS_ARGS, branchNamesOf, DEFAULT_FORM, initArgs, initFormError, initFormFor, staleBaseArgs, trimForm } from './flowinit'
import { cleanMessage, COMMIT_SYSTEM, commitPrompt, commitRuns, contextArgs, newFiles } from './commit'
import { checkoutArgs, defaultPushRemotes, deleteBranchArgs, type MenuItem, menuFor, menuGroups, pushRuns, renameArgs, stashArgs } from './menu'
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
// Secondary text (author, hash, hints, a merge commit's text): a set gray, not `dimColor`, the
// terminal's faint, which many themes barely draw.
const MUTED = '#808080'
const BADGE_BG: Partial<Record<BadgeKind, string>> = { tag: '#e2c08d', detached: '#f48771' }
// A gone branch's pill, the `+N` pill and a remote's name in settings.
const GRAY_BG = '#9d9d9d'
const SELECTED_BG = '#264f78'
const ADD_COLOR = '#89d185'
const DEL_COLOR = '#f48771'
const AUTHOR_W = 12
// The subject's columns the pills after the first leave it (the first may take them all).
const MIN_SUBJECT = 10
const BODY_LINES = 8
const OVERSCAN = 15
const BAR_W = 8
// A pill's caps (or padding) and its gap, around its name.
const PILL_PAD = 3
const EDGE_SAFETY = 1
const STATUS_ARGS = ['status', '--porcelain=v2', '--branch']
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
const EMPTY_GRAPH: Graph = { status: 'idle', rows: [], head: '', branch: '', conflicts: 0, remotes: [], hasMore: false }
const DEFAULT_VIEW: View = { scope: 'all', limit: PAGE, selected: null, confirm: null, menu: null, isRenaming: false, isDeleting: false, isForce: false, push: null, running: null, screen: 'graph', configScope: 'local', editingRemote: null, isAddingRemote: false, remoteDraft: '', scrollTo: null, isSearching: false, search: '', commitDraft: '', isSuggesting: false, uncommittedForm: null, commitStep: 'files', commitFiles: [], refresh: 'idle', isOpen: false, flow: DEFAULT_FLOW, isActionsOpen: false, notice: null }

const graphState = atom({ plugin: 'gitgraph', key: 'graph' } as const, EMPTY_GRAPH)
// Bumped with every graph write: renders read this small number and keep the graph
// itself in `graphCache`, so a scroll step does not carry the whole graph across.
const versionState = atom({ plugin: 'gitgraph', key: 'graphVersion' } as const, 0)
// Tagged with the shape of View: a view an older version kept (without fields added
// since) reads as absent after an update, instead of breaking the render.
const viewState = atom({ plugin: 'gitgraph', key: 'view' } as const, DEFAULT_VIEW, { shape: 'view-16' })
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

let generation = 0
// What a render derives from the graph, worked out once per graph version.
// `branchColors`: each local branch's pill color (its tip's lane), which its remotes take too.
type GraphCache = { version: number; graph: Graph; maxCells: number; indexOf: Map<string, number>; branchColors: Map<string, string>; dead: Set<string> }
let graphCache: GraphCache | null = null
let signature = ''
let busy = false
// Set synchronously when an action starts, so a second press before the redraw is ignored.
let isRunning = false
// The last left click on a pill, to tell a double click.
let lastPillClick = { key: '', at: 0 }
// The window a docked terminal pane last drew (null elsewhere): where the `ui.scroll` hook
// moves it from, and whether a search centers its commit itself. Written by the render
// (only it knows the rows' geometry), read by that hook and by the search.
let ownScroll: { top: number; maxTop: number } | null = null

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
    setView($, (v): View => ({ ...v, ...CLOSED, flow: { ...v.flow, ...FLOW_CLOSED, conflict: null }, selected: null, limit: PAGE, scrollTo: null })),
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
    branchColors: new Map(graph.rows.flatMap(r => r.commit.refs.flatMap(ref => (ref.kind === 'head' || ref.kind === 'branch' ? [[ref.name, laneColor(r.cells)] as const] : [])))),
    dead: new Set(graph.merged ?? []),
  }
}

// Every write of the view: while a modal is open the pane is opened again with
// `closeOnEscape`, so Escape (on the pane, or at the empty prompt it hands the keys back to)
// raises the person's `ui.close`, which closes the modal instead (see that hook).
async function setView($: EngineInterface, change: (v: View) => View): Promise<View> {
  // `update` may run `change` again on a miss: the last run's `v` is the value written over.
  let before!: View
  const view = await update($, viewState, v => ((before = v), change(v)))
  if (view.isOpen && hasModal(view) !== hasModal(before)) await openPane($, view)
  return view
}

// Opens the pane (or sets its manners again): Escape is its close while a modal is open.
// With a modal it asks for the keyboard too (taken only over an idle, empty prompt): Escape
// reaches it as the pane's close only while the pane holds the keys, and Enter its main button.
const openPane = ($: EngineInterface, view: View) => $.ui.open({ id: PANE, title: TITLE, ...(hasModal(view) && { closeOnEscape: true, focus: true }) })

async function setGraph($: EngineInterface, change: (g: Graph) => Graph): Promise<void> {
  const graph = await update($, graphState, change)
  graphCache = cacheOf(await update($, versionState, n => n + 1), graph)
}

// A commit's badges as the pane draws them: remotes alone only with all branches on, merged ones
// gone, a local branch with how far it is from its upstream.
const rowBadges = (refs: Ref[], graph: Graph, view: View, dead: Set<string>) => withSync(badgesOf(refs, graph.locals, view.scope === 'all', dead), graph.tracks ?? {})

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
    const [log, status, refs, track] = await Promise.all([
      git($, ['log', ...(view.scope === 'all' ? ['--all'] : ['--branches', 'HEAD']), '--date-order', `-n${view.limit + 1}`, LOG_FORMAT]),
      known?.status ?? git($, STATUS_ARGS),
      known?.refs ?? git($, REFS_ARGS),
      git($, TRACK_ARGS),
    ])
    if (!isCurrent()) return
    if (status.exitCode !== 0) {
      await setGraph($, (): Graph => ({ ...EMPTY_GRAPH, status: 'no-repo' }))
      return
    }
    const { head, branch, dirty, staged, conflicts } = parseStatus(status.stdout)
    const remotes = remotesOf(refs.stdout)
    const locals = localsOf(refs.stdout)
    // The remotes merged into a base: needs the branches the refs name, so it runs after them,
    // and only when the refs or the bases changed (a scope toggle or load more keeps them).
    const bases = basesOf((await read($, flowState))?.config)
    const mergedKey = `${bases.join()}\0${refs.stdout}`
    const before = await read($, graphState)
    let merged = before.mergedKey === mergedKey ? (before.merged ?? []) : null
    if (merged === null) {
      const query = mergedArgs(bases, locals)
      const out = query ? await git($, query) : null
      if (!isCurrent()) return
      merged = out?.exitCode === 0 ? parseMerged(out.stdout, refs.stdout, bases) : []
    }
    const commits = parseLog(log.exitCode === 0 ? log.stdout : '', remotes)
    const shown = withUncommitted(commits.slice(0, view.limit), head, dirty)
    const cells = layout(shown, PALETTE.length)
    signature = signatureOf(status.stdout, refs.stdout)
    await setGraph($, (): Graph => ({
      status: 'ready',
      rows: shown.map((commit, i) => ({ commit, cells: cells[i] ?? [] })),
      head,
      branch,
      conflicts,
      remotes,
      locals,
      merged,
      mergedKey,
      tracks: track.exitCode === 0 ? parseTracks(track.stdout) : {},
      changes: parseChanges(status.stdout),
      staged,
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
  await setView($, v => ({ ...v, ...CLOSED, selected }))
  await update($, detailState, () => null)
  // The uncommitted changes are no commit to show: their panel is the stash.
  if (selected && selected !== UNCOMMITTED) await loadDetail($, selected)
}

async function stashChanges($: EngineInterface, message: string): Promise<void> {
  await setView($, v => ({ ...v, selected: null }))
  await runAction($, stashArgs(message), 'Stashed the changes')
}

// Commits every uncommitted change with the message as reviewed; an empty one commits nothing.
// The uncommitted changes picked for the commit, as the graph last read them.
async function pickedChanges($: EngineInterface): Promise<Change[]> {
  const [graph, view] = await Promise.all([readGraph($), read($, viewState)])
  return (graph.changes ?? []).filter(c => view.commitFiles.includes(c.path))
}

// Commits the picked files alone with the message shown; none, or no message, commits nothing.
async function commitChanges($: EngineInterface, message: string): Promise<void> {
  const text = message.trim()
  const files = await pickedChanges($)
  if (!text || !files.length) {
    $.ui.toast(files.length ? 'No message to commit yet: ✨ suggest again' : 'Pick a file to commit')
    return
  }
  await setView($, v => ({ ...v, selected: null, commitDraft: '' }))
  await runActions($, commitRuns(text, files), `Committed: ${text}`, 'Committing…')
}

// The files step's Next: on to the message, which Claude writes at once.
async function commitNext($: EngineInterface): Promise<void> {
  if (!(await pickedChanges($)).length) {
    $.ui.toast('Pick a file to commit')
    return
  }
  await setView($, v => ({ ...v, commitStep: 'message', commitDraft: '' }))
  await suggestCommit($)
}

// Picks a file, or (none given) every file or none: all of them on unless they all are.
async function pickFile($: EngineInterface, path?: string): Promise<void> {
  const all = ((await readGraph($)).changes ?? []).map(c => c.path)
  await setView($, v => {
    if (path === undefined) return { ...v, commitFiles: v.commitFiles.length === all.length ? [] : all }
    const files = v.commitFiles.includes(path) ? v.commitFiles.filter(p => p !== path) : [...v.commitFiles, path]
    return { ...v, commitFiles: all.filter(p => files.includes(p)) }
  })
}

// Claude reads the changes and the recent subjects and writes a message into the field, to be
// reviewed there: a suggestion commits nothing.
async function suggestCommit($: EngineInterface): Promise<void> {
  if ((await read($, viewState)).isSuggesting) return
  await setView($, v => ({ ...v, isSuggesting: true }))
  try {
    const files = await pickedChanges($)
    const args = contextArgs(files)
    const [stat, diff, log] = await Promise.all([args.stat, args.diff, args.log].map(a => git($, a)))
    const reply = await $.model.complete({
      model: 'haiku',
      system: COMMIT_SYSTEM,
      prompt: commitPrompt({ stat: stat?.stdout ?? '', diff: diff?.stdout ?? '', untracked: newFiles(files), log: log?.stdout ?? '' }),
      maxTokens: 200,
    })
    const message = reply.isAnswered ? cleanMessage(reply.text) : ''
    if (!message) $.ui.toast('Claude could not suggest a message')
    await setView($, v => ({ ...v, isSuggesting: false, commitDraft: message || v.commitDraft }))
  } catch (err) {
    $.ui.toast(`Claude could not suggest a message: ${firstLine(String(err))}`)
    await setView($, v => ({ ...v, isSuggesting: false }))
  }
}

async function loadDetail($: EngineInterface, hash: string): Promise<void> {
  const out = await git($, ['show', '--numstat', '--diff-merges=first-parent', DETAIL_FORMAT, hash])
  if ((await read($, viewState)).selected !== hash) return
  await update($, detailState, () => (out.exitCode === 0 ? parseDetail(out.stdout) : null))
}

// Reloads everything on screen; the button shows it running, then `✓ updated` for a moment.
async function refreshAll($: EngineInterface): Promise<void> {
  if ((await read($, viewState)).refresh === 'running') return
  await setView($, (v): View => ({ ...v, refresh: 'running' }))
  try {
    if (await findRepos($)) return await showRepo($)
    const view = await read($, viewState)
    await Promise.all([load($), view.selected ? loadDetail($, view.selected) : undefined, view.screen === 'settings' ? loadSettings($) : undefined, (await read($, flowState)) ? loadFlow($) : undefined])
  } finally {
    await setView($, (v): View => ({ ...v, refresh: 'done' }))
    $.clock.after(REFRESHED_MS, () => void setView($, (v): View => (v.refresh === 'done' ? { ...v, refresh: 'idle' } : v)))
  }
}

async function checkoutRef($: EngineInterface, badge: Badge): Promise<void> {
  const args = checkoutArgs(badge)
  if (args) await runAction($, args, `Checked out ${badge.label}`)
  else $.ui.toast(badge.kind === 'head' ? `Already on ${badge.label}` : `Nothing to check out for ${badge.label}`)
}

// A search by hash, message or author over the loaded commits: the next match after the selected
// one, selected and scrolled to (the render draws the window around `scrollTo`). With several the
// field stays, holding the term, so finding again goes on to the next.
async function searchCommit($: EngineInterface, value: string): Promise<void> {
  const query = value.trim()
  if (!query) return
  const [graph, view] = await Promise.all([readGraph($), read($, viewState)])
  const found = findCommit(graph.rows.map(r => r.commit).filter(c => c.hash !== UNCOMMITTED), query, view.selected ?? undefined)
  if (!found) {
    // A hash past the loaded commits: say so, rather than that there is none.
    const exists = isHashQuery(query) && (await git($, ['rev-parse', '--verify', '--quiet', `${query}^{commit}`])).exitCode === 0
    $.ui.toast(exists ? `Commit ${query} is not among the ${graph.rows.length} loaded: use "Load more"` : `No commit matches "${query}" among the ${graph.rows.length} loaded: use "Load more"`)
    return
  }
  const { hash, index, count } = found
  if (count > 1) $.ui.toast(`Match ${index}/${count}`)
  await setView($, v => ({ ...v, scrollTo: hash, menu: null, isSearching: count > 1, search: count > 1 ? query : '' }))
  if ((await read($, viewState)).selected !== hash) await select($, hash)
  // A pane scrolling its own rows draws the commit centered until the next scroll.
  if (ownScroll) return
  // Scrolling is a convenience: where a surface cannot, the commit is still selected.
  try {
    await $.ui.scroll({ to: { key: hash }, in: PANE, block: 'center' })
  } catch {
    // no surface to scroll
  }
  await setView($, v => ({ ...v, scrollTo: null }))
}

// Whether the open menu is this ref's, on this commit.
const isMenuOpen = (menu: View['menu'], hash: string, badge: Badge) => menu?.hash === hash && menu.badge.label === badge.label && menu.badge.kind === badge.kind

async function openMenu($: EngineInterface, hash: string, badge: Badge): Promise<void> {
  if ((await read($, flowState)) === null) await loadFlow($)
  await setView($, (v): View => ({ ...v, ...CLOSED, menu: isMenuOpen(v.menu, hash, badge) ? null : { hash, badge } }))
}

async function runAction($: EngineInterface, args: string[], done: string, isNetwork = false): Promise<void> {
  await runActions($, [args], done, `Running git ${args[0]}…`, isNetwork)
}

// Holds the one-action-at-a-time lock while `work` runs: `running` replaces the action
// buttons with a spinner and the label. `work` returns the failures to report; the
// result is null when another action held the lock.
// With `asNotice` on a docked terminal pane, the action shows in a dialog while it runs: done,
// the dialog goes; failed, it stays with the error. The outcome is a toast either way.
async function withRunning($: EngineInterface, label: string, done: string, work: () => Promise<string[]>, asNotice = false): Promise<string[] | null> {
  if (isRunning) return null
  isRunning = true
  const hasNotice = asNotice && ownScroll !== null
  let failures: string[] = []
  try {
    await setView($, v => ({ ...v, running: label, confirm: null, notice: hasNotice ? { label, error: null } : v.notice }))
    failures = await work()
  } finally {
    isRunning = false
    await setView($, v => ({ ...v, ...CLOSED, running: null }))
  }
  const outcome = failures.length === 0 ? done : failures.join(' · ')
  if (hasNotice) await setView($, v => ({ ...v, notice: failures.length && v.notice ? { ...v.notice, error: outcome } : null }))
  $.ui.toast(outcome)
  await Promise.all([load($), (await read($, viewState)).screen === 'settings' ? loadSettings($) : undefined])
  return failures
}

// Runs each git command in turn, all of them even when one fails (a push to every
// remote), and names each failure by its command and target: `git push github: …`.
async function runActions($: EngineInterface, runs: string[][], done: string, label: string, isNetwork = false, asNotice = false): Promise<void> {
  const work = async () => {
    const failures: string[] = []
    for (const args of runs) {
      const out = await git($, args, isNetwork)
      const target = args.filter(a => !a.startsWith('-')).slice(0, isNetwork ? 2 : 1).join(' ')
      if (out.exitCode !== 0) failures.push(`git ${target} failed: ${firstLine(out.stderr || out.stdout)}`)
    }
    return failures
  }
  await withRunning($, label, done, work, asNotice)
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

const setFlow = ($: EngineInterface, fn: (f: FlowView) => FlowView) => setView($, (v): View => ({ ...v, flow: fn(v.flow) }))

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

// Opens the dialog asking for an update; again on the same one, closes it.
async function toggleConfirm($: EngineInterface, action: 'update', topic: FlowTopic): Promise<void> {
  await setView($, (v): View => {
    const isOpen = v.flow.confirming?.action === action && v.flow.confirming.topic.branch === topic.branch
    return { ...v, ...CLOSED, flow: { ...v.flow, ...FLOW_CLOSED, confirming: isOpen ? null : { action, topic } } }
  })
}

// Opens the finish dialog; again on the same branch, closes it.
async function toggleFinish($: EngineInterface, topic: FlowTopic): Promise<void> {
  await setView($, (v): View => ({
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
  await setView($, (v): View => ({ ...v, ...CLOSED, flow: { ...v.flow, ...FLOW_CLOSED, init: form } }))
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
  await Promise.all([setView($, (v): View => ({ ...v, ...CLOSED, screen: 'changelog' })), isFirst && update($, changelogState, () => null)])
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
  branchColors: Map<string, string>
  dead: Set<string>
  // The main branch's pill color, which tags take; absent while it is not loaded.
  mainColor: string | undefined
}

// The dark shade of a pill's color: its remotes' segment (light text) and its icon.
const SHADE = 0.45
const LIGHT_FG = '#f0f0f0'
// A ref's pill: a branch `[name][remotes]`, the checked-out one with a check before its
// name (two spaces after it: a Nerd Font icon is drawn two cells wide); a tag `[icon][version]`
// and a branch only on a remote (merged, deleted here) `[ghost][name]`, the name on the dark
// shade of the pill color. Icons are in that dark shade.
// A badge's color: a gone one (merged, or deleted here) gray; a remote branch the dark shade of
// its local branch's color (its own lane's while that one is not loaded), as a local pill's
// remote segment is; a tag the main branch's (its own while main is not loaded); a detached
// HEAD its own; a branch its lane's.
function pillBg({ branchColors, mainColor }: Ctx, badge: Badge, lane: string): string {
  if (badge.isGone) return GRAY_BG
  if (badge.kind === 'remote') return shade(branchColors.get(branchOf(badge.label)) ?? lane, SHADE)
  if (badge.kind === 'tag' && mainColor) return mainColor
  return BADGE_BG[badge.kind] ?? lane
}

// A ref's pill. A tag, or a gone branch alone, is its icon on the color, then the name on its
// dark shade; any other is its name on the color, then its remotes on the dark shade, the
// checked-out branch (and a gone one with its remote: the ghost there) with an icon first.
function pillProps(ctx: Ctx, badge: Badge, lane: string): PillProps {
  const { isRound, icons } = ctx
  const { name, remotes } = badgeParts(badge)
  const bg = pillBg(ctx, badge, lane)
  const dark = shade(bg, SHADE)
  const isBold = badge.kind === 'head' || badge.kind === 'detached'
  const icon = badge.kind === 'head' ? icons.head : badge.kind === 'tag' ? icons.tag : badge.isGone ? icons.ghost : ''
  const isPinned = badge.kind === 'head' || (badge.isGone === true && remotes !== '')
  const fg = badge.kind === 'remote' && !badge.isGone ? LIGHT_FG : BADGE_FG
  const segments: PillSegment[] =
    icon && !isPinned
      ? [
          { text: '', bg, fg: BADGE_FG, icon: { text: icon, fg: dark } },
          { text: name, bg: dark, fg: LIGHT_FG },
        ]
      : [
          isPinned ? { text: `  ${name}`, bg, fg, isBold, icon: { text: icon, fg: dark } } : { text: name, bg, fg, isBold },
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
function line({ els: { Box } }: Ctx, children: RenderChildren, gap = 0, justify?: 'space-between' | 'center', key?: string) {
  return (
    <Box key={key} height={1} overflow="hidden" flexDirection="row" gap={gap} justifyContent={justify}>
      {children}
    </Box>
  )
}

const rule = (ctx: Ctx, width = ctx.cols, key?: string) => line(ctx, <ctx.els.Text color={MUTED}>{'─'.repeat(Math.max(0, width))}</ctx.els.Text>, 0, undefined, key)

const localBranch = (refs: Ref[]) => refs.find(r => (r.kind === 'head' && r.name !== 'HEAD') || r.kind === 'branch')?.name
const isCheckedOut = (refs: Ref[]) => refs.some(r => r.kind === 'head' && r.name !== 'HEAD')

const headName = (graph: Graph) => graph.branch || (graph.head ? short(graph.head) : '—')

// An on/off switch: the icon in green when on, the label dimmed when off.
function switchButton(ctx: Ctx, key: string, label: string, isOn: boolean, onPress: () => Promise<unknown>) {
  const { els: { Button, Text }, icons } = ctx
  // A Nerd Font icon is drawn two cells wide over the space after it: two spaces keep one.
  return (
    <Button key={key} plain onPress={onPress}>
      <Text color={isOn ? 'success' : MUTED}>
        {isOn ? icons.on : icons.off}
      </Text>
      <Text color={isOn ? undefined : MUTED}>{' '.repeat(iconCells(ctx))}{label}</Text>
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
  const head = headName(graph)
  const headColor = headRow ? laneColor(headRow.cells) : (PALETTE[0] ?? '#4fc1ff')
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
          {/* The checked-out branch as its badge in the graph (a detached HEAD: its short hash). */}
          {renderPill(ctx, graph.branch ? pillProps(ctx, { kind: 'head', label: head, remotes: [] }, headColor) : plainPill(ctx, head, headColor, true))}
        </Text>
      </Box>
      <Box flexDirection="row" gap={2} flexShrink={0}>
        {switchButton(ctx, 'scope', 'all branches', isAll, async () => {
          await setView($, (v): View => ({ ...v, ...CLOSED, scope: v.scope === 'all' ? 'head' : 'all', limit: PAGE, selected: null }))
          await load($)
        })}
        <Box flexDirection="row">
          {Input && (
            <Button key="search-toggle" plain dimColor={!view.isSearching} onPress={() => setView($, v => ({ ...v, isSearching: !v.isSearching }))}>
              {iconLabel(ctx, icons.search)}
            </Button>
          )}
          <Button key="settings" plain dimColor onPress={async () => {
            await setView($, (v): View => ({ ...v, ...CLOSED, screen: 'settings', selected: null }))
            await loadSettings($)
          }}>
            {iconLabel(ctx, icons.settings)}
          </Button>
          <Button key="changelog" plain dimColor onPress={() => openChangelog($)}>
            {iconLabel(ctx, icons.changelog)}
          </Button>
          <Button key="fetch" plain dimColor onPress={() => runActions($, [['fetch', '--all']], 'Fetched remote(s) ✓', 'Fetching remote(s)…', true, true)}>
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
            <Text color={MUTED}>{branchColumn(label, repos.branches[path], cols)}</Text>
          </Button>,
        ),
      )
    }
  if (Input && view.isSearching)
    lines.push(
      line(
        ctx,
        <Input key="search" label={`${icons.search} `} value={view.search} placeholder="find by hash, message or author" submitLabel="find" autoFocus onSubmit={value => searchCommit($, value)} />,
      ),
    )
  // As wide as a row (EDGE_SAFETY too), `Author` and `Commit` over the rows' meta; over
  // a graph narrower than its name, `Graph` keeps a space after it.
  const meta = metaOf(ctx, 'Author', 'Commit')
  const graphHead = 'Graph'.padEnd(Math.max(graphWidth + 1, 'Graph '.length))
  if (cols >= 70)
    lines.push(
      line(ctx, <Text color={MUTED}>{`${graphHead}${'Description'.padEnd(Math.max(0, cols - EDGE_SAFETY - graphHead.length - meta.length))}${meta}`}</Text>),
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
  // The uncommitted changes: pressed, they open their stash under the row.
  if (commit.hash === UNCOMMITTED)
    return line(ctx, [
      <Text>
        {graphText}
        {pad}
      </Text>,
      <Button key="uncommitted" plain onPress={() => select($, UNCOMMITTED)}>
        <Text italic color="warning">
          {commit.subject}
        </Text>
      </Button>,
      // How many of them are staged, beside it in red.
      ...(ctx.graph.staged ? [<Text color="error">{`Staged (${ctx.graph.staged})`}</Text>] : []),
    ], 2)
  const lane = laneColor(cells)
  const meta = metaOf(ctx, commit.author, commit.hash)
  // The first pill may fill the Description column; the others get what is left once the
  // subject keeps its minimum, the rest as `+N`.
  const fixed = graphWidth + 1 + meta.length + EDGE_SAFETY
  const { shown, hidden, width } = fitBadges(rowBadges(commit.refs, ctx.graph, ctx.view, ctx.dead), Math.max(0, cols - fixed - MIN_SUBJECT), Math.max(0, cols - fixed))
  const more = hidden > 0 ? `+${hidden}` : ''
  const room = Math.max(0, cols - fixed - width)
  const isSelected = view.selected === commit.hash
  // A merge commit's text is gray: the Button dim too, in case a surface draws its children in its style.
  const mergeColor = commit.parents.length > 1 ? MUTED : undefined
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
          {renderPill(ctx, plainPill(ctx, more, GRAY_BG))}
        </Box>
      )}
      <Button key={commit.hash} plain dimColor={mergeColor ? true : undefined} onPress={() => select($, commit.hash)}>
        <Text backgroundColor={isSelected ? SELECTED_BG : undefined} weight={isSelected ? 'bold' : undefined} color={mergeColor}>
          {truncate(commit.subject, room).padEnd(room)}
        </Text>
        <Text color={MUTED}>
          {meta}
        </Text>
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
    onPress: () => (isArmed ? run() : setView($, v => ({ ...v, confirm: armKey }))),
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

// The push's remotes to tick, and its run and cancel.
function pushParts($: EngineInterface, ctx: Ctx, badge: Badge, item: MenuItem): { remotes: RenderChildren; actions: RenderChildren } {
  const { els: { Text, Button }, graph, view } = ctx
  const chosen = graph.remotes.filter(r => view.push?.includes(r))
  const isAll = chosen.length === graph.remotes.length
  const setPush = (fn: (sel: string[]) => string[]) => setView($, v => ({ ...v, push: fn(v.push ?? []) }))
  return {
    remotes: line(
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
    actions: line(
      ctx,
      [
        chosen.length ? (
          <Button key="push-run" variant="primary" autoFocus onPress={() =>
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
          <Text color={MUTED}>Select at least one remote</Text>
        ),
        <Button key="push-cancel" plain dimColor onPress={() => setView($, v => ({ ...v, push: null }))}>
          cancel
        </Button>,
      ],
      2,
    ),
  }
}

// The push chooser under its menu item (off a docked terminal pane).
function renderPushChooser($: EngineInterface, ctx: Ctx, badge: Badge, item: MenuItem) {
  const { remotes, actions } = pushParts($, ctx, badge, item)
  return [line(ctx, <ctx.els.Text color={MUTED}>Push {badge.label} to:</ctx.els.Text>), remotes, actions]
}


// A git flow item, the same in a branch's menu and in the footer: finish opens its form
// (whose Finish runs it); update opens a dialog asking for it.
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
        await setView($, v => ({ ...v, menu: null }))
      },
    }
  if (item.pushArgs)
    return {
      label: item.label,
      isActive: view.push !== null,
      onPress: () => setView($, v => ({ ...v, push: v.push ? null : defaultPushRemotes(badge, graph.remotes), isRenaming: false, isDeleting: false, confirm: null })),
    }
  if (item.deleteBranch !== undefined)
    return {
      label: item.label,
      isActive: view.isDeleting,
      onPress: () => setView($, v => ({ ...v, isDeleting: !v.isDeleting, isForce: false, isRenaming: false, push: null, confirm: null })),
    }
  if (item.isRename)
    return {
      label: item.label,
      isActive: view.isRenaming,
      onPress: () => setView($, v => ({ ...v, isRenaming: !v.isRenaming, isDeleting: false, push: null, confirm: null })),
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

// Rows `<prefix>-row-<id>` of entries in groups, a blank row `<prefix>-gap-<n>` between groups.
function entryList(ctx: Ctx, prefix: string, groups: ListItem[][]): RenderChildren[] {
  return groups.filter(g => g.length > 0).flatMap((group, n) => [
    ...(n > 0 ? [line(ctx, <ctx.els.Text> </ctx.els.Text>, 0, undefined, `${prefix}-gap-${n}`)] : []),
    ...group.flatMap(({ id, key = id, entry, after }) => [entryRow(ctx, key, `${prefix}-row-${id}`, entry), ...(after ?? [])]),
  ])
}

// The room inside a framed box under the graph: its border and padding taken off.
const framedWidth = ({ cols, graphWidth }: Ctx) => cols - graphWidth - 1 - 4

// A framed box exactly `rows.length + 2` rows tall: the border, then one row each.
function framed({ els: { Box } }: Ctx, color: string, indent: number, rows: RenderChildren[], extraRows = 0) {
  const height = rows.length + extraRows + 2
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
    <ctx.els.Text color={color ?? MUTED}>
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
          switchButton(ctx, 'menu-opt-force', 'force (deletes unmerged work)', view.isForce, () => setView($, v => ({ ...v, isForce: !v.isForce }))),
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

const closeMenuButton = ($: EngineInterface, ctx: Ctx) => closeButton(ctx, 'menu-close', () => setView($, v => ({ ...v, menu: null, isRenaming: false })))

// A ref's menu framed under its row (off a docked terminal pane): the pill and close, then the list.
function renderMenu($: EngineInterface, ctx: Ctx, { cells }: GraphRow, badge: Badge) {
  const lane = laneColor(cells)
  const head = line(ctx, [<ctx.els.Text>{renderPill(ctx, pillProps(ctx, badge, lane))}</ctx.els.Text>, closeMenuButton($, ctx)], 0, 'space-between')
  return framed(ctx, pillBg(ctx, badge, lane), ctx.graphWidth + 1, [head, ...menuBody($, ctx, badge)])
}

// The form a menu item opened, as a dialog of its own: push's remotes, delete's force (it
// runs on the first press: the dialog is the confirmation), rename's field. Cancel goes
// back to the menu.
function menuFormDialog($: EngineInterface, ctx: Ctx, badge: Badge): Omit<Dialog, 'color'> | null {
  const { els: { Button }, view, graph, Input } = ctx
  if (view.running) return null
  const items = menuFor(badge, graph.remotes, ctx.flow?.config ?? null)
  const push = items.find(i => i.pushArgs)
  if (view.push && push) {
    const { remotes, actions } = pushParts($, ctx, badge, push)
    return { title: `Push ${badge.label}`, rows: [remotes], actions }
  }
  const branch = items.find(i => i.deleteBranch !== undefined)?.deleteBranch
  if (view.isDeleting && branch !== undefined)
    return {
      title: `Delete ${branch}`,
      rows: [line(ctx, switchButton(ctx, 'menu-opt-force', 'force (deletes unmerged work)', view.isForce, () => setView($, v => ({ ...v, isForce: !v.isForce }))))],
      actions: line(
        ctx,
        [
          <Button key="menu-delete-run" variant="primary" autoFocus onPress={() => runAction($, deleteBranchArgs(branch, view.isForce), `Deleted ${branch}`)}>
            Delete
          </Button>,
          closeButton(ctx, 'menu-delete-cancel', () => setView($, v => ({ ...v, isDeleting: false, isForce: false })), 'cancel'),
        ],
        2,
      ),
    }
  if (view.isRenaming && Input)
    return {
      title: `Rename ${badge.label}`,
      rows: [line(ctx, <Input key="rename" label="New name" value={badge.label} submitLabel="rename" autoFocus onSubmit={value => renameBranch($, badge.label, value)} />)],
      actions: line(ctx, closeButton(ctx, 'rename-cancel', () => setView($, v => ({ ...v, isRenaming: false })), 'cancel')),
    }
  return null
}

// A ref's menu as a dialog (on a docked terminal pane), or the form one of its items opened.
function menuDialog($: EngineInterface, ctx: Ctx, { cells }: GraphRow, badge: Badge): Dialog {
  const lane = laneColor(cells)
  const color = pillBg(ctx, badge, lane)
  const form = menuFormDialog($, ctx, badge)
  if (form) return { ...form, color }
  return { title: <ctx.els.Text>{renderPill(ctx, pillProps(ctx, badge, lane))}</ctx.els.Text>, rows: menuBody($, ctx, badge), actions: line(ctx, closeMenuButton($, ctx)), color }
}

// A commit's actions as a dialog (on a docked terminal pane).
function actionsDialog($: EngineInterface, ctx: Ctx, { commit, cells }: GraphRow): Dialog {
  const close = closeButton(ctx, 'actions-close', () => setView($, v => ({ ...v, isActionsOpen: false, confirm: null })))
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
            <Text color={MUTED}>{'bin'.padStart(12)}</Text>
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
    ...(files.length > MAX_FILES ? [line(ctx, <Text color={MUTED}>… and {files.length - MAX_FILES} more files</Text>)] : []),
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
  if (commit.hash === UNCOMMITTED) return renderStash($, ctx, commit.subject, lane)
  const badges = rowBadges(commit.refs, ctx.graph, ctx.view, ctx.dead).filter(b => b.kind !== 'detached')
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
        <Button key="detail-actions-toggle" plain dimColor={!view.isActionsOpen} onPress={() => setView($, v => ({ ...v, isActionsOpen: !v.isActionsOpen, confirm: null }))}>
          {iconLabel(ctx, icons.actions)}
        </Button>,
      ],
      1,
      'space-between',
    ),
  ]
  if (view.isActionsOpen && !view.running && !ctx.isPinned) rows.push(...commitActions($, ctx, commit), blank(ctx))
  if (detail === null) rows.push(line(ctx, <Text color={MUTED}>Loading details…</Text>))
  else {
    rows.push(
      line(
        ctx,
        <Text color={MUTED} wrap="truncate-end">
          {detail.author} &lt;{detail.email}&gt; · {absTime(detail.time)} ({relTime(ctx.now, detail.time)}) · {detail.hash}
        </Text>,
      ),
    )
    rows.push(...refMenuRows($, ctx, commit.hash, badges))
    if (body.length && body[0] !== '') {
      rows.push(blank(ctx), ...body.slice(0, BODY_LINES).map(l => line(ctx, <Text wrap="truncate-end">{l}</Text>)))
      if (body.length > BODY_LINES) rows.push(line(ctx, <Text color={MUTED}>…</Text>))
    }
    rows.push(blank(ctx), ...renderFiles(ctx, detail.files))
  }
  rows.push(blank(ctx))
  if (view.running) rows.push(view.menu ? blank(ctx) : renderRunning(ctx))
  else if (Input)
    rows.push(line(ctx, <Input key="new-branch" label="New branch here" placeholder="branch-name" submitLabel="create" onSubmit={value => createBranch($, commit.hash, value)} />))
  return framed(ctx, lane, ctx.graphWidth + 1, rows)
}

// Opens a form of the uncommitted changes (null: back to their actions). Leaving the commit form
// keeps no message: each time it opens Claude writes a new one.
async function openUncommittedForm($: EngineInterface, form: View['uncommittedForm']): Promise<void> {
  // The commit lists the changes as they are now (the graph's may predate them, or this code),
  // every one picked to start with.
  if (form === 'commit') {
    const status = await git($, STATUS_ARGS)
    if (status.exitCode === 0) {
      const { staged } = parseStatus(status.stdout)
      await setGraph($, g => ({ ...g, changes: parseChanges(status.stdout), staged }))
    }
  }
  const all = ((await readGraph($)).changes ?? []).map(c => c.path)
  await setView($, v => ({ ...v, uncommittedForm: form, commitDraft: '', commitStep: 'files', commitFiles: all }))
}

// The uncommitted changes' actions, as a ref's menu lists its own: each opens its form.
function uncommittedActions($: EngineInterface, ctx: Ctx): RenderChildren[] {
  const item = (id: 'commit' | 'stash', label: string): ListItem => ({
    id,
    key: `uncommitted-${id}`,
    entry: { label, isActive: ctx.view.uncommittedForm === id, onPress: () => openUncommittedForm($, id) },
  })
  return entryList(ctx, 'uncommitted', [[item('commit', 'Commit changes…'), item('stash', 'Stash changes…')]])
}

// The form an action opened: commit them all (the message written, or Claude's suggestion
// reviewed) or stash them all (an optional message); cancel goes back to the actions.
function uncommittedForm($: EngineInterface, ctx: Ctx): Omit<Dialog, 'color'> | null {
  const { els: { Text, Button }, Input, view } = ctx
  if (!Input || !view.uncommittedForm) return null
  const cancel = (key: string) => line(ctx, closeButton(ctx, key, () => openUncommittedForm($, null), 'cancel'))
  if (view.running) return { title: 'Uncommitted changes', rows: [renderRunning(ctx)], actions: line(ctx, null) }
  if (view.uncommittedForm === 'stash')
    return {
      title: 'Stash changes',
      rows: [line(ctx, <Input key="stash-message" label="Message" placeholder="optional" submitLabel="stash" autoFocus onSubmit={value => stashChanges($, value)} />)],
      actions: cancel('stash-cancel'),
    }
  if (view.commitStep === 'files') return commitFilesForm($, ctx)
  // Claude's message, whole (wrapped over a few lines of a wider dialog) and not edited: Commit
  // (Enter) takes it as shown, ✨ asks for another, ← files goes back to the files.
  const message = view.isSuggesting
    ? line(ctx, [renderSpinner(ctx, 'suggest-spinner'), <Text color={MUTED}>Claude is writing a message…</Text>], 1)
    : view.commitDraft
      ? <Text wrap="wrap">{view.commitDraft}</Text>
      : <Text color={MUTED}>No message yet: ✨ suggest again</Text>
  return {
    title: 'Commit changes',
    width: COMMIT_DIALOG_W,
    extraRows: COMMIT_ROWS - 1,
    rows: [
      <ctx.els.Box key="commit-message" height={COMMIT_ROWS} overflow="hidden" flexShrink={0} flexDirection="column">
        {message}
      </ctx.els.Box>,
    ],
    actions: line(
      ctx,
      [
        <Button key="commit-run" variant="primary" autoFocus onPress={() => commitChanges($, view.commitDraft)}>
          Commit
        </Button>,
        <Button key="commit-suggest" plain dimColor onPress={() => suggestCommit($)}>
          ✨ suggest again
        </Button>,
        <Button key="commit-back" plain dimColor onPress={() => setView($, v => ({ ...v, commitStep: 'files', commitDraft: '' }))}>
          ← files
        </Button>,
        closeButton(ctx, 'commit-cancel', () => openUncommittedForm($, null), 'cancel'),
      ],
      2,
    ),
  }
}

// The commit's first step: Stage all changes, then a line a file (picked or not, what changed);
// past COMMIT_FILES of them the rest are counted, picked or not by Stage all. Next goes on.
function commitFilesForm($: EngineInterface, ctx: Ctx): Omit<Dialog, 'color'> {
  const { els: { Button, Text }, view, graph } = ctx
  const changes = graph.changes ?? []
  const box = (isOn: boolean) => (isOn ? '☑' : '☐')
  const isAll = changes.length > 0 && view.commitFiles.length === changes.length
  const shown = changes.slice(0, COMMIT_FILES)
  const rows: RenderChildren[] = [
    line(
      ctx,
      <Button key="commit-all" plain onPress={() => pickFile($)}>
        {`${box(isAll)} Stage all changes (${changes.length})`}
      </Button>,
    ),
    blank(ctx),
    ...shown.map((c, i) =>
      line(
        ctx,
        <Button key={`commit-file-${i}`} plain dimColor={!view.commitFiles.includes(c.path)} onPress={() => pickFile($, c.path)}>
          {`${box(view.commitFiles.includes(c.path))} ${c.code}  ${c.from ? `${c.from} → ` : ''}${c.path}`}
        </Button>,
        0,
        undefined,
        `commit-file-row-${i}`,
      ),
    ),
    ...(changes.length > shown.length ? [line(ctx, <Text color={MUTED}>{`… and ${changes.length - shown.length} more`}</Text>)] : []),
  ]
  return {
    title: `Commit changes · ${view.commitFiles.length} of ${changes.length} files`,
    width: COMMIT_DIALOG_W,
    rows,
    actions: line(
      ctx,
      [
        <Button key="commit-next" variant="primary" autoFocus onPress={() => commitNext($)}>
          Next
        </Button>,
        closeButton(ctx, 'commit-files-cancel', () => openUncommittedForm($, null), 'cancel'),
      ],
      2,
    ),
  }
}

// The uncommitted changes under their row where no dialog floats: the title, the actions, and
// the form one opened under them.
function renderStash($: EngineInterface, ctx: Ctx, title: string, lane: string) {
  const form = uncommittedForm($, ctx)
  const rows: RenderChildren[] = [line(ctx, <ctx.els.Text weight="bold">{title}</ctx.els.Text>), blank(ctx), ...uncommittedActions($, ctx), ...(form ? [blank(ctx), ...form.rows, form.actions] : [])]
  return framed(ctx, lane, ctx.graphWidth + 1, rows, form?.extraRows ?? 0)
}

// The uncommitted changes as a dialog on a docked terminal pane, as a ref's menu: the actions,
// or in their place the form one opened. Close (or Escape) closes it.
function uncommittedDialog($: EngineInterface, ctx: Ctx, { commit, cells }: GraphRow): Dialog {
  const color = laneColor(cells)
  const form = uncommittedForm($, ctx)
  if (form) return { ...form, color }
  const close = closeButton(ctx, 'uncommitted-close', () => setView($, v => ({ ...v, selected: null })))
  return { title: commit.subject, rows: uncommittedActions($, ctx), actions: line(ctx, close), color }
}

// A screen's title, its way back to the graph, and a rule.
function screenHeader($: EngineInterface, ctx: Ctx, screen: Exclude<Screen, 'graph'>, title: string) {
  const { Box, Text, Button } = ctx.els
  return [
    <Box flexDirection="row" justifyContent="space-between">
      <Text weight="bold">{title}</Text>
      <Button key={`${screen}-back`} plain dimColor onPress={() => setView($, (v): View => ({ ...v, screen: 'graph' }))}>
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
      <Text color={MUTED}>Loading…</Text>
    ) : changelog.versions.length === 0 ? (
      <Text color={MUTED}>Could not read the mod's CHANGELOG.md</Text>
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
    <Button key={`scope-${scope}`} plain onPress={() => setView($, v => ({ ...v, configScope: scope }))}>
      {view.configScope === scope ? '◉' : '○'} {label}
    </Button>
  )
  const both = (key: 'name' | 'email') =>
    `local: ${settings?.local[key] || '—'} · global: ${settings?.global[key] || '—'}`
  return (
    <Box flexDirection="column">
      {screenHeader($, ctx, 'settings', `${ctx.icons.settings} Repository settings`)}
      {settings === null ? (
        <Text color={MUTED}>Loading…</Text>
      ) : (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text>
              <Text weight="bold">Columns</Text>
              <Text color={MUTED}> · every repository</Text>
            </Text>
            <Box flexDirection="row" gap={2}>
              {switchButton(ctx, 'cfg-col-author', 'author', ctx.columns.isAuthor, () => toggleColumn($, 'isAuthor'))}
              {switchButton(ctx, 'cfg-col-hash', 'hash', ctx.columns.isHash, () => toggleColumn($, 'isHash'))}
            </Box>
          </Box>
          <Box flexDirection="column">
            <Text weight="bold">User</Text>
            <Text color={MUTED}>name   {both('name')}</Text>
            <Text color={MUTED}>email  {both('email')}</Text>
            <Box flexDirection="row" gap={2} marginTop={1}>
              <Text color={MUTED}>Save to:</Text>
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
            {settings.remotes.length === 0 && <Text color={MUTED}>No remotes.</Text>}
            {settings.remotes.map(r => (
              <Box flexDirection="column">
                <Box height={1} overflow="hidden" flexDirection="row">
                  <Box flexShrink={0}>{renderPill(ctx, plainPill(ctx, r.name, GRAY_BG, true))}</Box>
                  <Text color={MUTED}>{truncateMiddle(r.fetchUrl, Math.max(10, cols - r.name.length - PILL_PAD))}</Text>
                </Box>
                {r.pushUrl && r.pushUrl !== r.fetchUrl && (
                  <Text color={MUTED}>{`  push: ${truncateMiddle(r.pushUrl, Math.max(10, cols - 8))}`}</Text>
                )}
                {!view.running && (
                  <Box flexDirection="row" gap={1} marginLeft={2}>
                    <Button key={`remote-fetch-${r.name}`} plain dimColor onPress={() => runAction($, ['fetch', r.name], `Fetched ${r.name} ✓`, true)}>
                      fetch
                    </Button>
                    <Button key={`remote-edit-${r.name}`} plain dimColor onPress={() =>
                      setView($, v => ({ ...v, editingRemote: v.editingRemote === r.name ? null : r.name }))
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
                  setView($, v => ({ ...v, isAddingRemote: !v.isAddingRemote, remoteDraft: '' }))
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
                      onInput={value => setView($, v => ({ ...v, remoteDraft: value }))}
                      onSubmit={value => setView($, v => ({ ...v, remoteDraft: value }))}
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
              <Text color={MUTED} wrap="truncate-end">{flowSummary(ctx.flow.config)}</Text>
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
  if (view.running) return view.menu || view.selected || view.notice ? [] : [renderRunning(ctx, 'flow-spinner')]
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
        <Button key="flow-continue" variant="primary" autoFocus onPress={() => runFlow($, [{ args: resumeArgs(conflict, '--continue') }], 'Continued ✓', 'Continuing…', conflict)}>
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
// `width`: the columns it wants, past the usual DIALOG_W (the pane's at most); `extraRows`: what its
// rows take past one each (a field several lines tall).
type Dialog = { title?: RenderChildren; rows: RenderChildren[]; actions: RenderChildren; color?: string; width?: number; extraRows?: number }

// The dialog's rows: its title and a blank row (when it has one), its body, a blank row, its buttons.
// Its buttons centered under the body, every dialog alike.
const dialogRows = (ctx: Ctx, { title, rows, actions }: Dialog): RenderChildren[] => [
  ...(title === undefined ? [] : [line(ctx, typeof title === 'string' ? <ctx.els.Text weight="bold">{title}</ctx.els.Text> : title), blank(ctx)]),
  ...rows,
  blank(ctx),
  <ctx.els.Box key="dialog-actions" height={1} overflow="hidden" flexDirection="row" justifyContent="center">
    {actions}
  </ctx.els.Box>,
]

// A dialog's dim close (or cancel) button.
const closeButton = ({ els: { Button } }: Ctx, key: string, onPress: () => Promise<unknown>, label = 'close') => (
  <Button key={key} plain dimColor onPress={onPress}>
    {label}
  </Button>
)

// What the git flow dialog shows: the Git Flow menu, the set-up form, start's name field,
// finish's switches and tag message, or the update it asks about; null when
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
        <Button key="flow-finish-run" variant="primary" autoFocus onPress={() => finishTopic($, finishing)}>
          Finish
        </Button>,
        'flow-finish-cancel',
      ),
    }
  }
  const type = confirming && typeOf(config, confirming.topic.kind)
  if (confirming && type) {
    const { topic } = confirming
    const isRebase = type.strategy === 'rebase'
    const [verb, question] = isRebase ? ['Rebase', `Rebase ${topic.branch} on ${type.parent}?`] : ['Merge', `Merge ${type.parent} into ${topic.branch}?`]
    return {
      title: `${verb} ${topic.branch}`,
      rows: [line(ctx, <Text>{question}</Text>)],
      actions: actions(
        <Button key="flow-confirm-run" variant="primary" autoFocus onPress={() => updateTopic($, topic)}>
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
// The commit dialog: wider, its message field several lines tall, to show a message whole.
const COMMIT_DIALOG_W = 96
const COMMIT_ROWS = 3
// The files the commit's first step lists at most; Stage all picks the rest too.
const COMMIT_FILES = 12

function renderDialog(ctx: Ctx, key: string, dialog: Dialog, top: number, room: number) {
  const { Box, Text } = ctx.els
  const rows = dialogRows(ctx, dialog)
  const width = Math.max(20, Math.min(dialog.width ?? DIALOG_W, ctx.cols - 2))
  const height = rows.length + (dialog.extraRows ?? 0) + 2
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
  const say = (text: string, color?: 'warning') => line(ctx, <Text color={color ?? MUTED}>{text}</Text>)
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
  const counts = sync ? syncText(sync) : ''
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

// An action shown in a dialog: its spinner and label while it runs, or the error it ended
// with, centered over a centered Dismiss.
function noticeDialog($: EngineInterface, ctx: Ctx, notice: NonNullable<View['notice']>): Dialog {
  const { els: { Button, Text } } = ctx
  const body =
    notice.error === null
      ? line(ctx, [renderSpinner(ctx, 'notice-spinner'), <Text>{notice.label}</Text>], 2, 'center')
      : line(ctx, <Text color="error">{notice.error}</Text>, 0, 'center')
  const dismiss = (
    <Button key="notice-dismiss" autoFocus onPress={() => setView($, v => ({ ...v, notice: null }))}>
      Dismiss
    </Button>
  )
  return { rows: [body], actions: line(ctx, dismiss, 0, 'center', 'notice-actions') }
}

// The one dialog a docked terminal pane floats over its graph: an action's notice, git flow's,
// a ref's menu or a commit's actions; none while an action runs (but the notice's and the
// menu's, which show its spinner).
function pinnedDialog($: EngineInterface, ctx: Ctx, menuRow: GraphRow | undefined, selectedRow: GraphRow | undefined): { key: string; dialog: Dialog } | null {
  const { view } = ctx
  if (view.notice) return { key: 'notice-dialog', dialog: noticeDialog($, ctx, view.notice) }
  const flowBox = view.running ? null : flowDialog($, ctx)
  if (flowBox) return { key: 'flow-dialog', dialog: flowBox }
  if (menuRow && view.menu) return { key: 'menu-dialog', dialog: menuDialog($, ctx, menuRow, view.menu.badge) }
  if (selectedRow && view.isActionsOpen && !view.running) return { key: 'actions-dialog', dialog: actionsDialog($, ctx, selectedRow) }
  if (selectedRow?.commit.hash === UNCOMMITTED) return { key: 'uncommitted-dialog', dialog: uncommittedDialog($, ctx, selectedRow) }
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
  // On a docked terminal pane the uncommitted changes float as a dialog, not under their row.
  const isUncommittedDialog = ctx.isPinned && selectedRow?.commit.hash === UNCOMMITTED
  const detailBox = selectedRow && !isUncommittedDialog ? renderDetail($, ctx, selectedRow) : undefined
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
  // Only the graph scrolls its own rows: any other screen (changelog, settings, a message)
  // lets the engine scroll, until the graph draws its window again below.
  ownScroll = null
  if (graph.status === 'no-repo') return <Text color={MUTED}>Not a git repository.</Text>
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
    branchColors: cache.branchColors,
    dead: cache.dead,
    mainColor: cache.branchColors.get(mainOf(flow?.config, graph.locals ?? [])),
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
      await setView($, v => ({ ...v, limit: v.limit + PAGE }))
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
  const empty = graph.rows.length === 0 && <Text color={MUTED}>{graph.status === 'ready' ? 'No commits yet.' : 'Loading…'}</Text>

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
    await openPane($, await setView($, v => ({ ...v, isOpen: true })))
    await findRepos($)
    await Promise.all([load($), loadFlow($), detectFont($, style), loadColumns($)])
    const graph = await readGraph($)
    return { text: graph.status === 'no-repo' ? 'Git Graph: not a git repository.' : 'Git Graph opened.' }
  })

  // The person's close (Escape, or the close mark) with a modal open closes the modal instead,
  // keeping the pane: no `next`.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    let isDismissed = false
    const view = await setView($, v => {
      const dismissed = e.origin.kind === 'person' ? dismissModal(v) : null
      isDismissed = dismissed !== null
      return dismissed ?? { ...v, isOpen: false }
    })
    if (!isDismissed) return next(e)
    // Escape handed the keys back: with a modal still open (a form back to its list), ask again.
    if (hasModal(view)) await openPane($, view)
    return { value: undefined }
  }).catch(($, e, next) => next(e))

  // A pill posts `{ button }`: a click opens its ref's menu (again, closes it); a second left
  // click on the same pill within DOUBLE_CLICK_MS checks the ref out instead, closing the menu
  // the first one opened. The commit's text beside it opens the details.
  on('ui.message', { requestId: PANE }, async ($, e, next) => {
    const [kind, hash = '', index = ''] = e.element.split(':')
    if (kind !== 'pill') return next(e)
    const button = (e.data as { button?: string } | null)?.button
    const [cache, view] = await Promise.all([readCache($), read($, viewState)])
    const { graph } = cache
    const row = graph.rows[cache.indexOf.get(hash) ?? -1]
    const badge = row && rowBadges(row.commit.refs, graph, view, cache.dead)[Number(index)]
    const now = await $.clock.now()
    const isDouble = button === 'left' && lastPillClick.key === e.element && now - lastPillClick.at <= DOUBLE_CLICK_MS
    lastPillClick = button === 'left' && !isDouble ? { key: e.element, at: now } : { key: '', at: 0 }
    if (!badge) return next(e)
    if (isDouble) {
      await setView($, v => ({ ...v, menu: null }))
      await checkoutRef($, badge)
    } else await openMenu($, hash, badge)
    return next(e)
  }).catch(($, e, next) => next(e))

  // On a docked terminal pane the mod scrolls its own rows: the engine's window holds still
  // (no `next`), so the header and the footer never move. Elsewhere the engine scrolls.
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    if (!ownScroll) return next(e)
    const { top, maxTop } = ownScroll
    await update($, scrollTopState, () => Math.max(0, Math.min(top + (e.by ?? 0), maxTop)))
    // A search's centered commit lets go at the first scroll, from where it was drawn.
    if ((await read($, viewState)).scrollTo) await setView($, v => ({ ...v, scrollTo: null }))
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
