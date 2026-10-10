// Skrypty uruchamiamy z lokalnymi zależnościami: bez modelu i płatnych wywołań.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import { builtinModules, createRequire, stripTypeScriptTypes } from 'node:module'
import { EventEmitter } from 'node:events'
import { Writable } from 'node:stream'
import { GIT_LOG, GIT_STATUS, gitOf } from '../hooks/git.ts'
import { ROSTER } from '../hooks/roster.ts'
import { riskHint } from '../hooks/voice.ts'

const sourceOf = file => fs.readFileSync(file, 'utf8').replace(/^import .*\n/gmu, '').replace(/\nmain\(\)\.catch[\s\S]*$/u, '')
for (const script of ['act-sheet', 'voice-bench']) test(script === 'act-sheet'
  ? 'act sheet uses private exclusive BMP files, cleans failures, explains unsupported platforms and reports frame violations'
  : 'voice bench handles stdin EPIPE, cleans up, announces cost and keeps report paths relative', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-script-test-'))
  try {
    if (script === 'act-sheet') {
      const temps = []
      const outputs = []
      const logs = []
      let exclusive = false
      let fail = false
      const context = vm.createContext({
        Buffer, console: { log: text => logs.push(text) }, process: { platform: 'linux', argv: [], exitCode: 0 },
        mkdtempSync: prefix => { const dir = fs.mkdtempSync(prefix); temps.push(dir); return dir },
        tmpdir: () => scratch, join: path.join, resolve: path.resolve,
        writeFileSync: (file, bytes, options) => { exclusive = options?.flag === 'wx'; fs.writeFileSync(file, bytes, options) },
        rmSync: fs.rmSync,
        execFileSync: (command, argv) => {
          assert.equal(command, 'sips')
          assert.equal(fs.readFileSync(argv[3]).subarray(0, 2).toString(), 'BM')
          if (fail) throw new Error('conversion failed')
          outputs.push(argv[5])
          fs.writeFileSync(argv[5], 'PNG fixture')
        },
      })
      for (const file of ['roster', 'stage', 'palette', 'apron']) {
        vm.runInContext(stripTypeScriptTypes(sourceOf(`hooks/${file}.ts`).replaceAll('export ', '')), context)
      }
      vm.runInContext(stripTypeScriptTypes(sourceOf('scripts/act-sheet.ts')), context)
      const stand = vm.runInContext('STAND', context)
      const act = { name: 'a', intro: [], length: 1, loop: () => stand }
      context.sheet(context.actStrips([act]), path.join(scratch, 'sheet.png'))
      assert.equal(exclusive, true, 'BMP must use exclusive creation')
      assert.equal(temps.length, 1, 'BMP must have a private temporary directory')
      assert.equal(fs.existsSync(temps[0]), false, 'success must remove the BMP directory')
      fail = true
      assert.throws(() => context.sheet(context.actStrips([act]), path.join(scratch, 'sheet.png')), /conversion failed/u)
      assert.notEqual(temps[0], temps[1], 'runs must not share a BMP path')
      assert.equal(fs.existsSync(temps[1]), false, 'failure must remove the BMP directory')
      await assert.rejects(context.main(), /macOS.*sips|sips.*macOS/u)
      fail = false
      context.process.platform = 'darwin'
      context.actsOf = async () => ['a', 'b', 'c'].map(name => ({ ...act, name }))
      await context.main()
      await context.main()
      assert.notEqual(outputs[1], outputs[2], 'default PNG outputs must not share a path')
      assert.equal(fs.existsSync(outputs[1]), true, 'the requested PNG must survive cleanup')
      assert.equal(context.process.exitCode, 0, 'valid frames must succeed')
      assert.equal(logs.at(-1), 'Zasady klatek: wszystkie trzymać.')
      context.actsOf = async () => ['a', 'b', 'c'].map(name => ({
        ...act, name, loop: () => stand.map(row => row.replaceAll('b', '.')),
      }))
      await context.main()
      assert.equal(context.process.exitCode, 1, 'a broken frame rule must set the failure exit code')
      assert.match(logs.at(-1), /Złamane zasady \(6\)/u)
      for (const name of ['a', 'b', 'c']) {
        assert.ok(logs.at(-1).includes(`${name} pętla 0: brak fartucha 'b'`))
        assert.ok(logs.at(-1).includes(`${name} pętla 0 (zegar 17): brak fartucha 'b'`))
      }
      assert.equal(fs.existsSync(outputs.at(-1)), true, 'a frame violation must still leave the PNG for inspection')
    } else if (script === 'voice-bench') {
      let stderr = ''
      let stdout = ''
      let killed = false
      let cleared = false
      let handlerInstalled = false
      const temps = []
      const reports = []
      const child = new EventEmitter()
      child.stderr = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stdin = new Writable({ write(_chunk, _encoding, callback) {
        handlerInstalled = this.listenerCount('error') > 0
        assert.equal(handlerInstalled, true, 'stdin needs an error handler before writing')
        callback(Object.assign(new Error('broken pipe'), { code: 'EPIPE' }))
      } })
      child.kill = () => { killed = true; queueMicrotask(() => child.emit('close', 1)) }
      const context = vm.createContext({
        fs: { ...fs,
          existsSync: () => true,
          mkdtempSync: prefix => { const dir = fs.mkdtempSync(prefix); temps.push(dir); return dir },
          writeFileSync: (file, data) => { if (file.endsWith('report.json')) reports.push(JSON.parse(data)); else fs.writeFileSync(file, data) },
        },
        os: { tmpdir: () => scratch }, path, crypto: { randomUUID: () => 'test-session' },
        fileURLToPath: () => path.resolve('scripts/voice-bench.mjs'), pathToFileURL: file => ({ href: file }),
        process: { argv: ['node', 'voice-bench', '--model', 'test-model', '--plugin-dir', '/private/tmp/test-plugin'], env: {},
          stderr: { write: text => { stderr += text } }, stdout: { write: text => { stdout += text } } },
        spawn: () => {
          assert.match(stderr, /test-model.*\$0\.45|\$0\.45.*test-model/u, 'cost and model must be shown before spawning')
          return child
        },
        setTimeout: () => 1, clearTimeout: () => { cleared = true },
      })
      const source = sourceOf('scripts/voice-bench.mjs').replaceAll('import.meta.url', "'file:///scripts/voice-bench.mjs'")
      vm.runInContext(source, context)
      // Odczyt kotwicy i raporty sesji nie dotykają konta ani katalogu benchmarks/.
      vm.runInContext(`anchorsOf = async () => ({}); findTranscript = () => null; reportDirectory = () => ${JSON.stringify(scratch)}`, context)
      await context.main()
      assert.equal(handlerInstalled, true)
      assert.equal(killed, true, 'stdin failure must terminate the child')
      assert.equal(cleared, true, 'stdin failure must clear the timeout')
      assert.equal(temps.length, 1)
      assert.equal(fs.existsSync(temps[0]), false, 'stdin failure must still clean up scratch')
      assert.equal(reports[0].status, 'ERROR')
      assert.match(reports[0].reason, /stdin.*broken pipe/u)
      assert.equal(path.isAbsolute(reports[0].plugin), false)
      assert.equal(JSON.parse(stdout).plugin, reports[0].plugin)
    } else throw new Error('unknown script test')
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true })
  }
})


