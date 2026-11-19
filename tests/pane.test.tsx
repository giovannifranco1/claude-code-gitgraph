import { expect, mock, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

import { shade } from '../hooks/pilldraw'

type On = Parameters<TestBody>[1]

const US = '\x1f'
const RS = '\x1e'
const M = 'aaaaaaa1'
const A = 'bbbbbbb2'
const B = 'ccccccc3'
const R = 'ddddddd4'

type Fake = {
  isRepo: boolean
  extra: number
  rev: number
  calls: string[][]
  envs: Record<string, string>[]
  headRefs?: string
  // The refs on B, feat's commit (merged into main by M).
  featRefs?: string
  // What `for-each-ref --merged` prints: the remotes merged into a base.
  merged?: string
  // feat's track against its upstream (`ahead 2, behind 1`).
  featTrack?: string
  // The status's change lines (porcelain v2), in place of the one unstaged `src/a.ts`.
  statusLines?: string
  // The commit HEAD is on (M by default), as after a reset.
  head?: string
  remotes?: string[]
  failPush?: string
  failFetch?: boolean
  clock?: ReturnType<typeof mock.clock>
  // Git Flow: which CLI answers `git flow`, the repository's gitflow.* config, the branch
  // checked out, and a flow verb that stops on a conflict.
  flow?: 'next' | 'other' | 'none'
  flowConfig?: string
  branch?: string
  conflictOn?: string
  isConflicted?: boolean
  // Each pane open's `closeOnEscape`, in order.
  opens?: (true | undefined)[]
  // Each pane open's `focus`, in order.
  focuses?: (true | undefined)[]
  // A push or a fetch waits on this, so a test can look at the pane while the action runs.
  hold?: Promise<void>
  // `-c` settings a call carried, as `<verb>: <key=value>`.
  configs: string[]
  // Each call's working directory, in the order of `calls`; what the repo search prints.
  cwds: string[]
  repos?: string
  // The branch each repo's HEAD points at, by repo path; `null` is a detached HEAD.
  heads?: Record<string, string | null>
  // The upstream of each repo's branch, by repo path; none when absent.
  upstreams?: Record<string, string>
  // `for-each-ref --format=%(refname)`: the branch names the git flow init form reads.
  branchRefs?: string
  // No Nerd Font found by the font check.
  hasNoNerdFont?: boolean
  // The status's upstream lines (`# branch.upstream …`, `# branch.ab …`); none when absent.
  sync?: string
  // The mod's store ($.store), kept between sessions.
  store?: Map<string, unknown>
  // What `git stash list` prints (its format); none by default.
  stashes?: string
}

const FLOW_CONFIG = [
  'gitflow.branch.main.type base',
  'gitflow.branch.develop.type base',
  'gitflow.branch.develop.parent main',
  'gitflow.branch.develop.autoupdate true',
  'gitflow.branch.feature.type topic',
  'gitflow.branch.feature.parent develop',
  'gitflow.branch.feature.startpoint develop',
  'gitflow.branch.feature.downstreamstrategy rebase',
  'gitflow.branch.feature.prefix feature/',
  'gitflow.branch.release.type topic',
  'gitflow.branch.release.parent main',
  'gitflow.branch.release.startpoint develop',
  'gitflow.branch.release.prefix release/',
  'gitflow.branch.release.tag true',
  'gitflow.branch.hotfix.type topic',
  'gitflow.branch.hotfix.parent main',
  'gitflow.branch.hotfix.startpoint main',
  'gitflow.branch.hotfix.prefix hotfix/',
  'gitflow.branch.hotfix.tag true',
  '',
].join('\n')

function logOf(fake: Fake): string {
  const row = (...f: string[]) => f.join(US) + RS + '\n'
  let out =
    row(M, `${A} ${B}`, fake.headRefs ?? 'HEAD -> main, origin/main', 'Ana', '1700000000', 'Merge feat') +
    row(A, R, '', 'Ana', '1699990000', 'Work on main') +
    row(B, R, fake.featRefs ?? 'feat, tag: v0.1', 'Bia', '1699980000', 'Work on feat')
  let parent = R
  for (let i = 0; i < fake.extra; i++) {
    const hash = `e${String(i).padStart(7, '0')}`
    out += row(parent, hash, '', 'Bot', '1600000000', `filler ${i}`)
    parent = hash
  }
  return out + row(parent, '', '', 'Ana', '1600000000', 'Initial')
}

function answer(fake: Fake, raw: readonly string[], cwd = '.') {
  // `git -c key=value …`: each config is kept apart, the call recorded without them.
  const pairs: string[] = []
  let at = 1
  while (raw[0] === 'git' && raw[at] === '-c') {
    pairs.push(raw[at + 1] ?? '')
    at += 2
  }
  const argv = pairs.length ? ['git', ...raw.slice(at)] : raw
  for (const pair of pairs) fake.configs.push(`${argv[1]}: ${pair}`)
  fake.calls.push([...argv])
  fake.cwds.push(cwd)
  const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  const fail = (stderr: string) => ({ ...ok(), exitCode: 128, stderr })
  const [, verb, ...rest] = argv
  if (argv[0] === 'find') return ok(fake.repos ?? '')
  if (argv[0] === 'sh') return fake.hasNoNerdFont ? { ...ok(), exitCode: 1 } : ok()
  // `isRepo: false` is the session folder only: the repos found below it are repos.
  if (!fake.isRepo && cwd === '.') return fail('fatal: not a git repository')
  switch (verb) {
    case 'symbolic-ref': {
      const head = fake.heads?.[cwd] === undefined ? (fake.branch ?? 'main') : fake.heads[cwd]
      return head === null ? { ...ok(), exitCode: 1 } : ok(`${head}\n`)
    }
    case 'for-each-ref':
      if (rest[0]?.startsWith('--format=%(upstream')) return ok(`${fake.upstreams?.[cwd] ?? ''}\0\n`)
      if (rest[0] === '--format=%(refname)') return ok(fake.branchRefs ?? 'refs/heads/main\nrefs/heads/feat\n')
      if (rest.some(a => a.startsWith('--merged='))) return ok(fake.merged ?? '')
      if (rest[0]?.startsWith('--format=%(refname:short)')) return ok(`main\t\nfeat\t${fake.featTrack ?? ''}\n`)
      return ok(`${M} refs/heads/main\n${B} refs/heads/feat\n${(fake.remotes ?? ['origin']).map(r => `${M} refs/remotes/${r}/main\n`).join('')}rev${fake.rev} refs/heads/moving\n`)
    case 'log':
      return ok(logOf(fake))
    case 'status':
      return ok(`# branch.oid ${fake.head ?? M}\n# branch.head ${fake.branch ?? 'main'}\n${fake.sync ?? ''}${fake.statusLines ?? '1 .M N... 100644 100644 100644 x y src/a.ts\n'}${fake.isConflicted ? 'u UU N... 100644 100644 100644 100644 a b c src/b.ts\n' : ''}`)
    case 'flow': {
      const cli = fake.flow ?? 'next'
      if (cli === 'none') return { ...fail("git: 'flow' is not a git command."), exitCode: 1 }
      if (rest[0] === 'version') return ok(cli === 'next' ? 'git-flow-next version 1.1.0\n' : '1.12.3 (AVH Edition)\n')
      if (rest.includes('--continue') || rest.includes('--abort')) fake.isConflicted = false
      else if (rest[1] === fake.conflictOn) {
        fake.isConflicted = true
        return fail('CONFLICT (content): Merge conflict in src/b.ts')
      }
      return ok()
    }
    case 'stash':
      if (rest[0] === 'list') return ok(fake.stashes ?? '')
      if (rest[0] === 'show') return ok('2\t1\tsrc/stashed.ts\n')
      return ok()
    case 'tag':
      return ok('1.0.0\n1.0.1\n')
    case 'show':
      return ok([B, 'Bia', 'bia@x.io', '1699980000', 'Work on feat\n\nDetails here\n'].join(US) + RS + '\n\n3\t1\tsrc/feat.ts\n')
    case 'fetch':
      return fake.failFetch ? fail('fatal: unable to access remote') : ok()
    case 'push':
      return rest.includes(fake.failPush ?? '\0') ? fail('fatal: could not read Username') : ok()
    case 'config': {
      if (rest[0] === '--get-regexp') return fake.flowConfig === '' ? fail('') : ok(fake.flowConfig ?? FLOW_CONFIG)
      const values: Record<string, string> = { '--local user.name': 'Gio Local', '--global user.name': 'Gio', '--global user.email': 'gio@x.io' }
      return rest.includes('--get') ? ok(`${values[`${rest[0]} ${rest[2]}`] ?? ''}\n`) : ok()
    }
    case 'remote':
      if (rest.length === 0) return ok((fake.remotes ?? ['origin']).map(r => `${r}\n`).join(''))
      return rest[0] === '-v' ? ok((fake.remotes ?? ['origin']).map(r => `${r}\thttps://git.example/${r}.git (fetch)\n${r}\thttps://git.example/${r}.git (push)\n`).join('')) : ok()
    case 'rev-parse':
      return rest[2] === `${'dead'}^{commit}` ? fail('') : ok(`${M}\n`)
    case 'check-ref-format':
      return /^[a-z][a-z0-9./-]*$/.test(rest[1] ?? '') ? ok(`${rest[1]}\n`) : fail('fatal: not a valid branch name')
    default:
      return ok()
  }
}

async function setup($: Engine, on: On, fake: Fake, copied: string[] = [], toasts: string[] = []) {
  fake.clock = mock.clock(on)
  on('command.register', () => ({ value: { command: 'gitgraph' } }))
  on('ui.open', (_, e) => {
    fake.opens?.push(e.closeOnEscape)
    fake.focuses?.push(e.focus)
    return { value: { isPlaced: true } }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('process.run', async (_, e) => {
    fake.envs.push({ ...(e.init?.env ?? {}) })
    if (fake.hold && (e.argv.includes('push') || e.argv.includes('fetch'))) await fake.hold
    return { value: answer(fake, e.argv, e.init?.cwd) }
  })
  const store = (fake.store ??= new Map())
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('command.run', () => ({ text: '' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  return $.command.run({ command: 'gitgraph', args: '' } as never)
}

const pane = <S extends 'terminal' | 'desktop' | 'vscode'>(surface: S, bodyColumns = 100, offset = 0) =>
  ({
    plugin: 'gitgraph',
    component: 'Pane',
    requestId: 'gitgraph',
    surface,
    props: {
      title: 'Git Graph',
      isFocused: false,
      bodyColumns,
      placement: 'dock',
      scroll: { offset, bodyRows: 40 },
      view: {},
    },
  }) as const

const newFake = (over: Partial<Fake> = {}): Fake => ({ isRepo: true, extra: 0, rev: 0, calls: [], envs: [], configs: [], cwds: [], ...over })
const gitCalls = (fake: Fake) => fake.calls.filter(c => c[0] === 'git')
const logCalls = (fake: Fake) => gitCalls(fake).filter(c => c[1] === 'log')

test('GG-01 /gitgraph opens the pane and draws commits, refs and the graph', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    expect((await ui.find({ type: 'Text', text: /Merge feat/ }))?.text).toContain('Merge feat')
    const head = await ui.find({ type: 'Client', key: `pill:${M}:0` })
    // the checked-out branch: a pin before its name, in its own color; then its remote
    const segments = (head?.props.props as { segments: { text: string; bg: string; isBold?: boolean; icon?: { text: string; fg: string } }[] }).segments
    expect(segments.map(g => `${g.icon?.text ?? ''}${g.text}`)).toEqual(['\uf058  main', 'origin'])
    // in the dark shade of the lane, as the remote's segment
    expect(segments[0]?.icon?.fg).toBe(segments[1]?.bg)
    expect(segments[0]?.isBold).toBe(true)
    // a tag: its icon on the tag color (the icon in its dark shade), then the version on that shade
    const tag = (await ui.find({ type: 'Client', key: `pill:${B}:1` }))?.props.props as { segments: { text: string; bg: string; icon?: { text: string; fg: string } }[] }
    expect(tag.segments.map(g => `${g.icon?.text ?? ''}${g.text}`)).toEqual(['\uf02b', 'v0.1'])
    expect(tag.segments[0]?.icon?.fg).toBe(tag.segments[1]?.bg)
    expect(await ui.find({ type: 'Text', text: /─╮/ })).toBeDefined()
    await ui.unmount()
  }
  expect(logCalls(fake)[0]).toContain('--all')
})

test('MG-01 the text of a merge commit (subject, author, hash) is gray, as Git Graph in VS Code does; others are not', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  expect((await ui.find({ type: 'Text', text: /^Merge feat/ }))?.props.color).toBe('#808080')
  // the terminal draws a Button's children in the Button's style: the row's Button is dim too
  expect((await ui.find({ type: 'Button', key: M }))?.props.dimColor).toBe(true)
  expect((await ui.find({ type: 'Button', key: A }))?.props.dimColor).toBeFalsy()
  expect((await ui.find({ type: 'Text', text: /^Work on main/ }))?.props.color).toBeUndefined()
  const metas = await ui.findAll({ type: 'Text', text: /Ana|aaaaaaa|bbbbbbb/ })
  // author and hash are gray on every row, merge or not
  expect(metas.length).toBeGreaterThan(1)
  expect(metas.every(t => t.props.color === '#808080')).toBe(true)
  await ui.unmount()
})

test('RC-01 a remote branch away from its local one has the dark shade of its color; a gone one stays gray', async ($, on) => {
  await setup($, on, newFake({ headRefs: 'origin/feat, origin/old' }))
  const ui = await $.ui.mount(pane('terminal'))
  const bg = async (key: string) => ((await ui.find({ type: 'Client', key }))?.props.props as { segments: { bg: string }[] }).segments[0]?.bg
  const labels = async (key: string) => ((await ui.find({ type: 'Client', key }))?.props.props as { segments: { text: string }[] }).segments.map(g => g.text).join('')
  expect(await labels(`pill:${M}:0`)).toContain('origin/feat')
  // feat's own pill is on B, in B's lane color: the remote one is its dark shade, light text
  expect(await bg(`pill:${M}:0`)).toBe(shade((await bg(`pill:${B}:0`))!, 0.45))
  expect(((await ui.find({ type: 'Client', key: `pill:${M}:0` }))?.props.props as { segments: { fg: string }[] }).segments[0]?.fg).toBe('#f0f0f0')
  expect(await bg(`pill:${M}:0`)).not.toBe('#9d9d9d')
  expect(await labels(`pill:${M}:1`)).toContain('origin/old')
  expect(await bg(`pill:${M}:1`)).toBe('#9d9d9d')
  await ui.unmount()
})

test('GG-24 a merged branch with its remote on its commit is one gone pill: ghost and name on gray, the remote on its dark shade', async ($, on) => {
  await setup($, on, newFake({ featRefs: 'feat, origin/feat', merged: `${B} refs/remotes/origin/feat\n` }))
  const ui = await $.ui.mount(pane('terminal'))
  const props = (await ui.find({ type: 'Client', key: `pill:${B}:0` }))?.props.props as { segments: { text: string; bg: string; icon?: { text: string } }[] }
  expect(props.segments.map(g => g.text)).toEqual(['  feat', 'origin'])
  expect(props.segments[0]?.icon?.text).toMatch(/^(◌|\u{f02a0})$/u)
  expect(props.segments[0]?.bg).toBe('#9d9d9d')
  // drawn as a checked-out pill: ghost and name on the gray, the remote on its dark shade
  expect(props.segments[1]?.bg).toBe('#474747')
  expect(await ui.find({ type: 'Client', key: `pill:${B}:1` })).toBeUndefined()
  await ui.unmount()
})

test('TG-01 a tag is drawn in the color of the main branch', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  const segs = async (key: string) => ((await ui.find({ type: 'Client', key }))?.props.props as { segments: { text: string; bg: string }[] }).segments
  // v0.1 is on B (feat's lane); main is on M
  const tag = await segs(`pill:${B}:1`)
  expect(tag.map(g => g.text)).toContain('v0.1')
  expect(tag[0]?.bg).toBe((await segs(`pill:${M}:0`))[0]?.bg)
  expect(tag[0]?.bg).not.toBe((await segs(`pill:${B}:0`))[0]?.bg)
  await ui.unmount()
})

test('DM-01 secondary text is a set gray, never dimColor (faint, which many terminals barely draw)', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  const dim = async () => (await ui.findAll({ type: 'Text' })).filter(t => t.props.dimColor).map(t => t.text)
  expect(await dim()).toEqual([])
  await ui.press({ key: B })
  expect(await dim()).toEqual([])
  for (const screen of ['settings', 'changelog']) {
    await ui.press({ key: screen })
    expect(await dim()).toEqual([])
    await ui.press({ key: `${screen}-back` })
  }
  await ui.unmount()
})

test('GG-24 the checked-out branch, merged, keeps its check: gray, the check where the ghost would be', async ($, on) => {
  // feat checked out, merged into main (by M), its remote with it
  await setup($, on, newFake({ featRefs: 'HEAD -> feat, origin/feat', branch: 'feat', merged: `${B} refs/remotes/origin/feat\n` }))
  const ui = await $.ui.mount(pane('terminal'))
  const props = (await ui.find({ type: 'Client', key: `pill:${B}:0` }))?.props.props as { segments: { text: string; bg: string; icon?: { text: string } }[] }
  expect(props.segments.map(g => g.text)).toEqual(['  feat', 'origin'])
  expect(props.segments[0]?.icon?.text).toMatch(/^(✔|\u{f058})$/u)
  expect(props.segments[0]?.bg).toBe('#9d9d9d')
  await ui.unmount()
})

test('BS-01 a branch ahead of or behind its upstream says so on its badge', async ($, on) => {
  await setup($, on, newFake({ featTrack: 'ahead 2, behind 1' }))
  const ui = await $.ui.mount(pane('terminal'))
  const segments = ((await ui.find({ type: 'Client', key: `pill:${B}:0` }))?.props.props as { segments: { text: string }[] }).segments
  expect(segments.map(g => g.text)).toEqual(['feat', '↑2 ↓1'])
  await ui.unmount()
})

const CHANGELOG = `# Changelog

## [1.6.0] - 2026-11-18

### Adicionado

- Changelog no painel.

## [1.5.1] - 2026-11-10

### Corrigido

- Coluna de branch.
`

function mockFiles(on: On, files: Record<string, string>) {
  on('fs.read', (_, e) => {
    const text = Object.entries(files).find(([f]) => e.path.endsWith(f))?.[1]
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
}

test('CL-02 the changelog icon swaps the graph for the versions, the installed one marked', async ($, on) => {
  mockFiles(on, { '/CHANGELOG.md': CHANGELOG, '/.claude-plugin/plugin.json': '{ "version": "1.5.1" }' })
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'changelog' })
  expect(await ui.find({ type: 'Text', text: /Merge feat/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /^v1\.6\.0 · 2026-11-18$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /• Changelog no painel\./ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Adicionado/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /your version/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^v1\.5\.1 · 2026-11-10 · your version$/ })).toBeDefined()
  await ui.press({ key: 'changelog-back' })
  expect(await ui.find({ type: 'Text', text: /Merge feat/ })).toBeDefined()
  await ui.unmount()
})

// The test engine cannot raise the person's close; `dismissModal` (what that close does with
// a modal open) is covered in dismiss.test.ts.
test('ESC-01 the pane takes Escape as its close only while a modal is open', async ($, on) => {
  mockFiles(on, { '/CHANGELOG.md': CHANGELOG, '/.claude-plugin/plugin.json': '{ "version": "1.5.1" }' })
  const opens: (true | undefined)[] = []
  const focuses: (true | undefined)[] = []
  await setup($, on, newFake({ opens, focuses }))
  const ui = await $.ui.mount(pane('terminal'))
  expect(opens).toEqual([undefined])
  await ui.press({ key: B })
  expect(opens).toEqual([undefined])
  await ui.press({ key: 'refmenu-0' })
  expect(opens.at(-1)).toBe(true)
  // the pane asks for the keyboard with it, so Escape (and Enter) reach the dialog
  expect(focuses.at(-1)).toBe(true)
  await ui.press({ key: 'menu-close' })
  expect(opens.at(-1)).toBeUndefined()
  expect(focuses.at(-1)).toBeUndefined()
  await ui.press({ key: 'changelog' })
  expect(opens.at(-1)).toBe(true)
  await ui.press({ key: 'changelog-back' })
  expect(opens.at(-1)).toBeUndefined()
  expect(opens).toHaveLength(5)
  await ui.unmount()
})

test('CL-02 without a readable CHANGELOG.md the screen says so', async ($, on) => {
  mockFiles(on, {})
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'changelog' })
  expect(await ui.find({ type: 'Text', text: /Could not read the mod's CHANGELOG\.md/ })).toBeDefined()
  await ui.unmount()
})

test('GG-02 outside a repository the pane says so', async ($, on) => {
  await setup($, on, newFake({ isRepo: false }))
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Text', text: /Not a git repository/ })).toBeDefined()
  await ui.unmount()
})

test('GG-07 uncommitted changes show as the first row', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Text', text: /Uncommitted changes \(1\)/ })).toBeDefined()
  await ui.unmount()
})

test('ST-01 the uncommitted changes row opens a stash, with an optional message, untracked files too', async ($, on) => {
  const toasts: string[] = []
  const fake = newFake()
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Input', key: 'stash-message' })).toBeUndefined()
  await ui.press({ key: 'uncommitted' })
  // no `git show` for a commit that is not one
  expect(fake.calls.some(c => c[1] === 'show' && c.includes('*'))).toBe(false)
  // the actions first; the stash form only once picked
  expect(await ui.find({ type: 'Input', key: 'stash-message' })).toBeUndefined()
  await ui.press({ key: 'uncommitted-stash' })
  expect(await ui.find({ type: 'Input', key: 'stash-message' })).toBeDefined()
  await ui.input({ key: 'stash-message', text: 'wip: header' })
  expect(callOf(fake, ['stash', 'push', '--include-untracked', '-m', 'wip: header'])).toBeGreaterThan(-1)
  expect(toasts).toContain('Stashed the changes')
  // again, no message: git names the stash itself
  await ui.press({ key: 'uncommitted' })
  await ui.press({ key: 'uncommitted-stash' })
  await ui.input({ key: 'stash-message', text: '' })
  expect(callOf(fake, ['stash', 'push', '--include-untracked'])).toBeGreaterThan(-1)
  await ui.unmount()
})

test('RS-01 the uncommitted changes reset, mixed or hard, once the mode is picked', async ($, on) => {
  const toasts: string[] = []
  const fake = newFake()
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'uncommitted' })
  await ui.press({ key: 'uncommitted-reset' })
  // opening the form runs nothing: picking the mode is the confirmation
  expect(fake.calls.some(c => c[1] === 'reset')).toBe(false)
  expect(await ui.find({ type: 'Button', key: 'reset-mixed' })).toBeDefined()
  await ui.press({ key: 'reset-hard' })
  expect(callOf(fake, ['reset', '--hard'])).toBeGreaterThan(-1)
  expect(toasts).toContain('Discarded the changes')
  // again, mixed: only unstaged
  await ui.press({ key: 'uncommitted' })
  await ui.press({ key: 'uncommitted-reset' })
  await ui.press({ key: 'reset-mixed' })
  expect(callOf(fake, ['reset'])).toBeGreaterThan(-1)
  expect(toasts).toContain('Unstaged the changes')
  // cancel goes back to the actions
  await ui.press({ key: 'uncommitted' })
  await ui.press({ key: 'uncommitted-reset' })
  await ui.press({ key: 'reset-cancel' })
  expect(await ui.find({ type: 'Button', key: 'reset-hard' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'uncommitted-reset' })).toBeDefined()
  await ui.unmount()
})

