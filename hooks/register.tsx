import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Cell, CommitDetail, Graph, GraphRow, Ref, View } from '../types'
import { isBranchNameCandidate, mutatesRepo } from './detect'
import { absTime, fitGraph, relTime, truncate } from './format'
import { layout } from './lanes'
import { DETAIL_FORMAT, LOG_FORMAT, parseDetail, parseLog, UNCOMMITTED, withUncommitted } from './log'

const PANE = 'gitgraph'
const TITLE = 'Git Graph'
const PAGE = 300
const POLL_MS = 5_000
const GIT_TIMEOUT_MS = 15_000
const MAX_FILES = 50
const PALETTE = ['#4fc1ff', '#c586c0', '#ce9178', '#4ec9b0', '#dcdcaa', '#f48771', '#b5cea8', '#d7ba7d']

const EMPTY_GRAPH: Graph = { status: 'idle', rows: [], head: '', branch: '', dirty: 0, hasMore: false }
const DEFAULT_VIEW: View = { scope: 'all', limit: PAGE, selected: null, confirm: null, isOpen: false }

const graphState = atom({ plugin: 'gitgraph', key: 'graph' } as const, EMPTY_GRAPH)
const viewState = atom({ plugin: 'gitgraph', key: 'view' } as const, DEFAULT_VIEW)
const detailState = atom({ plugin: 'gitgraph', key: 'detail' } as const, null as CommitDetail | null)

let generation = 0
let signature = ''
let polling = false

const lines = (text: string) => text.split('\n').filter(l => l.trim() !== '')
const firstLine = (text: string) => lines(text)[0] ?? 'erro desconhecido'

function git($: EngineInterface, args: string[]) {
  return $.process.run(['git', ...args], { timeoutMs: GIT_TIMEOUT_MS })
}

async function repoSignature($: EngineInterface): Promise<string> {
  const outs = await Promise.all([
    git($, ['for-each-ref', '--format=%(objectname) %(refname)']),
    git($, ['rev-parse', 'HEAD']),
    git($, ['status', '--porcelain']),
  ])
  return outs.map(o => o.stdout).join('\0')
}

async function load($: EngineInterface): Promise<void> {
  const gen = ++generation
  const view = await read($, viewState)
  const isCurrent = () => gen === generation
  try {
    const root = await git($, ['rev-parse', '--show-toplevel'])
    if (root.exitCode !== 0) {
      if (isCurrent()) await update($, graphState, () => ({ ...EMPTY_GRAPH, status: 'no-repo' }))
      return
    }
    const [log, head, branch, status, remotes, sig] = await Promise.all([
      git($, ['log', view.scope === 'all' ? '--all' : 'HEAD', '--date-order', `-n${view.limit + 1}`, LOG_FORMAT]),
      git($, ['rev-parse', 'HEAD']),
      git($, ['branch', '--show-current']),
      git($, ['status', '--porcelain']),
      git($, ['remote']),
      repoSignature($),
    ])
    const commits = parseLog(log.exitCode === 0 ? log.stdout : '', lines(remotes.stdout))
    const headHash = head.exitCode === 0 ? head.stdout.trim() : ''
    const dirty = lines(status.stdout).length
    const shown = withUncommitted(commits.slice(0, view.limit), headHash, dirty)
    const cells = layout(shown)
    const rows: GraphRow[] = shown.map((commit, i) => ({ commit, cells: cells[i] ?? [] }))
    if (!isCurrent()) return
    signature = sig
    await update($, graphState, (): Graph => ({
      status: 'ready',
      rows,
      head: headHash,
      branch: branch.stdout.trim(),
      dirty,
      hasMore: commits.length > view.limit,
    }))
  } catch (err) {
    if (isCurrent()) await update($, graphState, (g): Graph => ({ ...g, status: 'error', error: String(err) }))
  }
}

async function poll($: EngineInterface): Promise<void> {
  if (polling || !(await read($, viewState)).isOpen) return
  polling = true
  try {
    if ((await repoSignature($)) !== signature) await load($)
  } finally {
    polling = false
  }
}

async function select($: EngineInterface, hash: string): Promise<void> {
  const selected = (await read($, viewState)).selected === hash ? null : hash
  await update($, viewState, v => ({ ...v, selected, confirm: null }))
  await update($, detailState, () => null)
  if (!selected) return
  const out = await git($, ['show', '--numstat', '--diff-merges=first-parent', DETAIL_FORMAT, selected])
  if ((await read($, viewState)).selected !== selected) return
  await update($, detailState, () => (out.exitCode === 0 ? parseDetail(out.stdout) : null))
}

