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
export type Badge = { kind: BadgeKind; label: string; remotes: string[] }

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
  dirty: number
  remotes: string[]
  hasMore: boolean
  error?: string
}

export type Scope = 'all' | 'head'
export type View = {
  scope: Scope
  limit: number
  selected: string | null
  confirm: string | null
  menu: { hash: string; badge: Badge } | null
  isRenaming: boolean
  // The remotes ticked while the push chooser is open; null when it is closed.
  push: string[] | null
  // What a running git action is doing, shown with a spinner; null when idle.
  running: string | null
  // The settings screen in place of the graph, and what its forms are on.
  isSettings: boolean
  configScope: ConfigScope
  editingRemote: string | null
  isAddingRemote: boolean
  remoteDraft: string
  // A commit the pane is scrolling to: the render draws the window around it.
  scrollTo: string | null
  // The refresh button's feedback: running, then `done` for a moment.
  refresh: 'idle' | 'running' | 'done'
  isOpen: boolean
}

export type BadgeStyle = 'auto' | 'round' | 'square'

export type ConfigScope = 'local' | 'global'
export type RemoteInfo = { name: string; fetchUrl: string; pushUrl: string }
export type UserConfig = { name: string; email: string }
export type RepoSettings = { local: UserConfig; global: UserConfig; remotes: RemoteInfo[] }

declare module 'claude-code' {
  interface PluginState {
    gitgraph: { graph: Graph; view: View; detail: CommitDetail | null; isRound: boolean; settings: RepoSettings | null; hasNerdFont: boolean; graphVersion: number }
  }
}
