import { expect, test } from 'claude-code/testing'

import type { FlowConfig, FlowInitForm } from '../types'
import { branchNamesOf, initArgs, initFormFor, initFormError, staleBaseArgs, trimForm } from '../hooks/flowinit'
import { parseFlowConfig } from '../hooks/flow'

const FORM: FlowInitForm = { main: 'master', develop: 'dev', feature: 'feat/', bugfix: 'fix/', release: 'rel/', hotfix: 'hot/', tag: 'v' }

test('FI-01 branch names come from local and remote refs, without the remote', () => {
  expect(branchNamesOf('refs/heads/master\nrefs/heads/feat/a\nrefs/remotes/origin/fix/b\nrefs/remotes/origin/HEAD\n')).toEqual(['master', 'feat/a', 'fix/b'])
})

test('FI-01 the form starts from the standard names in an empty repository', () => {
  expect(initFormFor([], null)).toEqual({ main: 'main', develop: 'develop', feature: 'feature/', bugfix: 'bugfix/', release: 'release/', hotfix: 'hotfix/', tag: '' })
})

test('FI-01 the form detects master, dev and the short prefixes already in use', () => {
  const form = initFormFor(['master', 'dev', 'feat/login', 'fix/typo', 'release/1.0'], null)
  expect(form).toMatchObject({ main: 'master', develop: 'dev', feature: 'feat/', bugfix: 'fix/', release: 'release/', hotfix: 'hotfix/' })
})

test('FI-01 main wins over master and develop over dev; a long prefix in use wins over the short one', () => {
  expect(initFormFor(['main', 'master', 'develop', 'dev', 'feature/a', 'feat/b'], null)).toMatchObject({ main: 'main', develop: 'develop', feature: 'feature/' })
})

test('FI-02 reconfiguring starts from the current config', () => {
  const config = parseFlowConfig(
    [
      'gitflow.branch.master.type base',
      'gitflow.branch.dev.type base',
      'gitflow.branch.dev.parent master',
      'gitflow.branch.feature.type topic',
      'gitflow.branch.feature.parent dev',
      'gitflow.branch.feature.prefix feat/',
      'gitflow.branch.release.type topic',
      'gitflow.branch.release.parent master',
      'gitflow.branch.release.prefix rel/',
      'gitflow.branch.release.tagprefix v',
    ].join('\n'),
  ) as FlowConfig
  expect(initFormFor(['main', 'develop'], config)).toEqual({ main: 'master', develop: 'dev', feature: 'feat/', bugfix: 'bugfix/', release: 'rel/', hotfix: 'hotfix/', tag: 'v' })
})

test('FI-01 the init runs git flow init -d with every name, the tag prefix only when set', () => {
  expect(initArgs(FORM, false)).toEqual(['flow', 'init', '-d', '--main', 'master', '--develop', 'dev', '--feature', 'feat/', '--bugfix', 'fix/', '--release', 'rel/', '--hotfix', 'hot/', '--tag', 'v'])
  expect(initArgs({ ...FORM, tag: '' }, true)).toEqual(['flow', 'init', '-d', '-f', '--main', 'master', '--develop', 'dev', '--feature', 'feat/', '--bugfix', 'fix/', '--release', 'rel/', '--hotfix', 'hot/'])
})

test('FI-01 values are trimmed before they are checked and run', () => {
  expect(trimForm({ ...FORM, main: ' master ', tag: '  ' })).toEqual({ ...FORM, tag: '' })
})

test('FI-01 an invalid field is named; a valid form has no error', () => {
  expect(initFormError(FORM)).toBeNull()
  expect(initFormError({ ...FORM, main: '' })).toBe('Invalid main branch: ""')
  expect(initFormError({ ...FORM, tag: '' })).toBeNull()
  expect(initFormError({ ...FORM, develop: '-x' })).toBe('Invalid develop branch: "-x"')
  expect(initFormError({ ...FORM, feature: 'my feat/' })).toBe('Invalid feature prefix: "my feat/"')
  expect(initFormError({ ...FORM, hotfix: '' })).toBe('Invalid hotfix prefix: ""')
  expect(initFormError({ ...FORM, tag: 'v 1' })).toBe('Invalid tag prefix: "v 1"')
  expect(initFormError({ ...FORM, develop: 'master' })).toBe('The develop branch must differ from the main branch')
})

test('FI-02 bases the new names leave behind lose their gitflow section', () => {
  const config: FlowConfig = { types: [], bases: [{ name: 'main', parent: '', isAutoUpdate: false }, { name: 'develop', parent: 'main', isAutoUpdate: true }], remote: 'origin', tagPrefix: '' }
  expect(staleBaseArgs(config, { ...FORM, main: 'main' })).toEqual([['config', '--local', '--remove-section', 'gitflow.branch.develop']])
  expect(staleBaseArgs(config, { ...FORM, main: 'main', develop: 'develop' })).toEqual([])
})
