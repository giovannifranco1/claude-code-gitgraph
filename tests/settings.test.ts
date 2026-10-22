import { expect, test } from 'claude-code/testing'

import { addRemoteArgs, isRemoteName, isRemoteUrl, parseRemotes, userConfigArgs } from '../hooks/settings'

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
  expect(addRemoteArgs(' fork ', ' git@h:me/a.git ')).toEqual(['remote', 'add', 'fork', 'git@h:me/a.git'])
  expect(addRemoteArgs('-x', 'git@h:a')).toBeNull()
  expect(addRemoteArgs('fork', '-x')).toBeNull()
})