async function runAction($: EngineInterface, args: string[], done: string): Promise<void> {
  const out = await git($, args)
  $.ui.toast(out.exitCode === 0 ? done : `git ${args[0]} falhou: ${firstLine(out.stderr || out.stdout)}`)
  await update($, viewState, v => ({ ...v, confirm: null }))
  await load($)
}

// Destructive actions run on the second press; the first arms them.
async function confirmed($: EngineInterface, key: string): Promise<boolean> {
  if ((await read($, viewState)).confirm === key) return true
  await update($, viewState, v => ({ ...v, confirm: key }))
  return false
}

async function createBranch($: EngineInterface, hash: string, value: string): Promise<void> {
  const name = value.trim()
  if (!isBranchNameCandidate(name)) {
    $.ui.toast(`Nome de branch inválido: "${truncate(name, 40)}"`)
    return
  }
  const check = await git($, ['check-ref-format', '--branch', name])
  if (check.exitCode !== 0) {
    $.ui.toast(`Nome de branch inválido: "${truncate(name, 40)}"`)
    return
  }
  await runAction($, ['branch', name, hash], `Branch ${name} criada em ${hash.slice(0, 7)}`)
}

function localBranch(refs: Ref[]): string | undefined {
  return refs.find(r => (r.kind === 'head' && r.name !== 'HEAD') || r.kind === 'branch')?.name
}

function groupCells(cells: Cell[]): { text: string; color: number }[] {
  const groups: { text: string; color: number }[] = []
  for (const cell of cells) {
    const last = groups[groups.length - 1]
    if (last && (last.color === cell.color || cell.ch === ' ')) last.text += cell.ch
    else groups.push({ text: cell.ch, color: cell.color })
  }
  return groups
}