const S = 'eeeeeee5'
const STASH = 'stash@{0}'
const STASHES = [S, `${A} fffffff6`, '1699995000', 'stash@{0}', 'On main: wip header'].join(US) + RS + '\n'

test('SH-01 each stash is a row off its base, its name in a badge; the log leaves refs/stash out', async ($, on) => {
  const fake = newFake({ stashes: STASHES })
  await setup($, on, fake)
  const log = logCalls(fake)[0] ?? []
  expect(log.indexOf('--exclude=refs/stash')).toBe(log.indexOf('--all') - 1)
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Button', key: STASH })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /stash@\{0\}/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /◇/ })).toBeDefined()
  await ui.unmount()
})

test('SH-02 a stash row opens its files and actions: apply, pop, and drop pressed twice', async ($, on) => {
  const toasts: string[] = []
  const fake = newFake({ stashes: STASHES })
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: STASH })
  // its files come from the stash, untracked ones too; it is no commit to `git show`
  expect(callOf(fake, ['stash', 'show', '--numstat', '--include-untracked', 'stash@{0}'])).toBeGreaterThan(-1)
  expect(fake.calls.some(c => c[1] === 'show' && c.includes(S))).toBe(false)
  expect(await ui.find({ type: 'Text', text: /src\/stashed\.ts/ })).toBeDefined()
  await ui.press({ key: 'stash-apply' })
  expect(callOf(fake, ['stash', 'apply', 'stash@{0}'])).toBeGreaterThan(-1)
  expect(toasts).toContain('Applied stash@{0}')
  await ui.press({ key: STASH })
  await ui.press({ key: 'stash-pop' })
  expect(callOf(fake, ['stash', 'pop', 'stash@{0}'])).toBeGreaterThan(-1)
  expect(toasts).toContain('Popped stash@{0}')
  // drop: the first press arms it, the second drops
  await ui.press({ key: STASH })
  await ui.press({ key: 'stash-drop' })
  expect(callOf(fake, ['stash', 'drop', 'stash@{0}'])).toBe(-1)
  await ui.press({ key: 'stash-drop' })
  expect(callOf(fake, ['stash', 'drop', 'stash@{0}'])).toBeGreaterThan(-1)
  expect(toasts).toContain('Dropped stash@{0}')
  await ui.unmount()
})

