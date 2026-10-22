import { expect, mock, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

const US = '\x1f'
const RS = '\x1e'
const M = 'aaaaaaa1'
const A = 'bbbbbbb2'
const B = 'ccccccc3'
const R = 'ddddddd4'

type Fake = { isRepo: boolean; extra: number; rev: number; calls: string[][]; envs: Record<string, string>[]; headRefs?: string; remotes?: string[]; failPush?: string; clock?: ReturnType<typeof mock.clock> }

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

function answer(fake: Fake, argv: readonly string[]) {
  fake.calls.push([...argv])
  const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })
  const fail = (stderr: string) => ({ ...ok(), exitCode: 128, stderr })
  const [, verb, ...rest] = argv
  if (!fake.isRepo) return fail('fatal: not a git repository')
  switch (verb) {
    case 'log':
      return ok(logOf(fake))
    case 'status':
      return ok(`# branch.oid ${M}\n# branch.head main\n1 .M N... 100644 100644 100644 x y src/a.ts\n`)
    case 'for-each-ref':
      return ok(`${M} refs/heads/main\n${B} refs/heads/feat\n${(fake.remotes ?? ['origin']).map(r => `${M} refs/remotes/${r}/main\n`).join('')}rev${fake.rev} refs/heads/moving\n`)
    case 'show':
      return ok([B, 'Bia', 'bia@x.io', '1699980000', 'Work on feat\n\nDetails here\n'].join(US) + RS + '\n\n3\t1\tsrc/feat.ts\n')
    case 'push':
      return rest.includes(fake.failPush ?? '\0') ? fail('fatal: could not read Username') : ok()
    case 'config': {
      const values: Record<string, string> = { '--local user.name': 'Gio Local', '--global user.name': 'Gio', '--global user.email': 'gio@x.io' }
      return rest.includes('--get') ? ok(`${values[`${rest[0]} ${rest[2]}`] ?? ''}\n`) : ok()
    }
    case 'remote':
      return rest[0] === '-v' ? ok((fake.remotes ?? ['origin']).map(r => `${r}\thttps://git.example/${r}.git (fetch)\n${r}\thttps://git.example/${r}.git (push)\n`).join('')) : ok()
    case 'rev-parse':
      return rest[2] === `${'dead'}^{commit}` ? fail('') : ok(`${M}\n`)
    case 'check-ref-format':
      return /^[a-z-]+$/.test(rest[1] ?? '') ? ok(`${rest[1]}\n`) : fail('fatal: not a valid branch name')
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
  on('process.run', (_, e) => {
    fake.envs.push({ ...(e.init?.env ?? {}) })
    return { value: answer(fake, e.argv) }
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

const newFake = (over: Partial<Fake> = {}): Fake => ({ isRepo: true, extra: 0, rev: 0, calls: [], envs: [], ...over })
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
  expect(gitCalls(fake).map(c => c[1]).sort()).toEqual(['for-each-ref', 'log', 'status'])
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
  expect(fake.envs[at]).toEqual({ GIT_TERMINAL_PROMPT: '0' })
  await ui.unmount()
})

test('GG-12 a left click on a pill selects its commit', async ($, on) => {
  await setup($, on, newFake())
  const ui = await $.ui.mount(pane('terminal'))
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: `pill:${B}:0` })
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
  for (const key of ['refresh', 'settings']) expect((await ui.find({ type: 'Button', key }))?.props.hotkey).toBeUndefined()
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

test('GG-16 a hash search selects the commit and scrolls to it', async ($, on) => {
  const toasts: string[] = []
  const fk = newFake({ extra: 300 })
  await setup($, on, fk, [], toasts)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.input({ key: 'search', text: 'E000020' })
  expect(fk.calls.at(-1)?.slice(-2)).toEqual(['--format=%H%x1f%an%x1f%ae%x1f%at%x1f%B%x1e', 'e0000200'])
  await ui.unmount()
  const there = await $.ui.mount(pane('terminal', 100, 200))
  expect(await there.find({ type: 'Text', text: /bia@x\.io/ })).toBeDefined()
  await there.input({ key: 'search', text: 'xyz' })
  expect(toasts.at(-1)).toMatch(/Invalid hash/)
  await there.input({ key: 'search', text: 'dead' })
  expect(toasts.at(-1)).toBe('No commit with hash dead')
  await there.input({ key: 'search', text: 'beef' })
  expect(toasts.at(-1)).toMatch(/not among the \d+ loaded/)
  await there.unmount()
})

test('GG-17 refresh reloads the graph and the open commit, then flashes "updated"', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  const ui = await $.ui.mount(pane('terminal'))
  await ui.press({ key: B })
  const logs = logCalls(fake).length
  const shows = gitCalls(fake).filter(c => c[1] === 'show').length
  await ui.press({ key: 'refresh' })
  expect(logCalls(fake).length).toBe(logs + 1)
  expect(gitCalls(fake).filter(c => c[1] === 'show').length).toBe(shows + 1)
  expect((await ui.find({ type: 'Button', key: 'refresh' }))?.text).toContain('updated')
  await fake.clock?.advance(2_000)
  expect((await ui.find({ type: 'Button', key: 'refresh' }))?.text).toContain('refresh')
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