function refLabel(ref: Ref): string {
  if (ref.kind === 'head') return ref.name === 'HEAD' ? 'HEAD' : `HEAD → ${ref.name}`
  return ref.kind === 'tag' ? `tag: ${ref.name}` : ref.name
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'gitgraph', description: 'Abre o Git Graph: grafo de commits do repositório' })
    $.clock.every(POLL_MS, () => void poll($))
    return next(e)
  })

  on('command.run', { command: 'gitgraph' }, async $ => {
    await update($, viewState, v => ({ ...v, isOpen: true }))
    await $.ui.open({ id: PANE, title: TITLE })
    await load($)
    const graph = await read($, graphState)
    return { text: graph.status === 'no-repo' ? 'Git Graph: não é um repositório git.' : 'Git Graph aberto.' }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    await update($, viewState, v => ({ ...v, isOpen: false }))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (mutatesRepo(e.command) && (await read($, viewState)).isOpen) await load($)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined
    const graph = await read($, graphState)
    const view = await read($, viewState)
    const detail = await read($, detailState)
    const cols = e.props.bodyColumns
    const now = Math.floor(Date.now() / 1000)

    if (graph.status === 'no-repo') return <Text dimColor>Não é um repositório git.</Text>
    if (graph.status === 'error') return <Text color="error">Erro ao ler o git: {graph.error ?? ''}</Text>

    const graphMax = Math.max(6, Math.min(40, Math.floor(cols / 3)))
    const graphWidth = Math.min(graphMax, Math.max(1, ...graph.rows.map(r => r.cells.length)))
    const showMeta = cols >= 70

    const header = (
      <Box flexDirection="row" gap={1}>
        <Text weight="bold">⎇ {graph.branch || (graph.head ? graph.head.slice(0, 7) : '—')}</Text>
        <Text dimColor>
          {graph.rows.length - (graph.dirty ? 1 : 0)}
          {graph.hasMore ? '+' : ''} commits
        </Text>
        <Button key="scope" hotkey="a" plain dimColor onPress={async () => {
          await update($, viewState, (v): View => ({ ...v, scope: v.scope === 'all' ? 'head' : 'all', limit: PAGE, selected: null }))
          await load($)
        }}>
          {view.scope === 'all' ? 'todas as branches' : 'só HEAD'}
        </Button>
        <Button key="refresh" hotkey="r" plain dimColor onPress={() => load($)}>
          ↻
        </Button>
      </Box>
    )

    if (graph.rows.length === 0)
      return (
        <Box flexDirection="column">
          {header}
          <Text dimColor>{graph.status === 'ready' ? 'Sem commits ainda.' : 'Carregando…'}</Text>
        </Box>
      )

    const rowFor = ({ commit, cells }: GraphRow) => {
      const graphText = groupCells(fitGraph(cells, graphMax)).map(g => (
        <Text color={PALETTE[g.color % PALETTE.length]}>{g.text}</Text>
      ))
      const pad = ' '.repeat(Math.max(0, graphWidth - Math.min(cells.length, graphMax)) + 1)
      if (commit.hash === UNCOMMITTED)
        return (
          <Text>
            {graphText}
            {pad}
            <Text italic dimColor>
              {commit.subject}
            </Text>
          </Text>
        )
      const badges = commit.refs.map(refLabel)
      const meta = showMeta ? ` ${truncate(commit.author, 14)} · ${relTime(now, commit.time)}` : ''
      const room = cols - graphWidth - 1 - 8 - badges.reduce((n, b) => n + b.length + 3, 0) - meta.length
      const isSelected = view.selected === commit.hash
      return (
        <Button key={commit.hash} plain onPress={() => select($, commit.hash)}>
          {graphText}
          {pad}
          <Text dimColor>{commit.hash.slice(0, 7)} </Text>
          {commit.refs.map(ref => (
            <Text
              color={ref.kind === 'head' ? 'success' : ref.kind === 'branch' ? '#89d185' : ref.kind === 'tag' ? '#dcdcaa' : undefined}
              dimColor={ref.kind === 'remote'}
              weight={ref.kind === 'head' ? 'bold' : undefined}
            >
              [{refLabel(ref)}]{' '}
            </Text>
          ))}
          <Text weight={isSelected ? 'bold' : undefined}>{truncate(commit.subject, room)}</Text>
          <Text dimColor>{meta}</Text>
        </Button>
      )
    }

    const detailFor = (row: GraphRow) => {
      const { commit } = row
      const branchName = localBranch(commit.refs)
      const isHead = commit.hash === graph.head
      const checkoutKey = `checkout:${commit.hash}`
      const pickKey = `pick:${commit.hash}`
      return (
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          {detail === null ? (
            <Text dimColor>Carregando detalhes…</Text>
          ) : (
            <Box flexDirection="column">
              <Text>
                <Text dimColor>commit </Text>
                {detail.hash}
              </Text>
              <Text>
                <Text dimColor>autor </Text>
                {detail.author} &lt;{detail.email}&gt;
              </Text>
              <Text>
                <Text dimColor>data </Text>
                {absTime(detail.time)}
              </Text>
              <Text> </Text>
              <Text>{detail.body}</Text>
              <Text> </Text>
              {detail.files.slice(0, MAX_FILES).map(f => (
                <Text>
                  <Text color="#89d185">{f.adds === null ? ' bin' : `+${f.adds}`.padStart(5)}</Text>
                  <Text color="#f48771">{f.dels === null ? '    ' : ` -${f.dels}`.padEnd(6)}</Text> {truncate(f.path, cols - 16)}
                </Text>
              ))}
              {detail.files.length > MAX_FILES && <Text dimColor>… e mais {detail.files.length - MAX_FILES} arquivos</Text>}
            </Box>
          )}
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Button key="copy" hotkey="c" onPress={async pe => {
              const res = await $.ui.copy({ text: commit.hash, surface: pe.surface })
              $.ui.toast(res.isCopied ? `Hash ${commit.hash.slice(0, 7)} copiado` : 'Não foi possível copiar')
            }}>
              Copiar hash
            </Button>
            {!(isHead && branchName === graph.branch && graph.branch) && (
              <Button key="checkout" variant={view.confirm === checkoutKey ? 'primary' : undefined} onPress={async () => {
                if (!(await confirmed($, checkoutKey))) return
                await runAction(
                  $,
                  branchName ? ['checkout', branchName] : ['checkout', '--detach', commit.hash],
                  `Checkout de ${branchName ?? commit.hash.slice(0, 7)} feito`,
                )
              }}>
                {view.confirm === checkoutKey ? 'Confirmar checkout?' : `Checkout ${branchName ?? '(detached)'}`}
              </Button>
            )}
            {!isHead && (
              <Button key="pick" variant={view.confirm === pickKey ? 'primary' : undefined} onPress={async () => {
                if (!(await confirmed($, pickKey))) return
                await runAction($, ['cherry-pick', commit.hash], `Cherry-pick de ${commit.hash.slice(0, 7)} feito`)
              }}>
                {view.confirm === pickKey ? 'Confirmar cherry-pick?' : 'Cherry-pick'}
              </Button>
            )}
          </Box>
          {Input && (
            <Input
              key="new-branch"
              label="Nova branch aqui:"
              placeholder="nome-da-branch"
              submitLabel="criar"
              onSubmit={value => createBranch($, commit.hash, value)}
            />
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {header}
        {graph.rows.map(row => (
          <Box key={`row:${row.commit.hash}`} flexDirection="column">
            {rowFor(row)}
            {view.selected === row.commit.hash && detailFor(row)}
          </Box>
        ))}
        {graph.hasMore && (
          <Button key="more" plain dimColor onPress={async () => {
            await update($, viewState, v => ({ ...v, limit: v.limit + PAGE }))
            await load($)
          }}>
            Carregar mais {PAGE}
          </Button>
        )}
      </Box>
    )
  })
}
