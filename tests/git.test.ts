import { expect, test } from 'claude-code/testing'
import * as gitCommands from '../hooks/git'

import { GIT_LOG, GIT_STATUS, gitBusy, gitOf, gitShort } from '../hooks/git'

test('whitespace checks inspect the working tree and the index separately without optional locks', () => {
  expect(gitCommands).toMatchObject({
    GIT_CHECK: ['git', '--no-optional-locks', 'diff', '--check'],
    GIT_CHECK_CACHED: ['git', '--no-optional-locks', 'diff', '--cached', '--check'],
  })
})

const STATUS = [
  '# branch.oid 87e8e95f00',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +6 -1',
  '1 .M N... 100644 100644 100644 aaa bbb hooks/register.ts',
  '2 R. N... 100644 100644 100644 aaa bbb R100 hooks/new.ts\thooks/old.ts',
  'u UU N... 100644 100644 100644 100644 aaa bbb ccc tests/mod.test.ts',
  '? scripts/tui-shot.py',
  '? notes.md',
].join('\n')

test('git status v2 gives branch, upstream, commits in flight and files outside a commit', () => {
  expect(gitOf(STATUS)).toEqual({
    branch: 'main',
    upstream: 'origin/main',
    ahead: 6,
    behind: 1,
    changed: 2,
    untracked: 2,
    conflicted: 1,
    files: [
      { code: 'M', path: 'hooks/register.ts' },
      { code: 'R', path: 'hooks/new.ts' },
      { code: 'U', path: 'tests/mod.test.ts' },
      { code: '?', path: 'scripts/tui-shot.py' },
      { code: '?', path: 'notes.md' },
    ],
    commits: [],
  })
  expect(gitShort(gitOf(STATUS))).toBe('main ↑6 ↓1 ●2 +2 ✗1')
})

test('a clean branch even with its upstream has nothing to say, one without upstream still has a name', () => {
  const clean = gitOf('# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0\n')
  expect(gitBusy(clean)).toBe(false)
  expect(gitShort(clean)).toBe('main')
  const local = gitOf('# branch.oid abc\n# branch.head feature\n')
  expect(local).toMatchObject({ branch: 'feature', upstream: null, ahead: 0, behind: 0 })
  expect(gitOf('# branch.oid (initial)\n# branch.head (detached)\n').branch).toBe('(detached)')
})

test('commits absent from upstream wait to be pushed; without upstream none counts as pushed', () => {
  const log = 'a6eb0c5-full\ta6eb0c5\tfeat: the Sztolnia shows the repo\n7d3213e-full\t7d3213e\tchore: release 0.6.1\nf610c3e-full\tf610c3e\tfix: a\tb\n'
  const ahead = gitOf('# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -0\n', log, 'a6eb0c5-full\n7d3213e-full\n')
  expect(ahead.commits).toEqual([
    { hash: 'a6eb0c5', subject: 'feat: the Sztolnia shows the repo', pushed: false },
    { hash: '7d3213e', subject: 'chore: release 0.6.1', pushed: false },
    { hash: 'f610c3e', subject: 'fix: a\tb', pushed: true },
  ])
  expect(gitOf('# branch.head feature\n', log).commits.every(commit => !commit.pushed)).toBe(true)
  expect(gitOf('# branch.head main\n').commits).toEqual([])
})

test('git reads disable optional index locks and keep non-ASCII paths readable', () => {
  expect([...GIT_STATUS]).toEqual(['git', '--no-optional-locks', '-c', 'core.quotePath=false', 'status', '--porcelain=v2', '--branch'])
  expect([...GIT_LOG]).toEqual(['git', '--no-optional-locks', '-c', 'core.quotePath=false', 'log', '--format=%H%x09%h%x09%s', '-n', '10'])
  expect(gitOf('# branch.head main\n? kawał.txt\n1 .M N... 100644 100644 100644 aaa bbb żółw.txt').files).toEqual([
    { code: '?', path: 'kawał.txt' }, { code: 'M', path: 'żółw.txt' },
  ])
})


test('pushed commits follow upstream reachability when merged history interleaves local commits', () => {
  const log = 'mergeoid\tmerge\tmerge upstream\nremoteoid\tremote\tupstream change\nlocaloid\tlocal\tlocal change\nbaseoid\tbase\tbase\n'
  const merged = gitOf('# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -0', log, 'mergeoid\nlocaloid\n')
  expect(merged.commits.map(commit => commit.pushed)).toEqual([false, true, false, true])
  expect(gitOf('# branch.head main', log, '').commits.every(commit => !commit.pushed)).toBe(true)
})
