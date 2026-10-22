import { expect, test } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

const US = '\x1f'
const RS = '\x1e'
const M = 'aaaaaaa1'
const A = 'bbbbbbb2'
const B = 'ccccccc3'
const R = 'ddddddd4'

type Fake = { isRepo: boolean; extra: number; rev: number; calls: string[][] }

function logOf(fake: Fake): string {
  const row = (...f: string[]) => f.join(US) + RS + '\n'
  let out =
    row(M, `${A} ${B}`, 'HEAD -> main, origin/main', 'Ana', '1700000000', 'Merge feat') +
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
      return ok(`${M} refs/heads/main\n${B} refs/heads/feat\n${M} refs/remotes/origin/main\nrev${fake.rev} refs/heads/moving\n`)
    case 'show':
      return ok([B, 'Bia', 'bia@x.io', '1699980000', 'Work on feat\n\nDetails here\n'].join(US) + RS + '\n\n3\t1\tsrc/feat.ts\n')
    case 'check-ref-format':
      return /^[a-z-]+$/.test(rest[1] ?? '') ? ok(`${rest[1]}\n`) : fail('fatal: not a valid branch name')
    default:
      return ok()
  }
}

async function setup($: Engine, on: On, fake: Fake, copied: string[] = []) {
  on('command.register', () => ({ value: { command: 'gitgraph' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('process.run', (_, e) => ({ value: answer(fake, e.argv) }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('command.run', () => ({ text: '' }))
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  return $.command.run({ command: 'gitgraph', args: '' } as never)
}

const pane = (surface: 'terminal' | 'desktop') =>
  ({
    plugin: 'gitgraph',
    component: 'Pane',
    requestId: 'gitgraph',
    surface,
    props: {
      title: 'Git Graph',
      isFocused: false,
      bodyColumns: 100,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 40 },
      view: {},
    },
  }) as const

const newFake = (over: Partial<Fake> = {}): Fake => ({ isRepo: true, extra: 0, rev: 0, calls: [], ...over })
const logCalls = (fake: Fake) => fake.calls.filter(c => c[1] === 'log')

test('GG-01 /gitgraph opens the pane and draws commits, refs and the graph', async ($, on) => {
  const fake = newFake()
  await setup($, on, fake)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(pane(surface))
    expect((await ui.find({ type: 'Text', text: /Merge feat/ }))?.text).toContain('Merge feat')
    expect(await ui.find({ type: 'Text', text: /HEAD → main/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /tag: v0\.1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /─╮/ })).toBeDefined()
    await ui.unmount()
  }
  expect(logCalls(fake)[0]).toContain('--all')
})

test('GG-02 outside a repository the pane says so', async ($, on) => {
  await setup($, on, newFake({ isRepo: false }))
  const ui = await $.ui.mount(pane('terminal'))
  expect(await ui.find({ type: 'Text', text: /Não é um repositório git/ })).toBeDefined()
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
  expect(fake.calls.map(c => c[1]).sort()).toEqual(['for-each-ref', 'log', 'status'])
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