// Próby wyżej czytają skrypty przez `sourceOf`, które wycina linie importu, więc
// zepsuty import (np. `node:child_proces`) nie zwala żadnej z nich — prawdziwy
// skrypt umiera wtedy na starcie z ERR_UNKNOWN_BUILTIN_MODULE. voice-bench ma
// szybkie wyjście bez modelu i bez `claude`: bez `--model` kończy się w
// `parseArgs`, zanim cokolwiek odpali, więc wstaje jako osobny proces. Skrypt
// act-sheet goły node nie wczyta (hooki importują bez rozszerzeń, stąd `npx
// tsx` w CLAUDE.md), więc jego importy sprawdzamy statycznie, bez uruchamiania.
function scriptRun(script, args) {
  const run = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 10_000 })
  assert.ok(!run.error, `${script}: proces nie wstał: ${run.error}`)
  for (const stream of [run.stdout, run.stderr]) assert.doesNotMatch(stream, /ERR_UNKNOWN_BUILTIN_MODULE|ERR_MODULE_NOT_FOUND/u)
  return run
}

test('voice bench without arguments reports the missing model, not a broken import', () => {
  const run = scriptRun('scripts/voice-bench.mjs', [])
  assert.equal(run.status, 1)
  assert.match(run.stderr, /Wymagane --model <model-id>/u)
  assert.equal(run.stdout, '', 'bez --model skrypt nie dochodzi do raportu')
})

// Wszystkie specyfikatory importu skryptu: linie `import … from` (także
// `import type`) i literałowe `import('…')`. Dynamicznych importów z wyliczaną
// ścieżką (`pathToFileURL(...)`) statycznie sprawdzić się nie da.
function importSpecifiersOf(script) {
  const source = fs.readFileSync(script, 'utf8')
  const specifiers = new Set()
  for (const pattern of [/^import\b[^'"]*?['"]([^'"]+)['"]/gmu, /(?<![.\w])import\(\s*['"]([^'"]+)['"]/gu]) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1])
  }
  return [...specifiers]
}

