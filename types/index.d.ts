export type RefKind = 'head' | 'branch' | 'remote' | 'tag'
export type Ref = { kind: RefKind; name: string }

// The remote branches merged into a base, by name to their tip, and the bases' tips.
export type Merged = { remotes: Record<string, string>; tips: string[] }

export type Commit = {
  hash: string
  parents: string[]
  refs: Ref[]
  author: string
  time: number
  subject: string
}

// A git worktree: its folder, its commit, its branch (null while detached), whether it is the
// main one (the repository's own folder), locked, or prunable (its folder is gone).
export type Worktree = { path: string; head: string; branch: string | null; isMain: boolean; isLocked: boolean; isPrunable: boolean }

// The environment contract of gitgraph.json (phase WE): where worktrees go, the commands the
// project declares (templates with {slug}, {path}, {branch}, {base}) and its links.
export type EnvCommand = 'new' | 'remove' | 'up' | 'down' | 'logs' | 'check' | 'status'
export type Contract = { dir: string; commands: Partial<Record<EnvCommand, string>>; links: string[] }
export type EnvStatus = 'up' | 'down' | 'unknown'
export type CheckLine = { mark: 'ok' | 'failed' | 'shared' | 'info'; text: string }
// The worktrees screen's environment: the last check of a worktree, and the logs followed
// (lines so far; `exit` once the command ended).
export type WorktreeEnv = {
  check: { path: string; lines: CheckLine[] } | null
  logs: { path: string; lines: string[]; exit: number | null } | null
}

// The new worktree form: on a branch, or on a new branch at a commit; its name (slug) follows
// the new branch and its path follows the name, each until typed by hand.
// `head`: from the worktrees screen, on a branch typed (an existing one, or a new one off HEAD).
export type WorktreeForm = ({ kind: 'branch'; branch: string } | { kind: 'commit'; hash: string } | { kind: 'head' }) & {
  newBranch: string
  slug: string
  path: string
  dir: string
  // The home folder `~` stands for in the path (read when the form opens: the render reads it).
  home: string
  isSlugEdited: boolean
  isPathEdited: boolean
  error: string | null
}

// A stash of `git stash list`: its commit, the commit it was made on, when, `stash@{N}`, message.
export type Stash = { hash: string; base: string; time: number; name: string; subject: string }

export type BadgeKind = 'head' | 'detached' | 'branch' | 'remote' | 'tag'
// `isGone`: a dead branch: a remote one with no local branch of its name (deleted here), or
// merged into a base (then its local branch on its commit too, which carries its remote).
// How far a local branch is from its upstream: its commits past it and short of it.
export type Track = { ahead: number; behind: number }
// An uncommitted change: its path (and the one it was renamed from), what changed (Modified,
// Added or untracked, Deleted, Renamed, Unmerged) and whether it is staged.
export type Change = { path: string; from?: string; code: 'M' | 'A' | 'D' | 'R' | 'U'; isStaged: boolean }
// `ahead`/`behind`: a local branch's Track, when not 0.
// `worktree`: a local branch open in another worktree; `isUp`: that worktree's environment is up.
export type Badge = { kind: BadgeKind; label: string; remotes: string[]; isGone?: true; ahead?: number; behind?: number; worktree?: true; isUp?: true }

export type Cell = { ch: string; color: number }
export type GraphRow = { commit: Commit; cells: Cell[] }

export type FileStat = { path: string; adds: number | null; dels: number | null }
export type CommitDetail = {
  hash: string
  author: string
  email: string
  time: number
  body: string
  files: FileStat[]
}

export type GraphStatus = 'idle' | 'ready' | 'no-repo' | 'error'
export type Graph = {
  status: GraphStatus
  rows: GraphRow[]
  head: string
  branch: string
  // Unmerged paths: a merge, rebase or finish stopped on a conflict.
  conflicts: number
  remotes: string[]
  // The local branch names: a remote branch with none of its name is gone here (merged, deleted).
  locals?: string[]
  // The remote branches merged into a base (main, develop), and the bases' tips: the finished
  // ones are drawn as gone (see deadOf).
  merged?: Merged
  // The uncommitted changes, file by file, and how many of them are staged.
  changes?: Change[]
  staged?: number
  // Each local branch off its upstream: how far ahead and behind.
  tracks?: Record<string, Track>
  // What `merged` was worked out from (the refs and the bases), to skip the query while unchanged.
  mergedKey?: string
  // The checked-out branch against its upstream; null where it has none (not published).
  sync?: (Track & { remote: string }) | null
  // The repo's worktrees (the main one first); derived from them at the load, so each row's
  // badges need not work them out: the one the pane shows, and each branch open in another
  // one, with where.
  worktrees?: Worktree[]
  worktree?: string
  openBranches?: Record<string, string>
  contract?: Contract | null
  contractProblem?: string | null
  // Each worktree's environment status (by path), as last asked: kept across loads, asked
  // again when old (the badges' up mark, the worktrees screen).
  envStatus?: Record<string, EnvStatus>
  hasMore: boolean
  error?: string
}

