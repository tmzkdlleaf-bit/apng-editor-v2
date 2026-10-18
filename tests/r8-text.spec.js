// R8-2 — 글자를 렌더 배율 단계에 맞춰 굽는다(확대·2배 내보내기에서 선명). 배율 1은 예전과 동일.
import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
}

test.describe('R8-2 글자 선명도', () => {
  // 2배로 그린 결과가 "1배를 키운 것"보다 가장자리 중간 알파 픽셀이 적다(= 선명).
  test('[선명도] 2배 굽기 < 1배 확대 (가장자리 중간 알파)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const W = 64, Ht = 40;
      const doc = createDoc({ width: W, height: Ht, fps: 12, frameCount: 2 });
      const t = createLayer('text', { name: 't' });
      t.text = '가나Ag'; t.size = 18; t.align = 'center';
      t.transform.x.value = 32; t.transform.y.value = 20;
      doc.layers[t.id] = t; doc.order.push(t.id);

      const eng = createRenderEngine({ createCanvas: H.createCanvas });
      // A: 2배로 직접 렌더(단계 2로 구움)
      const a = H.createCanvas(W * 2, Ht * 2);
      eng.renderFrame(a.getContext('2d'), doc, 0, { scale: 2 });
      const aData = a.getContext('2d').getImageData(0, 0, W * 2, Ht * 2).data;
      // B: 1배 렌더 후 2배 확대(흐림)
      const b1 = H.createCanvas(W, Ht);
      eng.renderFrame(b1.getContext('2d'), doc, 0, { scale: 1 });
      const b2 = H.createCanvas(W * 2, Ht * 2);
      const bx = b2.getContext('2d'); bx.imageSmoothingEnabled = true;
      bx.drawImage(b1, 0, 0, W, Ht, 0, 0, W * 2, Ht * 2);
      const bData = bx.getImageData(0, 0, W * 2, Ht * 2).data;

      const partial = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) { const al = d[i]; if (al > 10 && al < 245) n++; } return n; };
      return { a: partial(aData), b: partial(bData) };
    });
    expect(r.a).toBeGreaterThan(0);
    expect(r.b).toBeGreaterThan(0);
    expect(r.a).toBeLessThan(r.b); // 2배 굽기가 더 선명(중간 알파 적음)
  });

  // 미리보기 확대(여러 배율)에서 한 레이어당 캐시된 배율 단계는 2개 이하.
  test('[캐시] 여러 배율 렌더해도 레이어당 단계 2개 이하', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const W = 64, Ht = 40;
      const doc = createDoc({ width: W, height: Ht, fps: 12, frameCount: 2 });
      const t = createLayer('text', { name: 't' });
      t.text = '선명'; t.size = 16; t.transform.x.value = 32; t.transform.y.value = 20;
      doc.layers[t.id] = t; doc.order.push(t.id);

      const eng = createRenderEngine({ createCanvas: H.createCanvas });
      const out = H.createCanvas(W * 4, Ht * 4);
      for (const s of [1, 1.5, 2, 3, 4, 1.5, 2]) eng.renderFrame(out.getContext('2d'), doc, 0, { scale: s });
      const keys = eng.cache.keys().filter((k) => k.startsWith(t.id + ':text:'));
      return { count: keys.length };
    });
    expect(r.count).toBeLessThanOrEqual(2);
    expect(r.count).toBeGreaterThanOrEqual(1);
  });
});