test('act sheet imports resolve: every builtin it names exists and every hook file is in place', () => {
  const script = 'scripts/act-sheet.ts'
  const specifiers = importSpecifiersOf(script)
  assert.ok(specifiers.some(specifier => specifier.startsWith('node:')), 'skrypt musi importować moduły wbudowane')
  assert.ok(specifiers.some(specifier => specifier.startsWith('../hooks/')), 'skrypt musi czytać hooki')
  const require = createRequire(path.resolve(script))
  for (const specifier of specifiers) {
    if (specifier.startsWith('node:')) assert.ok(builtinModules.includes(specifier.slice(5)), `${script}: nie ma wbudowanego modułu ${specifier}`)
    else if (/^\.{1,2}\//u.test(specifier)) assert.ok(fs.existsSync(path.resolve(path.dirname(script), specifier)), `${script}: ${specifier} nie wskazuje pliku`)
    else assert.doesNotThrow(() => require.resolve(specifier), `${script}: pakiet ${specifier} musi się rozwiązywać`)
  }
})


// Te próby uruchamiają prawdziwe funkcje moda. Zastępują tylko granicę silnika,
// gdzie testy pluginu nie pozwalają bezpośrednio odczytać ani popsuć stanu.
function registerContext(overrides = {}) {
  const context = vm.createContext({
    THREAD_TOOL_NAME: 'mcp__krux-mod__watki', DEFAULT_MODES: {}, EMPTY_LORE: {}, CALM: {}, EMPTY_CREW: {}, EMPTY_BOARD: {}, EMPTY_MUSTER: {}, EMPTY_THREADS: {},
    atom: (key, fallback) => ({ ...key, fallback }),
    ...overrides,
  })
  const source = fs.readFileSync('hooks/register.ts', 'utf8')
    .replace(/^import [\s\S]*?from ['"][^'"]+['"]\n/gmu, '')
    .replace('export const register', 'const register')
  vm.runInContext(stripTypeScriptTypes(source), context)
  return context
}

test('a failed counter reset preserves completed compaction without running next twice', async () => {
  let executions = 0
  const logs = []
  const context = registerContext({
    read: async () => ({ persona: true }),
    update: async () => { throw new Error('counter unavailable') },
    COMPACT_NOTE: 'compact note',
  })
  const hooks = new Map()
  context.on = (event, ...args) => {
    const hook = { run: args.at(-1) }
    hooks.set(event, hook)
    return { catch(handler) { hook.catch = handler } }
  }
  vm.runInContext('register(on)', context)
  const hook = hooks.get('session.compact')
  const event = { trigger: 'manual', instructions: 'keep plan', messages: [{ text: 'input' }] }
  const result = { messages: [{ text: 'completed summary' }] }
  const next = async e => {
    executions += 1
    assert.equal(e.instructions, 'keep plan\n\ncompact note')
    return result
  }
  const api = { ui: { log: text => logs.push(text) } }
  await assert.rejects(hook.run(api, event, next), /counter unavailable/u)
  // Kontrakt silnika: next w .catch zwraca zapamiętany wynik, jeśli już wykonany.
  const caught = Object.assign(async () => result, { called: true, error: { kind: 'throw', message: 'counter unavailable' } })
  assert.equal(await hook.catch(api, event, caught), result)
  assert.equal(executions, 1)
  assert.match(logs[0], /session.compact.*counter unavailable/u)
  // Awaria logowania też nie odbiera gotowego wyniku.
  assert.equal(await hook.catch({ ui: { log() { throw new Error('log unavailable') } } }, event, caught), result)
})

test('git refresh runs status, log and diff check concurrently and coalesces overlapping reads with one trailing refresh', async () => {
  const gitSource = fs.readFileSync('hooks/git.ts', 'utf8').replace(/^import .*\n/gmu, '').replaceAll('export ', '')
  const gitContext = vm.createContext({})
  vm.runInContext(stripTypeScriptTypes(gitSource), gitContext)
  const commands = vm.runInContext('({ GIT_STATUS, GIT_LOG, GIT_CHECK, GIT_CHECK_CACHED, GIT_UNPUSHED, gitOf })', gitContext)
  let state = null
  let failStatus = false
  let blocked = false
  let release
  let gate
  const calls = []
  const context = registerContext({ ...commands, read: async () => state, update: async (_api, _atom, change) => { state = change(state) } })
  const api = { process: { run: async (argv, options) => {
    assert.equal(options.timeoutMs, 5000)
    const command = argv.includes('--cached') ? 'diff-cached' : argv.includes('--check') ? 'diff' : argv[4]
    if (command === 'diff') assert.deepEqual(Array.from(argv), ['git', '--no-optional-locks', 'diff', '--check'])
    else if (command === 'diff-cached') assert.deepEqual(Array.from(argv), ['git', '--no-optional-locks', 'diff', '--cached', '--check'])
    else assert.deepEqual(Array.from(argv).slice(0, 4), ['git', '--no-optional-locks', '-c', 'core.quotePath=false'])
    calls.push(command)
    if (command === 'status' && failStatus) throw new Error('git unavailable')
    if (blocked && command === 'log') await gate
    return { exitCode: 0, stdout: command === 'status' ? '# branch.head main' : command === 'log' ? 'oid\tabc\tlocal' : '' }
  } } }
  context.api = api
  const refresh = () => vm.runInContext('refreshGit(api)', context)
  blocked = true
  gate = new Promise(resolve => { release = resolve })
  const first = refresh()
  const second = refresh()
  const third = refresh()
  assert.equal(first, second)
  assert.equal(second, third)
  assert.deepEqual(calls, ['status', 'log', 'diff', 'diff-cached'])
  blocked = false
  release()
  await Promise.all([first, second, third])
  assert.deepEqual(calls, ['status', 'log', 'diff', 'diff-cached', 'status', 'log', 'diff', 'diff-cached'])
  assert.equal(state.commits[0].pushed, false)
  assert.equal(state.whitespace, true)
  // Odrzucony status nie zwalnia blokady przed końcem równoległego logu.
  calls.length = 0
  failStatus = true
  blocked = true
  gate = new Promise(resolve => { release = resolve })
  const failing = refresh()
  await Promise.resolve()
  const overlapping = refresh()
  assert.equal(failing, overlapping)
  assert.deepEqual(calls, ['status', 'log', 'diff', 'diff-cached'])
  blocked = false
  failStatus = false
  release()
  await failing
  assert.deepEqual(calls, ['status', 'log', 'diff', 'diff-cached', 'status', 'log', 'diff', 'diff-cached'])
  calls.length = 0
  await refresh()
  assert.deepEqual(calls, ['status', 'log', 'diff', 'diff-cached'])
})

test('git refresh reads upstream reachability with full hashes and safe global options', async () => {
  const gitContext = vm.createContext({})
  vm.runInContext(stripTypeScriptTypes(fs.readFileSync('hooks/git.ts', 'utf8').replace(/^import .*\n/gmu, '').replaceAll('export ', '')), gitContext)
  const commands = vm.runInContext('({ GIT_STATUS, GIT_LOG, GIT_CHECK, GIT_CHECK_CACHED, GIT_UNPUSHED, gitOf })', gitContext)
  let state = null
  let reachability = 'ok'
  const calls = []
  const context = registerContext({ ...commands, read: async () => state, update: async (_api, _atom, change) => { state = change(state) } })
  context.api = { process: { run: async (argv, options) => {
    calls.push(Array.from(argv))
    assert.equal(options.timeoutMs, 5000)
    if (argv.includes('--check')) return { exitCode: 0, stdout: '' }
    if (argv[4] === 'status') return { exitCode: 0, stdout: '# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -0' }
    if (argv[4] === 'log') return { exitCode: 0, stdout: 'mergeoid\tmerge\tmerge\nremoteoid\tremote\tupstream\nlocaloid\tlocal\tlocal\nbaseoid\tbase\tbase' }
    assert.deepEqual(Array.from(argv), ['git', '--no-optional-locks', '-c', 'core.quotePath=false', 'rev-list', '@{upstream}..HEAD'])
    return { exitCode: reachability === 'failed' ? 128 : 0, stdout: reachability === 'truncated' ? 'mergeoid\n' : 'mergeoid\nlocaloid\n', isStdoutTruncated: reachability === 'truncated' }
  } } }
  await vm.runInContext('refreshGit(api)', context)
  assert.deepEqual(Array.from(state.commits, commit => commit.pushed), [false, true, false, true])
  assert.equal(calls.length, 5)
  reachability = 'failed'
  await vm.runInContext('refreshGit(api)', context)
  assert.deepEqual(Array.from(state.commits, commit => commit.pushed), [false, false, false, false])
  reachability = 'truncated'
  await vm.runInContext('refreshGit(api)', context)
  assert.deepEqual(Array.from(state.commits, commit => commit.pushed), [false, false, false, false])
})


test('gating observers recover failures without repeating downstream actions', async () => {
  const logs = []
  const context = registerContext({
    mateIn: () => null,
    mateOfType: () => null,
    applyToggle: () => ({}),
    read: async () => ({ persona: true, sztolnia: true }),
    update: async () => { throw new Error('state unavailable') },
  })
  const hooks = []
  context.on = (event, ...args) => {
    const hook = { event, matcher: args.length > 1 ? args[0] : null, run: args.at(-1) }
    hooks.push(hook)
    return { catch(handler) { hook.catch = handler } }
  }
  vm.runInContext('register(on)', context)
  const api = {
    clock: { now: async () => { throw new Error('clock unavailable') } },
    store: { get: async () => { throw new Error('store unavailable') } },
    ui: { log: text => logs.push(text) },
  }
  for (const [name, matcher, event, result] of [
    ['agent.spawn', null, { prompt: 'work', description: 'Niuch' }, { agentId: 'a1' }],
    ['tool.call', null, { tool: 'Write', file_path: 'a.ts', content: '' }, { result: 'written' }],
    ['tool.call', 'mcp__krux-mod__watki', { tool: 'mcp__krux-mod__watki' }, { result: 'fallback' }],
    ['ui.close', null, { id: 'sztolnia', origin: { kind: 'person' } }, {}],
  ]) {
    const hook = hooks.find(hook => hook.event === name && (hook.matcher?.tool ?? null) === matcher)
    let executions = 0
    const next = async () => { executions += 1; return result }
    await assert.rejects(hook.run(api, event, next), /unavailable/u)
    const caught = Object.assign(async () => executions > 0 ? result : next(), { called: executions > 0, error: { kind: 'throw', message: 'unavailable' } })
    assert.equal(await hook.catch(api, event, caught), result)
    assert.equal(executions, 1)
  }
  assert.equal(logs.length, 4)
})


test('a refresh at completion reads again instead of joining a finished snapshot', async () => {
  for (let depth = 0; depth < 8; depth += 1) {
    const gitContext = vm.createContext({})
    vm.runInContext(stripTypeScriptTypes(fs.readFileSync('hooks/git.ts', 'utf8').replace(/^import .*\n/gmu, '').replaceAll('export ', '')), gitContext)
    const commands = vm.runInContext('({ GIT_STATUS, GIT_LOG, GIT_CHECK, GIT_CHECK_CACHED, GIT_UNPUSHED, gitOf })', gitContext)
    let state = commands.gitOf('# branch.head main', 'oid\tabc\tlocal')
    let schedule = true
    let later
    let queued
    const lateCall = new Promise(resolve => { queued = resolve })
    const calls = []
    const defer = (depth, action) => queueMicrotask(() => depth === 0 ? action() : defer(depth - 1, action))
    const context = registerContext({ ...commands,
      read: async () => {
        if (schedule) {
          schedule = false
          // Granica ostatniego await: repo zmienia się po odczycie tego samego stanu.
          defer(depth, () => { later = vm.runInContext('refreshGit(api)', context); queued() })
        }
        return Promise.resolve(state)
      },
      update: async (_api, _atom, change) => { state = change(state) },
    })
    context.api = { process: { run: async argv => {
      calls.push(argv.includes('--cached') ? 'diff-cached' : argv.includes('--check') ? 'diff' : argv[4])
      return { exitCode: 0, stdout: argv[4] === 'status' ? '# branch.head main' : 'oid\tabc\tlocal' }
    } } }
    const first = vm.runInContext('refreshGit(api)', context)
    await first
    await lateCall
    await later
    assert.deepEqual(calls, ['status', 'log', 'diff', 'diff-cached', 'status', 'log', 'diff', 'diff-cached'], `microtask depth ${depth}`)
  }
})

test('a real repository without upstream keeps its complete local commit history', t => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-git-contract-'))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  const gitEnv = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: os.devNull,
    GIT_AUTHOR_NAME: 'Krux test',
    GIT_AUTHOR_EMAIL: 'krux-test@example.invalid',
    GIT_COMMITTER_NAME: 'Krux test',
    GIT_COMMITTER_EMAIL: 'krux-test@example.invalid',
  }
  const git = args => {
    const result = spawnSync('git', args, { cwd: repository, env: gitEnv, encoding: 'utf8', timeout: 10_000 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    return result.stdout
  }
  git(['init', '--initial-branch=main'])
  const expected = []
  for (const subject of ['base', 'first local change', 'second local change']) {
    fs.writeFileSync(path.join(repository, 'history.txt'), `${subject}\n`)
    git(['add', '--', 'history.txt'])
    git(['-c', 'commit.gpgSign=false', 'commit', '-m', subject])
    expected.unshift({ hash: git(['rev-parse', '--short', 'HEAD']).trim(), subject, pushed: false })
  }

  // Exercise the shipped Git commands and the native parser with real output.
  // Expected commits come from the commits we created, not from the parser.
  const actual = gitOf(git(GIT_STATUS.slice(1)), git(GIT_LOG.slice(1)))
  assert.equal(actual.branch, 'main')
  assert.equal(actual.upstream, null)
  assert.deepEqual(actual.commits, expected)
})

// Run the shipped CLI against a local executable at the external Claude boundary.
// Traffic, reports and scratch cleanup are observed without a model or account.
function voiceBenchFixture(t, { kind, failAt = 1, exitCode = 0, ignoreTerm = false }) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-bench-cli-test-'))
  const bin = path.join(scratch, 'bin')
  const log = path.join(scratch, 'prompts.jsonl')
  fs.mkdirSync(bin)
  fs.mkdirSync(path.join(scratch, 'scripts'))
  fs.mkdirSync(path.join(scratch, 'hooks'))
  fs.copyFileSync('scripts/voice-bench.mjs', path.join(scratch, 'scripts', 'voice-bench.mjs'))
  fs.writeFileSync(path.join(scratch, 'hooks', 'hooks.json'), '{}\n')
  fs.writeFileSync(path.join(scratch, 'hooks', 'voice.ts'), "export const VOICE_ANCHOR = 'fixture anchor'\nexport const VOICE_SHORT = 'fixture short'\n")
  fs.writeFileSync(path.join(bin, 'claude'), `#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
const argv = process.argv.slice(2)
const session = argv[argv.indexOf('--session-id') + 1]
const fixture = JSON.parse(process.env.SCRIPT_FIXTURE)
const project = path.join(process.env.CLAUDE_CONFIG_DIR, 'projects', path.basename(path.dirname(process.cwd())))
fs.mkdirSync(project, { recursive: true })
fs.writeFileSync(path.join(project, session + '.jsonl'), JSON.stringify({ type: 'user', context: ['fixture anchor'] }) + '\\n')
if (fixture.ignoreTerm) process.on('SIGTERM', () => {})
let count = 0
for await (const line of readline.createInterface({ input: process.stdin })) {
  if (!line.trim()) continue
  count += 1
  fs.appendFileSync(process.env.SCRIPT_FIXTURE_LOG, JSON.stringify({ pid: process.pid, cwd: process.cwd(), message: JSON.parse(line) }) + '\\n')
  const bad = count === fixture.failAt
  const event = { type: 'result', session_id: bad && fixture.kind === 'session' ? 'other-session' : session,
    is_error: bad && fixture.kind === 'error', result: bad && fixture.kind === 'empty' ? '  ' : bad && fixture.kind === 'error' ? 'fixture API error' : 'Krux kopać rudę. Robak siedzieć w skale.',
    total_cost_usd: count / 100, usage: { output_tokens: 5, output_tokens_details: { thinking_tokens: 1 } } }
  process.stdout.write(JSON.stringify(event) + '\\n')
}
if (fixture.ignoreTerm) setInterval(() => {}, 1000)
else process.exitCode = fixture.exitCode
`, { mode: 0o700 })
  const records = () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []
  t.after(() => {
    for (const pid of new Set(records().map(record => record.pid))) {
      try { process.kill(pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
    fs.rmSync(scratch, { recursive: true, force: true })
  })
  const run = spawnSync(process.execPath, [path.join(scratch, 'scripts', 'voice-bench.mjs'), '--model', 'fixture-model'], {
    encoding: 'utf8', timeout: 8000,
    env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, CLAUDE_CONFIG_DIR: path.join(scratch, 'config'),
      SCRIPT_FIXTURE_LOG: log, SCRIPT_FIXTURE: JSON.stringify({ kind, failAt, exitCode, ignoreTerm }) },
  })
  assert.ifError(run.error)
  return { run, report: JSON.parse(run.stdout), records: records(), scratch }
}

for (const [kind, reason] of [['error', /fixture API error/u], ['session', /Zmiana session_id/u], ['empty', /Pusty final response/u]]) {
  test(`voice bench stops before another prompt after an invalid ${kind} result`, t => {
    const { run, report, records } = voiceBenchFixture(t, { kind })
    assert.equal(records.length, 1, 'an invalid result must not buy another model turn')
    assert.equal(run.status, 1)
    assert.equal(report.status, 'ERROR')
    assert.match(report.reason, reason)
    assert.equal(report.turns, 0)
    assert.equal(fs.existsSync(records[0].cwd), false, 'the failed run must remove its work directory')
  })
}

test('voice bench preserves completed responses and their usage before a later error', t => {
  const { run, report, records, scratch } = voiceBenchFixture(t, { kind: 'error', failAt: 2 })
  assert.equal(records.length, 2)
  assert.equal(run.status, 1)
  assert.equal(report.status, 'ERROR')
  assert.equal(report.turns, 1, 'a later error must preserve the completed first turn')
  assert.equal(report.costUsd, 0.01)
  assert.deepEqual(report.costUsdPerResult, [0.01])
  assert.equal(report.visibleTokens, 4)
  const reports = path.join(scratch, 'benchmarks', 'voice-bench')
  const directory = path.join(reports, fs.readdirSync(reports)[0])
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'responses.json'), 'utf8')), ['Krux kopać rudę. Robak siedzieć w skale.'])
})

