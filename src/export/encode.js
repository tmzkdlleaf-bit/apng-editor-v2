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

// baked.frames 를 transfer 가능한 형태로. 서로 다른 프레임 버퍼만 넘기고, 재생 순서는 번호 목록으로 보낸다.
//   핑퐁은 되돌아오는 구간에서 같은 프레임 배열을 재사용하므로(bake.js), 그대로 map 하면
//   같은 ArrayBuffer 가 transfer 목록에 두 번 들어가 DataCloneError 가 난다(R11-1).
//   → 고유 버퍼만 한 번씩 넘기고 order 로 펼치면 핑퐁도 안전하고 메모리도 핑퐁만큼 줄어든다.
//   move=false(기본): 고유 프레임의 복사본을 넘긴다(원본 baked 보존 — 용량 맞추기처럼 여러 번 인코딩).
//   move=true: 고유 프레임의 원본 버퍼를 그대로 넘긴다(복사 없음 → 메모리 절약, 1회용).
// 반환: { frames:[{buf}](고유), order:[번호…](프레임별), delays:[ms…](프레임별), transfer:[버퍼…] }
function _framesForTransfer(baked, move = false) {
  const unique = [];                 // { buf }
  const indexByRgba = new Map();     // Uint8ClampedArray → unique 내 번호
  const order = [];
  const delays = [];
  const transfer = [];
  for (const f of baked.frames) {
    delays.push(f.delayMs);
    let idx = indexByRgba.get(f.rgba);
    if (idx === undefined) {
      idx = unique.length;
      indexByRgba.set(f.rgba, idx);
      const buf = move ? f.rgba.buffer : f.rgba.slice().buffer;
      unique.push({ buf });
      transfer.push(buf);
    }
    order.push(idx);
  }
  return { frames: unique, order, delays, transfer };
}

export function encode(baked, format, options = {}, ctx = {}) {
  const { onProgress, signal, moveFrames = false } = ctx;
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
        const { frames, order, delays, transfer } = _framesForTransfer(baked, moveFrames);
        worker.postMessage(
          { type: 'encode', format, width: baked.width, height: baked.height, frames, order, delays, loops, options },
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

// PNG 묶음 인코딩 — 고유 프레임마다 PNG 한 장. 워커가 'result-seq' 로 pngs 배열을 돌려준다(R13-2).
// 반환: { pngs:[ArrayBuffer](고유), order:[번호…](프레임별), delays:[ms…](프레임별), bytes }
export function encodePngSeq(baked, options = {}, ctx = {}) {
  const { onProgress, signal } = ctx;
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
      try {
        // move=false: 원본 baked 보존. 고유 프레임만 넘긴다.
        const { frames, order, delays, transfer } = _framesForTransfer(baked, false);
        worker.postMessage(
          { type: 'encode', format: 'png-seq', width: baked.width, height: baked.height, frames, order, delays, options },
          transfer,
        );
      } catch (err) { fail(err); }
    }
    worker.onmessage = ({ data: m }) => {
      if (m.type === 'ready')      { postEncode(); return; }
      if (m.type === 'progress')   { onProgress?.(m.done, m.total); return; }
      if (m.type === 'result-seq') { done({ pngs: m.pngs, order: m.order, delays: m.delays, bytes: m.bytes }); return; }
      if (m.type === 'cancelled')  { fail(new DOMException('취소됨', 'AbortError')); return; }
      if (m.type === 'error')      { fail(new Error(m.message)); return; }
    };
    worker.onerror = (err) => fail(new Error('인코더 워커 오류: ' + (err.message ?? '(알 수 없음)')));
  });
}

// 워커 하나를 재사용하는 인코더. 용량 맞추기/여러 형식처럼 encode 를 여러 번 부를 때
// 매번 워커+WebP wasm 를 다시 읽지 않도록 한다. 한 번에 하나씩만 인코딩한다(순차 호출 전제).
// 준비(워커+WebP wasm 로딩) 대기 한도. 느린 환경에서도 영원히 대기하지 않도록.
const READY_TIMEOUT_MS = 15000;

export function createEncoder() {
  let worker = null;
  let readyPromise = null;
  let readyResolve = null;
  let readyReject = null;
  let readySettled = false;
  let pending = null;  // { onProgress, resolve, reject }

  function _dropWorker() {
    if (worker) { try { worker.terminate(); } catch {} }
    worker = null; readyPromise = null; readyResolve = null; readyReject = null; readySettled = false;
  }

  function _spawn() {
    worker = _spawnWorker();
    readySettled = false;
    readyPromise = new Promise((res, rej) => {
      readyResolve = () => { if (!readySettled) { readySettled = true; res(); } };
      readyReject  = (e) => { if (!readySettled) { readySettled = true; rej(e); } };
    });
    worker.onmessage = ({ data: m }) => {
      if (m.type === 'ready')     { readyResolve?.(); return; }
      if (!pending) return;
      if (m.type === 'progress')  { pending.onProgress?.(m.done, m.total); return; }
      if (m.type === 'result')    { pending.resolve({ buf: m.buf, bytes: m.bytes }); return; }
      if (m.type === 'cancelled') { pending.reject(new DOMException('취소됨', 'AbortError')); return; }
      if (m.type === 'error')     { pending.reject(new Error(m.message)); return; }
    };
    worker.onerror = (err) => {
      const e = new Error('인코더 워커를 불러오지 못했습니다: ' + (err.message ?? '(알 수 없음)'));
      // 준비 전이면 준비 Promise 를 거절하고 워커를 버린다(다음 호출 때 새로 만듦).
      if (!readySettled) { readyReject?.(e); _dropWorker(); }
      else pending?.reject(e);
    };
  }

  // 준비 대기 — 취소 신호·시간초과로도 끝난다. 준비 전 취소/실패면 워커를 버린다.
  function _awaitReady(signal) {
    return new Promise((resolve, reject) => {
      let done = false;
      const cleanup = () => { clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); };
      const fin = (fn, v) => { if (done) return; done = true; cleanup(); fn(v); };
      const onAbort = () => { _dropWorker(); fin(reject, new DOMException('취소됨', 'AbortError')); };
      const timer = setTimeout(() => {
        _dropWorker();
        fin(reject, new Error('인코더 준비가 너무 오래 걸립니다. 잠시 후 다시 시도하세요.'));
      }, READY_TIMEOUT_MS);
      if (signal) {
        if (signal.aborted) { onAbort(); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      readyPromise.then(() => fin(resolve), (e) => fin(reject, e));
    });
  }

  function dispose() {
    if (worker) { try { worker.terminate(); } catch {} }
    worker = null; readyPromise = null; readyResolve = null; readyReject = null; readySettled = false;
    if (pending) { const p = pending; pending = null; p.reject(new DOMException('취소됨', 'AbortError')); }
  }

  async function encodeReuse(baked, format, options = {}, ctx = {}) {
    const { onProgress, signal } = ctx;
    const loops = options.loops ?? 0;

    const invalid = _validate(baked);
    if (invalid) throw new Error(invalid);
    if (signal?.aborted) throw new DOMException('취소됨', 'AbortError');

    if (!worker) _spawn();
    await _awaitReady(signal);  // 준비 대기(취소·실패·시간초과로도 끝남)

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
        const { frames, order, delays, transfer } = _framesForTransfer(baked);
        worker.postMessage(
          { type: 'encode', format, width: baked.width, height: baked.height, frames, order, delays, loops, options },
          transfer,
        );
      } catch (err) {
        pending?.reject(err);
      }
    });
  }

  return { encode: encodeReuse, dispose };
}
