// 프레임 굽기 — 내보내기용. DOM을 쓰지 않는다(캔버스는 주입받은 createCanvas).
// 미리보기와 같은 renderFrame으로 0..N-1 프레임을 구워 RGBA + 지연시간을 만든다.
//
// bakeFrames(engine, doc, opts) → {
//   width, height,              // (trim 적용 후) 최종 크기
//   frames: [{ rgba, delayMs }],
//   trimRect: { x, y, w, h },   // 원본 캔버스 기준 잘라낸 영역
//   warning?: { type:'memory', estimatedBytes, limitBytes },  // 굽기 전 메모리 경고
//   aborted?: true,             // signal로 취소됨
// }
//
// opts:
//   scale        출력 배율(기본 1)
//   range        { start, end } 0-based 프레임 범위(기본 0..frameCount-1)
//   playback     'loop' | 'once' | 'pingpong' (기본 doc.meta.playback)
//   trim         투명 여백 잘라내기(기본 false)
//   createCanvas (w,h) => canvas (필수)
//   onProgress   (done, total) => void
//   signal       AbortSignal
//   maxMemoryMB  메모리 경고 임계(기본 300)

const DEFAULT_MAX_MEMORY_MB = 300;

// 1000/fps를 누적 반올림해 지연시간 배열을 만든다. 합계가 정확히 round(M*1000/fps)가 되게.
function buildDelays(count, fps) {
  const delays = [];
  let prev = 0;
  for (let i = 1; i <= count; i++) {
    const cum = Math.round((i * 1000) / fps);
    delays.push(cum - prev);
    prev = cum;
  }
  return delays;
}

// 재생 방식에 따른 프레임 순서(기준 프레임 인덱스 배열). 핑퐁은 0..M-1, M-2..1.
function frameOrder(indices, playback) {
  const fwd = indices.slice();
  if (playback === 'pingpong' && fwd.length >= 2) {
    const back = [];
    for (let i = fwd.length - 2; i >= 1; i--) back.push(fwd[i]);
    return fwd.concat(back);
  }
  return fwd; // loop / once 는 한 방향
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// 모든 프레임의 불투명 영역 합집합 bbox. 전부 투명이면 null.
function unionOpaqueRect(frames, w, h) {
  const accum = new Uint8Array(w * h);
  for (const { rgba } of frames) {
    for (let p = 0; p < w * h; p++) accum[p] |= rgba[p * 4 + 3];
  }
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (accum[y * w + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function cropFrame(rgba, w, rect) {
  const dst = new Uint8ClampedArray(rect.w * rect.h * 4);
  for (let y = 0; y < rect.h; y++) {
    const si = ((y + rect.y) * w + rect.x) * 4;
    dst.set(rgba.subarray(si, si + rect.w * 4), y * rect.w * 4);
  }
  return dst;
}

export async function bakeFrames(engine, doc, opts = {}) {
  const {
    scale = 1,
    range = null,
    playback = doc.meta.playback ?? 'loop',
    trim = false,
    createCanvas,
    onProgress = () => {},
    signal = null,
    maxMemoryMB = DEFAULT_MAX_MEMORY_MB,
  } = opts;

  if (typeof createCanvas !== 'function') throw new Error('createCanvas 함수가 필요합니다.');

  const fps        = doc.meta.fps ?? 12;
  const frameCount = doc.meta.frameCount ?? 24;
  const start = Math.max(0, range?.start ?? 0);
  const end   = Math.min(frameCount - 1, range?.end ?? (frameCount - 1));
  const baseIndices = [];
  for (let i = start; i <= end; i++) baseIndices.push(i);

  const outW = Math.max(1, Math.round(doc.meta.width  * scale));
  const outH = Math.max(1, Math.round(doc.meta.height * scale));

  const order     = frameOrder(baseIndices, playback);
  const limitBytes = maxMemoryMB * 1024 * 1024;
  const estBytes   = outW * outH * 4 * order.length;
  if (estBytes > limitBytes) {
    return { warning: { type: 'memory', estimatedBytes: estBytes, limitBytes } };
  }

  const baseDelays = buildDelays(baseIndices.length, fps); // 기준 프레임별 지연(범위 길이 기준)

  // 기준 프레임을 한 번씩만 렌더(핑퐁은 재사용).
  const canvas = createCanvas(outW, outH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rendered = new Map(); // baseIndex → Uint8ClampedArray

  const total = order.length;
  let done = 0;
  for (let k = 0; k < baseIndices.length; k++) {
    if (signal?.aborted) return { aborted: true };
    const fi = baseIndices[k];
    engine.renderFrame(ctx, doc, fi, { scale });
    const id = ctx.getImageData(0, 0, outW, outH);
    rendered.set(fi, new Uint8ClampedArray(id.data));
    done++;
    onProgress(Math.min(done, total), total);
    // 프레임마다 이벤트 루프에 양보
    await new Promise((r) => setTimeout(r, 0));
  }

  // 순서대로 펼치며 지연시간 부여. 기준 프레임 인덱스의 원래 위치(k)로 baseDelays를 찾는다.
  const posInRange = new Map();
  baseIndices.forEach((fi, k) => posInRange.set(fi, k));
  let frames = order.map((fi) => ({
    rgba: rendered.get(fi),
    delayMs: baseDelays[posInRange.get(fi)],
  }));

  // 연속으로 완전히 같은 프레임은 하나로 합치고 지연을 더한다.
  const merged = [];
  for (const fr of frames) {
    const last = merged[merged.length - 1];
    if (last && bytesEqual(last.rgba, fr.rgba)) {
      last.delayMs += fr.delayMs;
    } else {
      merged.push({ rgba: fr.rgba, delayMs: fr.delayMs });
    }
  }
  frames = merged;

  let width = outW, height = outH;
  let trimRect = { x: 0, y: 0, w: outW, h: outH };
  if (trim) {
    const rect = unionOpaqueRect(frames, outW, outH);
    if (rect && (rect.w !== outW || rect.h !== outH)) {
      frames = frames.map((fr) => ({ rgba: cropFrame(fr.rgba, outW, rect), delayMs: fr.delayMs }));
      width = rect.w; height = rect.h; trimRect = rect;
    } else if (rect) {
      trimRect = rect;
    }
  }

  return { width, height, frames, trimRect };
}

export { buildDelays, frameOrder };
