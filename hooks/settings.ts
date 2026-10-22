import type { ConfigScope, RemoteInfo } from '../types'

// `git remote -v`: `<name>\t<url> (fetch|push)`, one line per direction.
export function parseRemotes(stdout: string): RemoteInfo[] {
  const remotes = new Map<string, RemoteInfo>()
  for (const line of stdout.split('\n')) {
    const match = line.match(/^(\S+)\t(.+) \((fetch|push)\)$/)
    if (!match) continue
    const [, name = '', url = '', direction] = match
    const remote = remotes.get(name) ?? { name, fetchUrl: '', pushUrl: '' }
    if (direction === 'fetch') remote.fetchUrl = url
    else remote.pushUrl = url
    remotes.set(name, remote)
  }
  return [...remotes.values()]
}

// Sets `user.<key>` in the scope, or unsets it when empty; null for an email without `@`.
export function userConfigArgs(scope: ConfigScope, key: 'name' | 'email', value: string): string[] | null {
  const trimmed = value.trim()
  if (trimmed === '') return ['config', `--${scope}`, '--unset', `user.${key}`]
  if (key === 'email' && !trimmed.includes('@')) return null
  return ['config', `--${scope}`, `user.${key}`, trimmed]
}

export const isRemoteName = (name: string) => /^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/.test(name)

export const isRemoteUrl = (url: string) => url.length > 0 && !url.startsWith('-') && !/\s/.test(url)

export function addRemoteArgs(name: string, url: string): string[] | null {
  const [n, u] = [name.trim(), url.trim()]
  return isRemoteName(n) && isRemoteUrl(u) ? ['remote', 'add', n, u] : null
}
