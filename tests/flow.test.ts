import { expect, test } from 'claude-code/testing'

import type { FlowConfig } from '../types'
import { defaultTagMessage, finishArgs, finishPushArgs, flowArgs, flowCliOf, flowMenuFor, nextVersion, parseFlowConfig, resumeArgs, topicOf, updateLabel } from '../hooks/flow'

// What `git config --get-regexp ^gitflow\.` prints after `git flow init -d` (git-flow-next 1.1).
const NEXT_CONFIG = `gitflow.version 1.0
gitflow.initialized true
gitflow.branch.release.type topic
gitflow.branch.release.parent main
gitflow.branch.release.startpoint develop
gitflow.branch.release.downstreamstrategy merge
gitflow.branch.release.prefix release/
gitflow.branch.release.tag true
gitflow.branch.hotfix.type topic
gitflow.branch.hotfix.parent main
gitflow.branch.hotfix.startpoint main
gitflow.branch.hotfix.downstreamstrategy rebase
gitflow.branch.hotfix.prefix hotfix/
gitflow.branch.hotfix.tag true
gitflow.branch.support.type topic
gitflow.branch.support.parent main
gitflow.branch.support.prefix support/
gitflow.branch.main.type base
gitflow.branch.main.autoupdate false
gitflow.branch.develop.type base
gitflow.branch.develop.parent main
gitflow.branch.develop.autoupdate true
gitflow.branch.feature.type topic
gitflow.branch.feature.parent develop
gitflow.branch.feature.startpoint develop
gitflow.branch.feature.downstreamstrategy rebase
gitflow.branch.feature.prefix feature/
gitflow.branch.bugfix.type topic
gitflow.branch.bugfix.parent develop
gitflow.branch.bugfix.startpoint develop
gitflow.branch.bugfix.downstreamstrategy merge
gitflow.branch.bugfix.prefix bugfix/
`

const config = () => parseFlowConfig(NEXT_CONFIG) as FlowConfig
const ON = { isNoFf: true, isPush: true, isKeep: true }

test('GF-02 tells git-flow-next from another git flow and from none', async () => {
  expect(flowCliOf(0, 'git-flow-next version 1.1.0\n')).toBe('next')
  expect(flowCliOf(0, '1.12.3 (AVH Edition)\n')).toBe('other')
  expect(flowCliOf(1, "git: 'flow' is not a git command.")).toBe('none')
})

test('GF-02 reads the four work types, the bases and the remote from the config', async () => {
  const c = config()
  expect(c.types.map(t => t.kind)).toEqual(['feature', 'bugfix', 'release', 'hotfix'])
  expect(c.types[0]).toEqual({ kind: 'feature', prefix: 'feature/', parent: 'develop', startpoint: 'develop', isTagged: false, strategy: 'rebase' })
  expect(c.types[3]).toMatchObject({ kind: 'hotfix', parent: 'main', startpoint: 'main', isTagged: true })
  expect(c.types[2]).toMatchObject({ kind: 'release', parent: 'main', startpoint: 'develop', isTagged: true })
  expect(c.bases).toContainEqual({ name: 'develop', parent: 'main', isAutoUpdate: true })
  expect(c.remote).toBe('origin')
  expect(parseFlowConfig(`${NEXT_CONFIG}gitflow.origin upstream\n`)?.remote).toBe('upstream')
})

test('GF-02 a repository without git flow config has none', async () => {
  expect(parseFlowConfig('')).toBeNull()
  expect(parseFlowConfig('gitflow.version 1.0\n')).toBeNull()
})

test('GF-02 a type missing its prefix is left out', async () => {
  const c = parseFlowConfig('gitflow.branch.feature.type topic\ngitflow.branch.feature.parent develop\n')
  expect(c?.types ?? []).toEqual([])
})

test('GF-04 a work branch is told by its prefix; the bare prefix and other branches are not', async () => {
  expect(topicOf('feature/login', config())).toEqual({ kind: 'feature', name: 'login', branch: 'feature/login' })
  expect(topicOf('release/1.2.0', config())).toEqual({ kind: 'release', name: '1.2.0', branch: 'release/1.2.0' })
  expect(topicOf('feature/', config())).toBeUndefined()
  expect(topicOf('develop', config())).toBeUndefined()
  expect(topicOf('support/1.0', config())).toBeUndefined()
})

test('GF-03 the next version comes from the highest semver tag, keeping its v', async () => {
  expect(nextVersion(['1.0.0', '1.0.1', 'nightly', '0.9.9'], 'release')).toBe('1.1.0')
  expect(nextVersion(['1.0.0', '1.0.1'], 'hotfix')).toBe('1.0.2')
  expect(nextVersion(['v1.9.0', 'v1.10.0'], 'release')).toBe('v1.11.0')
  expect(nextVersion([], 'release')).toBe('0.1.0')
  expect(nextVersion([], 'hotfix')).toBe('0.0.1')
  expect(nextVersion(['1.0.0'], 'feature')).toBe('')
})

test('GF-03 start passes the name as its own argument', async () => {
  expect(flowArgs('start', { kind: 'feature', name: 'login', branch: 'feature/login' })).toEqual(['flow', 'feature', 'start', 'login'])
})