test('voice bench reports a nonzero child exit even after twelve valid results', t => {
  const { run, report, records } = voiceBenchFixture(t, { kind: 'none', exitCode: 7 })
  assert.equal(records.length, 12)
  assert.equal(report.status, 'ERROR')
  assert.match(report.reason, /claude → exit 7 po 12 turach/u)
  assert.equal(report.turns, 12, 'the exit error must preserve all completed turns')
  assert.equal(run.status, 1)
  assert.equal(report.accepted, false)
})

test('voice bench stops a child that ignores SIGTERM after an invalid result', t => {
  const { run, report, records } = voiceBenchFixture(t, { kind: 'error', ignoreTerm: true })
  assert.equal(records.length, 1)
  assert.equal(run.status, 1)
  assert.match(report.reason, /fixture API error/u)
  assert.throws(() => process.kill(records[0].pid, 0), { code: 'ESRCH' }, 'the failed benchmark must wait for its own child to exit')
})

test('voice bench completes twelve valid turns and removes only its temporary session', t => {
  const { run, report, records, scratch } = voiceBenchFixture(t, { kind: 'none' })
  assert.equal(run.status, 0)
  assert.deepEqual({ status: report.status, turns: report.turns, costUsd: report.costUsd, visibleTokens: report.visibleTokens, accepted: report.accepted },
    { status: 'COMPLETE', turns: 12, costUsd: 0.12, visibleTokens: 48, accepted: true })
  assert.equal(records.length, 12)
  assert.equal(fs.existsSync(records[0].cwd), false)
  assert.deepEqual(fs.readdirSync(path.join(scratch, 'config', 'projects')), [])
  // Dwanaście tych samych odpowiedzi: każda po pierwszej powtarza otwarcie.
  assert.deepEqual({ scenario: report.scenario, repeatedOpenings: report.repeatedOpenings, emphasisTotal: report.emphasisTotal, moodNotes: report.moodNotes },
    { scenario: 'cache', repeatedOpenings: 11, emphasisTotal: 0, moodNotes: 0 })
})

