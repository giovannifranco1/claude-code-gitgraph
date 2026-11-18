import type { ChangelogVersion } from '../types'

const SEMVER = /^\d+\.\d+\.\d+$/

// Keep a Changelog: `## [1.6.0] - 2026-11-18`, `### Adicionado`, `- item`; an indented line
// after an item goes on with it. Versions in the file's order (newest first).
export function parseChangelog(md: string): ChangelogVersion[] {
  const out: ChangelogVersion[] = []
  for (const text of md.split('\n')) {
    const version = /^##\s+\[?(\d+\.\d+\.\d+)\]?(?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/.exec(text)
    if (version) {
      out.push({ version: version[1] ?? '', date: version[2] ?? null, groups: [] })
      continue
    }
    const groups = out.at(-1)?.groups
    const title = /^###\s+(.+)$/.exec(text)?.[1]
    if (groups && title) {
      groups.push({ title: title.trim(), items: [] })
      continue
    }
    const items = groups?.at(-1)?.items
    if (!items) continue
    const item = /^[-*]\s+(.+)$/.exec(text)?.[1]
    if (item) items.push(item.trim())
    else if (/^\s+\S/.test(text) && items.length) items[items.length - 1] += ` ${text.trim()}`
  }
  return out
}

// The `version` of a plugin.json, when it is semver.
export function versionOf(json: string): string | null {
  try {
    const version = (JSON.parse(json) as { version?: unknown }).version
    return typeof version === 'string' && SEMVER.test(version) ? version : null
  } catch {
    return null
  }
}
