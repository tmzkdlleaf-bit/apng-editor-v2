// E1 테스트용 브라우저 헬퍼 (http-server가 /tests/ 아래로 서빙).
import { createDoc, createLayer } from '/src/core/doc/schema.js';
import { createRenderEngine } from '/src/core/render/frame.js';

export function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// 정수 위치로 이동하는 사각형(프레임마다 서로 다름, 안티앨리어싱 없음).
export function movingShapeDoc({ width = 16, height = 16, fps = 10, frameCount = 4, x0 = 4, x1 = 10 } = {}) {
  const doc = createDoc({ width, height, fps, frameCount });
  const s = createLayer('shape', { name: '사각형' });
  s.shape = { kind: 'rect', w: 8, h: 8, fill: '#e74c3c', stroke: null };
  s.transform.x = { value: x0, keys: [{ f: 0, v: x0, ease: 'linear' }, { f: frameCount - 1, v: x1, ease: 'linear' }] };
  s.transform.y.value = height / 2;
  doc.layers[s.id] = s; doc.order.push(s.id);
  return doc;
}

export function renderPixels(doc, f, scale = 1) {
  const engine = createRenderEngine({ createCanvas });
  const w = Math.round(doc.meta.width * scale), h = Math.round(doc.meta.height * scale);
  const c = createCanvas(w, h);
  const cx = c.getContext('2d', { willReadFrequently: true });
  engine.renderFrame(cx, doc, f, { scale });
  return Array.from(cx.getImageData(0, 0, w, h).data);
}

// ImageDecoder로 결과를 디코드. 각 프레임을 캔버스에 합성해 RGBA를 돌려준다.
export async function decode(buf, mime) {
  const dec = new ImageDecoder({ data: buf, type: mime });
  await dec.tracks.ready;
  const track = dec.tracks.selectedTrack;
  const n = track.frameCount;
  const rep = track.repetitionCount;
  const frames = [];
  const cv = document.createElement('canvas');
  for (let i = 0; i < n; i++) {
    const { image } = await dec.decode({ frameIndex: i, completeFramesOnly: true });
    cv.width = image.displayWidth; cv.height = image.displayHeight;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.drawImage(image, 0, 0);
    frames.push({
      data: Array.from(cx.getImageData(0, 0, cv.width, cv.height).data),
      w: cv.width, h: cv.height,
      durUs: image.duration ?? 0,
    });
    image.close?.();
  }
  dec.close?.();
  return { n, rep: rep === Infinity ? 'inf' : rep, frames };
}

// demo=1 문서용 — 에셋 비트맵을 미리 로드한 동기 getBitmap 어댑터.
export async function demoAssets(doc) {
  const { getAsset } = await import('/src/core/io/assets.js');
  const bmps = {};
  for (const aid of Object.keys(doc.assets ?? {})) {
    try { const b = await getAsset(aid); if (b) bmps[aid] = await createImageBitmap(b); } catch {}
  }
  return { getBitmap: (id) => bmps[id] ?? null, getAnimFrames: () => null };
}

export async function demoRegistries() {
  const effects = (await import('/src/effects/registry.js')).effects;
  const motions = (await import('/src/motions/registry.js')).default;
  return { effects, motions };
}

// demo=1 문서로 fit/exportMany에 넘길 deps 한 번에.
export async function demoDeps() {
  const doc = window.__store.get();
  const assets = await demoAssets(doc);
  const { effects, motions } = await demoRegistries();
  return { doc, deps: { createCanvas, assets, effects, motions, name: 'demo' } };
}

export function exactEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// 불투명(alpha>=128) 픽셀에서 RGB 평균 절대오차.
export function meanRgbDiffOpaque(a, b) {
  let sum = 0, cnt = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] >= 128 && b[i + 3] >= 128) {
      sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      cnt += 3;
    }
  }
  return cnt ? sum / cnt : 0;
}

// alpha<128 를 투명으로 보고 위치 불일치 픽셀 수.
export function alphaMismatchCount(a, b) {
  let miss = 0;
  for (let i = 3; i < a.length; i += 4) {
    const ta = a[i] < 128, tb = b[i] < 128;
    if (ta !== tb) miss++;
  }
  return miss;
}