test('GF-05 finish follows the switches, and a tagged type always carries its tag message', async () => {
  const feature = { kind: 'feature', name: 'login', branch: 'feature/login' } as const
  const release = { kind: 'release', name: '1.2.0', branch: 'release/1.2.0' } as const
  expect(finishArgs(feature, config(), ON, null)).toEqual(['flow', 'feature', 'finish', 'login', '--no-ff', '--keep'])
  expect(finishArgs(feature, config(), { ...ON, isNoFf: false, isKeep: false }, null)).toEqual(['flow', 'feature', 'finish', 'login', '--ff', '--no-keep'])
  expect(finishArgs(release, config(), ON, null)).toEqual(['flow', 'release', 'finish', '1.2.0', '--no-ff', '--keep', '-m', 'Release 1.2.0'])
  expect(finishArgs(release, config(), ON, '  Big one  ')).toEqual(['flow', 'release', 'finish', '1.2.0', '--no-ff', '--keep', '-m', 'Big one'])
  expect(finishArgs(release, config(), ON, '   ')).toContain('Release 1.2.0')
})

test('GF-05 the tag message names the type and the version', async () => {
  expect(defaultTagMessage({ kind: 'hotfix', name: '1.0.2', branch: 'hotfix/1.0.2' })).toBe('Hotfix 1.0.2')
})

test('GF-05 the push after finish sends the parent and the bases that follow it, with the tags', async () => {
  expect(finishPushArgs({ kind: 'feature', name: 'x', branch: 'feature/x' }, config())).toEqual(['push', '--follow-tags', 'origin', 'develop'])
  expect(finishPushArgs({ kind: 'release', name: '1.2.0', branch: 'release/1.2.0' }, config())).toEqual(['push', '--follow-tags', 'origin', 'main', 'develop'])
  expect(finishPushArgs({ kind: 'hotfix', name: '1.0.2', branch: 'hotfix/1.0.2' }, config())).toEqual(['push', '--follow-tags', 'origin', 'main', 'develop'])
})

test('GF-04 update and publish name the branch; the label follows the strategy', async () => {
  expect(flowArgs('update', { kind: 'feature', name: 'x', branch: 'feature/x' })).toEqual(['flow', 'feature', 'update', 'x'])
  expect(flowArgs('publish', { kind: 'bugfix', name: 'y', branch: 'bugfix/y' })).toEqual(['flow', 'bugfix', 'publish', 'y'])
  const [feature, bugfix] = config().types
  expect(updateLabel(feature!)).toBe('Rebase on develop')
  expect(updateLabel(bugfix!)).toBe('Merge develop in')
})

test('GF-06 a stopped finish continues or aborts through git flow; a stopped update through git', async () => {
  const topic = { kind: 'feature', name: 'x', branch: 'feature/x' } as const
  expect(resumeArgs({ op: 'finish', topic }, '--continue')).toEqual(['flow', 'feature', 'finish', '--continue', 'x'])
  expect(resumeArgs({ op: 'finish', topic }, '--abort')).toEqual(['flow', 'feature', 'finish', '--abort', 'x'])
  expect(resumeArgs({ op: 'rebase', topic }, '--continue')).toEqual(['rebase', '--continue'])
  expect(resumeArgs({ op: 'merge', topic }, '--abort')).toEqual(['merge', '--abort'])
})

test('GF-07 a work branch menu leads with finish, update and publish of that branch', async () => {
  const items = flowMenuFor('feature/login', config())
  expect(items.map(i => [i.id, i.label])).toEqual([
    ['flow-finish', 'Finish feature'],
    ['flow-update', 'Rebase on develop'],
    ['flow-publish', 'Publish'],
  ])
  expect(items.every(i => i.flow?.topic.name === 'login')).toBe(true)
  expect(flowMenuFor('develop', config())).toEqual([])
  expect(flowMenuFor('feature/login', null)).toEqual([])
})

// What git-flow AVH writes, which git-flow-next also reads.
const AVH_CONFIG = `gitflow.branch.master main
gitflow.branch.develop develop
gitflow.prefix.feature feature/
gitflow.prefix.bugfix bugfix/
gitflow.prefix.release release/
gitflow.prefix.hotfix hotfix/
gitflow.prefix.versiontag 
gitflow.branch.feature/x.base develop
`

test('GF-02 a git flow AVH config is read as git-flow-next reads it', async () => {
  const c = parseFlowConfig(AVH_CONFIG) as FlowConfig
  expect(c.types.map(t => [t.kind, t.prefix, t.parent, t.startpoint, t.isTagged, t.strategy])).toEqual([
    ['feature', 'feature/', 'develop', 'develop', false, 'rebase'],
    ['bugfix', 'bugfix/', 'develop', 'develop', false, 'rebase'],
    ['release', 'release/', 'main', 'develop', true, 'merge'],
    ['hotfix', 'hotfix/', 'main', 'main', true, 'rebase'],
  ])
  expect(finishPushArgs({ kind: 'release', name: '1.1.0', branch: 'release/1.1.0' }, c)).toEqual(['push', '--follow-tags', 'origin', 'main', 'develop'])
})

test('GF-02 a config with no work type is not set up', async () => {
  expect(parseFlowConfig('gitflow.branch.feature/x.base develop\n')).toBeNull()
  expect(parseFlowConfig('gitflow.branch.main.type base\n')).toBeNull()
})
