// R12-1 — 이펙트 coord 파라미터를 캔버스에서 끌기. 좌표 매핑이 실제 렌더 위치와 맞는지(±2px),
// 되돌리기 1건에 원래 값으로 돌아오는지. (밝은 픽셀 무게중심으로 효과 중심을 측정.)
import { test, expect } from './helpers/fixtures.js';

test.describe('R12-1 이펙트 좌표 끌기', () => {
  // 화면 파라미터를 항등으로(zoom1·pan0·W=H=docW) 두면 coordToScreen 가 doc-post-camera 좌표를 바로 돌려준다.
  // 그 좌표가 engine.renderFrame(scale1) 로 그린 효과의 밝은 무게중심과 ±2px 안이어야 한다.
  test('[좌표 매핑] full / box(회전30) / 카메라 줌1.5 — 렌더 중심과 ±2px', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { effects } = await import('/src/effects/registry.js');
      const { coordToScreen } = await import('/src/ui/canvas/effect-coord.js');
      const D = 64;
      const createCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      const engine = createRenderEngine({ createCanvas, effects });

      function centroid(data, w, h) {
        let sx = 0, sy = 0, s = 0;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const a = data[(y * w + x) * 4 + 3];
          if (a > 8) { sx += x * a; sy += y * a; s += a; }
        }
        return s ? { x: sx / s, y: sy / s, n: s } : { x: -1, y: -1, n: 0 };
      }
      function mkGlow(coord, { scope = 'full', box = null, rotation = 0 } = {}) {
        const doc = createDoc({ width: D, height: D, fps: 12, frameCount: 2 });
        const l = createLayer('effect', { name: 'glow', effectId: 'glow' });
        l.params = { center: coord, radius: 0.12, intensity: 1, pulse: 0, color: '#ffffff' };
        l.scope = scope; l.box = box; l.transform.rotation.value = rotation;
        if (scope === 'box') { l.transform.x.value = D / 2; l.transform.y.value = D / 2; }
        else { l.transform.x.value = 0; l.transform.y.value = 0; }
        doc.layers[l.id] = l; doc.order.push(l.id);
        return { doc, l };
      }
      function measure(doc) {
        const c = createCanvas(D, D);
        engine.renderFrame(c.getContext('2d', { willReadFrequently: true }), doc, 0, { scale: 1 });
        return centroid(c.getContext('2d').getImageData(0, 0, D, D).data, D, D);
      }
      const ID = (coord, l, doc) => coordToScreen(coord, l, doc, 0, 1, 0, 0, D, D); // 항등 화면 → doc-post-camera

      const out = [];
      // (1) full, 카메라 없음
      {
        const coord = { x: 0.35, y: 0.6 };
        const { doc, l } = mkGlow(coord, { scope: 'full' });
        const m = measure(doc), s = ID(coord, l, doc);
        out.push({ name: 'full', dx: Math.abs(m.x - s.x), dy: Math.abs(m.y - s.y), n: m.n });
      }
      // (2) box, 회전 30°, 중심에서 벗어난 coord
      {
        const coord = { x: 0.72, y: 0.5 };
        const { doc, l } = mkGlow(coord, { scope: 'box', box: { w: 44, h: 44 }, rotation: 30 });
        const m = measure(doc), s = ID(coord, l, doc);
        out.push({ name: 'box30', dx: Math.abs(m.x - s.x), dy: Math.abs(m.y - s.y), n: m.n });
      }
      // (3) full, 카메라 줌 1.5
      {
        const coord = { x: 0.5, y: 0.5 };
        const { doc, l } = mkGlow(coord, { scope: 'full' });
        doc.camera.zoom.value = 1.5;
        const m = measure(doc), s = ID(coord, l, doc);
        out.push({ name: 'cam1.5', dx: Math.abs(m.x - s.x), dy: Math.abs(m.y - s.y), n: m.n });
      }
      return out;
    });
    for (const c of r) {
      expect(c.n, `${c.name}: 그려진 픽셀 없음`).toBeGreaterThan(0);
      expect(c.dx, `${c.name}: x 오차 ${c.dx.toFixed(2)}px`).toBeLessThanOrEqual(2);
      expect(c.dy, `${c.name}: y 오차 ${c.dy.toFixed(2)}px`).toBeLessThanOrEqual(2);
    }
  });

  // 화면 점 → coord → 화면 점 왕복(끌면 값이 그 화면 위치로 간다). 되돌리기 1건에 원래 값.
  test('[왕복·되돌리기] screenToCoord↔coordToScreen, 끌기 1건 되돌리기', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const { coordToScreen, screenToCoord } = await import('/src/ui/canvas/effect-coord.js');
      const D = 128;
      const doc = createDoc({ width: D, height: D, fps: 12, frameCount: 2 });
      const l = createLayer('effect', { name: 'glow', effectId: 'glow' });
      l.params = { center: { x: 0.5, y: 0.5 } };
      l.scope = 'box'; l.box = { w: 60, h: 60 }; l.transform.rotation.value = 20;
      l.transform.x.value = D / 2; l.transform.y.value = D / 2;
      doc.layers[l.id] = l; doc.order.push(l.id);

      // 왕복: 임의 화면 점 → coord → 화면 점
      const target = { x: 40, y: 30 };
      const coord = screenToCoord(target.x, target.y, l, doc, 0, 1, 0, 0, D, D);
      const back = coordToScreen(coord, l, doc, 0, 1, 0, 0, D, D);
      const roundTrip = { dx: Math.abs(back.x - target.x), dy: Math.abs(back.y - target.y) };

      // 끌기 모사: begin→preview→commit (effect-coord.js 와 같은 setLayer). 되돌리기 1건.
      const store = createStore(doc);
      const before = JSON.parse(JSON.stringify(store.get().layers[l.id].params.center));
      const depth0 = store.undoDepth();
      store.begin('효과 위치');
      store.preview({ type: 'setLayer', id: l.id, patch: { params: { ...store.get().layers[l.id].params, center: { x: coord.x, y: coord.y } } } });
      store.commit();
      const afterDepth = store.undoDepth();
      const moved = JSON.parse(JSON.stringify(store.get().layers[l.id].params.center));
      store.undo();
      const restored = JSON.parse(JSON.stringify(store.get().layers[l.id].params.center));
      return { roundTrip, before, moved, restored, added: afterDepth - depth0 };
    });
    expect(r.roundTrip.dx).toBeLessThanOrEqual(0.01);
    expect(r.roundTrip.dy).toBeLessThanOrEqual(0.01);
    expect(r.added).toBe(1); // 끌기 = 되돌리기 1건
    expect(r.moved).not.toEqual(r.before);
    expect(r.restored).toEqual(r.before); // 되돌리기 1번에 원래 값
  });
});
