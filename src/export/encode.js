// 인코더 워커 메인 래퍼 — baked 프레임을 모듈 워커로 보내 인코딩한다.
// encode(baked, format, options, { onProgress, signal }) → { buf, bytes }   (워커 1회용)
// createEncoder() → { encode, dispose }                                      (워커 재사용)
//
// baked.frames 는 보존된다(복사본을 transfer로 넘긴다). 같은 baked로 여러 형식을 인코딩할 수 있다.
// 워커가 'ready'를 보낸 뒤에 encode를 전송한다(모듈 워커는 top-level await 동안 메시지를 잃을 수 있음).

// 잘못된 입력이면 워커를 만들기 전에 바로 걸러낸다(영원히 대기하지 않도록).
function _validate(baked) {
  if (!baked || !Array.isArray(baked.frames) || baked.frames.length === 0) {
    return '인코딩할 프레임이 없습니다.';
  }
  if (!baked.width || !baked.height) {
    return '인코딩 크기가 올바르지 않습니다.';
  }
  return null;
}

function _spawnWorker() {
  return new Worker(new URL('./encode-worker.js', import.meta.url), { type: 'module' });
}

// baked.frames 복사본을 transfer 가능한 형태로(원본 baked 보존).
function _framesForTransfer(baked) {
  const frames = baked.frames.map((f) => {
    const copy = f.rgba.slice();
    return { buf: copy.buffer, delayMs: f.delayMs };
  });
  return { frames, transfer: frames.map((f) => f.buf) };
}

export function encode(baked, format, options = {}, ctx = {}) {
  const { onProgress, signal } = ctx;
  const loops = options.loops ?? 0;

  const invalid = _validate(baked);
  if (invalid) return Promise.reject(new Error(invalid));

  return new Promise((resolve, reject) => {
    const worker = _spawnWorker();
    let settled = false;
    const finish = (fn) => (val) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', onAbort);
      worker.terminate();
      fn(val);
    };
    const done = finish(resolve);
    const fail = finish(reject);
    function onAbort() {
      try { worker.postMessage({ type: 'cancel' }); } catch {}
      fail(new DOMException('취소됨', 'AbortError'));
    }

    if (signal) {
      if (signal.aborted) { worker.terminate(); reject(new DOMException('취소됨', 'AbortError')); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    function postEncode() {
      // 프레임 복사·transfer 중 오류가 나도 Promise 가 끝나도록 try/catch.
      try {
        const { frames, transfer } = _framesForTransfer(baked);
        worker.postMessage(
          { type: 'encode', format, width: baked.width, height: baked.height, frames, loops, options },
          transfer,
        );
      } catch (err) {
        fail(err);
      }
    }

    worker.onmessage = ({ data: m }) => {
      if (m.type === 'ready')     { postEncode(); return; }
      if (m.type === 'progress')  { onProgress?.(m.done, m.total); return; }
      if (m.type === 'result')    { done({ buf: m.buf, bytes: m.bytes }); return; }
      if (m.type === 'cancelled') { fail(new DOMException('취소됨', 'AbortError')); return; }
      if (m.type === 'error')     { fail(new Error(m.message)); return; }
    };
    worker.onerror = (err) => fail(new Error('인코더 워커 오류: ' + (err.message ?? '(알 수 없음)')));
  });
}

// 워커 하나를 재사용하는 인코더. 용량 맞추기/여러 형식처럼 encode 를 여러 번 부를 때
// 매번 워커+WebP wasm 를 다시 읽지 않도록 한다. 한 번에 하나씩만 인코딩한다(순차 호출 전제).
export function createEncoder() {
  let worker = null;
  let readyPromise = null;
  let readyResolve = null;
  let pending = null;  // { onProgress, resolve, reject }

  function _spawn() {
    worker = _spawnWorker();
    readyPromise = new Promise((res) => { readyResolve = res; });
    worker.onmessage = ({ data: m }) => {
      if (m.type === 'ready')     { readyResolve?.(); return; }
      if (!pending) return;
      if (m.type === 'progress')  { pending.onProgress?.(m.done, m.total); return; }
      if (m.type === 'result')    { pending.resolve({ buf: m.buf, bytes: m.bytes }); return; }
      if (m.type === 'cancelled') { pending.reject(new DOMException('취소됨', 'AbortError')); return; }
      if (m.type === 'error')     { pending.reject(new Error(m.message)); return; }
    };
    worker.onerror = (err) => {
      pending?.reject(new Error('인코더 워커 오류: ' + (err.message ?? '(알 수 없음)')));
    };
  }

  function dispose() {
    if (worker) { try { worker.terminate(); } catch {} }
    worker = null; readyPromise = null; readyResolve = null;
    if (pending) { const p = pending; pending = null; p.reject(new DOMException('취소됨', 'AbortError')); }
  }

  async function encodeReuse(baked, format, options = {}, ctx = {}) {
    const { onProgress, signal } = ctx;
    const loops = options.loops ?? 0;

    const invalid = _validate(baked);
    if (invalid) throw new Error(invalid);
    if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');

    if (!worker) _spawn();
    await readyPromise;

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => { if (signal) signal.removeEventListener('abort', onAbort); pending = null; };
      function onAbort() {
        if (settled) return;
        settled = true; cleanup();
        // 취소하면 워커를 종료하고 다음 요청 때 새로 만든다(취소 상태가 남지 않게).
        if (worker) { try { worker.terminate(); } catch {} worker = null; readyPromise = null; readyResolve = null; }
        reject(new DOMException('취소됨', 'AbortError'));
      }
      pending = {
        onProgress,
        resolve: (v) => { if (settled) return; settled = true; cleanup(); resolve(v); },
        reject:  (e) => { if (settled) return; settled = true; cleanup(); reject(e); },
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });

      try {
        const { frames, transfer } = _framesForTransfer(baked);
        worker.postMessage(
          { type: 'encode', format, width: baked.width, height: baked.height, frames, loops, options },
          transfer,
        );
      } catch (err) {
        pending?.reject(err);
      }
    });
  }

  return { encode: encodeReuse, dispose };
}
