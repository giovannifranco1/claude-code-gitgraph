import { expect, test } from 'claude-code/testing'

import { addRemotePlan, isRemoteName, isRemoteUrl, parseRemotes, userConfigArgs } from '../hooks/settings'

test('GG-13 remotes come from git remote -v, fetch and push URLs apart', async () => {
  const out = 'github\tgit@github.com:me/app.git (fetch)\ngithub\tgit@github.com:me/app.git (push)\norigin\thttps://x.io/a.git (fetch)\norigin\thttps://push.x.io/a.git (push)\n'
  expect(parseRemotes(out)).toEqual([
    { name: 'github', fetchUrl: 'git@github.com:me/app.git', pushUrl: 'git@github.com:me/app.git' },
    { name: 'origin', fetchUrl: 'https://x.io/a.git', pushUrl: 'https://push.x.io/a.git' },
  ])
  expect(parseRemotes('')).toEqual([])
})

test('GG-13 user name and email are set per scope, and unset when empty', async () => {
  expect(userConfigArgs('local', 'name', 'Giovanni Franco')).toEqual(['config', '--local', 'user.name', 'Giovanni Franco'])
  expect(userConfigArgs('global', 'email', ' g@x.io ')).toEqual(['config', '--global', 'user.email', 'g@x.io'])
  expect(userConfigArgs('local', 'email', '  ')).toEqual(['config', '--local', '--unset', 'user.email'])
  expect(userConfigArgs('local', 'email', 'not-an-email')).toBeNull()
})

test('GG-13 remote names and URLs are validated before git sees them', async () => {
  for (const ok of ['origin', 'github', 'my-fork', 'team/upstream', 'a.b_c']) expect({ ok, valid: isRemoteName(ok) }).toEqual({ ok, valid: true })
  for (const bad of ['', '-f', '--mirror', 'a b', 'x;y', 'x$(id)']) expect({ bad, valid: isRemoteName(bad) }).toEqual({ bad, valid: false })
  for (const ok of ['https://github.com/me/a.git', 'git@github.com:me/a.git', '../local/repo', 'ssh://h/x']) expect({ ok, valid: isRemoteUrl(ok) }).toEqual({ ok, valid: true })
  for (const bad of ['', '  ', '--upload-pack=x', '-u', 'has space']) expect({ bad, valid: isRemoteUrl(bad) }).toEqual({ bad, valid: false })
})

test('GG-13 adding a remote passes name and URL as their own arguments', async () => {
  const url = 'git@github.com:giovannifranco1/claude-code-gitgraph.git'
  expect(addRemotePlan(' fork ', ` ${url} `, ['origin'])).toEqual({ args: ['remote', 'add', 'fork', url] })
  expect(addRemotePlan('-x', url, [])).toEqual({ error: 'Invalid remote name: "-x"' })
  expect(addRemotePlan('fork', '-x', [])).toEqual({ error: 'Invalid URL: "-x"' })
})

test('GG-13 an empty name is origin, as the field suggests, unless origin exists', async () => {
  const url = 'git@github.com:me/a.git'
  expect(addRemotePlan('', url, [])).toEqual({ args: ['remote', 'add', 'origin', url] })
  expect(addRemotePlan('  ', url, ['github'])).toEqual({ args: ['remote', 'add', 'origin', url] })
  expect(addRemotePlan('', url, ['origin'])).toEqual({ error: 'Enter a name for the remote: origin already exists' })
  expect(addRemotePlan('origin', url, ['origin'])).toEqual({ error: 'Remote "origin" already exists' })
})
