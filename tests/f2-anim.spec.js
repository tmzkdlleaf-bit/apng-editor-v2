// F2-1 — 움직이는 이미지 가져오기(GIF·APNG·WebP). 인코더로 만든 애니를 decodeAnim 으로 되가져온다.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => true);
}

test.describe('F2-1 — 움직이는 이미지', () => {
  test('[디코드] GIF·APNG·WebP: 프레임 수·길이 일치', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { encode } = await import('/src/export/encode.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { decodeAnim } = await import('/src/core/io/anim-decode.js');

      const fps = 10, N = 6;
      const doc = H.movingShapeDoc({ fps, frameCount: N });
      const engine = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(engine, doc, { createCanvas: H.createCanvas, playback: 'loop' });

      const out = {};
      for (const [fmt, mime] of [['gif', 'image/gif'], ['apng', 'image/png'], ['webp', 'image/webp']]) {
        const { buf } = await encode(baked, fmt, { loops: 0, colors: 0, quality: 90 }, {});
        const blob = new Blob([buf], { type: mime });
        const dec = await decodeAnim(blob);
        const totalMs = dec ? dec.delays.reduce((a, b) => a + b, 0) : 0;
        out[fmt] = { frames: dec?.frames.length ?? 0, totalMs };
      }
      return { out, expectedMs: (N / fps) * 1000 };
    });
    for (const fmt of ['gif', 'apng', 'webp']) {
      expect(r.out[fmt].frames).toBe(6);                        // 프레임 수 일치
      expect(Math.abs(r.out[fmt].totalMs - r.expectedMs)).toBeLessThanOrEqual(60); // 길이 일치(반올림 여유)
    }
  });

  test('[시간 기준] frameIndexAtTime — 지연 제각각이어도 누적 시간으로 고름', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const { frameIndexAtTime } = await import('/src/core/io/anim-decode.js');
      const delays = [100, 500, 100, 300]; // 제각각
      return {
        at50:  frameIndexAtTime(delays, 50),    // 0
        at150: frameIndexAtTime(delays, 150),   // 1 (100~600)
        at650: frameIndexAtTime(delays, 650),   // 2 (600~700)
        at750: frameIndexAtTime(delays, 750),   // 3 (700~1000)
        at9999: frameIndexAtTime(delays, 9999), // 마지막
      };
    });
    expect(r.at50).toBe(0);
    expect(r.at150).toBe(1);
    expect(r.at650).toBe(2);
    expect(r.at750).toBe(3);
    expect(r.at9999).toBe(3);
  });

  test('[판별] 여러 프레임 → 움직이는 이미지, 단일 프레임 → 정지', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { encode } = await import('/src/export/encode.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { probeAnim } = await import('/src/core/io/anim-decode.js');

      // 애니메이션 GIF
      const doc = H.movingShapeDoc({ fps: 10, frameCount: 4 });
      const engine = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(engine, doc, { createCanvas: H.createCanvas, playback: 'loop' });
      const { buf } = await encode(baked, 'gif', { loops: 0 }, {});
      const animProbe = await probeAnim(new Blob([buf], { type: 'image/gif' }));

      // 단일 프레임 PNG
      const c = H.createCanvas(16, 16); const cx = c.getContext('2d');
      cx.fillStyle = '#f00'; cx.fillRect(0, 0, 16, 16);
      const stillBlob = await new Promise((res) => c.toBlob(res, 'image/png'));
      const stillProbe = await probeAnim(stillBlob);

      return { anim: animProbe, still: stillProbe };
    });
    expect(r.anim.animated).toBe(true);
    expect(r.anim.frameCount).toBe(4);
    expect(r.still.animated).toBe(false);
  });

  test('[렌더] anim 레이어가 시간에 따라 다른 소스 프레임을 보인다', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { encode } = await import('/src/export/encode.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { createLayer, createDoc } = await import('/src/core/doc/schema.js');
      const { decodeAnim } = await import('/src/core/io/anim-decode.js');

      // 프레임마다 위치가 다른 애니를 APNG(무손실)로 만든다
      const fps = 10, N = 6;
      const src = H.movingShapeDoc({ fps, frameCount: N, x0: 2, x1: 14 });
      const eng0 = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(eng0, src, { createCanvas: H.createCanvas, playback: 'loop' });
      const { buf } = await encode(baked, 'apng', { loops: 0, colors: 0 }, {});
      const dec = await decodeAnim(new Blob([buf], { type: 'image/png' }));

      // anim 레이어를 담은 문서 + 메모리 비트맵 어댑터
      const doc = createDoc({ width: 16, height: 16, fps, frameCount: N });
      const a = createLayer('anim', { name: '움직임', assetId: 'A' });
      a.transform.x.value = 0; a.transform.y.value = 0; a.anchor = { x: 0, y: 0 };
      a.timing = { mode: 'loop', speed: 1, offset: 0 };
      doc.layers[a.id] = a; doc.order.push(a.id);
      const assets = { getBitmap: () => null, getAnimFrames: (id) => (id === 'A' ? dec : null) };
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets });

      function pixels(f) {
        const c = H.createCanvas(16, 16); const cx = c.getContext('2d', { willReadFrequently: true });
        eng.invalidate?.(); eng.renderFrame(cx, doc, f, {});
        return Array.from(cx.getImageData(0, 0, 16, 16).data);
      }
      const p0 = pixels(0), p3 = pixels(3);
      let diff = 0; for (let i = 0; i < p0.length; i++) if (p0[i] !== p3[i]) diff++;
      return { frames: dec?.frames.length ?? 0, diff };
    });
    expect(r.frames).toBe(6);
    expect(r.diff).toBeGreaterThan(0); // 시간이 흐르면 다른 소스 프레임(움직임)
  });
});