test('voice bench rejects an unknown scenario before spawning claude', () => {
  const run = scriptRun('scripts/voice-bench.mjs', ['--model', 'fixture-model', '--scenario', 'kopalnia'])
  assert.equal(run.status, 1)
  assert.match(run.stderr, /--scenario cache\|smrod, nie kopalnia/u)
  assert.equal(run.stdout, '')
})

function tuiShotFixture(t, steps, interrupt = false) {
  if (process.platform === 'win32') { t.skip('tui-shot requires POSIX pty'); return null }
  const python = fs.existsSync('.venv/bin/python') ? path.resolve('.venv/bin/python') : 'python3'
  const available = spawnSync(python, ['-c', 'import pyte'], { encoding: 'utf8', timeout: 5000 })
  if (available.error || available.status !== 0) { t.skip('tui-shot requires Python with pyte'); return null }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-tui-cli-test-'))
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }))
  const probe = String.raw`from pathlib import Path
import json, os, shlex, signal, subprocess, sys, time
script, directory, encoded = sys.argv[1:]
config = json.loads(encoded)
directory = Path(directory)
pidfile, heartbeat = directory / 'pid.json', directory / 'heartbeat'
child = directory / 'child.py'
child.write_text("""from pathlib import Path
import json, os, signal, subprocess, sys, time
signal.signal(signal.SIGHUP, signal.SIG_IGN)
signal.signal(signal.SIGTERM, signal.SIG_IGN)
beat = 'from pathlib import Path; import signal,time; signal.signal(signal.SIGHUP,signal.SIG_IGN); signal.signal(signal.SIGTERM,signal.SIG_IGN); p=Path(' + repr(sys.argv[2]) + '); exec("while True:\\n p.write_text(str(time.monotonic_ns()))\\n time.sleep(0.03)")'
mate = subprocess.Popen([sys.executable, '-c', beat])
Path(sys.argv[1]).write_text(json.dumps({'pid': os.getpid(), 'group': os.getpgrp(), 'mate': mate.pid}))
print('READY', flush=True)
time.sleep(30)
""")
unrelated = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'], start_new_session=True)
process = None
owned = None
before = None
def alive(pid):
    try: os.kill(pid, 0); return True
    except ProcessLookupError: return False
try:
    command = ' '.join(shlex.quote(str(value)) for value in [sys.executable, child, pidfile, heartbeat])
    process = subprocess.Popen([sys.executable, script, '--cmd', command, *config['steps']], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    deadline = time.monotonic() + 3
    while not pidfile.exists() and process.poll() is None and time.monotonic() < deadline:
        time.sleep(0.01)
    if pidfile.exists(): owned = json.loads(pidfile.read_text())
    if config['interrupt'] and process.poll() is None: process.send_signal(getattr(signal, config['interrupt']))
    stdout, stderr = process.communicate(timeout=4)
    before = heartbeat.read_text() if heartbeat.exists() else None
    time.sleep(0.15)
    after = heartbeat.read_text() if heartbeat.exists() else None
    print(json.dumps({'exit': process.returncode, 'stdout': stdout, 'stderr': stderr,
      'childAlive': owned is not None and alive(owned['pid']), 'descendantWorking': before != after,
      'unrelatedAlive': unrelated.poll() is None, 'ownedStarted': owned is not None}))
finally:
    if owned is not None and (alive(owned['pid']) or (heartbeat.exists() and heartbeat.read_text() != before)):
        try: os.killpg(owned['group'], signal.SIGKILL)
        except ProcessLookupError: pass
    if process is not None and process.poll() is None:
        process.kill()
        process.wait()
    unrelated.terminate()
    unrelated.wait()
`
  const run = spawnSync(python, ['-c', probe, path.resolve('scripts/tui-shot.py'), scratch, JSON.stringify({ steps, interrupt })], { encoding: 'utf8', timeout: 10_000 })
  assert.ifError(run.error)
  assert.equal(run.status, 0, run.stderr)
  return JSON.parse(run.stdout)
}

