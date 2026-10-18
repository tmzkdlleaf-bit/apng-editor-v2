// R8-1 — 카메라 의미 변경: X/Y = 화면 이동, 줌 = 화면 가운데 기준. 기존 문서는 v2→v3 변환.
import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
}

// 비치는(불투명) 픽셀의 무게중심 x (화면 px)
function centroidX(data, w, h) {
  let sum = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = data[(y * w + x) * 4 + 3];
    if (a > 10) { sum += x; n++; }
  }
  return n ? sum / n : -1;
}
function centroidY(data, w, h) {
  let sum = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = data[(y * w + x) * 4 + 3];
    if (a > 10) { sum += y; n++; }
  }
  return n ? sum / n : -1;
}

test.describe('R8-1 카메라', () => {
  // 변환: 예전(점 기준 줌) 카메라를 migrate 하면 같은 프레임의 화면 변환(z·p+T)이 그대로 유지된다.
  test('[변환] v2→v3: 화면 변환 T 가 예전과 같다(X0·z 여러 경우)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const { migrate } = await import('/src/core/io/migrate.js');
      const { cameraScreenTr } = await import('/src/core/render/matrix.js');
      const W = 768, H = 768;
      const cases = [[20, 1.5], [100, 2], [-60, 0.5], [50, 1]];
      const out = [];
      for (const [x0, z] of cases) {
        const v2 = {
          version: 2, format: 'apng-editor',
          meta: { width: W, height: H, fps: 12, frameCount: 24, background: { type: 'transparent' }, playback: 'loop' },
          camera: { x: { value: x0 }, y: { value: 0 }, zoom: { value: z } },
          order: [], layers: {}, assets: {},
        };
        const v3 = migrate(v2);
        const cam = { x: v3.camera.x.value, y: v3.camera.y.value, zoom: v3.camera.zoom.value };
        const newT = cameraScreenTr(cam, W, H).tx;   // 새 의미의 화면 이동량
        const oldT = z * 0 + x0 * (1 - z);           // 예전 의미의 화면 이동량(z·p + X0(1−z))
        out.push({ x0, z, newT, oldT });
      }
      return out;
    });
    for (const c of r) expect(Math.abs(c.newT - c.oldT)).toBeLessThanOrEqual(0.01);
  });

  // 변환 렌더 픽셀 동일: 예전 카메라를 레이어에 구워 넣은 참조(항등 카메라)와 migrate 결과가 같은 픽셀.
  test('[변환] 렌더 픽셀 동일(±1): migrate 결과 == 예전 화면', async ({ page }) => {
    await open(page);
    const same = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { migrate } = await import('/src/core/io/migrate.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const W = 64, Ht = 64, x0 = 10, z = 1.5, sx = 32, sy = 32;

      const v2 = {
        version: 2, format: 'apng-editor',
        meta: { width: W, height: Ht, fps: 12, frameCount: 2, background: { type: 'transparent' }, playback: 'loop' },
        camera: { x: { value: x0 }, y: { value: 0 }, zoom: { value: z } },
        order: [], layers: {}, assets: {},
      };
      const sh = createLayer('shape', { name: 's' });
      sh.shape = { kind: 'rect', w: 16, h: 16, fill: '#cc4422', stroke: null };
      sh.transform.x.value = sx; sh.transform.y.value = sy;
      v2.layers[sh.id] = sh; v2.order.push(sh.id);
      const v3 = migrate(JSON.parse(JSON.stringify(v2)));

      // 참조: 항등 카메라 + 레이어를 예전 화면 위치/축척으로 미리 변환.
      const ref = createDoc({ width: W, height: Ht, fps: 12, frameCount: 2 });
      const rs = createLayer('shape', { name: 's' });
      rs.shape = { kind: 'rect', w: 16, h: 16, fill: '#cc4422', stroke: null };
      rs.transform.x.value = z * sx + x0 * (1 - z);
      rs.transform.y.value = z * sy + 0 * (1 - z);
      rs.transform.scale.value = z;
      ref.layers[rs.id] = rs; ref.order.push(rs.id);

      const eng = createRenderEngine({ createCanvas: H.createCanvas });
      const render = (d) => { const c = H.createCanvas(W, Ht); eng.renderFrame(c.getContext('2d'), d, 0, {}); return c.getContext('2d').getImageData(0, 0, W, Ht).data; };
      const a = render(v3), b = render(ref);
      let diff = 0;
      for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1) diff++;
      return diff;
    });
    expect(same).toBe(0);
  });

  // 새 의미: 줌 1, 이동 X 50 → 그림이 왼쪽으로 50px.
  test('[새 의미] 줌 1, 이동 X 50 → 왼쪽으로 50px', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const W = 64, Ht = 64;
      // 이동(왼쪽 50) 후에도 화면 안에 남도록 오른쪽에 둔다(x=56, 폭 12 → 50..62).
      const mk = () => { const d = createDoc({ width: W, height: Ht, fps: 12, frameCount: 2 });
        const s = createLayer('shape', { name: 's' }); s.shape = { kind: 'rect', w: 12, h: 12, fill: '#2288ff', stroke: null };
        s.transform.x.value = 56; s.transform.y.value = 32; d.layers[s.id] = s; d.order.push(s.id); return d; };
      const eng = createRenderEngine({ createCanvas: H.createCanvas });
      const px = (d) => { const c = H.createCanvas(W, Ht); eng.renderFrame(c.getContext('2d'), d, 0, {}); return c.getContext('2d').getImageData(0, 0, W, Ht).data; };
      const base = mk();
      const moved = mk(); moved.camera.x.value = 50; // 줌 1
      return { c0: px(base), c1: px(moved) };
    });
    const cx0 = centroidX(r.c0, 64, 64);
    const cx1 = centroidX(r.c1, 64, 64);
    expect(cx1).toBeLessThan(cx0);                 // 왼쪽으로
    expect(Math.abs((cx0 - cx1) - 50)).toBeLessThanOrEqual(2); // 약 50px
  });

  // 새 의미: 줌 2, 이동 0 → 가운데 기준 확대(가운데 레이어는 가운데 유지).
  test('[새 의미] 줌 2, 이동 0 → 가운데 기준(중심 유지)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const W = 64, Ht = 64;
      const d = createDoc({ width: W, height: Ht, fps: 12, frameCount: 2 });
      const s = createLayer('shape', { name: 's' }); s.shape = { kind: 'rect', w: 10, h: 10, fill: '#22cc66', stroke: null };
      s.transform.x.value = 32; s.transform.y.value = 32; d.layers[s.id] = s; d.order.push(s.id);
      d.camera.zoom.value = 2;
      const eng = createRenderEngine({ createCanvas: H.createCanvas });
      const c = H.createCanvas(W, Ht); eng.renderFrame(c.getContext('2d'), d, 0, {});
      return [...c.getContext('2d').getImageData(0, 0, W, Ht).data];
    });
    const cx = centroidX(r, 64, 64), cy = centroidY(r, 64, 64);
    expect(Math.abs(cx - 32)).toBeLessThanOrEqual(1.5); // 중심 x 유지
    expect(Math.abs(cy - 32)).toBeLessThanOrEqual(1.5); // 중심 y 유지
  });

  // 점선 사각형(기즈모)이 실제 렌더 범위와 같은 카메라 식을 쓴다: 보이는 doc 범위 모서리가 화면 0·docW 로 간다.
  test('[점선] 카메라 줌 1.5, 이동 X 30 — 점선 범위가 렌더 프레임과 일치', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const { cameraScreenTr } = await import('/src/core/render/matrix.js');
      const W = 768, Ht = 768, z = 1.5, X = 30;
      const cam = { x: X, y: 0, zoom: z };
      const { tx } = cameraScreenTr(cam, W, Ht);
      // 기즈모가 그리는 "보이는 doc 범위"
      const rx0 = -tx / z, rx1 = (W - tx) / z;
      // 그 범위 모서리를 카메라로 보내면 화면 0·W 가 되어야 한다.
      const fwd = (p) => z * p + tx;
      return { left: fwd(rx0), right: fwd(rx1), W };
    });
    expect(Math.abs(r.left)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(r.right - r.W)).toBeLessThanOrEqual(0.01);
  });
});
