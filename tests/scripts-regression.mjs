// Skrypty uruchamiamy z lokalnymi zależnościami: bez modelu i płatnych wywołań.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import zlib from 'node:zlib'
import { execFileSync, spawnSync } from 'node:child_process'
import { builtinModules, createRequire, stripTypeScriptTypes } from 'node:module'
import { EventEmitter } from 'node:events'
import { Writable } from 'node:stream'
import { GIT_LOCAL, GIT_LOG, GIT_STATUS, gitOf } from '../hooks/git.ts'
import { ROSTER } from '../hooks/roster.ts'
import { promptKind, riskHint } from '../hooks/voice.ts'

const sourceOf = file => fs.readFileSync(file, 'utf8').replace(/^import .*\n/gmu, '').replace(/\nmain\(\)\.catch[\s\S]*$/u, '')
// Kawałki PNG z kontrolą CRC-32 i piksele z IDAT (8 bitów, RGB, filtr 0 w każdym wierszu).
function decodePng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG signature')
  const chunks = []
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at)
    const body = bytes.subarray(at + 4, at + 8 + length)
    assert.equal(bytes.readUInt32BE(at + 8 + length), zlib.crc32(body) >>> 0, `CRC of ${body.subarray(0, 4)}`)
    chunks.push({ type: body.subarray(0, 4).toString('ascii'), data: body.subarray(4) })
    at += 12 + length
  }
  assert.deepEqual(chunks.map(chunk => chunk.type), ['IHDR', 'IDAT', 'IEND'])
  const header = chunks[0].data
  const width = header.readUInt32BE(0)
  const height = header.readUInt32BE(4)
  assert.deepEqual([...header.subarray(8)], [8, 2, 0, 0, 0], '8-bit RGB, no interlace')
  const raw = zlib.inflateSync(chunks[1].data)
  assert.equal(raw.length, (width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) assert.equal(raw[y * (width * 3 + 1)], 0, `row ${y} filter`)
  const pixel = (x, y) => [...raw.subarray(y * (width * 3 + 1) + 1 + x * 3, y * (width * 3 + 1) + 4 + x * 3)]
  return { width, height, pixel }
}

