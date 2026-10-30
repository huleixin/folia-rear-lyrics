package io.github.huleixin.tingyu.lx

// 原生侧重新实现的洛雪移动版宿主环境（对应 WebView 里的 src/services/lxSource/bootstrap.ts）。
//
// 与那一版的三处关键差异，都是为了能在**没有 WebView、不能重入引擎**的 Service 里跑：
// 1. HTTP 不再是"脚本发消息 → 宿主回投"的往返，而是原生 async 函数直接返回一个 Promise，
//    引擎会在 evaluate 内部等到它落地 —— 后台线程里不需要任何跨线程回投；
// 2. setTimeout 走同一个 async 函数，而不是宿主定时器表，脚本的 await/串行重试照旧可用；
// 3. 结果不再靠 evaluate 的返回值，而是脚本在 .then 里 emit 出来，宿主按 id 认领。
//
// 不提供给脚本：文件系统、进程、Android Context、反射、任意算法名、本应用的任何凭据。
object LxBootstrap {

    const val SHIM: String = """
(() => {
  const emit = globalThis.__emit; delete globalThis.__emit;
  const utility = globalThis.__utility; delete globalThis.__utility;
  const http = globalThis.__http; delete globalThis.__http;
  const sleep = globalThis.__sleep; delete globalThis.__sleep;
  const callbacks = new Map();
  let serial = 0;
  let handler = null;
  const nextId = () => ++serial;
  const callUtility = (op, ...args) => {
    const raw = utility(JSON.stringify({ op, args }));
    const parsed = JSON.parse(raw);
    if (parsed.error) throw Error(parsed.error);
    return parsed.value;
  };
  const encode = value => Array.from(value || []);
  globalThis.console = { log(){}, warn(){}, error(){}, info(){}, debug(){}, trace(){} };
  globalThis.setTimeout = (fn, ms, ...args) => {
    const id = nextId();
    callbacks.set(id, () => fn(...args));
    const delay = Math.max(0, Math.min(15000, Number(ms) || 0));
    sleep(delay).then(() => {
      const callback = callbacks.get(id);
      if (!callback) return;
      callbacks.delete(id);
      callback();
    }, () => {});
    return id;
  };
  globalThis.clearTimeout = id => { callbacks.delete(id); };
  globalThis.setInterval = (fn, ms) => {
    let stopped = false;
    const tick = () => globalThis.setTimeout(() => { if (!stopped) { fn(); tick(); } }, ms || 10);
    tick();
    const id = nextId();
    callbacks.set(id, () => { stopped = true; });
    return id;
  };
  globalThis.clearInterval = id => {
    const stop = callbacks.get(id);
    if (stop) { stop(); callbacks.delete(id); }
  };
  globalThis.btoa = value => callUtility('btoa', String(value));
  globalThis.atob = value => callUtility('atob', String(value));
  const buffer = {
    from: (data, format='utf8') => new Uint8Array(callUtility('buffer', data, format)),
    bufToString: (data, format='utf8') => callUtility('string', encode(data), format),
  };
  globalThis.lx = {
    version: '2.0.0',
    env: 'mobile',
    currentScriptInfo: {},
    EVENT_NAMES: { request: 'request', inited: 'inited', updateAlert: 'updateAlert' },
    on: (name, fn) => { if (name === 'request') handler = fn; },
    send: (name, data) => { emit(JSON.stringify({ kind: name, data })); return Promise.resolve(); },
    request: (url, options, callback) => {
      if (typeof options === 'function') { callback = options; options = {}; }
      const promise = http(String(url), options || {}).then(text => JSON.parse(text));
      if (typeof callback === 'function') {
        promise.then(response => callback(null, response, response && response.body),
          error => callback(error instanceof Error ? error : Error(String(error))));
        return () => {};
      }
      return promise;
    },
    utils: {
      buffer,
      crypto: {
        md5: data => callUtility('md5', data),
        randomBytes: size => new Uint8Array(callUtility('random', size)),
        aesEncrypt: (data, mode, key, iv) => new Uint8Array(callUtility('aes', encode(data), mode, encode(key), encode(iv))),
        rsaEncrypt: () => { throw Error('此版本不支持 RSA 工具，请使用兼容移动端的音源'); },
      },
    },
  };
  globalThis.__request = data => Promise.resolve()
    .then(() => {
      if (!handler) throw Error('音源未注册请求处理器');
      return handler(data.payload);
    })
    .then(value => emit(JSON.stringify({ kind: 'result', id: data.id, value })),
      error => emit(JSON.stringify({ kind: 'result', id: data.id, error: String((error && error.message) || error) })));
})();
"""
}