for (const [name, steps, exit, interrupt] of [
  ['shot', ['shot'], 0],
  ['unknown key', ['key:unknown'], 1],
  ['bad regex', ['fg:['], 1],
  ['until timeout', ['until:never:0.01'], 1],
  ['unknown step', ['unknown'], 2],
  ['interrupt', ['wait:30'], null, 'SIGINT'],
  ['termination', ['wait:30'], null, 'SIGTERM'],
  ['hangup', ['wait:30'], null, 'SIGHUP'],
]) {
  test(`tui shot cleans up its own process group after ${name}`, t => {
    const result = tuiShotFixture(t, steps, interrupt ?? false)
    if (result === null) return
    assert.equal(result.ownedStarted, true, result.stderr)
    if (exit === null) assert.notEqual(result.exit, 0)
    else assert.equal(result.exit, exit, result.stderr)
    assert.equal(result.childAlive, false, 'the owned child must be terminated and reaped')
    assert.equal(result.descendantWorking, false, 'the owned descendant must stop with the group')
    assert.equal(result.unrelatedAlive, true, 'cleanup must leave an unrelated process alone')
  })
}

function benchContext() {
  const context = vm.createContext({ fs, path, process: { argv: [], env: {} }, fileURLToPath: () => path.resolve('scripts/voice-bench.mjs'), pathToFileURL: file => ({ href: file }) })
  vm.runInContext(sourceOf('scripts/voice-bench.mjs').replaceAll('import.meta.url', "'file:///scripts/voice-bench.mjs'"), context)
  return context
}