for (const script of ['act-sheet', 'voice-bench']) test(script === 'act-sheet'
  ? 'act sheet writes a valid PNG without external tools on any platform and reports frame violations'
  : 'voice bench handles stdin EPIPE, cleans up, announces cost and keeps report paths relative', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-script-test-'))
  try {
    if (script === 'act-sheet') {
      const outputs = []
      const logs = []
      const context = vm.createContext({
        Buffer, console: { log: text => logs.push(text) }, process: { platform: 'linux', argv: [], exitCode: 0 },
        mkdtempSync: fs.mkdtempSync, tmpdir: () => scratch, join: path.join, resolve: path.resolve,
        writeFileSync: (file, bytes, options) => { outputs.push(file); fs.writeFileSync(file, bytes, options) },
        crc32: zlib.crc32, deflateSync: zlib.deflateSync,
        // Linux bez `sips`: arkusz nie woła żadnego programu.
        execFileSync: () => assert.fail('act sheet must not run an external tool'),
      })
      for (const file of ['roster', 'stage', 'palette', 'apron']) {
        vm.runInContext(stripTypeScriptTypes(sourceOf(`hooks/${file}.ts`).replaceAll('export ', '')), context)
      }
      vm.runInContext(stripTypeScriptTypes(sourceOf('scripts/act-sheet.ts')), context)
      const stand = vm.runInContext('STAND', context)
      const act = { name: 'a', intro: [], length: 1, loop: () => stand }
      const strips = context.actStrips([act])
      context.sheet(strips, path.join(scratch, 'sheet.png'))
      const [W, H, GAP, SCALE, PER_ROW, PALETTE] = vm.runInContext('[W, H, GAP, SCALE, PER_ROW, PALETTE]', context)
      const image = decodePng(fs.readFileSync(path.join(scratch, 'sheet.png')))
      assert.equal(image.width, PER_ROW * (W + GAP) * SCALE)
      assert.equal(image.height, strips.length * (H + GAP) * SCALE)
      // Pierwsza klatka arkusza piksel w piksel: kolor z palety, puste pole szare, wiersze od góry.
      strips[0][0].forEach((row, y) => [...row].forEach((cell, x) => {
        const hex = PALETTE[cell] ?? '#262626'
        const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
        assert.deepEqual(image.pixel(x * SCALE + SCALE - 1, y * SCALE + SCALE - 1), rgb, `cell ${x},${y} '${cell}'`)
      }))
      context.actsOf = async () => ['a', 'b', 'c'].map(name => ({ ...act, name }))
      await context.main()
      await context.main()
      assert.notEqual(outputs[1], outputs[2], 'default PNG outputs must not share a path')
      assert.equal(decodePng(fs.readFileSync(outputs[1])).width, image.width, 'the default output is a PNG sheet')
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
// tsx` w hooks/CLAUDE.md), więc jego importy sprawdzamy statycznie, bez uruchamiania.
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

test('module memories of chat times and grouped tools drop their oldest entries past the limit', () => {
  const context = registerContext()
  const times = vm.runInContext('const times = new Map(); for (let i = 0; i < 5; i += 1) times.set(`m${i}`, i); trimOldest(times, 3); [...times.keys()]', context)
  assert.deepEqual(Array.from(times), ['m2', 'm3', 'm4'])
  const tools = vm.runInContext('const tools = new Set(["a", "b"]); trimOldest(tools, 3); [...tools]', context)
  assert.deepEqual(Array.from(tools), ['a', 'b'])
  assert.deepEqual(Array.from(vm.runInContext('[MESSAGE_TIMES_LIMIT, GROUPED_TOOLS_LIMIT]', context)), [2000, 4000])
})

test('the version and display fields live only in plugin.json, not in the marketplace entry', () => {
  const manifest = JSON.parse(fs.readFileSync('.claude-plugin/plugin.json', 'utf8'))
  const marketplace = JSON.parse(fs.readFileSync('.claude-plugin/marketplace.json', 'utf8'))
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/u)
  // Etykieta w UI; `name` zostaje stały, bo po nim idą instalacje i linie logu (publish.md „Choose a permanent name”).
  assert.equal(manifest.displayName, 'Krux mod')
  assert.equal(manifest.name, 'krux-mod')
  const entry = marketplace.plugins.find(plugin => plugin.name === manifest.name)
  assert.ok(entry)
  // Silnik bierze wersję z plugin.json bez ostrzeżenia (host-marketplace „Release a new version”).
  assert.equal('version' in entry, false)
  // Pola wyświetlane z wpisu przesłaniają plugin.json; przy źródle względnym silnik czyta manifest sam.
  for (const field of ['description', 'author', 'displayName', 'homepage', 'repository', 'license', 'keywords']) assert.equal(field in entry, false, field)
})

test('the threads tool matcher is a literal that validate can read and matches THREAD_TOOL_NAME', () => {
  const threads = vm.createContext({})
  vm.runInContext(stripTypeScriptTypes(fs.readFileSync('hooks/threads.ts', 'utf8').replace(/^import .*\n/gmu, '').replaceAll('export ', '')), threads)
  const name = vm.runInContext('THREAD_TOOL_NAME', threads)
  assert.equal(name, 'mcp__krux-mod__watki')
  assert.ok(fs.readFileSync('hooks/register.ts', 'utf8').includes(`on('tool.call', { tool: '${name}' }`))
})

// `claude plugin test` nie odpala `ui.fault`: zestaw ma tylko render, resolve, scroll i focus.
test('a canvas fault switches the band and the forge pane to text for the session', async () => {
  const context = registerContext()
  const hooks = new Map()
  context.on = (event, ...args) => {
    hooks.set(event, args.at(-1))
    return { catch() {} }
  }
  vm.runInContext('register(on)', context)
  assert.equal(vm.runInContext('forgeFault', context), false)
  const logs = []
  const event = { surface: 'terminal', component: 'AbovePrompt', requestId: 'band', element: 'forge', module: 'hooks/forge.ts', phase: 'load', reason: 'boom' }
  const result = await hooks.get('ui.fault')({ ui: { log: (text, options) => logs.push([text, options?.to]) } }, event, async e => { assert.equal(e, event); return {} })
  assert.deepEqual(result, {})
  assert.equal(vm.runInContext('forgeFault', context), true)
  assert.deepEqual(logs, [['płótno hooks/forge.ts (load): boom', 'debug']])
  // Oba miejsca z płótnem czytają flagę: pas (`hasClient`, gałąź tekstu) i panel /krux.
  // Desktop rysuje płótno jako `Svg`, bez `Client`, więc flaga dotyczy tylko terminala.
  const source = fs.readFileSync('hooks/register.ts', 'utf8')
  assert.match(source, /hasClient: desk \|\| \('Client' in table && !forgeFault\)/u)
  assert.match(source, /!\('Client' in table\) \|\| forgeFault/u)
  assert.match(source, /'Client' in table && !forgeFault && e\.props\.bodyColumns/u)
})

test('git refresh runs status, log and diff check concurrently and coalesces overlapping reads with one trailing refresh', async () => {
  const gitSource = fs.readFileSync('hooks/git.ts', 'utf8').replace(/^import .*\n/gmu, '').replaceAll('export ', '')
  const gitContext = vm.createContext({})
  vm.runInContext(stripTypeScriptTypes(gitSource), gitContext)
  const commands = vm.runInContext('({ GIT_STATUS, GIT_LOG, GIT_CHECK, GIT_CHECK_CACHED, GIT_UNPUSHED, GIT_LOCAL, gitOf })', gitContext)
  let state = null
  let failStatus = false
  let blocked = false
  let release
  let gate
  const calls = []
  const context = registerContext({ ...commands, read: async () => state, update: async (_api, _atom, change) => { state = change(state) } })
  const api = { process: { run: async (argv, options) => {
    assert.equal(options.timeoutMs, 5000)
    const command = argv.includes('--cached') ? 'diff-cached' : argv.includes('--check') ? 'diff' : argv[6]
    if (command === 'diff') assert.deepEqual(Array.from(argv), ['git', '--no-optional-locks', '-c', 'core.fsmonitor=false', 'diff', '--check'])
    else if (command === 'diff-cached') assert.deepEqual(Array.from(argv), ['git', '--no-optional-locks', '-c', 'core.fsmonitor=false', 'diff', '--cached', '--check'])
    else assert.deepEqual(Array.from(argv).slice(0, 6), ['git', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false'])
    calls.push(command)
    if (command === 'status' && failStatus) throw new Error('git unavailable')
    if (blocked && command === 'log') await gate
    // Gałąź bez upstreamu: `GIT_LOCAL` po statusie mówi, że commit nie leży na żadnym zdalnym.
    return { exitCode: 0, stdout: command === 'status' ? '# branch.head main' : command === 'log' ? 'oid\tabc\tlocal' : command === 'rev-list' ? 'oid\n' : '' }
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
  assert.deepEqual(calls, ['status', 'log', 'diff', 'diff-cached', 'rev-list', 'status', 'log', 'diff', 'diff-cached', 'rev-list'])
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
  // Bez statusu nie ma czego porównać z `rev-list`; zaległy odczyt już go ma.
  assert.deepEqual(calls, ['status', 'log', 'diff', 'diff-cached', 'status', 'log', 'diff', 'diff-cached', 'rev-list'])
  calls.length = 0
  await refresh()
  assert.deepEqual(calls, ['status', 'log', 'diff', 'diff-cached', 'rev-list'])
})

test('git refresh reads upstream reachability with full hashes and safe global options', async () => {
  const gitContext = vm.createContext({})
  vm.runInContext(stripTypeScriptTypes(fs.readFileSync('hooks/git.ts', 'utf8').replace(/^import .*\n/gmu, '').replaceAll('export ', '')), gitContext)
  const commands = vm.runInContext('({ GIT_STATUS, GIT_LOG, GIT_CHECK, GIT_CHECK_CACHED, GIT_UNPUSHED, GIT_LOCAL, gitOf })', gitContext)
  let state = null
  let reachability = 'ok'
  let local = 'ok'
  let status = '# branch.head main\n# branch.upstream origin/main\n# branch.ab +2 -0'
  const calls = []
  const context = registerContext({ ...commands, read: async () => state, update: async (_api, _atom, change) => { state = change(state) } })
  const UPSTREAM = ['git', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false', 'rev-list', '@{upstream}..HEAD']
  const REMOTES = ['git', '--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.quotePath=false', 'rev-list', '-n', '10', 'HEAD', '--not', '--remotes', '--']
  context.api = { process: { run: async (argv, options) => {
    const command = Array.from(argv)
    assert.equal(options.timeoutMs, 5000)
    if (argv.includes('--check')) return { exitCode: 0, stdout: '' }
    if (argv[6] === 'status') return { exitCode: 0, stdout: status }
    if (argv[6] === 'log') return { exitCode: 0, stdout: 'mergeoid\tmerge\tmerge\nremoteoid\tremote\tupstream\nlocaloid\tlocal\tlocal\nbaseoid\tbase\tbase' }
    calls.push(command.includes('@{upstream}..HEAD') ? 'upstream' : 'remotes')
    if (command.includes('@{upstream}..HEAD')) {
      assert.deepEqual(command, UPSTREAM)
      return { exitCode: reachability === 'failed' ? 128 : 0, stdout: reachability === 'truncated' ? 'mergeoid\n' : 'mergeoid\nlocaloid\n', isStdoutTruncated: reachability === 'truncated' }
    }
    // Commity spoza wszystkich zdalnych: tu tylko merge, reszta leży na jakimś zdalnym.
    assert.deepEqual(command, REMOTES)
    return { exitCode: local === 'failed' ? 128 : 0, stdout: local === 'truncated' ? '' : 'mergeoid\n', isStdoutTruncated: local === 'truncated' }
  } } }
  const pushed = async () => {
    calls.length = 0
    await vm.runInContext('refreshGit(api)', context)
    return Array.from(state.commits, commit => commit.pushed)
  }
  assert.deepEqual(await pushed(), [false, true, false, true])
  assert.deepEqual(calls, ['upstream'])
  // Upstream bez odczytu (kod różny od 0 albo ucięta lista): pytamy wszystkie zdalne.
  reachability = 'failed'
  assert.deepEqual(await pushed(), [false, true, true, true])
  assert.deepEqual(calls, ['upstream', 'remotes'])
  reachability = 'truncated'
  assert.deepEqual(await pushed(), [false, true, true, true])
  assert.deepEqual(calls, ['upstream', 'remotes'])
  // Bez żadnego odczytu nic nie jest wypchnięte.
  for (const broken of ['failed', 'truncated']) {
    local = broken
    assert.deepEqual(await pushed(), [false, false, false, false])
  }
  local = 'ok'
  // Bez upstreamu i przy upstreamie bez `branch.ab` (`[gone]`) `@{upstream}` nie ma sensu.
  for (const branch of ['# branch.head main', '# branch.head feature\n# branch.upstream origin/feature']) {
    status = branch
    assert.deepEqual(await pushed(), [false, true, true, true])
    assert.deepEqual(calls, ['remotes'])
  }
})


// Reszta kontraktu awarii idzie przez `claude plugin test` (tests/mod.test.ts); `ui.close` zestaw nie odpala.
test('a failed close observer does not repeat the downstream close', async () => {
  const context = registerContext({
    applyToggle: () => ({}),
    read: async () => ({ persona: true, sztolnia: true }),
    update: async () => { throw new Error('state unavailable') },
  })
  const hooks = []
  context.on = (event, ...args) => {
    const hook = { event, run: args.at(-1) }
    hooks.push(hook)
    return { catch(handler) { hook.catch = handler } }
  }
  vm.runInContext('register(on)', context)
  const hook = hooks.find(one => one.event === 'ui.close')
  let executions = 0
  const next = async () => { executions += 1; return {} }
  // Przełącznik czyta tryby ze stanu sesji, więc magazyn pada też przy zapisie.
  const api = { store: { get: async () => { throw new Error('store unavailable') }, set: async () => { throw new Error('store unavailable') } } }
  // Silnik pomija hook bez .catch albo zostawia wynik next; mod nie może wołać next drugi raz.
  await assert.rejects(hook.run(api, { id: 'sztolnia', origin: { kind: 'person' } }, next), /unavailable/u)
  assert.ok(executions <= 1)
  assert.equal(hook.catch, undefined)
})


test('a refresh at completion reads again instead of joining a finished snapshot', async () => {
  for (let depth = 0; depth < 8; depth += 1) {
    const gitContext = vm.createContext({})
    vm.runInContext(stripTypeScriptTypes(fs.readFileSync('hooks/git.ts', 'utf8').replace(/^import .*\n/gmu, '').replaceAll('export ', '')), gitContext)
    const commands = vm.runInContext('({ GIT_STATUS, GIT_LOG, GIT_CHECK, GIT_CHECK_CACHED, GIT_UNPUSHED, GIT_LOCAL, gitOf })', gitContext)
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
      calls.push(argv.includes('--cached') ? 'diff-cached' : argv.includes('--check') ? 'diff' : argv[6])
      return { exitCode: 0, stdout: argv[6] === 'status' ? '# branch.head main' : 'oid\tabc\tlocal' }
    } } }
    const first = vm.runInContext('refreshGit(api)', context)
    await first
    await lateCall
    await later
    assert.deepEqual(calls, ['status', 'log', 'diff', 'diff-cached', 'rev-list', 'status', 'log', 'diff', 'diff-cached', 'rev-list'], `microtask depth ${depth}`)
  }
})

test('mod git reads do not run a core.fsmonitor command from the repository config', () => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-git-fsmonitor-'))
  try {
    const marker = path.join(repository, 'fsmonitor-ran')
    const hook = path.join(repository, 'fsmonitor.sh')
    fs.writeFileSync(hook, `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 })
    const git = (...args) => execFileSync('git', args, { cwd: repository, stdio: 'pipe' })
    git('init', '-q')
    git('config', 'core.fsmonitor', hook)
    // Bez wyłączenia git uruchamia komendę z konfiguracji repo: test ma sens.
    git('status', '--porcelain=v2')
    assert.ok(fs.existsSync(marker))
    fs.rmSync(marker)
    const gitContext = vm.createContext({})
    vm.runInContext(stripTypeScriptTypes(fs.readFileSync('hooks/git.ts', 'utf8').replace(/^import .*\n/gmu, '').replaceAll('export ', '')), gitContext)
    const commands = vm.runInContext('[GIT_STATUS, GIT_LOG, GIT_CHECK, GIT_CHECK_CACHED]', gitContext)
    for (const [command, ...args] of commands) {
      try { execFileSync(command, args, { cwd: repository, stdio: 'pipe' }) } catch { /* Pusty log bez commitów kończy się kodem 128. */ }
    }
    assert.equal(fs.existsSync(marker), false)
  } finally {
    fs.rmSync(repository, { recursive: true, force: true })
  }
})

// Git w izolowanym środowisku: bez konfiguracji systemu i Morry, z tożsamością testu.
const GIT_ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_AUTHOR_NAME: 'Krux test',
  GIT_AUTHOR_EMAIL: 'krux-test@example.invalid',
  GIT_COMMITTER_NAME: 'Krux test',
  GIT_COMMITTER_EMAIL: 'krux-test@example.invalid',
}

function gitIn(repository) {
  return args => {
    const result = spawnSync('git', args, { cwd: repository, env: GIT_ENV, encoding: 'utf8', timeout: 10_000 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    return result.stdout
  }
}

// `refreshGit` z `register.ts` na prawdziwym repo: komendy moda idą do gita w `repository`,
// a decyzję, który odczyt wypchnięcia wziąć, podejmuje kod moda. Wynik: zapisany `KruxGit`.
async function refreshedIn(repository) {
  const gitContext = vm.createContext({})
  vm.runInContext(stripTypeScriptTypes(fs.readFileSync('hooks/git.ts', 'utf8').replace(/^import .*\n/gmu, '').replaceAll('export ', '')), gitContext)
  const commands = vm.runInContext('({ GIT_STATUS, GIT_LOG, GIT_CHECK, GIT_CHECK_CACHED, GIT_UNPUSHED, GIT_LOCAL, gitOf })', gitContext)
  let state = null
  const context = registerContext({ ...commands, read: async () => state, update: async (_api, _atom, change) => { state = change(state) } })
  context.api = { process: { run: async ([command, ...args], options) => {
    const result = spawnSync(command, args, { cwd: repository, env: GIT_ENV, encoding: 'utf8', timeout: options.timeoutMs })
    return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr, isStdoutTruncated: false, isStderrTruncated: false }
  } } }
  await vm.runInContext('refreshGit(api)', context)
  return state
}

// Podpisy commitów z flagą wypchnięcia, od najnowszego.
const pushedOf = git => Array.from(git.commits, commit => [commit.subject, commit.pushed])

test('a real repository without upstream keeps its complete local commit history', t => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-git-contract-'))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  const git = gitIn(repository)
  git(['init', '--initial-branch=main'])
  const expected = []
  for (const subject of ['base', 'first local change', 'second local change']) {
    fs.writeFileSync(path.join(repository, 'history.txt'), `${subject}\n`)
    git(['add', '--', 'history.txt'])
    git(['-c', 'commit.gpgSign=false', 'commit', '-m', subject])
    expected.unshift({ hash: git(['rev-parse', '--short', 'HEAD']).trim(), subject, pushed: false, at: Number(git(['show', '-s', '--format=%ct', 'HEAD']).trim()) * 1000 })
  }

  // Exercise the shipped Git commands and the native parser with real output.
  // Expected commits come from the commits we created, not from the parser.
  // Bez żadnego zdalnego `GIT_LOCAL` daje całą historię: nic nie jest wypchnięte.
  const actual = gitOf(git(GIT_STATUS.slice(1)), git(GIT_LOG.slice(1)), git(GIT_LOCAL.slice(1)))
  assert.equal(actual.branch, 'main')
  assert.equal(actual.upstream, null)
  assert.deepEqual(actual.commits, expected)
})

// Repo z bare origin i klonem roboczym; `commit` pisze jeden plik i commituje.
function originAndWork(scratch) {
  const origin = path.join(scratch, 'origin.git')
  const work = path.join(scratch, 'work')
  gitIn(scratch)(['init', '--bare', '--initial-branch=main', origin])
  gitIn(scratch)(['init', '--initial-branch=main', work])
  const git = gitIn(work)
  const commit = subject => {
    fs.writeFileSync(path.join(work, 'history.txt'), `${subject}\n`)
    git(['add', '--', 'history.txt'])
    git(['-c', 'commit.gpgSign=false', 'commit', '-m', subject])
  }
  return { origin, work, git, commit }
}

test('a real branch before its first push keeps commits from origin/main pushed and only its own unpushed', async t => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-git-new-branch-'))
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }))
  const { origin, work, git, commit } = originAndWork(scratch)
  commit('base')
  git(['remote', 'add', 'origin', origin])
  git(['push', '-u', 'origin', 'main'])
  git(['checkout', '-b', 'nowa'])
  commit('own change')
  // Plik o nazwie HEAD robi z gołego `rev-list HEAD` dwuznaczny argument; `--` to rozstrzyga.
  fs.writeFileSync(path.join(work, 'HEAD'), 'not a ref\n')
  const fresh = await refreshedIn(work)
  assert.deepEqual([fresh.branch, fresh.upstream], ['nowa', null])
  assert.deepEqual(pushedOf(fresh), [['own change', false], ['base', true]])
})

test('a real branch whose upstream was deleted after a merge reads as gone, not as even', async t => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-git-gone-'))
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }))
  const { origin, work, git, commit } = originAndWork(scratch)
  commit('base')
  git(['remote', 'add', 'origin', origin])
  git(['push', '-u', 'origin', 'main'])
  git(['checkout', '-b', 'feature'])
  commit('feature change')
  git(['push', '-u', 'origin', 'feature'])
  const even = gitOf(git(GIT_STATUS.slice(1)))
  assert.equal(even.upstream, 'origin/feature')
  assert.equal(even.upstreamGone, undefined)
  // PR scalony, gałąź na zdalnym usunięta, `fetch --prune` zdejmuje jej ref.
  gitIn(origin)(['branch', '-D', 'feature'])
  git(['fetch', '--prune'])
  const gone = gitOf(git(GIT_STATUS.slice(1)))
  assert.deepEqual([gone.upstream, gone.upstreamGone, gone.ahead, gone.behind], ['origin/feature', true, 0, 0])
  // `@{upstream}..HEAD` pada kodem 128, więc o wypchnięciu mówią wszystkie zdalne:
  // commit gałęzi nie leży już na żadnym, a base leży na origin/main.
  const refreshed = await refreshedIn(work)
  assert.equal(refreshed.upstreamGone, true)
  assert.deepEqual(pushedOf(refreshed), [['feature change', false], ['base', true]])
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
# Zombie to proces zakończony. dash przy 'sh -c' nie robi exec, więc dziecko jest wnukiem
# tui-shot: po SIGKILL trafia pod PID 1, a ten w kontenerze często zombie nie zbiera.
def alive(pid):
    try: os.kill(pid, 0)
    except ProcessLookupError: return False
    try: return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[0] != 'Z'
    except FileNotFoundError: return not Path('/proc/self').exists()
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
    assert.equal(result.childAlive, false, 'the owned child must be terminated')
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
// o ruch nieodwracalny, której żaden prompt benchu nie robi. Prośba o plan dostaje
// środek zawsze; w benchu stoi tylko w turze nieparzystej, gdzie rotacja daje to samo.
// Gdy reguła się zmieni, ten test pada, zanim liczby w notatkach zaczną kłamać.
test('the bench replays the horde notes by the rule the mod uses', () => {
  const lore = fs.readFileSync('hooks/lore.ts', 'utf8')
  const quietTurns = source => source.match(/^const QUIET_TURNS = (\d+)$/mu)?.[1]
  assert.ok(quietTurns(lore))
  assert.equal(quietTurns(fs.readFileSync('scripts/voice-bench.mjs', 'utf8')), quietTurns(lore))
  assert.match(lore, /const place = aside\.middle \? PLACES\[0\] : pick\(PLACES, seed \+ 1\)\n/u)
  assert.match(lore, /miejsce: \$\{place\}/u)
  assert.match(lore, /^const PLACES = \['w środku[^'\n]*', 'na końcu'\] as const$/mu)
  const register = fs.readFileSync('hooks/register.ts', 'utf8')
  assert.match(register, /const life = risk === null \? hordeNote\(chronicle, turn, aside\) : null/u)
  assert.match(register, /const plan = promptKind\(e\.text\) === 'plan'\n[\s\S]*middle: plan \}/u)
  for (const { prompts } of Object.values(vm.runInContext('SCENARIOS', benchContext()))) {
    prompts.forEach((prompt, turn) => {
      assert.equal(riskHint(prompt), null, prompt)
      if (promptKind(prompt) === 'plan') assert.equal(turn % 2, 1, prompt)
    })
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
  const colors = []
  for (const [mate, { agent }] of Object.entries(ROSTER)) {
    const text = fs.readFileSync(new URL(`../agents/${agent}.md`, import.meta.url), 'utf8')
    const front = text.match(/^---\n([\s\S]*?)\n---\n/u)?.[1]
    assert.ok(front, `${agent}.md bez frontmattera`)
    assert.match(front, new RegExp(`^name: ${agent}$`, 'mu'))
    assert.match(front, new RegExp(`^description: ${mate} z hordy Kruxa`, 'mu'))
    assert.match(text, new RegExp(`^Jesteś ${mate},`, 'mu'))
    assert.ok(skill.includes(`\`krux-mod:${agent}\``), `skill bez krux-mod:${agent}`)
    const tools = front.match(/^tools: (.+)$/mu)?.[1].split(/,\s*/u)
    // Kolor z listy silnika, jeden na kumpla (sub-agents „Supported frontmatter fields”).
    colors.push(front.match(/^color: (.+)$/mu)?.[1])
    if (['niuch', 'piryt', 'mlot'].includes(agent)) {
      assert.ok(tools, `${agent}.md bez listy narzędzi`)
      for (const edit of ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']) assert.ok(!tools.includes(edit), `${agent}: ${edit}`)
    }
    // Zwiad bierze wszystko z zadania, jak wbudowany Explore; Młot zostaje z CLAUDE.md, bo tam stoją komendy testów.
    assert.equal(/^omitClaudeMd: true$/mu.test(front), agent === 'niuch', `${agent}: omitClaudeMd`)
    if (['niuch', 'mlot'].includes(agent)) assert.match(front, /^maxTurns: \d+$/mu, `${agent}: maxTurns`)
  }
  for (const color of colors) assert.ok(['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'].includes(color), String(color))
  assert.equal(new Set(colors).size, colors.length)
})

// Audyt wykopał duplikaty kolorów stanów i Morry (#5b9bd5 dwa razy, #3fb950 i #e0322b po dwa):
// każdy hex ma jedno źródło, dokumentacja w hooks/CLAUDE.md zostaje dosłowna i nie liczy się.
// Razem z hooks/acts/ i bez wielkości liter: '#3FB950' to ta sama kopia.
test('each UI colour lives in its single source file, not in a third place under hooks/', () => {
  const homes = { '5b9bd5': 'avatar.ts', '3fb950': 'sprites.ts', e0322b: 'palette.ts' }
  for (const file of fs.readdirSync('hooks', { recursive: true })) {
    if (!file.endsWith('.ts')) continue
    const text = fs.readFileSync(path.join('hooks', file), 'utf8').toLowerCase()
    for (const [hex, home] of Object.entries(homes)) {
      if (file !== home) assert.ok(!text.includes(hex), `${hex} poza hooks/${home}: hooks/${file}`)
    }
  }
})

// Cudzysłowy w voice/ zamykają się znakiem ASCII jak teksty moda w prompcie (tests/gauge.test.ts):
// mieszanka z typograficznym U+201D była (43 linie do 3), model kopiuje powierzchnię przykładów.
// Zakaz obejmuje też inne zamknięcia („tak“, „tak»); odwrót zasady zmienia oba testy naraz.
test('voice markdown closes every quote with the plain ASCII character like VOICE_ANCHOR', () => {
  for (const file of fs.readdirSync('voice')) {
    if (!file.endsWith('.md')) continue
    const lines = fs.readFileSync(path.join('voice', file), 'utf8').split('\n')
    const bad = lines.findIndex(line => /[”“«»]/u.test(line))
    assert.equal(bad, -1, `voice/${file}:${bad + 1}: cudzysłów spoza ASCII`)
  }
})

// Typy silnika w `.claude-plugin/types/` powstają dopiero po `claude --plugin-dir .`. Bez nich
// `extends` się nie czyta, a tsc z domyślnymi opcjami pisał .js obok każdego .ts w katalogu pluginu.
test('tsconfig never emits JavaScript, even before the engine writes its types', () => {
  const config = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'))
  assert.equal(config.extends, './.claude-plugin/types/tsconfig.json')
  assert.equal(config.compilerOptions?.noEmit, true)
})

// O Morrze i o kumplach bez rodzaju: model kopiuje powierzchnię przykładów, więc
// „Grom wygonić go” w przykładzie persony ciągnął zaimki z rodzajem także do Ochry.
test('persona examples name Morra and the mates without a gendered pronoun', () => {
  const lines = fs.readFileSync('voice/persona.md', 'utf8').split('\n')
  const names = new RegExp(`(?<!\\p{L})(?:Morr\\p{L}*|${Object.values(ROSTER).map(mate => mate.pattern.source.replace(/^\(\?<!\\p\{L\}\)|\(\?!\\p\{L\}\)$/gu, '')).join('|')})(?!\\p{L})`, 'u')
  const pronoun = /(?<!\p{L})(?:go|mu|jego|jej|ją|niego|niej|nim|nią|on|ona)(?!\p{L})/u
  lines.forEach((line, at) => {
    if (line.startsWith('Krux:') && names.test(line)) assert.doesNotMatch(line, pronoun, `voice/persona.md:${at + 1}`)
  })
})
