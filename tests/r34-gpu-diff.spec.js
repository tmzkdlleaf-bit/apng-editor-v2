// GPU 흐림 비교 — CPU(기준 렌더러) 대비 GPU 결과가 CLAUDE.md 렌더 규칙 2번 허용 기준 안인지.
//   허용 기준: 채널별 최대 차이 ≤3, 평균 차이 ≤0.5, 99.5% 이상 픽셀이 (픽셀 최대채널차) ≤2.
//   R34b 에서 CPU·GPU 가 같은 흐림 정의(칸평균 축소+프리멀티 박스+직접 쌍선형)를 쓰게 해 이 기준을 만족한다.
//   - 같은 렌더러로 두 번 그리면 완전히 같다(GPU 포함).
//   - 루프: GPU 로 frame 0 과 frame N(=frameCount)이 완전히 같다.
//   - WebGL2 를 못 받으면 GPU 비교는 건너뛰고, 대체 경로(요청해도 CPU 로 동작·픽셀 동일)만 돈다.
import { test, expect } from '@playwright/test';

test('R34a: GPU 흐림 ↔ CPU 허용 기준 · 결정론 · 루프 · 대체 경로', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');

  const out = await page.evaluate(async () => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };
    // 간단한 캔버스 풀(테스트용): 빌리면 지운 캔버스, 돌려주면 보관.
    const _free = new Map();
    const borrow = (w, h) => {
      w = Math.max(1, w | 0); h = Math.max(1, h | 0);
      const k = w + 'x' + h; const arr = _free.get(k);
      let c; if (arr && arr.length) c = arr.pop(); else c = mk(w, h);
      const cx = c.getContext('2d'); cx.setTransform(1, 0, 0, 1, 0, 0); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; cx.clearRect(0, 0, w, h);
      return c;
    };
    const release = (c) => { const k = c.width + 'x' + c.height; if (!_free.has(k)) _free.set(k, []); _free.get(k).push(c); };

    // 불투명·비대칭 소스(세로 뒤집힘·해상도 손실을 드러내도록): 대각 그라디언트 + 색 도형.
    function makeSource(W, H) {
      const c = mk(W, H); const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#102040'); g.addColorStop(0.5, '#4080c0'); g.addColorStop(1, '#f0d040');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = '#e03020'; x.fillRect(W * 0.12, H * 0.15, W * 0.3, H * 0.3);
      x.fillStyle = '#20c060'; x.beginPath(); x.arc(W * 0.7, H * 0.35, Math.min(W, H) * 0.18, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#ffffff'; x.fillRect(W * 0.1, H * 0.7, W * 0.8, H * 0.08);
      x.strokeStyle = '#000000'; x.lineWidth = 3; x.strokeRect(W * 0.55, H * 0.6, W * 0.35, H * 0.3);
      return c; // 전부 불투명(alpha=255)
    }

    // 두 캔버스 비교(허용 기준 통계).
    function compare(a, b) {
      const W = a.width, H = a.height;
      const da = a.getContext('2d').getImageData(0, 0, W, H).data;
      const db = b.getContext('2d').getImageData(0, 0, W, H).data;
      let maxCh = 0, sum = 0, nCh = da.length, pxOk = 0, nPx = W * H;
      for (let i = 0; i < nPx; i++) {
        let pxMax = 0;
        for (let k = 0; k < 4; k++) { const d = Math.abs(da[i * 4 + k] - db[i * 4 + k]); if (d > maxCh) maxCh = d; if (d > pxMax) pxMax = d; sum += d; }
        if (pxMax <= 2) pxOk++;
      }
      return { maxCh, avg: sum / nCh, pctOk: pxOk / nPx };
    }
    function identical(a, b) {
      const W = a.width, H = a.height;
      const da = a.getContext('2d').getImageData(0, 0, W, H).data;
      const db = b.getContext('2d').getImageData(0, 0, W, H).data;
      if (da.length !== db.length) return false;
      for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) return false;
      return true;
    }

    const { blurCanvas: cpuBlur } = await import('/src/core/render/blur.js');
    const { createGLContext } = await import('/src/core/render/gpu/context.js');
    const { createTexturePool } = await import('/src/core/render/gpu/textures.js');
    const { createUploader } = await import('/src/core/render/gpu/upload.js');
    const { createGpuBlur } = await import('/src/core/render/gpu/blur.js');

    const result = { webgl2: false, blur: [], determinism: null, loop: null, fallback: null };

    const glctx = createGLContext(mk);
    if (glctx) {
      result.webgl2 = true;
      const texPool = createTexturePool(glctx.gl);
      const uploader = createUploader(glctx.gl);
      const gpu = createGpuBlur(glctx.gl, texPool, uploader);

      const { blurToSmall: cpuSmall } = await import('/src/core/render/blur.js');
      const W = 256, H = 192;
      const src = makeSource(W, H);
      for (const r of [1, 8, 32]) {
        const cc = cpuBlur(src, r, borrow, release);
        const gg = gpu.blurCanvas(src, r, borrow, release);
        // 진단: 발산이 축소에서 오는지 확대에서 오는지 — 작은 크기 단계만 따로 비교.
        const cs = cpuSmall(src, r, borrow);
        const gs = gpu.blurToSmall(src, r, borrow);
        const small = compare(cs.canvas, gs.canvas);
        release(cs.canvas); release(gs.canvas);
        result.blur.push({ r, ...compare(cc, gg), smallMax: small.maxCh, smallAvg: small.avg });
        release(cc); release(gg);
      }
      // 결정론: GPU 로 같은 입력을 두 번
      const g1 = gpu.blurCanvas(src, 8, borrow, release);
      const g2 = gpu.blurCanvas(src, 8, borrow, release);
      result.determinism = identical(g1, g2);
      release(g1); release(g2);
    }

    // 엔진 경로: bloom 문서를 CPU/GPU 엔진으로 각각 그려 비교(루프·대체 경로 포함).
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');

    function bloomDoc() {
      const doc = createDoc({ width: 240, height: 180, fps: 12, frameCount: 24 });
      const shp = createLayer('shape', { name: 'src' });
      shp.shape = { kind: 'ellipse', w: 120, h: 120, fill: '#ffffff', stroke: null };
      shp.transform.x.value = 120; shp.transform.y.value = 90;
      shp.visible = false;
      doc.layers[shp.id] = shp; doc.order.push(shp.id);
      const fx = createLayer('effect', { name: 'bloom', effectId: 'bloom' });
      fx.params = {}; for (const d of (effects.get('bloom').params ?? [])) fx.params[d.key] = d.default;
      fx.params.radius = 24; fx.params.breathe = 1; fx.params.cycles = 1;
      fx.sources = [{ key: 'below', sourceId: shp.id }];
      doc.layers[fx.id] = fx; doc.order.push(fx.id);
      return doc;
    }
    const draw = (eng, doc, f) => { const c = mk(doc.meta.width, doc.meta.height); eng.renderFrame(c.getContext('2d'), doc, f, {}); return c; };

    const engCpu = createRenderEngine({ createCanvas: mk, effects });
    const cpuA = draw(engCpu, bloomDoc(), 6);

    if (glctx) {
      const engGpu = createRenderEngine({ createCanvas: mk, effects, renderer: 'gpu' });
      result.engineRenderer = engGpu.stats().renderer;
      const gpuA = draw(engGpu, bloomDoc(), 6);
      result.engineBloom = compare(cpuA, gpuA);
      // 루프: GPU 로 frame 0 == frame frameCount(=24)
      const d = bloomDoc();
      result.loop = identical(draw(engGpu, d, 0), draw(engGpu, d, d.meta.frameCount));
      result.engineUploads = engGpu.stats().gpuUploads;
    }

    // 대체 경로: WebGL2 를 거부하는 캔버스를 주입 → 'gpu' 요청해도 CPU 로 동작, 픽셀은 CPU 와 동일.
    const mkNoGl = (w, h) => {
      const c = mk(w, h); const orig = c.getContext.bind(c);
      c.getContext = (type, ...a) => (type === 'webgl2' || type === 'webgl') ? null : orig(type, ...a);
      return c;
    };
    const engFallback = createRenderEngine({ createCanvas: mkNoGl, effects, renderer: 'gpu' });
    const fbRenderer = engFallback.stats().renderer;
    const fbA = draw(engFallback, bloomDoc(), 6);
    result.fallback = { renderer: fbRenderer, identicalToCpu: identical(cpuA, fbA) };

    return result;
  });

  // 표 출력
  console.log('R34a WebGL2:', out.webgl2, '| 엔진 renderer:', out.engineRenderer, '| 엔진 bloom 업로드 횟수:', out.engineUploads);
  if (out.webgl2) {
    console.log('R34a 흐림 비교(CPU 기준 ↔ GPU)  [CLAUDE 허용: 최대≤3 · 평균≤0.5 · ≤2비율≥99.5%]');
    for (const row of out.blur) {
      const pass = row.maxCh <= 3 && row.avg <= 0.5 && row.pctOk >= 0.995;
      console.log(`  r=${row.r}: 최대채널차=${row.maxCh}, 평균차=${row.avg.toFixed(3)}, ≤2비율=${(row.pctOk * 100).toFixed(2)}%  [기준 ${pass ? '통과' : '초과'}]  (작은단계 최대=${row.smallMax}, 평균=${row.smallAvg.toFixed(3)})`);
    }
    if (out.engineBloom) console.log(`  엔진 bloom(전체 프레임): 최대채널차=${out.engineBloom.maxCh}, 평균차=${out.engineBloom.avg.toFixed(3)}, ≤2비율=${(out.engineBloom.pctOk * 100).toFixed(2)}%`);
  }
  console.log('R34a 대체 경로:', JSON.stringify(out.fallback));

  // ── 하드 검증(반드시 성립) ──────────────────────────────────────────────
  // 대체 경로는 WebGL2 유무와 무관하게 항상 돈다: 'gpu' 요청해도 CPU 로 동작하고 픽셀이 CPU 와 같다.
  expect(out.fallback.renderer, '대체 경로는 CPU 로 동작해야 함').toBe('cpu');
  expect(out.fallback.identicalToCpu, '대체 경로 결과는 CPU 엔진과 픽셀 동일해야 함').toBe(true);

  if (!out.webgl2) {
    test.info().annotations.push({ type: 'skip', description: 'WebGL2 없음 — GPU 비교 건너뜀(대체 경로만 검증)' });
    expect(errors, '콘솔 오류 없음').toEqual([]);
    return;
  }

  expect(out.engineRenderer, 'GPU 요청 + WebGL2 가능 → renderer=gpu').toBe('gpu');
  expect(out.determinism, 'GPU 흐림 결정론(두 번 그리면 완전히 동일)').toBe(true);
  expect(out.loop, 'GPU 루프: frame 0 == frame frameCount(완전히 동일)').toBe(true);
  expect(out.engineUploads, 'GPU bloom 이 실제로 GPU 흐림을 거쳤는지(업로드>0)').toBeGreaterThan(0);

  // ── CLAUDE 허용 기준(최대≤3·평균≤0.5·≤2비율≥99.5%)을 실제로 만족해야 한다 ────────────
  // R34b 결론: CPU blurCanvas/blurToSmall 을 drawImage 리샘플러에서 직접 계산(칸평균 축소 + 프리멀티
  //   박스 3회 + 직접 쌍선형 확대 + 언프리멀티)으로 바꿔 GPU 셰이더와 "같은 흐림 정의"를 쓰게 했다.
  //   이제 GPU 결과가 CPU 기준 렌더러와 허용 기준 안에서 일치한다(측정값은 위 로그 참조 — 반경별 최대차 ≤2).
  //   "예전 파일 픽셀 동일" 규칙의 예외로 흐림 기준을 이번 한 번 다시 정한 결과(사용자 승인).
  for (const row of out.blur) {
    expect(row.maxCh, `r=${row.r} 채널 최대차 ≤3`).toBeLessThanOrEqual(3);
    expect(row.avg, `r=${row.r} 평균차 ≤0.5`).toBeLessThanOrEqual(0.5);
    expect(row.pctOk, `r=${row.r} (픽셀 최대차 ≤2) 비율 ≥99.5%`).toBeGreaterThanOrEqual(0.995);
  }
  // 엔진 bloom(투명 가장자리 포함 전체 프레임)도 같은 허용 기준 안이어야 한다.
  expect(out.engineBloom.maxCh, 'bloom 채널 최대차 ≤3').toBeLessThanOrEqual(3);
  expect(out.engineBloom.avg, 'bloom 평균차 ≤0.5').toBeLessThanOrEqual(0.5);
  expect(out.engineBloom.pctOk, 'bloom (픽셀 최대차 ≤2) 비율 ≥99.5%').toBeGreaterThanOrEqual(0.995);

  expect(errors, '콘솔 오류 없음').toEqual([]);
});