// Transkrypt podaje tylko liczbę notek o hordzie, więc tury notek bench odtwarza z
// odpowiedzi: kumpel wymieniony bez notki przesuwa całą resztę harmonogramu.
test('voice bench replays the horde notes from the answers and counts a mate closing a middle turn', () => {
  const context = benchContext()
  const quiet = 'Krux czytać kod.'
  // Notki w turach 2, 5, 8 i 11; „w środku” w 5 i 11.
  const regular = [quiet, quiet, 'Niuch węszyć.', quiet, quiet, 'Grom kuć. Krux kończyć.', quiet, quiet, 'Lont mierzyć.', quiet, quiet, 'Krux zaczynać. Piryt zrzędzić.']
  assert.deepEqual({ ...context.middleClosings(regular) }, { middleNotes: 2, middleMates: 2, middleClosings: 1 })
  // Młot bez notki w turze 1 przesuwa notki na 4, 7 i 10; „w środku” tylko w 7.
  const shifted = [quiet, 'Młot liczyć.', quiet, quiet, 'Ochra malować.', quiet, quiet, 'Krux sprawdzać. Lont mierzyć.', quiet, quiet, 'Piryt zrzędzić.', quiet]
  assert.deepEqual({ ...context.middleClosings(shifted) }, { middleNotes: 1, middleMates: 1, middleClosings: 1 })
})

test('voice bench counts the mood word echoed in prose, not in code', () => {
  const moodWordHits = vm.runInContext('moodWordHits', benchContext())
  assert.equal(moodWordHits('Nastrój Kruxa dobry, bez nastroju. `nastrój` w kodzie.'), 2)
})

