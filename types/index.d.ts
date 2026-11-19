export type RefKind = 'head' | 'branch' | 'remote' | 'tag'
export type Ref = { kind: RefKind; name: string }

export type Commit = {
  hash: string
  parents: string[]
  refs: Ref[]
  author: string
  time: number
  subject: string
}

export type BadgeKind = 'head' | 'detached' | 'branch' | 'remote' | 'tag'
// `isGone`: a dead branch: a remote one with no local branch of its name (deleted here), or
// merged into a base (then its local branch on its commit too, which carries its remote).
// How far a local branch is from its upstream: its commits past it and short of it.
export type Track = { ahead: number; behind: number }
// An uncommitted change: its path (and the one it was renamed from), what changed (Modified,
// Added or untracked, Deleted, Renamed, Unmerged) and whether it is staged.
export type Change = { path: string; from?: string; code: 'M' | 'A' | 'D' | 'R' | 'U'; isStaged: boolean }
// `ahead`/`behind`: a local branch's Track, when not 0.
export type Badge = { kind: BadgeKind; label: string; remotes: string[]; isGone?: true; ahead?: number; behind?: number }

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
  // The remote branches merged into a base (main, develop): drawn as gone.
  merged?: string[]
  // The uncommitted changes, file by file, and how many of them are staged.
  changes?: Change[]
  staged?: number
  // Each local branch off its upstream: how far ahead and behind.
  tracks?: Record<string, Track>
  // What `merged` was worked out from (the refs and the bases), to skip the query while unchanged.
  mergedKey?: string
  // The checked-out branch against its upstream; null where it has none (not published).
  sync?: (Track & { remote: string }) | null
  hasMore: boolean
  error?: string
}

// The "all branches" switch: on, local and remote branches (`--all`); off (`head`, the name kept
// for the stored view), the local branches alone (`--branches HEAD`).
export type Scope = 'all' | 'head'
export type Screen = 'graph' | 'settings' | 'changelog'
export type View = {
  scope: Scope
  limit: number
  selected: string | null
  confirm: string | null
  menu: { hash: string; badge: Badge } | null
  isRenaming: boolean
  // The menu's branch delete is asking, and whether to force it (off each time it opens).
  isDeleting: boolean
  isForce: boolean
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
// A finish or update that stopped on a conflict, to continue or abort.
export type FlowConflict = { op: 'finish' | 'rebase' | 'merge'; topic: FlowTopic }
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
export type RepoSettings = { local: UserConfig; global: UserConfig; remotes: RemoteInfo[] }
// The repos found in the session folder, by path relative to it (`.` is the folder), the one
// shown, whether the repo dropdown is open, and the branch each repo is on (absent: unknown).
export type Repos = { list: string[]; active: string; isPicking: boolean; branches: Record<string, string> }

// The list's optional columns, chosen in settings and kept in the mod's store between sessions.
export type Columns = { isAuthor: boolean; isHash: boolean }

declare module 'claude-code' {
  interface PluginState {
    gitgraph: { graph: Graph; view: Shaped<View>; detail: CommitDetail | null; isRound: boolean; settings: RepoSettings | null; hasNerdFont: boolean; graphVersion: number; scrollTop: number; columns: Columns; flow: FlowInfo | null; repos: Shaped<Repos>; changelog: Changelog | null }
  }
}
