import { expect, mock, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

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
  // The commit HEAD is on (M by default), as after a reset.
  head?: string
  remotes?: string[]
  failPush?: string
  clock?: ReturnType<typeof mock.clock>
  // Git Flow: which CLI answers `git flow`, the repository's gitflow.* config, the branch
  // checked out, and a flow verb that stops on a conflict.
  flow?: 'next' | 'other' | 'none'
  flowConfig?: string
  branch?: string
  conflictOn?: string
  isConflicted?: boolean
  // A push waits on this, so a test can look at the pane while the action runs.
  hold?: Promise<void>
  // `-c` settings a call carried, as `<verb>: <key=value>`.
  configs: string[]
  // Each call's working directory, in the order of `calls`; what the repo search prints.
  cwds: string[]
  repos?: string
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
    row(B, R, 'feat, tag: v0.1', 'Bia', '1699980000', 'Work on feat')
  let parent = R
  for (let i = 0; i < fake.extra; i++) {
    const hash = `e${String(i).padStart(7, '0')}`
    out += row(parent, hash, '', 'Bot', '1600000000', `filler ${i}`)
    parent = hash
  }
  return out + row(parent, '', '', 'Ana', '1600000000', 'Initial')
}

function answer(fake: Fake, raw: readonly string[], cwd = '.') {
  // `git -c key=value …`: the config is kept apart, the call recorded without it.
  const hasConfig = raw[0] === 'git' && raw[1] === '-c'
  const argv = hasConfig ? ['git', ...raw.slice(3)] : raw
  if (hasConfig) fake.configs.push(`${argv[1]}: ${raw[2]}`)
  fake.calls.push([...argv])
  fake.cwds.push(cwd)
  const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  const fail = (stderr: string) => ({ ...ok(), exitCode: 128, stderr })
  const [, verb, ...rest] = argv
  if (argv[0] === 'find') return ok(fake.repos ?? '')
  // `isRepo: false` is the session folder only: the repos found below it are repos.
  if (!fake.isRepo && cwd === '.') return fail('fatal: not a git repository')
  switch (verb) {
    case 'log':
      return ok(logOf(fake))
    case 'status':
      return ok(`# branch.oid ${fake.head ?? M}\n# branch.head ${fake.branch ?? 'main'}\n1 .M N... 100644 100644 100644 x y src/a.ts\n${fake.isConflicted ? 'u UU N... 100644 100644 100644 100644 a b c src/b.ts\n' : ''}`)
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
    case 'tag':
      return ok('1.0.0\n1.0.1\n')
    case 'for-each-ref':
      return ok(`${M} refs/heads/main\n${B} refs/heads/feat\n${(fake.remotes ?? ['origin']).map(r => `${M} refs/remotes/${r}/main\n`).join('')}rev${fake.rev} refs/heads/moving\n`)
    case 'show':
      return ok([B, 'Bia', 'bia@x.io', '1699980000', 'Work on feat\n\nDetails here\n'].join(US) + RS + '\n\n3\t1\tsrc/feat.ts\n')
    case 'push':
      return rest.includes(fake.failPush ?? '\0') ? fail('fatal: could not read Username') : ok()
    case 'config': {
      if (rest[0] === '--get-regexp') return fake.flowConfig === '' ? fail('') : ok(fake.flowConfig ?? FLOW_CONFIG)
      const values: Record<string, string> = { '--local user.name': 'Gio Local', '--global user.name': 'Gio', '--global user.email': 'gio@x.io' }
      return rest.includes('--get') ? ok(`${values[`${rest[0]} ${rest[2]}`] ?? ''}\n`) : ok()
    }
    case 'remote':
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
  on('ui.open', () => ({ value: { isPlaced: true } }))
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
    if (fake.hold && e.argv.includes('push')) await fake.hold
    return { value: answer(fake, e.argv, e.init?.cwd) }
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
    expect(head?.props.props).toMatchObject({ name: '● main', remotes: ' ⇄ origin', isBold: true })
    expect((await ui.find({ type: 'Client', key: `pill:${B}:1` }))?.props.props).toMatchObject({ name: '◆ v0.1' })
    expect(await ui.find({ type: 'Text', text: /─╮/ })).toBeDefined()
    await ui.unmount()
  }
  expect(logCalls(fake)[0]).toContain('--all')
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

test('GG-05 the scope toggle reloads with HEAD only', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'scope' })
  const last = logCalls(fake).at(-1) ?? []
  expect(last).toContain('HEAD')
  expect(last).not.toContain('--all')
  await ui.unmount()
})