// The "all branches" switch: on, local and remote branches (`--all`); off (`head`, the name kept
// for the stored view), the local branches alone (`--branches HEAD`).
export type Scope = 'all' | 'head'
export type Screen = 'graph' | 'settings' | 'changelog' | 'diff' | 'compare' | 'worktrees'

// Two points of the graph compared: git refs or hashes, and how the screen names them.
export type Compare = { from: string; to: string; fromLabel: string; toLabel: string }
// A comparison's answers: commits only in `to` (ahead) and only in `from` (behind), the files
// from one to the other; `key` the comparison they are of.
export type Comparison = { key: string; ahead: number; behind: number; files: FileStat[] }

// Where a file's diff comes from: a commit (against its first parent), a stash (against its
// base), or a comparison (from one point to the other, `label` naming both).
export type DiffSource = { kind: 'commit'; hash: string } | { kind: 'stash'; name: string } | { kind: 'range'; from: string; to: string; label: string }
// A line of a diff as the diff screen draws it.
export type DiffLine = { kind: 'hunk' | 'add' | 'del' | 'ctx' | 'note'; text: string }
// A file's diff: its first lines, `hidden` the rest; `key` the file it is of (`diffKey`).
export type Diff = { key: string; lines: DiffLine[]; hidden: number }
export type View = {
  scope: Scope
  limit: number
  selected: string | null
  confirm: string | null
  menu: { hash: string; badge: Badge } | null
  isRenaming: boolean
  // The menu's branch delete is asking, whether to force it, and whether to delete it on its
  // remotes too (both off each time it opens).
  isDeleting: boolean
  isForce: boolean
  isDeletingRemote: boolean
  // The remotes ticked while the push chooser is open; null when it is closed.
  push: string[] | null
  // What a running git action is doing, shown with a spinner; null when idle.
  running: string | null
  // The settings screen in place of the graph, and what its forms are on.
  // What the pane shows: the graph, or a screen in its place.
  screen: Screen
  configScope: ConfigScope
  editingRemote: string | null
  isAddingRemote: boolean
  remoteDraft: string
  // A commit the pane is scrolling to: the render draws the window around it.
  scrollTo: string | null
  // The hash search field, opened from its toolbar icon.
  isSearching: boolean
  // The last term searched, kept in the field while it matches several (find again: the next).
  search: string
  // The uncommitted changes' commit message being written (or Claude's suggestion), and
  // whether Claude is writing one.
  commitDraft: string
  isSuggesting: boolean
  // The form the uncommitted changes' actions opened, in a dialog of its own; null: the actions.
  uncommittedForm: 'commit' | 'stash' | 'reset' | null
  // The file whose diff the diff screen shows, where it is from, and the screen it goes back to.
  diff: { source: DiffSource; path: string; back: Screen } | null
  // What the compare screen compares, and the commit marked to compare another with.
  compare: Compare | null
  compareMark: string | null
  // On the worktrees screen: the worktree whose actions are open, and the one being removed
  // (its force is `isForce`).
  worktreeSelected: string | null
  worktreeRemoving: string | null
  // The worktree whose environment action runs: its spinner shows under it alone.
  worktreeRunning: string | null
  // The new worktree form on the worktrees screen.
  worktreeForm: WorktreeForm | null
  // The commit's step (pick the files, then the message) and the files picked, by path.
  commitStep: 'files' | 'message'
  commitFiles: string[]
  // The refresh button's feedback: running, then `done` for a moment.
  refresh: 'idle' | 'running' | 'done'
  isOpen: boolean
  flow: FlowView
  // The open commit's actions list, opened from its icon (closed for each commit opened).
  isActionsOpen: boolean
  // An action shown in a dialog on a docked terminal pane (a fetch): its label while it runs,
  // then the error it failed with; null once done or dismissed.
  notice: { label: string; error: string | null } | null
}