test('CM-01 the uncommitted changes commit with the message Claude suggests from the diff, shown whole, not edited', async ($, on) => {
  const toasts: string[] = []
  const asked: { model: string; prompt: string }[] = []
  on('model.complete', (_, e) => {
    asked.push({ model: e.model, prompt: e.prompt })
    return { value: { isAnswered: true, text: '```\nfeat(graph): add the commit box\n```', usage: {} } } as never
  })
  const fake = newFake()
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'uncommitted' })
  // the files first; Next asks Claude at once
  await ui.press({ key: 'uncommitted-commit' })
  expect(asked).toHaveLength(0)
  await ui.press({ key: 'commit-next' })
  expect(asked).toHaveLength(1)
  // nothing is committed by a suggestion: it is shown, as text, no field to edit
  expect(asked[0]?.model).toBe('haiku')
  expect(asked[0]?.prompt).toContain('Recent commit subjects')
  expect(fake.calls.some(c => c[1] === 'diff' && c.includes('HEAD'))).toBe(true)
  expect(await ui.find({ type: 'Input', key: 'commit-message' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'feat(graph): add the commit box' })).toBeDefined()
  expect(fake.calls.some(c => c[1] === 'commit')).toBe(false)
  // another version on request
  expect((await ui.find({ type: 'Button', key: 'commit-suggest' }))?.text).toContain('suggest again')
  await ui.press({ key: 'commit-suggest' })
  expect(asked).toHaveLength(2)
  // cancel keeps nothing: opened again, Claude writes a new one
  await ui.press({ key: 'commit-cancel' })
  await ui.press({ key: 'uncommitted-commit' })
  await ui.press({ key: 'commit-next' })
  expect(asked).toHaveLength(3)
  // Commit, the main button (Enter): every change, with the message shown
  expect((await ui.find({ type: 'Button', key: 'commit-run' }))?.props.autoFocus).toBe(true)
  await ui.press({ key: 'commit-run' })
  expect(callOf(fake, ['add', '-A', '--', 'src/a.ts'])).toBeGreaterThan(-1)
  expect(callOf(fake, ['commit', '-m', 'feat(graph): add the commit box', '--', 'src/a.ts'])).toBeGreaterThan(callOf(fake, ['add', '-A', '--', 'src/a.ts']))
  expect(toasts).toContain('Committed: feat(graph): add the commit box')
  await ui.unmount()
})

test('CM-01 without a suggestion there is nothing to commit, only to ask again', async ($, on) => {
  const toasts: string[] = []
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'empty-reply' } }) as never)
  const fake = newFake()
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'uncommitted' })
  await ui.press({ key: 'uncommitted-commit' })
  await ui.press({ key: 'commit-next' })
  expect(toasts).toContain('Claude could not suggest a message')
  await ui.press({ key: 'commit-run' })
  expect(fake.calls.some(c => c[1] === 'commit')).toBe(false)
  expect(toasts.at(-1)).toMatch(/suggest again/)
  await ui.unmount()
})

test('CM-02 the commit picks its files first, all at once or one by one; the row counts the staged in red', async ($, on) => {
  const asked: string[] = []
  on('model.complete', (_, e) => {
    asked.push(e.prompt)
    return { value: { isAnswered: true, text: 'fix(graph): x', usage: {} } } as never
  })
  const statusLines = [
    '1 M. N... 100644 100644 100644 a1 b1 staged.ts',
    '1 .M N... 100644 100644 100644 a2 b2 edited.ts',
    '? new.md',
    '',
  ].join('\n')
  const fake = newFake({ statusLines })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  const staged = await ui.find({ type: 'Text', text: /^Staged \(1\)$/ })
  expect(staged?.props.color).toBe('error')
  await ui.press({ key: 'uncommitted' })
  await ui.press({ key: 'uncommitted-commit' })
  // every file listed with what changed, all chosen to start with
  const file = async (i: number) => (await ui.find({ type: 'Button', key: `commit-file-${i}` }))?.text ?? ''
  expect(await file(0)).toMatch(/☑ M +staged\.ts/)
  expect(await file(1)).toMatch(/☑ M +edited\.ts/)
  expect(await file(2)).toMatch(/☑ A +new\.md/)
  expect((await ui.find({ type: 'Button', key: 'commit-all' }))?.text).toMatch(/☑ Stage all changes \(3\)/)
  // all off: Next does nothing; one back on, then another
  await ui.press({ key: 'commit-all' })
  expect(await file(0)).toMatch(/☐/)
  await ui.press({ key: 'commit-next' })
  expect(asked).toHaveLength(0)
  await ui.press({ key: 'commit-file-1' })
  await ui.press({ key: 'commit-file-2' })
  expect((await ui.find({ type: 'Button', key: 'commit-all' }))?.text).toMatch(/☐ Stage all changes/)
  await ui.press({ key: 'commit-next' })
  // Claude reads those files alone
  expect(asked).toHaveLength(1)
  expect(fake.calls.some(c => c.join(' ') === 'git diff HEAD -- edited.ts new.md')).toBe(true)
  expect(asked[0]).toContain('new.md')
  // back to the files, the choice kept; then the commit, of those files alone
  await ui.press({ key: 'commit-back' })
  expect(await file(0)).toMatch(/☐/)
  expect(await file(1)).toMatch(/☑/)
  await ui.press({ key: 'commit-next' })
  await ui.press({ key: 'commit-run' })
  expect(callOf(fake, ['add', '-A', '--', 'edited.ts', 'new.md'])).toBeGreaterThan(-1)
  expect(callOf(fake, ['commit', '-m', 'fix(graph): x', '--', 'edited.ts', 'new.md'])).toBeGreaterThan(-1)
  await ui.unmount()
})

test('ST-02 the uncommitted changes open their actions in a dialog, each action its own dialog, as a ref menu', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'uncommitted' })
  expect(await ui.find({ key: 'uncommitted-dialog' })).toBeDefined()
  // the actions, no form yet
  expect(await ui.find({ type: 'Button', key: 'uncommitted-commit' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'uncommitted-stash' })).toBeDefined()
  expect(await ui.find({ type: 'Input', key: 'commit-message' })).toBeUndefined()
  // commit opens its own dialog, in place of the list; cancel goes back to the list
  await ui.press({ key: 'uncommitted-commit' })
  await ui.press({ key: 'commit-next' })
  expect(await ui.find({ key: 'commit-message' })).toBeDefined()
  expect(await ui.find({ type: 'Input', key: 'stash-message' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'uncommitted-stash' })).toBeUndefined()
  // the message whole: three lines of text in a wider dialog, as tall as they need
  // (title, blank, the message's 3, blank, the buttons, and the border's 2)
  const box = await ui.find({ key: 'uncommitted-dialog' })
  expect(box?.props.height).toBe(1 + 1 + 3 + 1 + 1 + 2)
  expect(box?.props.width).toBeGreaterThan(60)
  await ui.press({ key: 'commit-cancel' })
  expect(await ui.find({ type: 'Button', key: 'uncommitted-stash' })).toBeDefined()
  // stash too
  await ui.press({ key: 'uncommitted-stash' })
  expect(await ui.find({ type: 'Input', key: 'stash-message' })).toBeDefined()
  expect(await ui.find({ key: 'commit-message' })).toBeUndefined()
  await ui.press({ key: 'stash-cancel' })
  await ui.press({ key: 'uncommitted-close' })
  expect(await ui.find({ key: 'uncommitted-dialog' })).toBeUndefined()
  await ui.unmount()
})

test('GG-05 SC-01 the scope toggle reloads with the local branches only', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  expect(logCalls(fake).at(-1)).toContain('--all')
  await ui.press({ key: 'scope' })
  const last = logCalls(fake).at(-1) ?? []
  expect(last).toContain('--branches')
  expect(last).toContain('HEAD')
  expect(last).not.toContain('--all')
  await ui.unmount()
})

test('GG-06 past 300 commits a load-more button fetches the next page', async ($, on) => {
  const fake = newFake({ extra: 300 })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('desktop'))
  await ui.press({ key: 'more' })
  expect(logCalls(fake).at(-1)).toContain('-n601')
  await ui.unmount()
})

test('GG-08 pressing a commit expands its details and files', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: B })
  expect(await ui.find({ type: 'Text', text: /bia@x\.io/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /src\/feat\.ts/ })).toBeDefined()
  await ui.press({ key: B })
  expect(await ui.find({ type: 'Text', text: /bia@x\.io/ })).toBeUndefined()
  await ui.unmount()
})

test('GG-09 after a Bash call the pane reloads only if the repository changed', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const before = logCalls(fake).length
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect(logCalls(fake).length).toBe(before)
  fake.rev++ // what `git commit` does to the refs
  await $.tool.call({ tool: 'Bash', command: 'git add . && git commit -m x' })
  expect(logCalls(fake).length).toBe(before + 1)
})

