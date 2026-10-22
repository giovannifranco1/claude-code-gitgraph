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

export type GraphStatus = 'idle' | 'loading' | 'ready' | 'no-repo' | 'error'
export type Graph = {
  status: GraphStatus
  rows: GraphRow[]
  head: string
  branch: string
  dirty: number
  hasMore: boolean
  error?: string
}

export type Scope = 'all' | 'head'
export type View = {
  scope: Scope
  limit: number
  selected: string | null
  confirm: string | null
  isOpen: boolean
}

declare module 'claude-code' {
  interface PluginState {
    gitgraph: { graph: Graph; view: View; detail: CommitDetail | null }
  }
}
