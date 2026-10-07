// Skrypty uruchamiamy z lokalnymi zależnościami: bez modelu i płatnych wywołań.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { stripTypeScriptTypes } from 'node:module'
import { EventEmitter } from 'node:events'
import { Writable } from 'node:stream'

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

test('git refresh runs status and log concurrently and coalesces overlapping reads with one trailing refresh', async () => {
  const gitSource = fs.readFileSync('hooks/git.ts', 'utf8').replace(/^import .*\n/gmu, '').replaceAll('export ', '')
  const gitContext = vm.createContext({})
  vm.runInContext(stripTypeScriptTypes(gitSource), gitContext)
  const commands = vm.runInContext('({ GIT_STATUS, GIT_LOG, GIT_UNPUSHED, gitOf })', gitContext)
  let state = null
  let failStatus = false
  let blocked = false
  let release
  let gate
  const calls = []
  const context = registerContext({ ...commands, read: async () => state, update: async (_api, _atom, change) => { state = change(state) } })
  const api = { process: { run: async (argv, options) => {
    assert.equal(options.timeoutMs, 5000)
    assert.deepEqual(Array.from(argv).slice(0, 4), ['git', '--no-optional-locks', '-c', 'core.quotePath=false'])
    const command = argv[4]
    calls.push(command)
    if (command === 'status' && failStatus) throw new Error('git unavailable')
    if (blocked && command === 'log') await gate
    return { exitCode: 0, stdout: command === 'status' ? '# branch.head main' : 'oid\tabc\tlocal' }
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
  assert.deepEqual(calls, ['status', 'log'])
  blocked = false
  release()
  await Promise.all([first, second, third])
  assert.deepEqual(calls, ['status', 'log', 'status', 'log'])
  assert.equal(state.commits[0].pushed, false)
  // Odrzucony status nie zwalnia blokady przed końcem równoległego logu.
  calls.length = 0
  failStatus = true
  blocked = true
  gate = new Promise(resolve => { release = resolve })
  const failing = refresh()
  await Promise.resolve()
  const overlapping = refresh()
  assert.equal(failing, overlapping)
  assert.deepEqual(calls, ['status', 'log'])
  blocked = false
  failStatus = false
  release()
  await failing
  assert.deepEqual(calls, ['status', 'log', 'status', 'log'])
  calls.length = 0
  await refresh()
  assert.deepEqual(calls, ['status', 'log'])
})

test('git refresh reads upstream reachability with full hashes and safe global options', async () => {
  const gitContext = vm.createContext({})
  vm.runInContext(stripTypeScriptTypes(fs.readFileSync('hooks/git.ts', 'utf8').replace(/^import .*\n/gmu, '').replaceAll('export ', '')), gitContext)
  const commands = vm.runInContext('({ GIT_STATUS, GIT_LOG, GIT_UNPUSHED, gitOf })', gitContext)
  let state = null
  let reachability = 'ok'
  const calls = []
  const context = registerContext({ ...commands, read: async () => state, update: async (_api, _atom, change) => { state = change(state) } })
  context.api = { process: { run: async (argv, options) => {
    calls.push(Array.from(argv))
    assert.equal(options.timeoutMs, 5000)
    if (argv[4] === 'status') return { exitCode: 0, stdout: '# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -0' }
    if (argv[4] === 'log') return { exitCode: 0, stdout: 'mergeoid\tmerge\tmerge\nremoteoid\tremote\tupstream\nlocaloid\tlocal\tlocal\nbaseoid\tbase\tbase' }
    assert.deepEqual(Array.from(argv), ['git', '--no-optional-locks', '-c', 'core.quotePath=false', 'rev-list', '@{upstream}..HEAD'])
    return { exitCode: reachability === 'failed' ? 128 : 0, stdout: reachability === 'truncated' ? 'mergeoid\n' : 'mergeoid\nlocaloid\n', isStdoutTruncated: reachability === 'truncated' }
  } } }
  await vm.runInContext('refreshGit(api)', context)
  assert.deepEqual(Array.from(state.commits, commit => commit.pushed), [false, true, false, true])
  assert.equal(calls.length, 3)
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
    const commands = vm.runInContext('({ GIT_STATUS, GIT_LOG, GIT_UNPUSHED, gitOf })', gitContext)
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
      calls.push(argv[4])
      return { exitCode: 0, stdout: argv[4] === 'status' ? '# branch.head main' : 'oid\tabc\tlocal' }
    } } }
    const first = vm.runInContext('refreshGit(api)', context)
    await first
    await lateCall
    await later
    assert.deepEqual(calls, ['status', 'log', 'status', 'log'], `microtask depth ${depth}`)
  }
})
