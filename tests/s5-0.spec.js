// S5-0 기반 — 가로·세로 크기 분리, 모션 채널(scaleX/Y·밝기·조각·이어그리기), bleed.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(120);
}

test('S5-0-1 — v1 문서 → migrate v2, 렌더 픽셀 동일', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const same = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { migrate } = await import('/src/core/io/migrate.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const makeDoc = () => {
      const d = createDoc({ width: 64, height: 64, fps: 12, frameCount: 4 });
      const s = createLayer('shape', { name: 's' });
      s.shape = { kind: 'rect', w: 30, h: 20, fill: '#cc4422', stroke: null };
      s.transform.x.value = 32; s.transform.y.value = 32;
      d.layers[s.id] = s; d.order.push(s.id);
      return d;
    };
    const v1 = makeDoc(); v1.version = 1;
    for (const id of v1.order) { delete v1.layers[id].transform.scaleX; delete v1.layers[id].transform.scaleY; }
    const eng = createRenderEngine({ createCanvas: mk });
    const render = (doc) => { const c = mk(64, 64); eng.renderFrame(c.getContext('2d'), doc, 0, {}); return c.getContext('2d').getImageData(0, 0, 64, 64).data; };
    const a = render(v1);
    const v2 = migrate(JSON.parse(JSON.stringify(v1)));
    const b = render(v2);
    if (v2.version !== 2) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  });
  expect(same).toBe(true);
});

test('S5-0-1 — 변 핸들 드래그 → scaleX만 변경, scaleY 불변, 기록 1건', async ({ page }) => {
  await openApp(page);
  const id = await page.evaluate(() => {
    const doc = window.__store.get();
    return doc.order.find((x) => doc.layers[x]?.type === 'shape' && doc.layers[x].name === '사각형');
  });
  await page.evaluate((i) => window.__editorState.set({ selection: [i], tool: 'select' }), id);
  await page.waitForTimeout(100);
  const depth0 = await page.evaluate(() => window.__store.undoDepth?.() ?? 0);
  const pt = await page.evaluate((i) => {
    const doc = window.__store.get(); const L = doc.layers[i];
    const hw = (L.shape.w ?? 100) / 2;
    const s = window.__stage.docToScreen(L.transform.x.value + hw, L.transform.y.value);
    const r = document.querySelector('.stage-overlay').getBoundingClientRect();
    return { x: r.left + s.x, y: r.top + s.y };
  }, id);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.down();
  await page.mouse.move(pt.x + 60, pt.y, { steps: 6 });
  await page.mouse.up();
  const r = await page.evaluate((i) => {
    const L = window.__store.get().layers[i];
    return { sx: L.transform.scaleX.value, sy: L.transform.scaleY.value };
  }, id);
  const depth1 = await page.evaluate(() => window.__store.undoDepth?.() ?? 0);
  expect(r.sx).toBeGreaterThan(1.2);
  expect(r.sy).toBeCloseTo(1, 3);
  if (depth0 >= 0 && depth1 >= 0) expect(depth1 - depth0).toBe(1);
});

test('S5-0-2 — 새 채널(scaleX) 렌더 반영 + 루프 이음매 검사', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { isLoopSeamOk } = await import('/src/motions/contract.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const bmp = mk(20, 20); { const c = bmp.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, 20, 20); }
    const assets = { getBitmap: () => bmp, getAnimFrames: () => null };
    const motions = new Map([['wide', { id: 'wide', kind: 'emphasis', evaluate: () => ({ scaleX: 2 }) }]]);
    const doc = createDoc({ width: 64, height: 64, fps: 12, frameCount: 4 });
    const L = createLayer('image', { name: 'img' }); L.assetId = 'a';
    L.transform.x.value = 32; L.transform.y.value = 32;
    doc.layers[L.id] = L; doc.order.push(L.id);
    const eng = createRenderEngine({ createCanvas: mk, assets, motions });
    const px = (d, x, y) => { const c = mk(64, 64); eng.renderFrame(c.getContext('2d'), d, 0, {}); return c.getContext('2d').getImageData(x, y, 1, 1).data[3]; };
    const baseA = px(doc, 50, 32); // 폭 20 → 22..42, x=50 투명
    L.clips = [{ id: 'c', motionId: 'wide', start: 0, length: 4, params: {}, gain: 1 }];
    const wideA = px(doc, 50, 32); // 폭 40 → 12..52, x=50 불투명
    const bad = { kind: 'loop', evaluate: (t) => ({ scaleX: 1 + t }) };
    const good = { kind: 'loop', evaluate: () => ({ scaleX: 1 }) };
    return { baseA, wideA, badSeam: isLoopSeamOk(bad), goodSeam: isLoopSeamOk(good) };
  });
  expect(r.baseA).toBe(0);
  expect(r.wideA).toBeGreaterThan(0);
  expect(r.badSeam).toBe(false);
  expect(r.goodSeam).toBe(true);
});

