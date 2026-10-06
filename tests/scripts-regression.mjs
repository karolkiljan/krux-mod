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
  ? 'act sheet uses private exclusive BMP files, cleans failures and explains unsupported platforms'
  : 'voice bench handles stdin EPIPE, cleans up, announces cost and keeps report paths relative', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'krux-script-test-'))
  try {
    if (script === 'act-sheet') {
      const temps = []
      const outputs = []
      let exclusive = false
      let fail = false
      const context = vm.createContext({
        Buffer, console: { log() {} }, process: { platform: 'linux', argv: [] },
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
        H: 1, W: 2, STAND: ['bb'], pad: x => x, PALETTE: { b: '#ffffff' },
      })
      vm.runInContext(stripTypeScriptTypes(sourceOf('scripts/act-sheet.ts')), context)
      const act = { intro: [], length: 1, loop: () => ['bb'] }
      context.sheet([act], path.join(scratch, 'sheet.png'))
      assert.equal(exclusive, true, 'BMP must use exclusive creation')
      assert.equal(temps.length, 1, 'BMP must have a private temporary directory')
      assert.equal(fs.existsSync(temps[0]), false, 'success must remove the BMP directory')
      fail = true
      assert.throws(() => context.sheet([act], path.join(scratch, 'sheet.png')), /conversion failed/u)
      assert.notEqual(temps[0], temps[1], 'runs must not share a BMP path')
      assert.equal(fs.existsSync(temps[1]), false, 'failure must remove the BMP directory')
      await assert.rejects(context.main(), /macOS.*sips|sips.*macOS/u)
      fail = false
      context.process.platform = 'darwin'
      vm.runInContext("actsOf = async () => ['a', 'b', 'c'].map(name => ({ name, intro: [], length: 1, loop: () => ['bb'] })); framesOf = () => []", context)
      await context.main()
      await context.main()
      assert.notEqual(outputs[1], outputs[2], 'default PNG outputs must not share a path')
      assert.equal(fs.existsSync(outputs[1]), true, 'the requested PNG must survive cleanup')
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
