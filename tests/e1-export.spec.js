// E1 — 프레임 굽기 / 인코더(APNG·WebP·GIF). 결과는 브라우저 ImageDecoder로 디코딩해 검증한다.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const MIME = { apng: 'image/png', webp: 'image/webp', gif: 'image/gif' };

test.describe('E1 — 내보내기', () => {
  // ── 3형식: 프레임 수 / 지연 합 = 전체 길이 / 반복 횟수(무한·1회) ──────────
  test('[3형식] 프레임 수·지연 합·반복 횟수(무한/1회)', async ({ page }) => {
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
        const inf = await encode(baked, fmt, { loops: 0, colors: 0, quality: 90 }, {});
        const once = await encode(baked, fmt, { loops: 1, colors: 0, quality: 90 }, {});
        const dInf = await H.decode(inf.buf, mime);
        const dOnce = await H.decode(once.buf, mime);
        const sumMs = Math.round(dInf.frames.reduce((s, f) => s + f.durUs, 0) / 1000);
        out[fmt] = { n: dInf.n, sumMs, repInf: dInf.rep, repOnce: dOnce.rep };
      }
      return out;
    });
    for (const fmt of ['apng', 'webp', 'gif']) {
      expect(r[fmt].n).toBe(4);
      // 전체 길이 400ms. GIF는 1/100초 단위라 반올림 여유.
      expect(Math.abs(r[fmt].sumMs - 400)).toBeLessThanOrEqual(fmt === 'gif' ? 20 : 2);
      expect(r[fmt].repInf).toBe('inf');       // 무한 반복
      expect(r[fmt].repOnce).not.toBe('inf');  // 1회 재생
    }
  });

  // ── APNG 무손실: 디코딩한 각 프레임 == renderFrame 결과(완전 일치) ─────────
  test('[APNG] 무손실 — 프레임별 renderFrame과 완전 일치', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { encode } = await import('/src/export/encode.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = H.movingShapeDoc({ frameCount: 4 });
      const engine = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(engine, doc, { createCanvas: H.createCanvas });
      const { buf } = await encode(baked, 'apng', { loops: 0, colors: 0 }, {});
      const dec = await H.decode(buf, 'image/png');
      const results = dec.frames.map((f, i) => H.exactEqual(f.data, H.renderPixels(doc, i)));
      return { n: dec.n, results };
    });
    expect(r.n).toBe(4);
    expect(r.results).toEqual([true, true, true, true]);
  });

  // ── WebP 무손실: 완전 일치 / WebP 손실 q80: 평균 오차 ≤ 3 ─────────────────
  test('[WebP] 무손실 완전 일치 · 손실 q80 평균오차 작음', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { encode } = await import('/src/export/encode.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = H.movingShapeDoc({ frameCount: 4 });
      const engine = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(engine, doc, { createCanvas: H.createCanvas });

      const ll = await encode(baked, 'webp', { loops: 0, lossless: 1 }, {});
      const lossy = await encode(baked, 'webp', { loops: 0, lossless: 0, quality: 80 }, {});
      const dLL = await H.decode(ll.buf, 'image/webp');
      const dLo = await H.decode(lossy.buf, 'image/webp');
      const llExact = dLL.frames.map((f, i) => H.exactEqual(f.data, H.renderPixels(doc, i)));
      const loDiff = dLo.frames.map((f, i) => H.meanRgbDiffOpaque(f.data, H.renderPixels(doc, i)));
      return { llExact, maxLoDiff: Math.max(...loDiff) };
    });
    expect(r.llExact).toEqual([true, true, true, true]);
    expect(r.maxLoDiff).toBeLessThanOrEqual(3);
  });

  // ── GIF: 투명 영역 위치 일치 + 색 평균 오차 기준 내 ───────────────────────
  test('[GIF] 투명 위치 일치 · 색 평균오차 기준 내', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { encode } = await import('/src/export/encode.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = H.movingShapeDoc({ frameCount: 4 });
      const engine = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(engine, doc, { createCanvas: H.createCanvas });
      const { buf } = await encode(baked, 'gif', { loops: 0 }, {});
      const dec = await H.decode(buf, 'image/gif');
      const miss = dec.frames.map((f, i) => H.alphaMismatchCount(f.data, H.renderPixels(doc, i)));
      const diff = dec.frames.map((f, i) => H.meanRgbDiffOpaque(f.data, H.renderPixels(doc, i)));
      return { maxMiss: Math.max(...miss), maxDiff: Math.max(...diff) };
    });
    expect(r.maxMiss).toBeLessThanOrEqual(4);   // 경계 1~2픽셀 허용
    expect(r.maxDiff).toBeLessThanOrEqual(8);
  });

  // ── 핑퐁 3프레임 → 0,1,2,1 순서 ──────────────────────────────────────────
  test('[핑퐁] 3프레임 → 0,1,2,1 순서', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = H.movingShapeDoc({ frameCount: 3, x0: 2, x1: 12 });
      const engine = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(engine, doc, { createCanvas: H.createCanvas, playback: 'pingpong' });
      // 기대 순서 0,1,2,1 과 각 베이크 프레임이 렌더 결과와 일치하는지
      const expectOrder = [0, 1, 2, 1];
      const match = baked.frames.map((fr, k) => H.exactEqual(Array.from(fr.rgba), H.renderPixels(doc, expectOrder[k])));
      return { n: baked.frames.length, match };
    });
    expect(r.n).toBe(4);
    expect(r.match).toEqual([true, true, true, true]);
  });

  // ── 같은 프레임 연속 → 합쳐지고 지연 합산 ────────────────────────────────
  test('[병합] 같은 프레임 연속 → 1장으로 합치고 지연 합산', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      // 움직임 없는 정지 사각형 → 모든 프레임 동일
      const doc = createDoc({ width: 16, height: 16, fps: 10, frameCount: 5 });
      const s = createLayer('shape', { name: '정지' });
      s.shape = { kind: 'rect', w: 8, h: 8, fill: '#2ecc71', stroke: null };
      s.transform.x.value = 8; s.transform.y.value = 8;
      doc.layers[s.id] = s; doc.order.push(s.id);
      const engine = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(engine, doc, { createCanvas: H.createCanvas });
      const totalMs = baked.frames.reduce((a, f) => a + f.delayMs, 0);
      return { n: baked.frames.length, totalMs };
    });
    expect(r.n).toBe(1);          // 5장 → 1장
    expect(r.totalMs).toBe(500);  // 지연 합산 (10fps × 5프레임)
  });

  // ── 투명 여백 잘라내기 → 결과 크기 = 불투명 영역 합집합 ───────────────────
  test('[트림] 투명 여백 잘라내기 → 불투명 합집합 크기', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = H.movingShapeDoc({ width: 32, height: 32, frameCount: 4, x0: 8, x1: 20 });
      const engine = createRenderEngine({ createCanvas: H.createCanvas });

      // 전체 렌더로 불투명 합집합 bbox 계산
      const W = 32, Hh = 32;
      const accum = new Uint8Array(W * Hh);
      for (let f = 0; f < 4; f++) {
        const px = H.renderPixels(doc, f);
        for (let p = 0; p < W * Hh; p++) accum[p] |= px[p * 4 + 3];
      }
      let minX = W, minY = Hh, maxX = -1, maxY = -1;
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (accum[y * W + x]) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      const expW = maxX - minX + 1, expH = maxY - minY + 1;

      const baked = await bakeFrames(engine, doc, { createCanvas: H.createCanvas, trim: true });
      return { bw: baked.width, bh: baked.height, expW, expH, full: W };
    });
    expect(r.bw).toBe(r.expW);
    expect(r.bh).toBe(r.expH);
    expect(r.bw).toBeLessThan(r.full); // 실제로 잘렸다
  });

  // ── 사파리 회피: 워커 어디에도 convertToBlob/toBlob으로 WebP를 만들지 않음 ──
  test('[사파리] 워커에 convertToBlob/toBlob WebP 경로 없음', async () => {
    const worker = readFileSync(join(__dir, '../src/export/encode-worker.js'), 'utf8');
    expect(worker).not.toMatch(/convertToBlob/);
    expect(worker).not.toMatch(/\.toBlob\s*\(/);
  });

  // ── 취소: 굽기 중 abort → 오류 대신 취소 결과 ─────────────────────────────
  test('[취소] 굽기 중 abort → AbortError(취소 결과), blob 없음', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { exportAnimation } = await import('/src/export/index.js');
      // 프레임 많은 큰 문서로 굽기가 여러 틱 걸리게
      const doc = H.movingShapeDoc({ width: 64, height: 64, frameCount: 60, x0: 4, x1: 60 });
      const ctrl = new AbortController();
      const p = exportAnimation(doc, { format: 'apng', createCanvas: H.createCanvas, signal: ctrl.signal, name: 't' });
      setTimeout(() => ctrl.abort(), 5);
      try { const res = await p; return { ok: true, bytes: res.bytes }; }
      catch (e) { return { ok: false, name: e.name, blob: false }; }
    });
    expect(r.ok).toBe(false);
    expect(r.name).toBe('AbortError');
  });

  // ── ?demo=1 문서 3형식 인코딩 시간·용량(보고용 표) ───────────────────────
  test('[데모] demo=1 3형식 시간·용량 출력', async ({ page }) => {
    await page.goto('/?demo=1');
    await page.waitForFunction(() => !!(window.__store && window.__stage));
    await page.waitForTimeout(300);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { exportAnimation } = await import('/src/export/index.js');
      const { getAsset } = await import('/src/core/io/assets.js');
      const effects = (await import('/src/effects/registry.js')).effects;
      const motions = (await import('/src/motions/registry.js')).default;
      const doc = window.__store.get();

      // 에셋 비트맵 사전 로드 → 동기 getBitmap 어댑터
      const bmps = {};
      for (const aid of Object.keys(doc.assets ?? {})) {
        try { const b = await getAsset(aid); if (b) bmps[aid] = await createImageBitmap(b); } catch {}
      }
      const assets = { getBitmap: (id) => bmps[id] ?? null, getAnimFrames: () => null };

      const rows = [];
      for (const fmt of ['apng', 'webp', 'gif']) {
        const t0 = performance.now();
        const res = await exportAnimation(doc, {
          format: fmt, scale: 1, createCanvas: H.createCanvas, assets, effects, motions, name: 'demo',
          colors: fmt === 'apng' ? 256 : undefined, quality: 80,
        });
        const ms = Math.round(performance.now() - t0);
        rows.push({ fmt, bytes: res.bytes, kb: +(res.bytes / 1024).toFixed(1), ms, w: res.width, h: res.height, n: res.frameCount });
      }
      return { rows, size: `${doc.meta.width}x${doc.meta.height}`, frames: doc.meta.frameCount };
    });
    console.log('[E1 데모 인코딩 표]', r.size, 'frames', r.frames);
    for (const row of r.rows) {
      console.log(`  ${row.fmt.padEnd(4)} ${String(row.kb).padStart(8)} KB  ${String(row.ms).padStart(6)} ms  ${row.w}x${row.h} ×${row.n}`);
      expect(row.bytes).toBeGreaterThan(0);
    }
  });
});