// Git Flow (git-flow-next), as the repository's `gitflow.*` config sets it up.
export type FlowKind = 'feature' | 'bugfix' | 'release' | 'hotfix'
export type FlowType = { kind: FlowKind; prefix: string; parent: string; startpoint: string; isTagged: boolean; strategy: 'rebase' | 'merge' }
export type FlowBase = { name: string; parent: string; isAutoUpdate: boolean }
export type FlowConfig = { types: FlowType[]; bases: FlowBase[]; remote: string; tagPrefix: string }
// The names `git flow init` sets up, as the init form edits them.
export type FlowInitForm = { main: string; develop: string; feature: string; bugfix: string; release: string; hotfix: string; tag: string }
// A work branch: its type, its name without the prefix, and the full branch name.
export type FlowTopic = { kind: FlowKind; name: string; branch: string }
export type FlowCli = 'next' | 'other' | 'none'
// `next` is the version a new release or hotfix is offered, worked out at load.
export type FlowInfo = { cli: FlowCli; config: FlowConfig | null; next: Partial<Record<FlowKind, string>> }
export type FlowOptions = { isNoFf: boolean; isPush: boolean; isKeep: boolean }
// A finish or update that stopped on a conflict, to continue or abort. A classic finish names
// the base it was merging the branch into (`into`), the `-c` settings its git flow ran with
// (`config`, for --continue), and the steps still to run once it goes on (`then`).
export type FlowConflict = { op: 'finish' | 'rebase' | 'merge'; topic: FlowTopic; into?: string; config?: string[]; then?: FlowStep[] }
// A step of a git flow action: its failure reads `git flow feature start failed: …` unless
// `failed` says otherwise; `stops` is the conflict it can leave; `isFlow` runs it as git flow
// is run (repo hooks off), by default a `flow` one; `config`, `-c` settings it runs with.
export type FlowStep = { args: string[]; isNetwork?: boolean; failed?: string; isFlow?: boolean; config?: string[]; stops?: Omit<FlowConflict, 'then'> }
export type FlowView = {
  // The type whose name field is open in Start.
  starting: FlowKind | null
  // The work branch whose finish is being confirmed.
  finishing: FlowTopic | null
  opts: FlowOptions
  tagMessage: string | null
  conflict: FlowConflict | null
  // The init form: under the footer bar where git flow is not set up, in settings to reconfigure.
  init: FlowInitForm | null
  // The update the dialog is asking about.
  confirming: { action: 'update'; topic: FlowTopic } | null
  // The Git Flow dialog, opened from the footer: a row per type, its start, update and finish.
  isMenuOpen: boolean
}

// The mod's CHANGELOG.md, read when its screen opens, and the version installed.
export type ChangelogGroup = { title: string; items: string[] }
export type ChangelogVersion = { version: string; date: string | null; groups: ChangelogGroup[] }
// No versions: the file could not be read.
export type Changelog = { versions: ChangelogVersion[]; installed: string | null }

export type BadgeStyle = 'auto' | 'round' | 'square'

export type ConfigScope = 'local' | 'global'
export type RemoteInfo = { name: string; fetchUrl: string; pushUrl: string }
export type UserConfig = { name: string; email: string }
// `worktreeDir`: the folder new worktrees go in, from the local config ('' when unset: the default).
export type RepoSettings = { local: UserConfig; global: UserConfig; remotes: RemoteInfo[]; worktreeDir: string }
// The repos found in the session folder, by path relative to it (`.` is the folder), the one
// shown, whether the repo dropdown is open, and the branch each repo is on (absent: unknown).
export type Repos = { list: string[]; active: string; isPicking: boolean; branches: Record<string, string> }

// The list's optional columns, chosen in settings and kept in the mod's store between sessions.
export type Columns = { isAuthor: boolean; isHash: boolean }

declare module 'claude-code' {
  interface PluginState {
    gitgraph: { graph: Shaped<Graph>; view: Shaped<View>; detail: CommitDetail | null; isRound: boolean; settings: RepoSettings | null; hasNerdFont: boolean; graphVersion: number; scrollTop: number; columns: Columns; flow: FlowInfo | null; repos: Shaped<Repos>; changelog: Changelog | null; diff: Diff | null; compare: Comparison | null; worktreeChanges: Record<string, number> | null; worktreeEnv: WorktreeEnv }
  }
}
