// R34a GPU 성능(참고) — 1080p 에서 CPU/GPU 흐림·bloom 의 프레임당 평균·최대(ms)와 업로드 왕복 횟수.
//   npm run perf:gpu 로 따로 돈다(기준값 파일에 넣지 않는다 — 기기마다 다름).
//   주의: 클라우드·CI 는 소프트웨어 GPU(SwiftShader)라 수치가 의미 없다 — 느리게 나온다.
//     진짜 판단은 나비 PC(실제 GPU)에서 이 명령을 돌려 표를 붙여서 한다.
//   R34a 범위: GPU 는 흐림(blur)만 담당한다. 합성·효과(불꽃·연기 등)는 R34b·R34c.
import { test } from '@playwright/test';

test('R34a GPU 성능(1080p, 참고용)', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(async () => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };
    const _free = new Map();
    const borrow = (w, h) => { w = Math.max(1, w | 0); h = Math.max(1, h | 0); const k = w + 'x' + h; const a = _free.get(k); let c = (a && a.length) ? a.pop() : mk(w, h); const cx = c.getContext('2d'); cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, w, h); return c; };
    const release = (c) => { const k = c.width + 'x' + c.height; if (!_free.has(k)) _free.set(k, []); _free.get(k).push(c); };
    const stat = (arr) => { arr = arr.slice().sort((a, b) => a - b); const avg = arr.reduce((a, b) => a + b, 0) / arr.length; return { avg, max: arr[arr.length - 1], med: arr[Math.floor(arr.length / 2)] }; };

    const W = 1920, H = 1080, N = 30;
    const res = { webgl2: false, blur: [], bloom: null };

    // 1080p 소스(불투명 그라디언트+도형)
    const src = mk(W, H); {
      const x = src.getContext('2d');
      const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#102040'); g.addColorStop(0.5, '#4080c0'); g.addColorStop(1, '#f0d040');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) { x.fillStyle = `hsl(${i * 37 % 360},70%,55%)`; x.fillRect((i * 97) % W, (i * 53) % H, 160, 120); }
    }

    const { blurCanvas: cpuBlur } = await import('/src/core/render/blur.js');
    const { createGLContext } = await import('/src/core/render/gpu/context.js');
    const { createTexturePool } = await import('/src/core/render/gpu/textures.js');
    const { createUploader } = await import('/src/core/render/gpu/upload.js');
    const { createGpuBlur } = await import('/src/core/render/gpu/blur.js');

    const glctx = createGLContext(mk);
    if (glctx) {
      res.webgl2 = true;
      const gl = glctx.gl;
      const texPool = createTexturePool(gl);
      const uploader = createUploader(gl);
      const gpu = createGpuBlur(gl, texPool, uploader);
      const sync = () => gl.finish(); // GPU 작업이 끝날 때까지 기다려 측정이 샌 것이 아니게

      for (const r of [8, 32]) {
        // CPU
        { const c = cpuBlur(src, r, borrow, release); release(c); } // warmup
        const cpuT = [];
        for (let i = 0; i < N; i++) { const t0 = performance.now(); const c = cpuBlur(src, r, borrow, release); const dt = performance.now() - t0; cpuT.push(dt); release(c); }
        // GPU (업로드+셰이더+읽기 포함)
        { const c = gpu.blurCanvas(src, r, borrow, release); sync(); release(c); } // warmup
        uploader.reset();
        const gpuT = [];
        for (let i = 0; i < N; i++) { const t0 = performance.now(); const c = gpu.blurCanvas(src, r, borrow, release); sync(); const dt = performance.now() - t0; gpuT.push(dt); release(c); }
        res.blur.push({ r, cpu: stat(cpuT), gpu: stat(gpuT), uploads: uploader.uploads, downloads: uploader.downloads });
      }
    }

    // 엔진 bloom(전체 프레임) — 1080p, 30프레임, CPU vs GPU
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    function bloomDoc() {
      const doc = createDoc({ width: W, height: H, fps: 12, frameCount: 24 });
      const shp = createLayer('shape', { name: 'src' });
      shp.shape = { kind: 'ellipse', w: W * 0.4, h: H * 0.4, fill: '#ffffff', stroke: null };
      shp.transform.x.value = W / 2; shp.transform.y.value = H / 2; shp.visible = false;
      doc.layers[shp.id] = shp; doc.order.push(shp.id);
      const fx = createLayer('effect', { name: 'bloom', effectId: 'bloom' });
      fx.params = {}; for (const d of (effects.get('bloom').params ?? [])) fx.params[d.key] = d.default;
      fx.params.radius = 40;
      fx.sources = [{ key: 'below', sourceId: shp.id }];
      doc.layers[fx.id] = fx; doc.order.push(fx.id);
      return doc;
    }
    function runEngine(renderer) {
      const eng = createRenderEngine({ createCanvas: mk, effects, renderer });
      const doc = bloomDoc(); const cv = mk(W, H); const cx = cv.getContext('2d');
      eng.renderFrame(cx, doc, 0, {}); // warmup
      eng.resetGpuStats?.();
      const ts = [];
      for (let f = 0; f < N; f++) { const t0 = performance.now(); eng.renderFrame(cx, doc, f % 24, {}); ts.push(performance.now() - t0); }
      return { renderer: eng.stats().renderer, stat: stat(ts), uploads: eng.stats().gpuUploads, downloads: eng.stats().gpuDownloads };
    }
    res.bloom = { cpu: runEngine('cpu') };
    if (glctx) res.bloom.gpu = runEngine('gpu');

    return res;
  });

  const f = (s) => `평균 ${s.avg.toFixed(2)} · 중앙 ${s.med.toFixed(2)} · 최대 ${s.max.toFixed(2)} ms`;
  console.log('── R34a GPU 성능(1080p, 참고용) ─────────────────────────────');
  console.log('WebGL2:', out.webgl2, out.webgl2 ? '(이 환경은 SwiftShader 소프트웨어 GPU — 수치 의미 없음. 실제 GPU 에서 다시 재야 함)' : '(없음 — GPU 미측정)');
  if (out.webgl2) {
    console.log('흐림(blurCanvas) 프레임당:');
    for (const b of out.blur) {
      console.log(`  r=${b.r}  CPU: ${f(b.cpu)}`);
      console.log(`         GPU: ${f(b.gpu)}  (업로드 ${b.uploads}, 읽기 ${b.downloads} / ${30}프레임 → 프레임당 왕복 ${(b.uploads / 30).toFixed(1)}+${(b.downloads / 30).toFixed(1)})`);
    }
  }
  console.log('엔진 bloom(전체 프레임) 프레임당:');
  console.log(`  CPU(${out.bloom.cpu.renderer}): ${f(out.bloom.cpu.stat)}`);
  if (out.bloom.gpu) console.log(`  GPU(${out.bloom.gpu.renderer}): ${f(out.bloom.gpu.stat)}  (업로드 ${out.bloom.gpu.uploads}, 읽기 ${out.bloom.gpu.downloads})`);
  console.log('참고: R34a 는 흐림만 GPU. 합성·불꽃·연기 등은 R34b·R34c. 전체 전환 판단은 실제 GPU 수치로.');
  console.log('─────────────────────────────────────────────────────────────');
});
