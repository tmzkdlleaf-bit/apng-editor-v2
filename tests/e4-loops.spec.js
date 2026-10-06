// E4 보완 1 — 반복 횟수의 '총 재생 횟수' 의미가 3형식에서 같은지.
// GIF(NETSCAPE)는 "첫 재생 뒤 추가 반복 횟수"라 총 3회면 2를 써야 한다(APNG num_plays·WebP loop=3 과 다름).
// ImageDecoder 의 repetitionCount 는 "첫 재생 뒤 반복 횟수"이므로 셋 다 2 여야 한다.
import { test, expect } from '@playwright/test';

test.describe('E4 보완 — 반복 횟수', () => {
  test('[1] 반복 3 → 3형식 모두 repetitionCount 2', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => true);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { encode } = await import('/src/export/encode.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = H.movingShapeDoc({ fps: 10, frameCount: 4 });
      const engine = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(engine, doc, { createCanvas: H.createCanvas, playback: 'loop' });

      const out = {};
      for (const [fmt, mime] of Object.entries({ apng: 'image/png', webp: 'image/webp', gif: 'image/gif' })) {
        const three = await encode(baked, fmt, { loops: 3, colors: 0, quality: 90 }, {});
        out[fmt] = (await H.decode(three.buf, mime)).rep;
      }
      return out;
    });
    expect(r.apng).toBe(2);
    expect(r.webp).toBe(2);
    expect(r.gif).toBe(2);
  });
});