// bench-compare liczy metryki od nowa z `responses.json`, więc stara seria liczy się jak
// nowa; przebieg ERROR z częściowym `responses.json` wypada, zamiast zwalić porównanie.
test('bench compare skips error runs and recomputes every series from its responses', t => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-compare-'))
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }))
  const run = (series, id, status, responses) => {
    const dir = path.join(scratch, series, id)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ status, model: 'm', mode: 'stream', scenario: 'smrod', fullAnchors: 1, shortAnchors: 6, driftFixes: 0, hordeNotes: 2, moodNotes: 0, hookContextChars: 0 }))
    fs.writeFileSync(path.join(dir, 'responses.json'), JSON.stringify(responses))
  }
  const quiet = 'Krux czytać kod.'
  const answers = middle => [quiet, quiet, 'Niuch węszyć.', quiet, quiet, middle, quiet]
  run('A', 'r1', 'COMPLETE', answers('Krux kuć. Grom patrzeć.'))
  run('A', 'r2', 'COMPLETE', answers('Grom patrzeć. Krux kuć.'))
  run('A', 'r3', 'ERROR', [quiet])
  run('B', 'r1', 'COMPLETE', answers('Grom patrzeć. Krux kuć.'))
  const result = spawnSync(process.execPath, ['scripts/bench-compare.mjs', `A=${path.join(scratch, 'A')}`, `B=${path.join(scratch, 'B')}`, '--scenario', 'smrod'], { encoding: 'utf8', timeout: 30_000 })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^\| metryka \| A \(n=2\) \| B \(n=1\) \| Δ B \| p B \|$/mu)
  assert.match(result.stdout, /^\| …w ostatnim zdaniu \| 0\.50 ± 0\.71 \| 0\.00 ± — \| -0\.50 \| [\d.]+ \|$/mu)
})

// Bench liczy kumpli własnymi wzorcami: przyrząd pomiaru stoi poza modem i nie zmienia się
// między ramionami A/B. Nowy kumpel w `ROSTER` musi trafić także tam.
test('the bench knows every mate of the roster by name and declension', () => {
  const context = benchContext()
  const names = vm.runInContext('MATE_NAMES', context)
  const horde = new RegExp(vm.runInContext('hordePattern', context).source, 'u')
  assert.deepEqual(Object.keys(names).sort(), Object.keys(ROSTER).sort())
  assert.deepEqual(Object.keys(vm.runInContext('MATE_WORDS', context)).sort(), Object.keys(ROSTER).sort())
  for (const [mate, { locative, accusative }] of Object.entries(ROSTER)) {
    for (const form of [mate, locative, accusative]) {
      assert.ok(names[mate].test(form), `${mate}: ${form}`)
      assert.ok(horde.test(form), `${mate}: ${form}`)
    }
  }
})

// Odtworzenie w benchu powtarza regułę moda: QUIET_TURNS z hooks/lore.ts, dwa miejsca
// z „w środku” w turach nieparzystych, ziarno z numeru tury i brak notki przy prośbie
// o ruch nieodwracalny, której żaden prompt benchu nie robi. Gdy reguła się zmieni, ten
// test pada, zanim liczby w notatkach zaczną kłamać.
test('the bench replays the horde notes by the rule the mod uses', () => {
  const lore = fs.readFileSync('hooks/lore.ts', 'utf8')
  const quietTurns = source => source.match(/^const QUIET_TURNS = (\d+)$/mu)?.[1]
  assert.ok(quietTurns(lore))
  assert.equal(quietTurns(fs.readFileSync('scripts/voice-bench.mjs', 'utf8')), quietTurns(lore))
  assert.match(lore, /miejsce: \$\{pick\(PLACES, seed \+ 1\)\}/u)
  assert.match(lore, /^const PLACES = \['w środku[^'\n]*', 'na końcu'\] as const$/mu)
  assert.match(fs.readFileSync('hooks/register.ts', 'utf8'), /const life = risk === null \? lifeNote\(chronicle, turn\) : null/u)
  for (const { prompts } of Object.values(vm.runInContext('SCENARIOS', benchContext()))) {
    for (const prompt of prompts) assert.equal(riskHint(prompt), null, prompt)
  }
})

// Opisy kumpli siedzą na liście typów narzędzia `Agent` w każdej turze, więc mają budżet
// jak kotwica. Treść pliku to prompt kumpla: bez rodzaju, jak notki o hordzie.
test('mate definitions keep the agent listing short and address the mate without gender', () => {
  let listing = 0
  for (const { agent } of Object.values(ROSTER)) {
    const text = fs.readFileSync(new URL(`../agents/${agent}.md`, import.meta.url), 'utf8')
    listing += text.match(/^description: (.+)$/mu)[1].length
    assert.doesNotMatch(text, /\p{L}(?:łeś|łaś)(?!\p{L})/u, `${agent}.md: forma z rodzajem`)
  }
  assert.ok(listing <= 700, `opisy kumpli: ${listing} znaków`)
})

test('every mate has an agent definition under his type, and the scouts and the tester cannot edit', () => {
  const skill = fs.readFileSync(new URL('../skills/krux-horda/SKILL.md', import.meta.url), 'utf8')
  for (const [mate, { agent }] of Object.entries(ROSTER)) {
    const text = fs.readFileSync(new URL(`../agents/${agent}.md`, import.meta.url), 'utf8')
    const front = text.match(/^---\n([\s\S]*?)\n---\n/u)?.[1]
    assert.ok(front, `${agent}.md bez frontmattera`)
    assert.match(front, new RegExp(`^name: ${agent}$`, 'mu'))
    assert.match(front, new RegExp(`^description: ${mate} z hordy Kruxa`, 'mu'))
    assert.match(text, new RegExp(`^Jesteś ${mate},`, 'mu'))
    assert.ok(skill.includes(`\`krux-mod:${agent}\``), `skill bez krux-mod:${agent}`)
    const tools = front.match(/^tools: (.+)$/mu)?.[1].split(/,\s*/u)
    if (['niuch', 'piryt', 'mlot'].includes(agent)) {
      assert.ok(tools, `${agent}.md bez listy narzędzi`)
      for (const edit of ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']) assert.ok(!tools.includes(edit), `${agent}: ${edit}`)
    }
  }
})