test('GG-06 past 300 commits a load-more button fetches the next page', async ($, on) => {
  const fake = newFake({ extra: 300 })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
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

test('GG-09 a load runs git in one parallel batch of three processes', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const flow = ['flow', 'config', 'tag']
  expect(gitCalls(fake).map(c => c[1] ?? '').filter(v => !flow.includes(v)).sort()).toEqual(['for-each-ref', 'log', 'status'])
})

test('GG-10 checkout and cherry-pick run only on the second press', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: B })
  await ui.press({ key: 'checkout' })
  expect(fake.calls.some(c => c[1] === 'checkout')).toBe(false)
  await ui.press({ key: 'checkout' })
  expect(fake.calls).toContainEqual(['git', 'checkout', 'feat'])
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
  await ui.press({ key: 'reset' })
  expect(fake.calls.some(c => c[1] === 'reset')).toBe(false)
  await ui.press({ key: 'reset' })
  expect(fake.calls).toContainEqual(['git', 'reset', '--soft', B])
  await ui.unmount()
})

test('GG-19 on a narrow pane the commit actions go on in more rows, none cut off', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal', 50))
  await ui.press({ key: B })
  expect(await ui.find({ type: 'Box', key: 'detail-actions-1' })).toBeDefined()
  for (const key of ['copy', 'checkout', 'pick', 'reset']) expect(await ui.find({ type: 'Button', key })).toBeDefined()
  await ui.unmount()
})

test('GG-19 the commit HEAD is on offers no reset', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: M })
  expect(await ui.find({ key: 'reset' })).toBeUndefined()
  await ui.unmount()
})

test('GG-19 after a reset, the commit left behind (kept by its pushed ref) resets the branch back', async ($, on) => {
  // HEAD moved back to A; M is still drawn through origin/main.
  const fake = newFake({ head: A, headRefs: 'origin/main' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: M })
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
  expect((await vs.find({ type: 'Text', text: /● main/ }))?.text).toContain('⇄ origin')
  expect(await vs.find({ type: 'Text', text: /◆ v0\.1/ })).toBeDefined()
  expect(await vs.find({ type: 'Text', text: /^\ue0b4/ })).toBeDefined()
  await vs.unmount()
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

test('GG-12 a left click on a pill selects its commit once no second click follows', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `pill:${B}:0` })
  expect(await ui.find({ type: 'Text', text: /bia@x\.io/ })).toBeUndefined()
  await fake.clock?.advance(1_000)
  expect(await ui.find({ type: 'Text', text: /bia@x\.io/ })).toBeDefined()
  await ui.unmount()
})

test('GG-12 the menu is reachable from the commit details and renames with a validated name', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  for (const surface of ['terminal', 'vscode'] as const) {
    const ui = await $.ui.mount(pane(surface))
    await ui.press({ key: B })
    await ui.press({ key: 'refmenu-0' })
    expect(await ui.find({ key: 'menu-merge' })).toBeDefined()
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

test('GG-14 a double click on a branch pill checks it out; a single click does not', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `pill:${B}:0` })
  expect(callOf(fake, ['checkout', 'feat'])).toBe(-1)
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `pill:${B}:0` })
  expect(callOf(fake, ['checkout', 'feat'])).toBeGreaterThan(-1)
  await fake.clock?.advance(1_000)
  expect(gitCalls(fake).some(c => c[1] === 'show')).toBe(false)
  expect(await ui.find({ type: 'Text', text: /bia@x\.io/ })).toBeUndefined()
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
  expect(await ui.find({ type: 'Text', text: /commits/ })).toBeDefined()
  await ui.unmount()
})

