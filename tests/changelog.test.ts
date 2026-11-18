import { expect, test } from 'claude-code/testing'

import { parseChangelog, versionOf } from '../hooks/changelog'

const MD = `# Changelog

Intro paragraph.

## [1.6.0] - 2026-11-18

### Adicionado

- Item um
  que continua na linha de baixo.
- Item dois

### Corrigido

* Fix

## 1.5.1

### Mudado

- Só isto
`

test('CL-02 the changelog parses into versions, groups and items, newest first', () => {
  expect(parseChangelog(MD)).toEqual([
    {
      version: '1.6.0',
      date: '2026-11-18',
      groups: [
        { title: 'Adicionado', items: ['Item um que continua na linha de baixo.', 'Item dois'] },
        { title: 'Corrigido', items: ['Fix'] },
      ],
    },
    { version: '1.5.1', date: null, groups: [{ title: 'Mudado', items: ['Só isto'] }] },
  ])
})

test('CL-02 a text with no version has no versions', () => {
  expect(parseChangelog('# Changelog\n\n- loose item\n')).toEqual([])
})

test('CL-02 the installed version comes from plugin.json; anything else is unknown', () => {
  expect(versionOf('{ "name": "gitgraph", "version": "1.6.0" }')).toBe('1.6.0')
  expect(versionOf('{ "version": "next" }')).toBeNull()
  expect(versionOf('not json')).toBeNull()
})
