var DEFAULT_BACKOFF_MS, DEFAULT_TIMEOUT_MS, MAX_BACKOFF_MS, ProcessBridge, RUNTIME_BIN, defaultSpawn, readline;

({
  spawn: defaultSpawn
} = require('node:child_process'));

readline = require('node:readline');

RUNTIME_BIN = Object.freeze({
  python: ['python3'],
  python3: ['python3'],
  node: ['node'],
  deno: ['deno', 'run', '--allow-all'],
  ruby: ['ruby'],
  bun: ['bun'],
  rust: []
});

DEFAULT_TIMEOUT_MS = 30000;

DEFAULT_BACKOFF_MS = 500;

MAX_BACKOFF_MS = 30000;

// JSONL bridge owned by the package host. No new registration semantics.
ProcessBridge = class ProcessBridge {
  constructor(options = {}) {
    if (!(options.name && options.runtime && options.main)) {
      throw new TypeError('name, runtime and main are required');
    }
    this.name = options.name;
    this.runtime = options.runtime;
    this.main = options.main;
    this.cwd = options.cwd || process.cwd();
    this.timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    this.spawn = options.spawn || defaultSpawn;
    this.onRegister = options.onRegister || function() {};
    this.onEmit = options.onEmit || function() {};
    this.onLog = options.onLog || function() {};
    this.onError = options.onError || function() {};
    this.onExit = options.onExit;
    this.child = null;
    this.pending = new Map();
    this.nextId = 1;
    this.backoff = DEFAULT_BACKOFF_MS;
    this.stopped = false;
    this.restartTimer = null;
  }

  start() {
    var args, baseArgs, bin, child, command, error, executable, ref;
    if (this.stopped) {
      return false;
    }
    bin = RUNTIME_BIN[this.runtime];
    if (!bin) {
      this.onError(new Error(`unsupported runtime \"${this.runtime}\"`));
      return false;
    }
    [command, ...baseArgs] = bin;
    executable = this.runtime === 'rust' ? this.main : command;
    args = this.runtime === 'rust' ? baseArgs : [...baseArgs, this.main];
    try {
      this.child = this.spawn(executable, args, {
        cwd: this.cwd,
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error1) {
      error = error1;
      this.onError(error);
      this.scheduleRestart({
        code: null,
        signal: null
      });
      return false;
    }
    child = this.child;
    if (child.stdout) {
      readline.createInterface({
        input: child.stdout
      }).on('line', (line) => {
        return this.onLine(line);
      });
    }
    if ((ref = child.stderr) != null) {
      ref.on('data', (data) => {
        return this.onLog(String(data), 'stderr');
      });
    }
    child.on('error', (error) => {
      return this.onError(error);
    });
    child.on('close', (code, signal) => {
      if (this.child !== child) {
        return;
      }
      this.child = null;
      this.rejectAll(`process exited with code ${code}`);
      if (!this.stopped) {
        this.scheduleRestart({code, signal});
      }
    });
    this.onLog(`started (${this.runtime} ${this.main}, pid ${child.pid})`, 'lifecycle');
    return true;
  }

  scheduleRestart(exit) {
    var base, error, handled, wait;
    handled = false;
    try {
      handled = (typeof this.onExit === "function" ? this.onExit(exit) : void 0) === true;
    } catch (error1) {
      error = error1;
      this.onError(error);
    }
    if (handled || this.stopped) {
      return;
    }
    wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    this.onLog(`exited (${exit.code}) — restarting in ${wait}ms`, 'lifecycle');
    this.restartTimer = setTimeout((() => {
      this.restartTimer = null;
      this.start();
    }), wait);
    if (typeof (base = this.restartTimer).unref === "function") {
      base.unref();
    }
  }

  onLine(line) {
    var message, pending;
    try {
      message = JSON.parse(line);
    } catch (error1) {
      return;
    }
    switch (message.op) {
      case 'result':
        pending = this.pending.get(message.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          pending.resolve(message.payload);
        }
        this.backoff = DEFAULT_BACKOFF_MS;
        break;
      case 'error':
        pending = this.pending.get(message.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          pending.reject(new Error(message.message || 'process error'));
        }
        break;
      case 'register':
        this.onRegister(Array.isArray(message.events) ? message.events : []);
        break;
      case 'emit':
        this.onEmit(message.event, message.payload);
        break;
      case 'log':
        this.onLog(String(message.message || ''), 'process');
    }
  }

  call(event, payload) {
    var id, ref, ref1;
    if (!((ref = this.child) != null ? (ref1 = ref.stdin) != null ? ref1.writable : void 0 : void 0)) {
      return Promise.reject(new Error(`[proc] module \"${this.name}\" is not running`));
    }
    id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      var error, timer;
      timer = setTimeout((() => {
        this.pending.delete(id);
        return reject(new Error(`[proc] \"${this.name}\" timed out on \"${event}\" (${this.timeoutMs}ms)`));
      }), this.timeoutMs);
      this.pending.set(id, {resolve, reject, timer});
      try {
        this.child.stdin.write(`${JSON.stringify({
          op: 'event',
          id,
          event,
          payload
        })}\n`);
      } catch (error1) {
        error = error1;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  rejectAll(reason) {
    var pending;
    for (pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`[proc] ${this.name}: ${reason}`));
    }
    this.pending.clear();
  }

  stop() {
    var ref;
    this.stopped = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }
    this.restartTimer = null;
    this.rejectAll('bridge stopped');
    if ((ref = this.child) != null) {
      ref.kill();
    }
    this.child = null;
  }

};

Object.defineProperty(ProcessBridge.prototype, 'pid', {
  get: function() {
    var ref;
    return (ref = this.child) != null ? ref.pid : void 0;
  },
  configurable: true
});

module.exports = {ProcessBridge, RUNTIME_BIN, DEFAULT_TIMEOUT_MS, DEFAULT_BACKOFF_MS, MAX_BACKOFF_MS};