test('GG-09 a load runs git in one parallel batch of five processes, then the merged remotes query', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const flow = ['flow', 'config', 'tag', 'remote']
  const calls = gitCalls(fake).filter(c => !flow.includes(c[1] ?? ''))
  // log, status, the refs, the branches' tracks and the stashes at once; then the merged remotes
  expect(calls.slice(0, 5).map(c => c[1] ?? '').sort()).toEqual(['for-each-ref', 'for-each-ref', 'log', 'stash', 'status'])
  expect(calls[5]).toContain('--merged=refs/heads/main')
  expect(calls).toHaveLength(6)
  // a reload over the same refs and bases (the scope toggle) does not ask again
  const ui = await $.ui.mount(pane('terminal'))
  const asked = () => gitCalls(fake).filter(c => c.some(a => a.startsWith('--merged='))).length
  // (the first reload may ask again: git flow's bases arrive after the first load)
  await ui.press({ key: 'scope' })
  const before = asked()
  await ui.press({ key: 'scope' })
  expect(asked()).toBe(before)
  await ui.unmount()
})

test('GG-19 the commit actions sit behind an icon: closed, none show; open, a list in groups, reset last', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal', 50))
  await ui.press({ key: B })
  for (const key of ['copy', 'checkout', 'pick', 'reset']) expect(await ui.find({ type: 'Button', key })).toBeUndefined()
  expect(await ui.find({ type: 'Input', key: 'new-branch' })).toBeDefined()
  await ui.press({ key: 'detail-actions-toggle' })
  for (const key of ['copy', 'checkout', 'pick', 'reset']) expect(await ui.find({ type: 'Box', key: `detail-row-${key}` })).toBeDefined()
  expect(await ui.find({ type: 'Box', key: 'detail-gap-2' })).toBeDefined()
  await ui.press({ key: 'reset' })
  expect((await ui.find({ type: 'Button', key: 'reset' }))?.text).toMatch(/^Confirm: Reset main here \(soft\)\? ◂$/)
  // another commit opens with the list closed
  await ui.press({ key: M })
  expect(await ui.find({ type: 'Button', key: 'copy' })).toBeUndefined()
  await ui.unmount()
})

test('GG-10 checkout and cherry-pick run only on the second press', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: B })
  await ui.press({ key: 'detail-actions-toggle' })
  await ui.press({ key: 'checkout' })
  expect(fake.calls.some(c => c[1] === 'checkout')).toBe(false)
  await ui.press({ key: 'checkout' })
  expect(fake.calls).toContainEqual(['git', 'checkout', 'feat'])
  // an action run closes the list, as it closes the branch menu
  expect(await ui.find({ type: 'Button', key: 'pick' })).toBeUndefined()
  await ui.press({ key: 'detail-actions-toggle' })
  await ui.press({ key: 'pick' })
  await ui.press({ key: 'pick' })
  expect(fake.calls).toContainEqual(['git', 'cherry-pick', B])
  await ui.unmount()
})

test('GG-19 a soft reset of the current branch to a commit runs on the second press', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: B })
  await ui.press({ key: 'detail-actions-toggle' })
  await ui.press({ key: 'reset' })
  expect(fake.calls.some(c => c[1] === 'reset')).toBe(false)
  await ui.press({ key: 'reset' })
  expect(fake.calls).toContainEqual(['git', 'reset', '--soft', B])
  await ui.unmount()
})

test('GG-19 the commit HEAD is on offers no reset', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: M })
  await ui.press({ key: 'detail-actions-toggle' })
  expect(await ui.find({ key: 'reset' })).toBeUndefined()
  await ui.unmount()
})

test('GG-19 after a reset, the commit left behind (kept by its pushed ref) resets the branch back', async ($, on) => {
  // HEAD moved back to A; M is still drawn through origin/main.
  const fake = newFake({ head: A, headRefs: 'origin/main' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: M })
  await ui.press({ key: 'detail-actions-toggle' })
  await ui.press({ key: 'reset' })
  await ui.press({ key: 'reset' })
  expect(fake.calls).toContainEqual(['git', 'reset', '--soft', M])
  await ui.unmount()
})

test('GG-10 a new branch name is validated and passed as its own argument', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: B })
  // the field draws its own colon after the label
  expect((await ui.find({ type: 'Input', key: 'new-branch' }))?.props.label).toBe('New branch here')
  await ui.input({ key: 'new-branch', text: '-D' })
  await ui.input({ key: 'new-branch', text: 'Bad Name' })
  await ui.input({ key: 'new-branch', text: 'x$(rm)' })
  expect(fake.calls.filter(c => c[1] === 'branch' && c[2] !== '--show-current')).toEqual([])
  await ui.input({ key: 'new-branch', text: 'nova-feature' })
  expect(fake.calls).toContainEqual(['git', 'check-ref-format', '--branch', 'nova-feature'])
  expect(fake.calls).toContainEqual(['git', 'branch', 'nova-feature', B])
  await ui.unmount()
})

test('GG-10 copy hash puts the full hash on the clipboard', async ($, on) => {
  const copied: string[] = []
  const fake = newFake()
  await setup($, on, fake, copied)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: B })
  await ui.press({ key: 'detail-actions-toggle' })
  await ui.press({ key: 'copy' })
  expect(copied).toEqual([B])
  await ui.unmount()
})

const callOf = (fake: Fake, argv: string[]) => fake.calls.findIndex(c => c.join(' ') === ['git', ...argv].join(' '))

test('GG-11 pills are rounded with a Nerd Font and fall back to text pills without Client', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  expect((await ui.find({ type: 'Client', key: `pill:${M}:0` }))?.props.props).toMatchObject({ isRound: true })
  await ui.unmount()
  const vs = await $.ui.mount(pane('vscode'))
  // the graph's main badge (the header's has no remote)
  expect((await vs.findAll({ type: 'Text', text: /\uf058 +main/ })).some(t => t.text.includes('origin'))).toBe(true)
  expect(await vs.find({ type: 'Text', text: /v0\.1/ })).toBeDefined()
  expect(await vs.find({ type: 'Text', text: /^\ue0b4/ })).toBeDefined()
  await vs.unmount()
})

test('EN-01 a dialog starts its focus on its main button, so Enter runs it: push, delete', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  await ui.press({ key: 'menu-push' })
  expect((await ui.find({ type: 'Button', key: 'push-run' }))?.props.autoFocus).toBe(true)
  await ui.press({ key: 'push-cancel' })
  await ui.press({ key: 'menu-delete' })
  expect((await ui.find({ type: 'Button', key: 'menu-delete-run' }))?.props.autoFocus).toBe(true)
  await ui.unmount()
})

test('DL-01 a dialog centers its buttons: push, the ref menu, the uncommitted changes', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  const centered = async () => (await ui.find({ key: 'dialog-actions' }))?.props.justifyContent
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  expect(await centered()).toBe('center')
  await ui.press({ key: 'menu-push' })
  expect(await centered()).toBe('center')
  await ui.press({ key: 'push-cancel' })
  await ui.press({ key: 'menu-close' })
  await ui.press({ key: 'uncommitted' })
  await ui.press({ key: 'uncommitted-stash' })
  expect(await centered()).toBe('center')
  await ui.unmount()
})

test('GG-12 a right click on a pill opens its branch menu; push asks for the remote, then runs', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  expect(await ui.find({ key: 'menu-rename' })).toBeDefined()
  expect(await ui.find({ key: 'menu-delete' })).toBeDefined()
  await ui.press({ key: 'menu-push' })
  expect(callOf(fake, ['push', '-u', 'origin', 'feat'])).toBe(-1)
  expect(await ui.find({ type: 'Button', key: 'push-remote-origin' })).toBeDefined()
  await ui.press({ key: 'push-run' })
  const at = callOf(fake, ['push', '-u', 'origin', 'feat'])
  expect(at).toBeGreaterThan(-1)
  expect(fake.envs[at]).toEqual(GIT_ENV)
  await ui.unmount()
})

test('GG-12 a left click on a pill opens its branch menu, a later one closes it; the commit text opens the details', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `pill:${B}:0` })
  expect(await ui.find({ type: 'Box', key: 'menu-row-checkout' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /bia@x\.io/ })).toBeUndefined()
  await fake.clock?.advance(1_000)
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `pill:${B}:0` })
  expect(await ui.find({ type: 'Box', key: 'menu-row-checkout' })).toBeUndefined()
  expect(callOf(fake, ['checkout', 'feat'])).toBe(-1)
  await ui.press({ key: B })
  expect(await ui.find({ type: 'Text', text: /bia@x\.io/ })).toBeDefined()
  await ui.unmount()
})

test('RM-01 a commit without refs shows no branch actions row', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: A })
  expect(await ui.find({ type: 'Text', text: /bia@x\.io/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Branch actions:/ })).toBeUndefined()
  await ui.unmount()
})

test('GG-12 RM-01 the menu is reachable from the commit details and renames with a validated name', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  for (const surface of ['terminal', 'vscode'] as const) {
    const ui = await $.ui.mount(pane(surface))
    await ui.press({ key: B })
    expect(await ui.find({ type: 'Text', text: /Branch actions:/ })).toBeDefined()
    expect((await ui.find({ type: 'Button', key: 'refmenu-0' }))?.text).toBe('feat ▾')
    expect((await ui.find({ type: 'Button', key: 'refmenu-1' }))?.text).toBe('v0.1 ▾')
    expect(await ui.find({ type: 'Text', text: /^Refs:/ })).toBeUndefined()
    await ui.press({ key: 'refmenu-0' })
    expect(await ui.find({ key: 'menu-merge' })).toBeDefined()
    await ui.press({ key: 'refmenu-0' })
    expect(await ui.find({ key: 'menu-merge' })).toBeUndefined()
    await ui.press({ key: 'refmenu-0' })
    await ui.press({ key: 'menu-close' })
    expect(await ui.find({ key: 'menu-merge' })).toBeUndefined()
    await ui.press({ key: B })
    await ui.unmount()
  }
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: B })
  await ui.press({ key: 'refmenu-0' })
  await ui.press({ key: 'menu-rename' })
  await ui.input({ key: 'rename', text: '--force' })
  expect(fake.calls.some(c => c[2] === '-m')).toBe(false)
  await ui.input({ key: 'rename', text: 'feat-two' })
  expect(callOf(fake, ['branch', '-m', 'feat', 'feat-two'])).toBeGreaterThan(-1)
  await ui.unmount()
})

test('GG-11 many refs on a narrow pane keep the subject: remote HEADs hidden, the rest as +N', async ($, on) => {
  const headRefs = 'HEAD -> main, origin/main, github/main, origin/HEAD, github/HEAD, feature/a-very-long-branch-name, feature/another-long-one, release/1.2.3, tag: v1.0.0'
  const fake = newFake({ headRefs })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('vscode', 80))
  expect((await ui.find({ type: 'Button', key: M }))?.text).toMatch(/^Merge feat/)
  expect(await ui.find({ type: 'Text', text: /HEAD$/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\+\d/ })).toBeDefined()
  await ui.unmount()
})

test('GG-12 with two remotes the push lets you pick them, and reports each failure', async ($, on) => {
  const toasts: string[] = []
  const fake = newFake({ remotes: ['origin', 'github'], failPush: 'github' })
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  await ui.press({ key: 'menu-push' })
  expect((await ui.find({ type: 'Button', key: 'push-remote-origin' }))?.text).toContain('☑')
  expect((await ui.find({ type: 'Button', key: 'push-remote-github' }))?.text).toContain('☐')
  await ui.press({ key: 'push-remote-all' })
  expect((await ui.find({ type: 'Button', key: 'push-remote-github' }))?.text).toContain('☑')
  await ui.press({ key: 'push-run' })
  expect(callOf(fake, ['push', '-u', 'origin', 'feat'])).toBeGreaterThan(-1)
  expect(callOf(fake, ['push', '-u', 'github', 'feat'])).toBeGreaterThan(-1)
  expect(toasts.at(-1)).toBe('git push github failed: fatal: could not read Username')
  await ui.unmount()
})

