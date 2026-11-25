'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const path = require('node:path');

// Execute both implementations with the same deterministic platform and clock.
function fixture(file, options = {}) {
  const timers = [], children = [], trace = [];
  const spawn = (command, args, settings) => {
    trace.push(['spawn', command, Array.from(args), JSON.parse(JSON.stringify(settings))]);
    if (options.spawnError) throw new Error('spawn failed');
    const child = new EventEmitter();
    child.pid = 42;
    child.stdin = { writable: true, write(line) {
      trace.push(['write', line]);
      if (options.writeError) throw new Error('write failed');
    }};
    child.stderr = new EventEmitter();
    child.kill = () => trace.push(['kill']);
    children.push(child);
    return child;
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
    module, exports: module.exports, process: { cwd: () => '/fixture' },
    require(name) { return name === 'node:child_process' ? { spawn } : require(name); },
    setTimeout(fn, delay) { const t = { fn, delay, active: true, unref() {} }; timers.push(t); return t; },
    clearTimeout(t) { t.active = false; },
  }, { filename: file });
  const subject = new module.exports.ProcessBridge({ name: 'fixture', runtime: options.runtime || 'node', main: 'main',
    onRegister: x => trace.push(['register', Array.from(x)]),
    onEmit: (...x) => trace.push(['emit', ...x]),
    onLog: (...x) => trace.push(['log', ...x]),
    onError: e => trace.push(['error', e.message]),
    onExit: exit => { trace.push(['exit', {...exit}]); if (options.exitThrows) throw new Error('exit callback'); return options.handled; },
  });
  return { subject, trace, timers, children, api: module.exports };
}
const oldFile = path.join(__dirname, 'fixtures/original.cjs');
const newFile = path.join(__dirname, '../dist/index.cjs');
const normalize = x => JSON.parse(JSON.stringify(x));

async function scenario(file, options = {}) {
  const f = fixture(file, options), s = f.subject;
  f.trace.push(['start', s.start(), s.pid]);
  if (s.child) {
    const a = s.call('a', { value: 1 });
    const b = s.call('b', { value: 2 });
    const settled = Promise.allSettled([a, b]);
    if (!options.writeError) {
      s.onLine('{invalid');
      s.onLine(JSON.stringify({op:'register', events:['ready']}));
      s.onLine(JSON.stringify({op:'register', events:'invalid'}));
      s.onLine(JSON.stringify({op:'emit', event:'ready', payload:7}));
      s.onLine(JSON.stringify({op:'log', message:'hello'}));
      s.onLine(JSON.stringify({op:'result', id:'2', payload:9}));
      s.onLine(JSON.stringify({op:'error', id:'1', message:'denied'}));
      s.onLine(JSON.stringify({op:'result', id:'unknown'}));
    }
    f.trace.push(['settled', (await settled).map(x => x.status === 'fulfilled' ? ['ok',x.value] : ['error',x.reason.message])]);
    const pending = s.call('pending', null).catch(e => e.message);
    s.child.emit('close', 3, null);
    f.trace.push(['closed', await pending, s.pending.size, s.backoff]);
  }
  f.trace.push(['timers', f.timers.map(t => [t.delay, t.active])]);
  s.stop();
  f.trace.push(['stopped', s.start(), s.restartTimer, s.child]);
  return normalize(f.trace);
}

for (const runtime of ['python','python3','node','deno','ruby','bun','rust','unknown']) {
  test(`differential protocol, launch, concurrency and shutdown: ${runtime}`, async () => {
    assert.deepEqual(await scenario(newFile, {runtime}), await scenario(oldFile, {runtime}));
  });
}
for (const options of [{spawnError:true}, {writeError:true}, {handled:true}, {exitThrows:true}]) {
  test(`differential failure policy ${JSON.stringify(options)}`, async () => {
    assert.deepEqual(await scenario(newFile, options), await scenario(oldFile, options));
  });
}

for (const file of [oldFile,newFile]) {
  test(`timeout, backoff cap/reset and restart cancellation: ${path.relative(__dirname,file)}`, async () => {
    const {subject:s,timers,children} = fixture(file);
    s.start();
    const result = s.call('slow', {}).catch(e => e.message);
    timers[0].fn();
    assert.match(await result, /timed out/);
    assert.equal(s.pending.size,0);
    for (let i=0;i<10;i++) s.scheduleRestart({code:1,signal:null});
    assert.equal(s.backoff,30000);
    s.onLine('{"op":"result","id":"unknown"}');
    assert.equal(s.backoff,500);
    const restart = timers.at(-1);
    restart.fn();
    assert.equal(children.length,2);
    children[0].emit('close',1,null);
    assert.equal(s.child,children[1]);
    s.scheduleRestart({code:1,signal:null});
    const last = timers.at(-1);
    s.stop();
    assert.equal(last.active,false);
    assert.equal(s.start(),false);
  });
}

test('public constants and constructor validation match original', () => {
  const a = fixture(oldFile).api, b = fixture(newFile).api;
  assert.deepEqual(Object.keys(b),Object.keys(a));
  for (const key of Object.keys(a).filter(x => x !== 'ProcessBridge')) assert.deepEqual(normalize(b[key]),normalize(a[key]));
  for (const options of [{},{name:'x'},{name:'x',runtime:'node'}]) {
    assert.throws(() => new b.ProcessBridge(options), /name, runtime and main are required/);
  }
});
