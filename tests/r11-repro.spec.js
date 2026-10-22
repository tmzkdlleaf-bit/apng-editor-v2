// R11 재현 — R7~R10 검토 후속. 고치기 전에는 2개 모두 실패하고, 고치면 통과한다.
//  [R11-1] 핑퐁 문서 내보내기(투명 여백 자르기 꺼짐)가 DataCloneError 로 실패한다(R9-2 move 전송).
//  [R11-2] 예전 카메라(v2) 애니메이션 변환이 키 사이에서 크게 어긋난다(R8-1 변환).
import { test, expect } from '@playwright/test';

test.describe('R11 재현', () => {
  // ── R11-1 ─────────────────────────────────────────────────────────────
  // 핑퐁은 되돌아오는 구간에서 같은 프레임 배열을 재사용한다. move 전송이 같은 ArrayBuffer 를
  // 한 postMessage 로 두 번 넘겨 DataCloneError 가 났다. 자르기 켬/끔 × 3형식 모두 성공해야 한다.
  test('[R11-1] 핑퐁 내보내기 — 자르기 켬/끔 × APNG/WebP/GIF 모두 성공', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { exportAnimation } = await import('/src/export/index.js');
      // 프레임마다 서로 다른(움직이는) 핑퐁 문서. frameCount 4 → 순서 0,1,2,3,2,1(2·1 재사용).
      const doc = H.movingShapeDoc({ width: 24, height: 24, fps: 10, frameCount: 4, x0: 4, x1: 16 });
      doc.meta.playback = 'pingpong';
      const out = [];
      for (const trim of [false, true]) {
        for (const format of ['apng', 'webp', 'gif']) {
          try {
            const res = await exportAnimation(doc, { format, trim, createCanvas: H.createCanvas, name: 't' });
            out.push({ format, trim, ok: true, bytes: res.bytes, n: res.frameCount });
          } catch (e) {
            out.push({ format, trim, ok: false, err: e.name + ': ' + e.message });
          }
        }
      }
      return out;
    });
    for (const c of r) {
      expect(c.ok, `${c.format} trim=${c.trim}: ${c.err ?? ''}`).toBe(true);
      expect(c.bytes).toBeGreaterThan(0);
    }
  });

  // 용량 예상(estimateSize → exportAnimation)도 같은 이유로 실패했다. 핑퐁에서 숫자를 내야 한다.
  test('[R11-1] 핑퐁 용량 예상이 오류 없이 숫자를 낸다', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { estimateSize } = await import('/src/export/fit.js');
      const doc = H.movingShapeDoc({ width: 24, height: 24, fps: 10, frameCount: 4, x0: 4, x1: 16 });
      doc.meta.playback = 'pingpong';
      try {
        const res = await estimateSize(doc, { format: 'apng', trim: false, createCanvas: H.createCanvas });
        return { ok: true, bytes: res.bytes };
      } catch (e) { return { ok: false, err: e.name + ': ' + e.message }; }
    });
    expect(r.ok, r.err ?? '').toBe(true);
    expect(r.bytes).toBeGreaterThan(0);
  });

  // 결과가 R8 이전(프레임마다 복사) 방식과 바이트까지 같은지 — 고유 프레임만 넘기고 order 로 펼쳐도
  // 복사 방식과 결과가 동일해야 한다(작은 핑퐁 문서, 3형식).
  test('[R11-1] 핑퐁 결과가 복사 방식과 바이트까지 같다', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { encode } = await import('/src/export/encode.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = H.movingShapeDoc({ width: 24, height: 24, fps: 10, frameCount: 4, x0: 4, x1: 16 });
      const engine = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(engine, doc, { createCanvas: H.createCanvas, playback: 'pingpong' });
      // 복사 방식: 프레임마다 서로 다른 버퍼(= R8 이전). 현재 중복 제거(order) 경로와 비교.
      const expanded = { ...baked, frames: baked.frames.map((fr) => ({ rgba: fr.rgba.slice(), delayMs: fr.delayMs })) };
      const out = {};
      for (const format of ['apng', 'webp', 'gif']) {
        const opt = format === 'apng' ? { colors: 0 } : format === 'webp' ? { lossless: 1 } : {};
        const a = await encode(baked, format, { loops: 0, ...opt }, {});     // 중복 제거(order) 경로
        const b = await encode(expanded, format, { loops: 0, ...opt }, {});  // 복사 방식
        const ua = new Uint8Array(a.buf), ub = new Uint8Array(b.buf);
        let same = ua.length === ub.length;
        for (let i = 0; same && i < ua.length; i++) if (ua[i] !== ub[i]) same = false;
        out[format] = { same, bytes: ua.length };
      }
      return out;
    });
    for (const fmt of ['apng', 'webp', 'gif']) {
      expect(r[fmt].same, `${fmt} 바이트 불일치`).toBe(true);
      expect(r[fmt].bytes).toBeGreaterThan(0);
    }
  });

  // ── R11-2 ─────────────────────────────────────────────────────────────
  // 예전 카메라(점 기준 줌)를 migrate 한 뒤, 모든 정수 프레임에서 화면 이동량 T 가 예전과 ±0.5px 안.
  //   예전 화면 이동: T = X0·(1−z)  (점 기준 줌 screen = z·p + X0(1−z), p=0 이면 T)
  //   새 화면 이동:   cameraScreenTr(evalCamera(v3,f)).tx
  test('[R11-2] v2→v3 카메라 — 모든 정수 프레임 ±0.5px, 키 개수 frameCount+1 이하', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { migrate } = await import('/src/core/io/migrate.js');
      const { evalProp } = await import('/src/core/anim/prop.js');
      const { evalCamera } = await import('/src/core/anim/evaluate.js');
      const { cameraScreenTr } = await import('/src/core/render/matrix.js');
      const W = 768, Ht = 768, FC = 24;

      const K = (pairs, ease = 'linear') => ({ value: pairs[0][1], keys: pairs.map(([f, v]) => ({ f, v, ease })) });
      const cases = {
        // 줌 1→2 + X 0→100 (키 f0,f10)
        zoomX:   { x: K([[0, 0], [10, 100]]), y: { value: 0 }, zoom: K([[0, 1], [10, 2]]) },
        // 줌만 1→2 (가장 흔한 줌인)
        zoomOnly:{ x: { value: 0 }, y: { value: 0 }, zoom: K([[0, 1], [10, 2]]) },
        // 줌 1→2 easeInOut, X/Y 고정
        zoomEase:{ x: { value: 0 }, y: { value: 0 }, zoom: K([[0, 1], [10, 2]], 'easeInOut') },
        // 줌아웃 2→1, 키 구간 f4~f20
        zoomOut: { x: { value: 0 }, y: { value: 0 }, zoom: K([[4, 2], [20, 1]]) },
      };

      const results = {};
      for (const [name, cam] of Object.entries(cases)) {
        const v2 = {
          version: 2, format: 'apng-editor',
          meta: { width: W, height: Ht, fps: 12, frameCount: FC, background: { type: 'transparent' }, playback: 'loop' },
          camera: JSON.parse(JSON.stringify(cam)),
          order: [], layers: {}, assets: {},
        };
        const xP = cam.x, yP = cam.y, zP = cam.zoom;
        const cx = W / 2, cy = Ht / 2;
        const v3 = migrate(JSON.parse(JSON.stringify(v2)));

        let maxErr = 0, worstF = -1;
        for (let f = 0; f < FC; f++) {
          const z = evalProp(zP, f);
          const oldTx = z * 0 + evalProp(xP, f) * (1 - z); // 예전 화면 이동량(p=0)
          const oldTy = z * 0 + evalProp(yP, f) * (1 - z);
          const ncam = evalCamera(v3, f);
          const { tx, ty } = cameraScreenTr(ncam, W, Ht);
          const e = Math.max(Math.abs(tx - oldTx), Math.abs(ty - oldTy));
          if (e > maxErr) { maxErr = e; worstF = f; }
        }
        const keyCount = Math.max(v3.camera.x.keys?.length ?? 0, v3.camera.y.keys?.length ?? 0);
        results[name] = { maxErr, worstF, keyCount, fcPlus1: FC + 1 };
      }
      return results;
    });
    for (const [name, c] of Object.entries(r)) {
      expect(c.maxErr, `${name}: 최대 오차 ${c.maxErr.toFixed(2)}px (f${c.worstF})`).toBeLessThanOrEqual(0.5 + 1e-6);
      expect(c.keyCount, `${name}: 키 ${c.keyCount}개 > ${c.fcPlus1}`).toBeLessThanOrEqual(c.fcPlus1);
    }
  });
});