test('GG-12 with no remote chosen there is nothing to send', async ($, on) => {
  const fake = newFake({ remotes: ['origin', 'github'] })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  await ui.press({ key: 'menu-push' })
  await ui.press({ key: 'push-remote-origin' })
  expect(await ui.find({ type: 'Button', key: 'push-run' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Select at least one remote/ })).toBeDefined()
  await ui.unmount()
})

test('GG-12 a second press while an action runs does nothing', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  await ui.press({ key: 'menu-push' })
  await Promise.allSettled([ui.press({ key: 'push-run' }), ui.press({ key: 'push-run' })])
  expect(fake.calls.filter(c => c[1] === 'push').length).toBe(1)
  await ui.unmount()
})

test('GG-13 the settings screen shows user name and email per scope and the remotes', async ($, on) => {
  await setup($, on, newFake({ remotes: ['origin', 'github'] }))
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: /Gio Local/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /gio@x\.io/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /https:\/\/git\.example\/github\.git/ })).toBeDefined()
  expect(await ui.find({ key: B })).toBeUndefined()
  await ui.press({ key: 'settings-back' })
  expect(await ui.find({ key: B })).toBeDefined()
  await ui.unmount()
})

test('GG-13 user name and email are written to the chosen scope; a bad email is refused', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'settings' })
  await ui.input({ key: 'cfg-name', text: 'Novo Nome' })
  expect(callOf(fake, ['config', '--local', 'user.name', 'Novo Nome'])).toBeGreaterThan(-1)
  await ui.press({ key: 'scope-global' })
  await ui.input({ key: 'cfg-email', text: 'sem-arroba' })
  expect(fake.calls.some(c => c[3] === 'user.email')).toBe(false)
  await ui.input({ key: 'cfg-email', text: 'novo@x.io' })
  expect(callOf(fake, ['config', '--global', 'user.email', 'novo@x.io'])).toBeGreaterThan(-1)
  await ui.unmount()
})

test('GG-13 remotes can be added, re-pointed, fetched and removed', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'remote-add' })
  await ui.input({ key: 'remote-new-name', text: 'fork', kind: 'change' })
  await ui.input({ key: 'remote-new-url', text: '--upload-pack=x' })
  expect(fake.calls.some(c => c[1] === 'remote' && c[2] === 'add')).toBe(false)
  await ui.input({ key: 'remote-new-name', text: 'fork', kind: 'change' })
  await ui.input({ key: 'remote-new-url', text: 'git@github.com:me/app.git' })
  expect(callOf(fake, ['remote', 'add', 'fork', 'git@github.com:me/app.git'])).toBeGreaterThan(-1)
  await ui.press({ key: 'remote-edit-origin' })
  await ui.input({ key: 'remote-url-origin', text: 'https://new.example/app.git' })
  expect(callOf(fake, ['remote', 'set-url', 'origin', 'https://new.example/app.git'])).toBeGreaterThan(-1)
  await ui.press({ key: 'remote-fetch-origin' })
  expect(callOf(fake, ['fetch', 'origin'])).toBeGreaterThan(-1)
  await ui.press({ key: 'remote-delete-origin' })
  expect(callOf(fake, ['remote', 'remove', 'origin'])).toBe(-1)
  await ui.press({ key: 'remote-delete-origin' })
  expect(callOf(fake, ['remote', 'remove', 'origin'])).toBeGreaterThan(-1)
  await ui.unmount()
})

test('GG-14 a double click on a branch pill checks it out and leaves no menu open; a single click does not', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `pill:${B}:0` })
  expect(callOf(fake, ['checkout', 'feat'])).toBe(-1)
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `pill:${B}:0` })
  expect(callOf(fake, ['checkout', 'feat'])).toBeGreaterThan(-1)
  expect(await ui.find({ type: 'Box', key: 'menu-row-checkout' })).toBeUndefined()
  await ui.unmount()
})

test('GG-14 a double click on the checked-out branch runs nothing', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `pill:${M}:0` })
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `pill:${M}:0` })
  expect(fake.calls.some(c => c[1] === 'checkout' || c[1] === 'switch')).toBe(false)
  await ui.unmount()
})

test('GG-05 the all-branches option is a switch with no keyboard shortcut', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  const before = await ui.find({ type: 'Button', key: 'scope' })
  expect(before?.text).toContain('')
  expect(before?.props.hotkey).toBeUndefined()
  await ui.press({ key: 'scope' })
  expect((await ui.find({ type: 'Button', key: 'scope' }))?.text).toContain('')
  for (const key of ['search-toggle', 'fetch', 'refresh', 'settings']) expect((await ui.find({ type: 'Button', key }))?.props.hotkey).toBeUndefined()
  // the header holds only the branch: no commit count, no changes count
  expect(await ui.find({ type: 'Text', text: /\d+\+? commits/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /● \d+ changes?/ })).toBeUndefined()
  await ui.unmount()
})

test('GG-15 where the engine scrolls, only the rows near the window are drawn; the rest are spacers', async ($, on) => {
  await setup($, on, newFake({ extra: 300 }))
  const top = await $.ui.mount(pane('desktop'))
  expect(await top.find({ type: 'Button', key: M })).toBeDefined()
  expect(await top.find({ type: 'Button', key: 'e0000250' })).toBeUndefined()
  expect(await top.find({ type: 'Box', key: 'space-after' })).toBeDefined()
  await top.unmount()
  const deep = await $.ui.mount(pane('desktop', 100, 255))
  expect(await deep.find({ type: 'Button', key: 'e0000250' })).toBeDefined()
  expect(await deep.find({ type: 'Button', key: M })).toBeUndefined()
  expect(await deep.find({ type: 'Box', key: 'space-before' })).toBeDefined()
  await deep.unmount()
})

test('GG-15 the table shows no date column; the date is in the details', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Text', text: /\bDate\b/ })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: B }))?.text).not.toMatch(/Nov|\d+[mhd]\b/)
  await ui.press({ key: B })
  expect(await ui.find({ type: 'Text', text: /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/ })).toBeDefined()
  await ui.unmount()
})

test('GG-16 the search icon opens a hash search that selects the commit and scrolls to it', async ($, on) => {
  const toasts: string[] = []
  const fk = newFake({ extra: 300 })
  await setup($, on, fk, [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Input', key: 'search' })).toBeUndefined()
  await ui.press({ key: 'search-toggle' })
  await ui.input({ key: 'search', text: 'E0000200' })
  expect(fk.calls.at(-1)?.slice(-2)).toEqual(['--format=%H%x1f%an%x1f%ae%x1f%at%x1f%B%x1e', 'e0000200'])
  // A commit found closes the search.
  expect(await ui.find({ type: 'Input', key: 'search' })).toBeUndefined()
  await ui.unmount()
  const there = await $.ui.mount(pane('terminal', 100, 200))
  expect(await there.find({ type: 'Text', text: /bia@x\.io/ })).toBeDefined()
  await there.press({ key: 'search-toggle' })
  await there.input({ key: 'search', text: 'xyz' })
  expect(toasts.at(-1)).toMatch(/^No commit matches "xyz" among the \d+ loaded/)
  await there.input({ key: 'search', text: 'dead' })
  expect(toasts.at(-1)).toMatch(/^No commit matches "dead" among the \d+ loaded/)
  await there.input({ key: 'search', text: 'beef' })
  expect(toasts.at(-1)).toMatch(/not among the \d+ loaded/)
  await there.unmount()
})

test('SR-01 a search finds by message or author too; again, the next match, in a loop', async ($, on) => {
  const toasts: string[] = []
  await setup($, on, newFake(), [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'search-toggle' })
  expect((await ui.find({ type: 'Input', key: 'search' }))?.props.placeholder).toBe('find by hash, message or author')
  // 'work' is in two messages: A (Work on main), then B (Work on feat), then A again
  await ui.input({ key: 'search', text: 'work' })
  expect(toasts.at(-1)).toBe('Match 1/2')
  expect(await ui.find({ type: 'Text', text: /Branch actions:|Refs:|Ana/ })).toBeDefined()
  // more than one: the field stays, with the term, for the next
  expect((await ui.find({ type: 'Input', key: 'search' }))?.props.value).toBe('work')
  await ui.input({ key: 'search', text: 'work' })
  expect(toasts.at(-1)).toBe('Match 2/2')
  await ui.input({ key: 'search', text: 'work' })
  expect(toasts.at(-1)).toBe('Match 1/2')
  // the author: one match, the field closes
  await ui.input({ key: 'search', text: 'BIA' })
  expect(await ui.find({ type: 'Input', key: 'search' })).toBeUndefined()
  await ui.unmount()
})

test('GG-17 refresh reloads the graph and the open commit, then flashes a check', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: B })
  const logs = logCalls(fake).length
  const shows = gitCalls(fake).filter(c => c[1] === 'show').length
  await ui.press({ key: 'refresh' })
  expect(logCalls(fake).length).toBe(logs + 1)
  expect(gitCalls(fake).filter(c => c[1] === 'show').length).toBe(shows + 1)
  expect((await ui.find({ type: 'Button', key: 'refresh' }))?.text).toContain('✓')
  await fake.clock?.advance(2_000)
  expect((await ui.find({ type: 'Button', key: 'refresh' }))?.text).not.toContain('✓')
  await ui.unmount()
})

test('GG-18 off a docked terminal pane the fetch button fetches every remote, reloads the graph and says so in a toast', async ($, on) => {
  const toasts: string[] = []
  const fake = newFake()
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('desktop'))
  const logs = logCalls(fake).length
  await ui.press({ key: 'fetch' })
  expect(callOf(fake, ['fetch', '--all'])).toBeGreaterThan(-1)
  expect(toasts.at(-1)).toBe('Fetched remote(s) ✓')
  expect(logCalls(fake).length).toBe(logs + 1)
  await ui.unmount()
})

test('GG-13 adding a remote with only a URL names it origin, and says why when it cannot', async ($, on) => {
  const toasts: string[] = []
  const url = 'git@github.com:giovannifranco1/claude-code-gitgraph.git'
  const fake = newFake({ remotes: ['github'] })
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'remote-add' })
  await ui.input({ key: 'remote-new-url', text: url })
  expect(callOf(fake, ['remote', 'add', 'origin', url])).toBeGreaterThan(-1)
  await ui.press({ key: 'remote-add' })
  await ui.input({ key: 'remote-new-name', text: 'github', kind: 'change' })
  await ui.input({ key: 'remote-new-url', text: url })
  expect(toasts.at(-1)).toBe('Remote "github" already exists')
  await ui.unmount()
})

const flowCalls = (fake: Fake) => gitCalls(fake).filter(c => c[1] === 'flow' && c[2] !== 'version')
const envOf = (fake: Fake, argv: string[]) => fake.envs[callOf(fake, argv)]
const GIT_ENV = { GIT_TERMINAL_PROMPT: '0', GIT_EDITOR: 'true', GIT_MERGE_AUTOEDIT: 'no' }

test('GF-01 the footer is one row that opens the Git Flow dialog: a row per type with its start, no finish off a work branch', async ($, on) => {
  await setup($, on, newFake())
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    expect(await ui.find({ key: 'flow-start-feature' })).toBeUndefined()
    expect((await ui.find({ type: 'Button', key: 'flow-open' }))?.text).toMatch(/Git Flow$/)
    await ui.press({ key: 'flow-open' })
    for (const kind of ['feature', 'release', 'hotfix']) {
      expect((await ui.find({ type: 'Box', key: `flow-row-${kind}` }))?.text).toContain(kind)
      expect((await ui.find({ type: 'Button', key: `flow-start-${kind}` }))?.text).toBe('start')
    }
    expect(await ui.find({ key: 'flow-finish' })).toBeUndefined()
    await ui.press({ key: 'flow-menu-close' })
    expect(await ui.find({ key: 'flow-start-feature' })).toBeUndefined()
    await ui.unmount()
  }
})

