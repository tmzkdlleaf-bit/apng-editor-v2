// 인코더 워커 메인 래퍼 — baked 프레임을 모듈 워커로 보내 인코딩한다.
// encode(baked, format, options, { onProgress, signal }) → { buf, bytes }
//
// baked.frames 는 보존된다(복사본을 transfer로 넘긴다). 같은 baked로 여러 형식을 인코딩할 수 있다.
// 워커가 'ready'를 보낸 뒤에 encode를 전송한다(모듈 워커는 top-level await 동안 메시지를 잃을 수 있음).

export function encode(baked, format, options = {}, ctx = {}) {
  const { onProgress, signal } = ctx;
  const loops = options.loops ?? 0;

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./encode-worker.js', import.meta.url), { type: 'module' });
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
      // baked를 보존하기 위해 복사본을 만들어 transfer한다.
      const frames = baked.frames.map((f) => {
        const copy = f.rgba.slice();
        return { buf: copy.buffer, delayMs: f.delayMs };
      });
      const transfer = frames.map((f) => f.buf);
      worker.postMessage(
        { type: 'encode', format, width: baked.width, height: baked.height, frames, loops, options },
        transfer,
      );
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