test('S5-0-3 — 조각 그리기(slices): 띠별 가로 밀기 반영', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const bmp = mk(40, 40); { const c = bmp.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, 40, 40); }
    const assets = { getBitmap: () => bmp, getAnimFrames: () => null };
    const motions = new Map([['glitch', { id: 'glitch', kind: 'emphasis',
      evaluate: () => ({ slices: [{ y0: 0, y1: 0.33, dx: 0.5, alpha: 1 }, { y0: 0.33, y1: 1, dx: 0, alpha: 1 }] }) }]]);
    const doc = createDoc({ width: 100, height: 100, fps: 12, frameCount: 4 });
    const L = createLayer('image', { name: 'img' }); L.assetId = 'a';
    L.transform.x.value = 50; L.transform.y.value = 50;
    L.clips = [{ id: 'c', motionId: 'glitch', start: 0, length: 4, params: {}, gain: 1 }];
    doc.layers[L.id] = L; doc.order.push(L.id);
    const eng = createRenderEngine({ createCanvas: mk, assets, motions });
    const c = mk(100, 100); eng.renderFrame(c.getContext('2d'), doc, 0, {}); const g = c.getContext('2d');
    // 콘텐츠 중심 50, 폭 40 → 30..70. 위 띠는 +20px 밀려 레이어 경계 안에서 50..70 만 보인다(왼쪽 30..50 은 빈다).
    return {
      topLeftA: g.getImageData(33, 35, 1, 1).data[3],   // 밀려서 빈 자리 → 투명
      topRightA: g.getImageData(60, 35, 1, 1).data[3],  // 밀려 들어온 콘텐츠 → 불투명
      botLeftA: g.getImageData(33, 60, 1, 1).data[3],   // 안 밀린 띠 → 불투명
      botRightA: g.getImageData(82, 60, 1, 1).data[3],  // 레이어 밖 → 투명
    };
  });
  expect(r.topLeftA).toBe(0);
  expect(r.topRightA).toBeGreaterThan(0);
  expect(r.botLeftA).toBeGreaterThan(0);
  expect(r.botRightA).toBe(0);
});

test('S5-0-4 — 이어 그리기(wrapX): 오른쪽이 왼쪽에 이어짐, 0과 1이 같은 그림', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const bmp = mk(100, 100); { const c = bmp.getContext('2d'); c.fillStyle = '#ff0000'; c.fillRect(0, 0, 50, 100); c.fillStyle = '#0000ff'; c.fillRect(50, 0, 50, 100); }
    const assets = { getBitmap: () => bmp, getAnimFrames: () => null };
    const makeMotion = (wrapX) => new Map([['scroll', { id: 'scroll', kind: 'loop', evaluate: () => ({ wrapX }) }]]);
    const doc = createDoc({ width: 100, height: 100, fps: 12, frameCount: 4 });
    const L = createLayer('image', { name: 'img', anchor: { x: 0, y: 0 } }); L.assetId = 'a';
    L.transform.x.value = 0; L.transform.y.value = 0;
    L.clips = [{ id: 'c', motionId: 'scroll', start: 0, length: 4, params: {}, gain: 1 }];
    doc.layers[L.id] = L; doc.order.push(L.id);
    const draw = (wrapX) => {
      const eng = createRenderEngine({ createCanvas: mk, assets, motions: makeMotion(wrapX) });
      const c = mk(100, 100); eng.renderFrame(c.getContext('2d'), doc, 0, {}); return c.getContext('2d');
    };
    const g = draw(0.25);
    const p = Array.from(g.getImageData(10, 50, 1, 1).data);
    const isBlue = p[2] > 150 && p[0] < 100;
    const g0 = draw(0).getImageData(0, 0, 100, 100).data;
    const g1 = draw(1).getImageData(0, 0, 100, 100).data;
    let same = true; for (let i = 0; i < g0.length; i += 997) if (Math.abs(g0[i] - g1[i]) > 2) { same = false; break; }
    return { isBlue, same };
  });
  expect(r.isBlue).toBe(true);
  expect(r.same).toBe(true);
});

test('S5-0-5 — bleed 선언값만큼 작업 캔버스가 커진다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    function measure(bleed) {
      let seen = 0;
      const eff = { id: 'e', name: 'e', render(ctx) { seen = ctx.canvas.width; } };
      if (bleed !== undefined) eff.bleed = bleed;
      const effects = new Map([['e', eff]]);
      const doc = createDoc({ width: 100, height: 100, fps: 12, frameCount: 4 });
      const L = createLayer('effect', { name: 'fx', effectId: 'e' });
      doc.layers[L.id] = L; doc.order.push(L.id);
      const eng = createRenderEngine({ createCanvas: mk, effects });
      const c = mk(100, 100); eng.renderFrame(c.getContext('2d'), doc, 0, {});
      return seen;
    }
    return { def: measure(undefined), big: measure(40) };
  });
  expect(r.def).toBe(140);
  expect(r.big).toBe(180);
});