test('GG-15 only the rows near the window are drawn; the rest are spacers', async ($, on) => {
  await setup($, on, newFake({ extra: 300 }))
  const top = await $.ui.mount(pane('terminal'))
  expect(await top.find({ type: 'Button', key: M })).toBeDefined()
  expect(await top.find({ type: 'Button', key: 'e0000250' })).toBeUndefined()
  expect(await top.find({ type: 'Box', key: 'space-after' })).toBeDefined()
  await top.unmount()
  const deep = await $.ui.mount(pane('terminal', 100, 255))
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
  await ui.input({ key: 'search', text: 'E000020' })
  expect(fk.calls.at(-1)?.slice(-2)).toEqual(['--format=%H%x1f%an%x1f%ae%x1f%at%x1f%B%x1e', 'e0000200'])
  // A commit found closes the search.
  expect(await ui.find({ type: 'Input', key: 'search' })).toBeUndefined()
  await ui.unmount()
  const there = await $.ui.mount(pane('terminal', 100, 200))
  expect(await there.find({ type: 'Text', text: /bia@x\.io/ })).toBeDefined()
  await there.press({ key: 'search-toggle' })
  await there.input({ key: 'search', text: 'xyz' })
  expect(toasts.at(-1)).toMatch(/Invalid hash/)
  await there.input({ key: 'search', text: 'dead' })
  expect(toasts.at(-1)).toBe('No commit with hash dead')
  await there.input({ key: 'search', text: 'beef' })
  expect(toasts.at(-1)).toMatch(/not among the \d+ loaded/)
  await there.unmount()
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

test('GG-18 the fetch button fetches every remote and reloads the graph', async ($, on) => {
  const toasts: string[] = []
  const fake = newFake()
  await setup($, on, fake, [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  const logs = logCalls(fake).length
  await ui.press({ key: 'fetch' })
  expect(callOf(fake, ['fetch', '--all'])).toBeGreaterThan(-1)
  expect(toasts.at(-1)).toBe('Fetched all remotes ✓')
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

test('GF-01 the footer bar shows the git flow actions as icons, with no base names', async ($, on) => {
  await setup($, on, newFake())
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    for (const kind of ['feature', 'release', 'hotfix']) {
      const text = (await ui.find({ type: 'Button', key: `flow-start-${kind}` }))?.text ?? ''
      expect(text).toContain(kind)
      expect(text).not.toContain('←')
    }
    expect(await ui.find({ key: 'flow-finish' })).toBeUndefined()
    expect(await ui.find({ key: 'flow-name' })).toBeUndefined()
    await ui.unmount()
  }
})

test('GF-01 on a docked terminal pane the footer is pinned to the bottom of the window', async ($, on) => {
  await setup($, on, newFake({ extra: 100 }))
  const ui = await $.ui.mount(pane('terminal', 100, 30))
  expect((await ui.find({ type: 'Box', key: 'flow-footer' }))?.props).toMatchObject({ position: 'absolute', top: 30 + 40 - 2 })
  await ui.unmount()
})

test('GF-01 a form grows the pinned footer by its rows, keeping it on the bottom edge', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-start-feature' })
  expect((await ui.find({ type: 'Box', key: 'flow-footer' }))?.props).toMatchObject({ top: 40 - 3, height: 3 })
  await ui.unmount()
})

test('GF-01 the bar counts the frame of its buttons and wide icons, wrapping before the right edge', async ($, on) => {
  await setup($, on, newFake({ branch: 'feature/login' }))
  // 54 columns held the bar on one row when only the labels were counted; it takes 67.
  const narrow = await $.ui.mount(pane('terminal', 54))
  expect((await narrow.find({ type: 'Box', key: 'flow-footer' }))?.props).toMatchObject({ height: 3 })
  await narrow.unmount()
  const wide = await $.ui.mount(pane('terminal', 68))
  expect((await wide.find({ type: 'Box', key: 'flow-footer' }))?.props).toMatchObject({ height: 2 })
  await wide.unmount()
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
  expect(await ui2.find({ type: 'Button', key: 'flow-start-feature' })).toBeDefined()
  await ui2.unmount()
})

for (const [over, text, name] of [
  [{ flow: 'none' }, /git flow is not installed/, 'not installed'],
  [{ flow: 'other' }, /need git-flow-next/, 'another git flow'],
  [{ flowConfig: '' }, /main · develop · feature\//, 'not set up'],
] as const)
  test(`GF-02 the drawer says when git flow is ${name}, with no actions`, async ($, on) => {
    await setup($, on, newFake(over))
    const ui = await $.ui.mount(pane('terminal'))
    expect(await ui.find({ type: 'Text', text })).toBeDefined()
    expect(await ui.find({ key: 'flow-start-feature' })).toBeUndefined()
    await ui.unmount()
  })

test('GF-02 Start git flow sets it up with the standard names (git flow init -d) on the second press', async ($, on) => {
  const fake = newFake({ flowConfig: '' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-init' })
  expect(flowCalls(fake)).toEqual([])
  await ui.press({ key: 'flow-init' })
  expect(flowCalls(fake)).toEqual([['git', 'flow', 'init', '-d']])
  await ui.unmount()
})

test('GF-03 start validates the full branch name and passes the name as its own argument', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
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
  await ui.press({ key: 'flow-start-release' })
  expect((await ui.find({ type: 'Input', key: 'flow-name' }))?.props).toMatchObject({ value: '1.1.0' })
  await ui.press({ key: 'flow-start-hotfix' })
  expect((await ui.find({ type: 'Input', key: 'flow-name' }))?.props).toMatchObject({ value: '1.0.2' })
  await ui.unmount()
})

test('GF-04 on a work branch the drawer offers update (confirmed) and publish', async ($, on) => {
  const fake = newFake({ branch: 'feature/login' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Text', text: /feature\/login/ })).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'flow-update' }))?.text).toContain('rebase')
  await ui.press({ key: 'flow-update' })
  expect(flowCalls(fake)).toEqual([])
  await ui.press({ key: 'flow-update' })
  await ui.press({ key: 'flow-publish' })
  await ui.press({ key: 'flow-publish' })
  expect(flowCalls(fake)).toEqual([
    ['git', 'flow', 'feature', 'update', 'login'],
    ['git', 'flow', 'feature', 'publish', 'login'],
  ])
  await ui.unmount()
})

test('GF-05 finish follows the switches, then pushes the parent with the tags', async ($, on) => {
  const fake = newFake({ branch: 'feature/login' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-finish' })
  expect(flowCalls(fake)).toEqual([])
  await ui.press({ key: 'flow-opt-keep' })
  await ui.press({ key: 'flow-finish-run' })
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
  await ui.press({ key: 'flow-finish' })
  expect((await ui.find({ type: 'Input', key: 'flow-tag' }))?.props).toMatchObject({ value: 'Release 1.1.0' })
  await ui.input({ key: 'flow-tag', text: 'Big release', kind: 'change' })
  await ui.press({ key: 'flow-finish-run' })
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
  await ui.press({ key: 'flow-finish' })
  await ui.press({ key: 'flow-finish-run' })
  await ui.press({ key: 'flow-finish-run' })
  expect(fake.calls.some(c => c[1] === 'push')).toBe(false)
  await ui.unmount()
})

test('GF-06 a finish stopped by a conflict offers continue and abort', async ($, on) => {
  const fake = newFake({ branch: 'feature/login', conflictOn: 'finish' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-finish' })
  await ui.press({ key: 'flow-finish-run' })
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
  await ui.press({ key: 'flow-update' })
  await ui.press({ key: 'flow-update' })
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
  await ui.press({ key: 'flow-finish-run' })
  expect(callOf(fake, ['flow', 'feature', 'finish', 'login', '--no-ff', '--keep'])).toBeGreaterThan(-1)
  await ui.unmount()
})

test('GF-01 on a narrow pane the bar goes on in a second row; a wide one keeps one row', async ($, on) => {
  await setup($, on, newFake({ branch: 'feature/login' }))
  const narrow = await $.ui.mount(pane('terminal', 40))
  expect((await narrow.find({ type: 'Box', key: 'flow-footer' }))?.props).toMatchObject({ height: 3 })
  expect(await narrow.find({ type: 'Button', key: 'flow-publish' })).toBeDefined()
  await narrow.unmount()
  const wide = await $.ui.mount(pane('terminal', 100))
  expect((await wide.find({ type: 'Box', key: 'flow-footer' }))?.props).toMatchObject({ height: 2 })
  await wide.unmount()
})

test('GF-02 a repository with git flow AVH config gets the actions, not an empty bar', async ($, on) => {
  const avh = 'gitflow.branch.master main\ngitflow.branch.develop develop\ngitflow.prefix.feature feature/\ngitflow.prefix.hotfix hotfix/\n'
  await setup($, on, newFake({ flowConfig: avh }))
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Button', key: 'flow-start-feature' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'flow-start-hotfix' })).toBeDefined()
  await ui.unmount()
})

test('GF-08 git flow runs with an empty hooks folder of the mod: repo hooks stay off and git-flow-next finds no hook', async ($, on) => {
  const fake = newFake({ branch: 'feature/login' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-start-feature' })
  await ui.input({ key: 'flow-name', text: 'search' })
  await ui.press({ key: 'flow-publish' })
  await ui.press({ key: 'flow-publish' })
  const flows = fake.configs.filter(c => c.startsWith('flow:'))
  expect(flows.length).toBe(2)
  expect(flows.every(c => /^flow: core\.hooksPath=.+\/nohooks$/.test(c))).toBe(true)
  expect(fake.configs.filter(c => !c.startsWith('flow:'))).toEqual([])
  await ui.unmount()
})

test('GF-08 publish and finish run only on a second press, in the bar and in the branch menu', async ($, on) => {
  const fake = newFake({ branch: 'feature/login', headRefs: 'HEAD -> feature/login' })
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: 'flow-publish' })
  await ui.press({ key: 'flow-finish' })
  await ui.press({ key: 'flow-finish-run' })
  expect(flowCalls(fake)).toEqual([])
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${M}:0` })
  await ui.press({ key: 'menu-flow-publish' })
  expect(flowCalls(fake)).toEqual([])
  await ui.press({ key: 'menu-flow-publish' })
  expect(flowCalls(fake)).toEqual([['git', 'flow', 'feature', 'publish', 'login']])
  await ui.unmount()
})


test('GF-01 the bar is always showing: no title to open, and finish, rebase and publish as words', async ($, on) => {
  await setup($, on, newFake({ branch: 'feature/login' }))
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ key: 'flow-toggle' })).toBeUndefined()
  for (const key of ['flow-finish', 'flow-update', 'flow-publish']) expect((await ui.find({ type: 'Button', key }))?.text).toMatch(/^(finish|rebase|publish)$/)
  expect(await ui.find({ key: 'flow-delete' })).toBeUndefined()
  await ui.unmount()
})

test('GG-12 Delete branch asks with force off; it runs on a second press, -D only when force is ticked', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${B}:0` })
  expect((await ui.find({ type: 'Button', key: 'menu-delete' }))?.text).toBe('Delete branch…')
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

test('GG-12 a long branch menu grows rows instead of hiding items: Delete branch and Copy name stay', async ($, on) => {
  await setup($, on, newFake({ headRefs: 'HEAD -> main, feature/login' }))
  const ui = await $.ui.mount(pane('terminal', 70))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'right', in: `pill:${M}:1` })
  const rows = []
  for (let n = 0; n < 8; n++) {
    const row = await ui.find({ type: 'Box', key: `menu-items-${n}` })
    if (row) rows.push(row)
  }
  expect(rows.length).toBeGreaterThan(2)
  expect(await ui.find({ type: 'Button', key: 'menu-delete' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'menu-copy' })).toBeDefined()
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
