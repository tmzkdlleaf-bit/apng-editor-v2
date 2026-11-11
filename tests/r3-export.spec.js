// R3 추가 — 인코더 워커 재사용(createEncoder)과 안정성.
import { test, expect } from './helpers/fixtures.js';

async function blank(page) { await page.goto('/tests/e1-helpers.js'); }

test.describe('R3 추가 — 내보내기', () => {
  // R3-3: 워커 하나로 여러 번(여러 형식) 인코딩한다.
  test('createEncoder: 한 워커로 APNG·GIF·WebP 를 연달아 인코딩', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { createEncoder } = await import('/src/export/encode.js');
      const doc = createDoc({ width: 32, height: 32, fps: 10, frameCount: 2 });
      const s = createLayer('shape', { name: 's' });
      s.shape = { kind: 'rect', w: 20, h: 20, fill: '#ff0000', stroke: null };
      s.transform.x.value = 16; s.transform.y.value = 16;
      doc.layers[s.id] = s; doc.order.push(s.id);
      const eng = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(eng, doc, { scale: 1, createCanvas: H.createCanvas });
      const enc = createEncoder();
      const a = await enc.encode(baked, 'apng', { colors: 0 }, {});
      const g = await enc.encode(baked, 'gif', {}, {});
      const w = await enc.encode(baked, 'webp', { lossless: 1 }, {});
      enc.dispose();
      // baked 는 보존돼야 한다(여러 번 인코딩).
      return { apng: a.bytes, gif: g.bytes, webp: w.bytes, framesKept: baked.frames.length };
    });
    expect(r.apng).toBeGreaterThan(0);
    expect(r.gif).toBeGreaterThan(0);
    expect(r.webp).toBeGreaterThan(0);
    expect(r.framesKept).toBeGreaterThan(0);
  });

  // R3-2: 잘못된 입력(프레임 없음)은 영원히 대기하지 않고 일반 오류로 즉시 끝난다.
  test('encode/createEncoder: 프레임 없는 입력은 즉시 오류(대기 없음)', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async () => {
      const { encode, createEncoder } = await import('/src/export/encode.js');
      const out = {};
      try { await encode({ width: 4, height: 4 }, 'apng', {}, {}); out.one = 'ok'; }
      catch (e) { out.one = e.name; }
      const enc = createEncoder();
      try { await enc.encode({ width: 4, height: 4 }, 'apng', {}, {}); out.reuse = 'ok'; }
      catch (e) { out.reuse = e.name; }
      enc.dispose();
      return out;
    });
    expect(r.one).toBe('Error');       // AbortError 아님(대기 아님)
    expect(r.reuse).toBe('Error');
  });
});