test('GG-21 GF-01 on a docked terminal pane the mod scrolls its rows: the pane holds still at its height, the footer below a window of rows', async ($, on) => {
  await setup($, on, newFake({ extra: 300 }))
  // the engine's offset does not move it: the tree never scrolls there
  const ui = await $.ui.mount(pane('terminal', 100, 255))
  expect(await ui.find({ type: 'Button', key: M })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'e0000250' })).toBeUndefined()
  expect(await ui.find({ type: 'Box', key: 'space-before' })).toBeUndefined()
  const footer = (await ui.find({ type: 'Box', key: 'flow-footer' }))?.props
  expect(footer).toMatchObject({ height: 2 })
  expect(footer?.position).toBeUndefined()
  // the header's rows, the window, the footer's two: the pane's 40
  const window = (await ui.find({ type: 'Box', key: 'rows-window' }))?.props.height as number
  expect(window).toBeGreaterThan(30)
  expect(window).toBeLessThan(40 - 2)
  await ui.unmount()
})

test('FD-01 an open dialog leaves the pinned footer as it is, on the bottom edge', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-start-feature' })
  expect((await ui.find({ type: 'Box', key: 'flow-footer' }))?.props).toMatchObject({ height: 2 })
  expect(await ui.find({ type: 'Box', key: 'flow-dialog' })).toBeDefined()
  await ui.unmount()
})

test('GF-01 elsewhere (other surfaces, an inline pane) the footer closes the list, after the last commit', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('desktop'))
  expect(await ui.find({ type: 'Box', key: 'flow-footer' })).toBeUndefined()
  await ui.unmount()
  const inline = await $.ui.mount({ ...pane('terminal'), props: { ...pane('terminal').props, placement: 'inline' } })
  expect(await inline.find({ type: 'Box', key: 'flow-footer' })).toBeUndefined()
  await inline.unmount()
  const ui2 = await $.ui.mount(pane('desktop'))
  await ui2.press({ key: 'flow-open' })
  expect(await ui2.find({ type: 'Button', key: 'flow-start-feature' })).toBeDefined()
  await ui2.unmount()
})

for (const [over, text, name] of [
  [{ flow: 'none' }, /git flow is not installed/, 'not installed'],
  [{ flow: 'other' }, /need git-flow-next/, 'another git flow'],
  [{ flowConfig: '' }, /main · develop · feature\//, 'not set up'],
] as const)
  test(`GF-02 the Git Flow dialog says when git flow is ${name}, with no actions`, async ($, on) => {
    await setup($, on, newFake(over))
    const ui = await $.ui.mount(pane('terminal'))
    await ui.press({ key: 'flow-open' })
    expect(await ui.find({ type: 'Text', text })).toBeDefined()
    expect(await ui.find({ key: 'flow-start-feature' })).toBeUndefined()
    await ui.unmount()
  })

test('GF-02 Start git flow sets it up with the standard names (git flow init -d) on the second press', async ($, on) => {
  const fake = newFake({ flowConfig: '' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-init' })
  expect(flowCalls(fake)).toEqual([])
  await ui.press({ key: 'flow-init' })
  expect(flowCalls(fake)).toEqual([['git', 'flow', 'init', '-d']])
  await ui.unmount()
})

test('FI-01 Set up git flow opens a form prefilled from the branches, and inits with its names', async ($, on) => {
  const fake = newFake({ flowConfig: '', branchRefs: 'refs/heads/master\nrefs/heads/dev\nrefs/remotes/origin/feat/login\n' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  expect((await ui.find({ type: 'Button', key: 'flow-init' }))?.text).toBe('Use defaults')
  await ui.press({ key: 'flow-init-open' })
  for (const [key, value] of [['main', 'master'], ['develop', 'dev'], ['feature', 'feat/'], ['bugfix', 'bugfix/'], ['tag', '']] as const)
    expect((await ui.find({ key: `flow-init-${key}` }))?.props.value).toBe(value)
  await ui.input({ key: 'flow-init-bugfix', text: 'fix/', kind: 'change' })
  await ui.press({ key: 'flow-init-run' })
  expect(flowCalls(fake)).toEqual([])
  await ui.press({ key: 'flow-init-run' })
  expect(flowCalls(fake)).toEqual([['git', 'flow', 'init', '-d', '--main', 'master', '--develop', 'dev', '--feature', 'feat/', '--bugfix', 'fix/', '--release', 'release/', '--hotfix', 'hotfix/']])
  expect(await ui.find({ key: 'flow-init-main' })).toBeUndefined()
  await ui.unmount()
})

test('FI-01 an invalid field runs nothing and says which one', async ($, on) => {
  const fake = newFake({ flowConfig: '' })
  const toasts: string[] = []
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-init-open' })
  await ui.input({ key: 'flow-init-feature', text: 'my feat/', kind: 'change' })
  await ui.press({ key: 'flow-init-run' })
  await ui.press({ key: 'flow-init-run' })
  expect(flowCalls(fake)).toEqual([])
  expect(toasts).toContain('Invalid feature prefix: "my feat/"')
  await ui.press({ key: 'flow-init-cancel' })
  expect(await ui.find({ key: 'flow-init-main' })).toBeUndefined()
  await ui.unmount()
})

test('FI-02 settings reconfigure git flow: old bases lose their section, then init -f', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'settings' })
  expect(await ui.find({ type: 'Text', text: /^main · develop · feature\/ release\/ hotfix\/$/ })).toBeDefined()
  await ui.press({ key: 'flow-reconfigure' })
  expect((await ui.find({ key: 'flow-init-develop' }))?.props.value).toBe('develop')
  await ui.input({ key: 'flow-init-develop', text: 'dev', kind: 'change' })
  await ui.press({ key: 'flow-init-run' })
  await ui.press({ key: 'flow-init-run' })
  const remove = callOf(fake, ['config', '--local', '--remove-section', 'gitflow.branch.develop'])
  const init = callOf(fake, ['flow', 'init', '-d', '-f', '--main', 'main', '--develop', 'dev', '--feature', 'feature/', '--bugfix', 'bugfix/', '--release', 'release/', '--hotfix', 'hotfix/'])
  expect(remove).toBeGreaterThan(-1)
  expect(init).toBeGreaterThan(remove)
  await ui.unmount()
})

test('GF-03 start validates the full branch name and passes the name as its own argument', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-start-feature' })
  await ui.input({ key: 'flow-name', text: 'Bad Name' })
  await ui.input({ key: 'flow-name', text: '$(rm -rf)' })
  expect(flowCalls(fake)).toEqual([])
  await ui.input({ key: 'flow-name', text: 'login' })
  expect(callOf(fake, ['check-ref-format', '--branch', 'feature/login'])).toBeGreaterThan(-1)
  expect(flowCalls(fake)).toEqual([['git', 'flow', 'feature', 'start', 'login']])
  expect(envOf(fake, ['flow', 'feature', 'start', 'login'])).toEqual(GIT_ENV)
  await ui.unmount()
})

test('GF-03 a release starts with the next version filled in', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-start-release' })
  expect((await ui.find({ type: 'Input', key: 'flow-name' }))?.props).toMatchObject({ value: '1.1.0' })
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-start-hotfix' })
  expect((await ui.find({ type: 'Input', key: 'flow-name' }))?.props).toMatchObject({ value: '1.0.2' })
  await ui.unmount()
})

test('GF-04 FD-03 on a work branch the Git Flow dialog offers its update, asked in a dialog, then run; no publish there', async ($, on) => {
  const fake = newFake({ branch: 'feature/login' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  expect((await ui.find({ type: 'Button', key: 'flow-update' }))?.text).toContain('rebase')
  expect(await ui.find({ key: 'flow-publish' })).toBeUndefined()
  await ui.press({ key: 'flow-update' })
  expect(flowCalls(fake)).toEqual([])
  expect(await ui.find({ type: 'Text', text: /Rebase feature\/login on develop\?/ })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'flow-confirm-run' }))?.text).toBe('Rebase')
  await ui.press({ key: 'flow-confirm-run' })
  expect(flowCalls(fake)).toEqual([['git', 'flow', 'feature', 'update', 'login']])
  await ui.unmount()
})

