// 실제 GPU 성능(참고) — 1080p 에서 6개 문서를 CPU/GPU 엔진으로 각각 그려 프레임당 평균·최대(ms)와
//   GPU 업로드 횟수를 잰다. 표 위에 WEBGL_debug_renderer_info 로 읽은 실제 GPU 이름을 적는다.
//   실행: npm run perf:gpu:real (playwright.gpu.config.js — headed + ANGLE d3d11 + GPU).
//   SwiftShader(소프트웨어)로 잡히면 수치는 의미 없다 — 실제 그래픽카드에서 다시 재야 한다.
//   기준값 파일에 넣지 않는다(기기마다 다름).
import { test } from '@playwright/test';

test('R34 실제 GPU 성능(1080p, 6개 문서, 참고용)', async ({ page }) => {
  await page.goto('/');
  const out = await page.evaluate(async () => {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };
    const _free = new Map();
    const borrow = (w, h) => { w = Math.max(1, w | 0); h = Math.max(1, h | 0); const k = w + 'x' + h; const a = _free.get(k); let c = (a && a.length) ? a.pop() : mk(w, h); const cx = c.getContext('2d'); cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, w, h); return c; };
    const release = (c) => { const k = c.width + 'x' + c.height; if (!_free.has(k)) _free.set(k, []); _free.get(k).push(c); };
    const stat = (arr) => { arr = arr.slice().sort((a, b) => a - b); const avg = arr.reduce((a, b) => a + b, 0) / arr.length; return { avg, max: arr[arr.length - 1] }; };

    // 실제 GPU 이름(가능하면 UNMASKED).
    let gpuName = '(알 수 없음)';
    try {
      const gl = mk(2, 2).getContext('webgl2');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        gpuName = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      } else gpuName = '(WebGL2 없음)';
    } catch (e) { gpuName = '(읽기 실패: ' + e.message + ')'; }

    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const W = 1920, H = 1080, N = 30;

    // 숨긴 모양 소스 + 효과 1개를 건 문서를 만든다.
    function fxDoc(effectId, params, shapeKind) {
      const doc = createDoc({ width: W, height: H, fps: 24, frameCount: 24 });
      const shp = createLayer('shape', { name: 'src' });
      shp.shape = shapeKind === 'rect'
        ? { kind: 'rect', w: W * 0.45, h: H * 0.45, fill: '#ffffff', stroke: null }
        : { kind: 'ellipse', w: W * 0.45, h: H * 0.45, fill: '#ffffff', stroke: null };
      shp.transform.x.value = W / 2; shp.transform.y.value = H / 2; shp.visible = false;
      doc.layers[shp.id] = shp; doc.order.push(shp.id);
      const fx = createLayer('effect', { name: effectId, effectId });
      fx.params = {}; for (const d of (effects.get(effectId).params ?? [])) fx.params[d.key] = d.default;
      Object.assign(fx.params, params);
      fx.sources = [{ key: 'below', sourceId: shp.id }];
      doc.layers[fx.id] = fx; doc.order.push(fx.id);
      return doc;
    }

    const docs = [
      { name: 'bloom r=16', make: () => fxDoc('bloom', { radius: 16 }, 'ellipse') },
      { name: 'bloom r=40', make: () => fxDoc('bloom', { radius: 40 }, 'ellipse') },
      { name: 'bloom r=64', make: () => fxDoc('bloom', { radius: 64 }, 'ellipse') },
      { name: 'drop-shadow blur=12', make: () => fxDoc('drop-shadow', { blur: 12, distance: 20 }, 'rect') },
      { name: 'drop-shadow blur=28', make: () => fxDoc('drop-shadow', { blur: 28, distance: 24, spread: 4 }, 'rect') },
      { name: 'drop-shadow blur=48', make: () => fxDoc('drop-shadow', { blur: 48, distance: 30, spread: 6 }, 'rect') },
    ];

    function run(renderer, make) {
      const eng = createRenderEngine({ createCanvas: mk, effects, renderer });
      const doc = make(); const cv = mk(W, H); const cx = cv.getContext('2d');
      eng.renderFrame(cx, doc, 0, {}); // warmup
      eng.resetGpuStats?.();
      const ts = [];
      for (let f = 0; f < N; f++) { const t0 = performance.now(); eng.renderFrame(cx, doc, f % 24, {}); ts.push(performance.now() - t0); }
      return { renderer: eng.stats().renderer, stat: stat(ts), uploads: eng.stats().gpuUploads, downloads: eng.stats().gpuDownloads };
    }

    const webgl2 = !!mk(2, 2).getContext('webgl2');
    const rows = [];
    for (const d of docs) {
      const cpu = run('cpu', d.make);
      const gpu = webgl2 ? run('gpu', d.make) : null;
      rows.push({ name: d.name, cpu, gpu });
    }
    return { gpuName, webgl2, rows, N };
  });

  const sw = /swiftshader|software|llvmpipe/i.test(out.gpuName);
  console.log('── R34 실제 GPU 성능(1080p, 6개 문서) ───────────────────────────');
  console.log('GPU:', out.gpuName, sw ? '← 소프트웨어(SwiftShader). 수치 의미 없음 — 실제 그래픽카드에서 다시 재야 함.' : '');
  console.log(`WebGL2: ${out.webgl2} · ${out.N}프레임 평균/최대(ms)`);
  for (const r of out.rows) {
    const c = r.cpu.stat, g = r.gpu && r.gpu.stat;
    console.log(`  ${r.name.padEnd(22)} CPU 평균 ${c.avg.toFixed(2)} 최대 ${c.max.toFixed(2)}` +
      (r.gpu ? `  |  GPU(${r.gpu.renderer}) 평균 ${g.avg.toFixed(2)} 최대 ${g.max.toFixed(2)}  업로드 ${r.gpu.uploads} 읽기 ${r.gpu.downloads}` : '  |  GPU 없음'));
  }
  console.log('참고: R34a/b 는 흐림만 GPU. 합성·효과는 R34c 이후. 전체 전환 판단은 실제 GPU 수치로.');
  console.log('─────────────────────────────────────────────────────────────────');
});