test('GF-05 finish follows the switches, then pushes the parent with the tags', async ($, on) => {
  const fake = newFake({ branch: 'feature/login' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-finish' })
  expect(flowCalls(fake)).toEqual([])
  await ui.press({ key: 'flow-opt-keep' })
  await ui.press({ key: 'flow-finish-run' })
  const finish = ['flow', 'feature', 'finish', 'login', '--no-ff', '--no-keep']
  expect(callOf(fake, finish)).toBeGreaterThan(-1)
  expect(envOf(fake, finish)).toEqual(GIT_ENV)
  expect(callOf(fake, ['push', '--follow-tags', 'origin', 'develop'])).toBeGreaterThan(callOf(fake, finish))
  await ui.unmount()
})

test('GF-05 a release finish carries its tag message; a failed push says the finish was done', async ($, on) => {
  const toasts: string[] = []
  const fake = newFake({ branch: 'release/1.1.0', failPush: 'origin' })
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-finish' })
  expect((await ui.find({ type: 'Input', key: 'flow-tag' }))?.props).toMatchObject({ value: '1.1.0', label: 'Tag message' })
  await ui.input({ key: 'flow-tag', text: 'Big release', kind: 'change' })
  await ui.press({ key: 'flow-finish-run' })
  expect(callOf(fake, ['flow', 'release', 'finish', '1.1.0', '--no-ff', '--keep', '-m', 'Big release'])).toBeGreaterThan(-1)
  expect(callOf(fake, ['push', '--follow-tags', 'origin', 'main', 'develop'])).toBeGreaterThan(-1)
  expect(toasts.at(-1)).toMatch(/^Finished release\/1\.1\.0, but the push to origin failed: fatal/)
  await ui.unmount()
})

test('GF-05 a failed finish does not push', async ($, on) => {
  const fake = newFake({ branch: 'feature/login', conflictOn: 'finish' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-finish' })
  await ui.press({ key: 'flow-finish-run' })
  expect(fake.calls.some(c => c[1] === 'push')).toBe(false)
  await ui.unmount()
})

test('GF-06 a finish stopped by a conflict offers continue and abort', async ($, on) => {
  const fake = newFake({ branch: 'feature/login', conflictOn: 'finish' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-finish' })
  await ui.press({ key: 'flow-finish-run' })
  expect(await ui.find({ type: 'Text', text: /Conflict/ })).toBeDefined()
  await ui.press({ key: 'flow-continue' })
  expect(callOf(fake, ['flow', 'feature', 'finish', '--continue', 'login'])).toBeGreaterThan(-1)
  expect(await ui.find({ type: 'Text', text: /Conflict/ })).toBeUndefined()
  await ui.unmount()
})

test('GF-06 an update stopped by a conflict aborts the rebase on the second press', async ($, on) => {
  const fake = newFake({ branch: 'feature/login', conflictOn: 'update' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-update' })
  await ui.press({ key: 'flow-confirm-run' })
  await ui.press({ key: 'flow-abort' })
  await ui.press({ key: 'flow-abort' })
  expect(callOf(fake, ['rebase', '--abort'])).toBeGreaterThan(-1)
  await ui.unmount()
})

test('GF-07 a right click on a work branch offers its git flow actions; finish opens the drawer', async ($, on) => {
  const fake = newFake({ headRefs: 'HEAD -> main, feature/login' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${M}:1` })
  expect((await ui.find({ type: 'Button', key: 'menu-flow-update' }))?.text).toContain('Rebase on develop')
  await ui.press({ key: 'menu-flow-finish' })
  expect(await ui.find({ key: 'flow-finish-run' })).toBeDefined()
  await ui.press({ key: 'flow-finish-run' })
  expect(callOf(fake, ['flow', 'feature', 'finish', 'login', '--no-ff', '--keep'])).toBeGreaterThan(-1)
  await ui.unmount()
})

test('GF-02 a repository with git flow AVH config gets the actions, not an empty bar', async ($, on) => {
  const avh = 'gitflow.branch.master main\ngitflow.branch.develop develop\ngitflow.prefix.feature feature/\ngitflow.prefix.hotfix hotfix/\n'
  await setup($, on, newFake({ flowConfig: avh }))
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  expect(await ui.find({ type: 'Button', key: 'flow-start-feature' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'flow-start-hotfix' })).toBeDefined()
  await ui.unmount()
})

test('GF-08 git flow runs with an empty hooks folder of the mod: repo hooks stay off and git-flow-next finds no hook', async ($, on) => {
  const fake = newFake({ branch: 'feature/login' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-start-feature' })
  await ui.input({ key: 'flow-name', text: 'search' })
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-update' })
  await ui.press({ key: 'flow-confirm-run' })
  const flows = fake.configs.filter(c => c.startsWith('flow: core.hooksPath='))
  expect(flows.length).toBe(2)
  expect(flows.every(c => /^flow: core\.hooksPath=.+\/nohooks$/.test(c))).toBe(true)
  expect(fake.configs.filter(c => c.startsWith('flow: gitflow.origin='))).toEqual(['flow: gitflow.origin=origin', 'flow: gitflow.origin=origin'])
  expect(fake.configs.filter(c => !c.startsWith('flow:'))).toEqual([])
  await ui.unmount()
})

test('GF-08 the branch menu has no publish: Push branch… publishes a branch', async ($, on) => {
  await setup($, on, newFake({ branch: 'feature/login', headRefs: 'HEAD -> feature/login' }))
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${M}:0` })
  expect(await ui.find({ key: 'menu-flow-publish' })).toBeUndefined()
  expect(await ui.find({ key: 'menu-flow-update' })).toBeDefined()
  expect(await ui.find({ key: 'menu-push' })).toBeDefined()
  await ui.unmount()
})

test('GF-01 on a work branch its type row in the Git Flow dialog has start, rebase and finish as words', async ($, on) => {
  await setup($, on, newFake({ branch: 'feature/login' }))
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  expect((await ui.find({ type: 'Box', key: 'flow-row-feature' }))?.text).toMatch(/feature *start *rebase *finish/)
  expect((await ui.find({ type: 'Box', key: 'flow-row-release' }))?.text).not.toMatch(/finish/)
  await ui.unmount()
})

test('GG-12 off a docked terminal pane Delete branch asks with force off; it runs on a second press, -D only when force is ticked', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('desktop'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  expect((await ui.find({ type: 'Button', key: 'menu-delete' }))?.text?.trim()).toBe('Delete branch…')
  await ui.press({ key: 'menu-delete' })
  expect((await ui.find({ type: 'Button', key: 'menu-opt-force' }))?.text).toContain('\uf204')
  await ui.press({ key: 'menu-delete-run' })
  expect(callOf(fake, ['branch', '-d', 'feat'])).toBe(-1)
  await ui.press({ key: 'menu-delete-run' })
  expect(callOf(fake, ['branch', '-d', 'feat'])).toBeGreaterThan(-1)
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  await ui.press({ key: 'menu-delete' })
  await ui.press({ key: 'menu-opt-force' })
  await ui.press({ key: 'menu-delete-run' })
  await ui.press({ key: 'menu-delete-run' })
  expect(callOf(fake, ['branch', '-D', 'feat'])).toBeGreaterThan(-1)
  await ui.unmount()
})

test('GG-12 on a narrow pane the menu list keeps every item, Delete branch and Copy name too', async ($, on) => {
  await setup($, on, newFake({ headRefs: 'HEAD -> main, feature/login' }))
  const ui = await $.ui.mount(pane('terminal', 70))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${M}:1` })
  for (const id of ['checkout', 'push', 'merge', 'rebase', 'rename', 'copy', 'delete'])
    expect(await ui.find({ type: 'Button', key: `menu-${id}` })).toBeDefined()
  await ui.unmount()
})

test('GG-12 while a push runs from the branch menu the pane draws, each spinner with its own key', async ($, on) => {
  let release = () => {}
  const fake = newFake({ hold: new Promise<void>(r => (release = r)) })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  await ui.press({ key: 'menu-push' })
  const pushing = ui.press({ key: 'push-run' })
  for (let i = 0; i < 20 && !(await ui.find({ type: 'Text', text: /Pushing feat/ })); i++) await Promise.resolve()
  expect(await ui.find({ type: 'Text', text: /Pushing feat/ })).toBeDefined()
  const keys = (await ui.findAll({ type: 'Client' })).map(c => c.key).filter(k => !String(k).startsWith('pill:'))
  expect(new Set(keys).size).toBe(keys.length)
  release()
  await pushing
  await ui.unmount()
})

const lastCwd = (fake: Fake, verb: string) => fake.cwds[fake.calls.findLastIndex(c => c[0] === 'git' && c[1] === verb)]

test('MR-02 with several repos a dropdown beside the hash search picks the one the graph shows', async ($, on) => {
  const fake = newFake({ repos: './.git\n./api/.git\n' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  expect((await ui.find({ type: 'Button', key: 'repo' }))?.text).toContain('(this folder)')
  expect(await ui.find({ type: 'Button', key: 'repo-option:api' })).toBeUndefined()
  expect(lastCwd(fake, 'log')).toBe('.')
  await ui.press({ key: B })
  await ui.press({ key: 'repo' })
  expect(await ui.find({ type: 'Button', key: 'repo-option:.' })).toBeDefined()
  await ui.press({ key: 'repo-option:api' })
  expect(lastCwd(fake, 'log')).toBe('api')
  expect(lastCwd(fake, 'status')).toBe('api')
  expect(await ui.find({ type: 'Text', text: /bia@x\.io/ })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'repo-option:api' })).toBeUndefined()
  expect((await ui.find({ type: 'Button', key: 'repo' }))?.text).toContain('api')
  await ui.unmount()
})

test('MR-04 each picker option shows the branch its repo is on in a right column', async ($, on) => {
  const fake = newFake({ repos: './.git\n./api/.git\n./web/.git\n', heads: { '.': 'main', api: 'develop', web: null }, upstreams: { '.': 'origin/main' } })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Text', text: /\[main\]/ })).toBeUndefined()
  await ui.press({ key: 'repo' })
  // One button per row: the repo on the left, its branch dim at the right end.
  expect((await ui.find({ type: 'Button', key: 'repo-option:api' }))?.text).toMatch(/api +\[develop\]$/)
  // On a remote: its upstream; not pushed: the local name.
  expect(await ui.find({ type: 'Text', text: /\[origin\/main\]/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\[develop\]/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\[detached\]/ })).toBeDefined()
  // Opening the picker reads the branches again: one changed meanwhile.
  await ui.press({ key: 'repo' })
  fake.heads = { ...fake.heads, api: 'feature/y' }
  await ui.press({ key: 'repo' })
  expect(await ui.find({ type: 'Text', text: /\[feature\/y\]/ })).toBeDefined()
  expect(fake.cwds.filter((_, i) => fake.calls[i]?.[1] === 'symbolic-ref')).toContain('web')
  await ui.unmount()
})

test('HD-01 the header shows the checked-out branch as its badge in the graph: the check, no branch glyph', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts.some(t => t.includes('⎇'))).toBe(false)
  expect(texts.some(t => /^(✔|\u{f058})  main/u.test(t))).toBe(true)
  await ui.unmount()
})

test('MR-02 with one repo the header has no repo dropdown', async ($, on) => {
  await setup($, on, newFake({ repos: './.git\n' }))
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Button', key: 'repo' })).toBeUndefined()
  await ui.unmount()
})

test('MR-02 a session folder that is no repo shows the first repo found', async ($, on) => {
  const fake = newFake({ isRepo: false, repos: './web/.git\n./api/.git\n' })
  const opened = await setup($, on, fake)
  expect((opened as { text?: string }).text).toBe('Git Graph opened.')
  expect(lastCwd(fake, 'log')).toBe('api')
})

test('MR-03 a repo gone from the search falls back to the session folder', async ($, on) => {
  const fake = newFake({ repos: './.git\n./api/.git\n' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'repo' })
  await ui.press({ key: 'repo-option:api' })
  fake.repos = './.git\n'
  await ui.press({ key: 'refresh' })
  expect(lastCwd(fake, 'log')).toBe('.')
  await ui.unmount()
})

test('GG-11 the Nerd Font check runs again on /gitgraph: a session that lost it (/clear, /resume) gets round pills back', async ($, on) => {
  const fake = newFake({ hasNoNerdFont: true })
  await setup($, on, fake)
  const before = await $.ui.mount(pane('terminal'))
  expect((await before.find({ type: 'Client', key: `pill:${M}:0` }))?.props.props).toMatchObject({ isRound: false })
  await before.unmount()
  fake.hasNoNerdFont = false
  await $.command.run({ command: 'gitgraph', args: '' } as never)
  const after = await $.ui.mount(pane('terminal'))
  expect((await after.find({ type: 'Client', key: `pill:${M}:0` }))?.props.props).toMatchObject({ isRound: true })
  await after.unmount()
})

test('GG-15 the column header lines Author and Commit up with the rows: as wide as a row', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal', 100))
  const header = (await ui.find({ type: 'Text', text: /^Graph +Description/ }))?.text ?? ''
  // a row is `cols - 1` wide (EDGE_SAFETY), its meta `  <author 12>  <hash 7>` at the end
  expect(header.length).toBe(99)
  expect(header.indexOf('Author')).toBe(99 - 23 + 2)
  expect(header.indexOf('Commit')).toBe(99 - 7)
  await ui.unmount()
})

test('GF-09 with no origin and no gitflow.origin, git flow runs and the finish pushes on the repo\'s remote', async ($, on) => {
  const fake = newFake({ remotes: ['github'], branch: 'hotfix/1.0.2', headRefs: 'HEAD -> hotfix/1.0.2, github/main' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-finish' })
  await ui.press({ key: 'flow-finish-run' })
  expect(fake.configs).toContain('flow: gitflow.origin=github')
  expect(callOf(fake, ['push', '--follow-tags', 'github', 'main', 'develop'])).toBeGreaterThan(-1)
  await ui.unmount()
})

test('GG-12 the branch menu is a list, one item a row, its groups split by a rule', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  for (const id of ['checkout', 'push', 'merge', 'rebase', 'rename', 'copy', 'delete'])
    expect(await ui.find({ type: 'Box', key: `menu-row-${id}` })).toBeDefined()
  expect(await ui.find({ type: 'Box', key: 'menu-gap-1' })).toBeDefined()
  expect(await ui.find({ type: 'Box', key: 'menu-gap-2' })).toBeDefined()
  expect(await ui.find({ type: 'Box', key: 'menu-gap-3' })).toBeUndefined()
  await ui.unmount()
})

test('FD-01 FD-02 on a docked terminal pane finish opens a dialog over the graph: centered, framed, its switches a row each', async ($, on) => {
  const fake = newFake({ branch: 'feature/login' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal', 100))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-finish' })
  const dialog = await ui.find({ type: 'Box', key: 'flow-dialog' })
  expect(dialog?.props).toMatchObject({ position: 'absolute', width: 60, left: 20 })
  expect(await ui.find({ type: 'Text', text: /^Finish feature\/login$/ })).toBeDefined()
  for (const key of ['flow-opt-noff', 'flow-opt-push', 'flow-opt-keep']) expect(await ui.find({ type: 'Box', key: `${key}-row` })).toBeDefined()
  // a Nerd Font icon takes two cells: two spaces keep one before the label
  expect((await ui.find({ type: 'Button', key: 'flow-opt-noff' }))?.text).toBe('\uf205  merge commit (--no-ff)')
  await ui.press({ key: 'flow-finish-cancel' })
  expect(await ui.find({ type: 'Box', key: 'flow-dialog' })).toBeUndefined()
  expect(flowCalls(fake)).toEqual([])
  await ui.unmount()
})

test('FD-02 start opens the dialog with the name field; a run closes it', async ($, on) => {
  const fake = newFake({ branch: 'main' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal', 100))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-start-feature' })
  expect(await ui.find({ type: 'Box', key: 'flow-dialog' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^New feature$/ })).toBeDefined()
  await ui.input({ key: 'flow-name', text: 'search' })
  expect(callOf(fake, ['flow', 'feature', 'start', 'search'])).toBeGreaterThan(-1)
  expect(await ui.find({ type: 'Box', key: 'flow-dialog' })).toBeUndefined()
  await ui.unmount()
})

test('FD-04 off a docked terminal pane the dialog content sits under the footer bar, no layer over the graph', async ($, on) => {
  const fake = newFake({ branch: 'feature/login' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: 'flow-open' })
  await ui.press({ key: 'flow-update' })
  expect(await ui.find({ type: 'Box', key: 'flow-dialog' })).toBeUndefined()
  await ui.press({ key: 'flow-confirm-run' })
  expect(flowCalls(fake)).toEqual([['git', 'flow', 'feature', 'update', 'login']])
  await ui.unmount()
})

test('MD-01 on a docked terminal pane the branch menu is a dialog over the graph; close shuts it', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal', 100))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  expect((await ui.find({ type: 'Box', key: 'menu-dialog' }))?.props).toMatchObject({ position: 'absolute', width: 60 })
  expect(await ui.find({ type: 'Box', key: 'menu-row-checkout' })).toBeDefined()
  await ui.press({ key: 'menu-close' })
  expect(await ui.find({ type: 'Box', key: 'menu-dialog' })).toBeUndefined()
  await ui.unmount()
})

test('MD-02 on a docked terminal pane the commit actions icon opens them as a dialog; close shuts it', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal', 100))
  await ui.press({ key: B })
  await ui.press({ key: 'detail-actions-toggle' })
  expect((await ui.find({ type: 'Box', key: 'actions-dialog' }))?.props).toMatchObject({ position: 'absolute' })
  expect(await ui.find({ type: 'Box', key: 'detail-row-reset' })).toBeDefined()
  await ui.press({ key: 'actions-close' })
  expect(await ui.find({ type: 'Box', key: 'actions-dialog' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'reset' })).toBeUndefined()
  await ui.unmount()
})

test('MD-03 off a docked terminal pane the branch menu and the commit actions stay in the row, no dialog', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('desktop', 100))
  await ui.press({ key: B })
  await ui.press({ key: 'detail-actions-toggle' })
  expect(await ui.find({ type: 'Box', key: 'actions-dialog' })).toBeUndefined()
  expect(await ui.find({ type: 'Box', key: 'detail-row-reset' })).toBeDefined()
  await ui.press({ key: 'refmenu-0' })
  expect(await ui.find({ type: 'Box', key: 'menu-dialog' })).toBeUndefined()
  expect(await ui.find({ type: 'Box', key: 'menu-row-copy' })).toBeDefined()
  await ui.unmount()
})

test('GG-23 settings hide the author and the hash columns, the header with them; the choice is kept for the next session', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal', 100))
  expect((await ui.find({ type: 'Button', key: M }))?.text).toMatch(/Ana .*aaaaaaa/)
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'cfg-col-author' })
  await ui.press({ key: 'cfg-col-hash' })
  await ui.press({ key: 'settings-back' })
  const row = (await ui.find({ type: 'Button', key: M }))?.text ?? ''
  expect(row).not.toMatch(/Ana|aaaaaaa/)
  expect((await ui.find({ type: 'Text', text: /^Graph +Description/ }))?.text).not.toMatch(/Author|Commit/)
  expect(fake.store?.get('columns')).toEqual({ isAuthor: false, isHash: false })
  await ui.unmount()
})

test('GG-23 a saved choice of columns applies when the pane opens', async ($, on) => {
  const fake = newFake({ store: new Map([['columns', { isAuthor: false, isHash: true }]]) })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal', 100))
  const row = (await ui.find({ type: 'Button', key: M }))?.text ?? ''
  expect(row).not.toMatch(/Ana/)
  expect(row).toMatch(/aaaaaaa$/)
  await ui.unmount()
})

test('GG-24 a branch only on a remote (merged, deleted here) leads with a ghost, as a tag with its icon: icon segment, then the name on its dark shade', async ($, on) => {
  await setup($, on, newFake({ headRefs: 'HEAD -> main, origin/main, origin/feature/gone' }))
  const ui = await $.ui.mount(pane('terminal', 120))
  const gone = (await ui.find({ type: 'Client', key: `pill:${M}:1` }))?.props.props as { segments: { text: string; bg: string; icon?: { text: string; fg: string } }[] }
  expect(gone.segments.map(g => `${g.icon?.text ?? ''}${g.text}`)).toEqual(['\u{f02a0}', 'origin/feature/gone'])
  expect(gone.segments[0]?.icon?.fg).toBe(gone.segments[1]?.bg)
  await ui.unmount()
})

test('FD-06 the footer row says where git flow stands: the work branch, or why it is off', async ($, on) => {
  await setup($, on, newFake({ branch: 'feature/login' }))
  const work = await $.ui.mount(pane('terminal'))
  expect((await work.find({ type: 'Button', key: 'flow-open' }))?.text).toMatch(/Git Flow · feature\/login · from develop · not published$/)
  await work.unmount()
})

for (const [sync, end] of [
  ['# branch.upstream github/feature/login\n# branch.ab +2 -1\n', /from develop · ↑2 ↓1 github$/],
  ['# branch.upstream github/feature/login\n# branch.ab +3 -0\n', /from develop · ↑3 github$/],
  ['# branch.upstream github/feature/login\n# branch.ab +0 -0\n', /from develop · in sync with github$/],
] as const)
  test(`FD-07 the footer row says how the work branch stands with its upstream: ${end.source}`, async ($, on) => {
    await setup($, on, newFake({ branch: 'feature/login', sync }))
    const ui = await $.ui.mount(pane('terminal'))
    expect((await ui.find({ type: 'Button', key: 'flow-open' }))?.text).toMatch(end)
    await ui.unmount()
  })

for (const [over, end, name] of [
  [{ branch: 'main' }, /Git Flow$/, 'off a work branch'],
  [{ flow: 'none' }, /Git Flow · not installed$/, 'not installed'],
  [{ flowConfig: '' }, /Git Flow · not set up$/, 'not set up'],
] as const)
  test(`FD-06 the footer row ${name}`, async ($, on) => {
    await setup($, on, newFake(over))
    const ui = await $.ui.mount(pane('terminal'))
    expect((await ui.find({ type: 'Button', key: 'flow-open' }))?.text).toMatch(end)
    await ui.unmount()
  })

test('GG-24 a remote branch whose local branch sits on another commit is no ghost', async ($, on) => {
  // `feat` is a local branch (on B): origin/feat here only lags behind it
  await setup($, on, newFake({ headRefs: 'HEAD -> main, origin/main, origin/feat' }))
  const ui = await $.ui.mount(pane('terminal', 120))
  const behind = (await ui.find({ type: 'Client', key: `pill:${M}:1` }))?.props.props as { segments: { text: string; icon?: unknown }[] }
  expect(behind.segments.map(g => g.text)).toEqual(['origin/feat'])
  expect(behind.segments[0]?.icon).toBeUndefined()
  await ui.unmount()
})

test('MD-04 on a docked terminal pane Push branch… is a dialog of its own: the remotes, then push; cancel goes back to the menu', async ($, on) => {
  const fake = newFake({ remotes: ['origin', 'github'] })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal', 100))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  await ui.press({ key: 'menu-push' })
  expect(await ui.find({ type: 'Text', text: /^Push feat$/ })).toBeDefined()
  expect(await ui.find({ type: 'Box', key: 'menu-row-checkout' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', key: 'push-remote-github' })).toBeDefined()
  await ui.press({ key: 'push-cancel' })
  expect(await ui.find({ type: 'Box', key: 'menu-row-checkout' })).toBeDefined()
  await ui.press({ key: 'menu-push' })
  await ui.press({ key: 'push-run' })
  expect(callOf(fake, ['push', '-u', 'origin', 'feat'])).toBeGreaterThan(-1)
  await ui.unmount()
})

test('MD-04 on a docked terminal pane Delete branch… is a dialog: force off, it runs on the first press', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal', 100))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  await ui.press({ key: 'menu-delete' })
  expect(await ui.find({ type: 'Text', text: /^Delete feat$/ })).toBeDefined()
  await ui.press({ key: 'menu-opt-force' })
  await ui.press({ key: 'menu-delete-run' })
  expect(callOf(fake, ['branch', '-D', 'feat'])).toBeGreaterThan(-1)
  await ui.unmount()
})

test('MD-04 on a docked terminal pane Rename… is a dialog with the name field; cancel goes back to the menu', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal', 100))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  await ui.press({ key: 'menu-rename' })
  expect(await ui.find({ type: 'Text', text: /^Rename feat$/ })).toBeDefined()
  expect(await ui.find({ type: 'Input', key: 'rename' })).toBeDefined()
  await ui.press({ key: 'rename-cancel' })
  expect(await ui.find({ type: 'Box', key: 'menu-row-checkout' })).toBeDefined()
  await ui.unmount()
})

test('GG-25 on a docked terminal pane a fetch shows in a dialog while it runs; done, the dialog goes and a toast says so', async ($, on) => {
  const toasts: string[] = []
  const fake = newFake()
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal', 100))
  await ui.press({ key: 'fetch' })
  expect(callOf(fake, ['fetch', '--all'])).toBeGreaterThan(-1)
  expect(await ui.find({ type: 'Box', key: 'notice-dialog' })).toBeUndefined()
  expect(toasts.at(-1)).toBe('Fetched remote(s) ✓')
  await ui.unmount()
})

test('GG-25 a failed fetch keeps the dialog: the error centered over a centered Dismiss', async ($, on) => {
  const toasts: string[] = []
  const fake = newFake({ failFetch: true })
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal', 100))
  await ui.press({ key: 'fetch' })
  expect(await ui.find({ type: 'Text', text: /fatal: unable to access remote/ })).toBeDefined()
  expect((await ui.find({ type: 'Box', key: 'notice-actions' }))?.props).toMatchObject({ justifyContent: 'center' })
  expect(toasts.some(t => /unable to access/.test(t))).toBe(true)
  await ui.press({ key: 'notice-dismiss' })
  expect(await ui.find({ type: 'Box', key: 'notice-dialog' })).toBeUndefined()
  await ui.unmount()
})

test('GG-25 while a fetch runs the dialog shows its spinner and label; dismissed, the outcome comes as a toast', async ($, on) => {
  const toasts: string[] = []
  let release = () => {}
  const fake = newFake({ hold: new Promise<void>(r => (release = r)) })
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal', 100))
  const pressing = ui.press({ key: 'fetch' })
  await fake.clock?.advance(10)
  expect(await ui.find({ type: 'Text', text: /Fetching remote\(s\)…/ })).toBeDefined()
  await ui.press({ key: 'notice-dismiss' })
  expect(await ui.find({ type: 'Box', key: 'notice-dialog' })).toBeUndefined()
  release()
  await pressing
  expect(toasts.at(-1)).toBe('Fetched remote(s) ✓')
  await ui.unmount()
})
