// R13-2 — PNG 묶음 / 스프라이트 시트. zip 을 다시 풀어 파일 수·이름·픽셀이 renderFrame 과 같은지,
// sheet.json 좌표로 잘라낸 조각이 해당 프레임과 같은지, 캔버스 한계 초과 시 막히는지.
import { test, expect } from './helpers/fixtures.js';

// 움직이는 사각형 문서(프레임마다 x 가 달라 프레임이 서로 다르게 나온다).
async function makeDoc(page) {
  return page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const D = 40, FC = 5;
    const doc = createDoc({ width: D, height: D, fps: 10, frameCount: FC });
    const s = createLayer('shape', { name: 'box' });
    s.shape = { kind: 'rect', w: 12, h: 12, fill: '#ff3030', stroke: null };
    s.transform.x = { value: 8, keys: [{ f: 0, v: 8, ease: 'linear' }, { f: FC - 1, v: D - 8, ease: 'linear' }] };
    s.transform.y.value = D / 2;
    doc.layers[s.id] = s; doc.order.push(s.id);
    window.__D = D; window.__FC = FC;
    return { D, FC };
  });
}

test.describe('R13-2 PNG 묶음 / 스프라이트 시트', () => {
  test('[PNG 묶음] 파일 수·이름·timing.json·픽셀 == renderFrame', async ({ page }) => {
    await page.goto('/');
    const { D, FC } = await makeDoc(page);
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { effects } = await import('/src/effects/registry.js');
      const { exportPngSequence } = await import('/src/export/index.js');
      const { readZip } = await import('/src/export/zip.js');
      const D = window.__D, FC = window.__FC;
      const createCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

      // 같은 문서를 다시 만든다(evaluate 경계 — 위에서 만든 doc 은 다른 컨텍스트).
      const doc = createDoc({ width: D, height: D, fps: 10, frameCount: FC });
      const s = createLayer('shape', { name: 'box' });
      s.shape = { kind: 'rect', w: 12, h: 12, fill: '#ff3030', stroke: null };
      s.transform.x = { value: 8, keys: [{ f: 0, v: 8, ease: 'linear' }, { f: FC - 1, v: D - 8, ease: 'linear' }] };
      s.transform.y.value = D / 2;
      doc.layers[s.id] = s; doc.order.push(s.id);

      const res = await exportPngSequence(doc, { name: 'proj', createCanvas, effects });
      const files = readZip(new Uint8Array(await res.blob.arrayBuffer()));
      const names = Object.keys(files).sort();
      const timing = JSON.parse(new TextDecoder().decode(files['timing.json']));

      // 각 PNG 를 디코드해 renderFrame 결과와 픽셀 비교.
      const engine = createRenderEngine({ createCanvas, effects });
      async function decodePng(bytes) {
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const c = createCanvas(bmp.width, bmp.height);
        c.getContext('2d').drawImage(bmp, 0, 0);
        return c.getContext('2d').getImageData(0, 0, bmp.width, bmp.height).data;
      }
      function render(f) {
        const c = createCanvas(D, D);
        engine.renderFrame(c.getContext('2d', { willReadFrequently: true }), doc, f, { scale: 1 });
        return c.getContext('2d').getImageData(0, 0, D, D).data;
      }
      let maxDiff = 0;
      for (let f = 0; f < FC; f++) {
        const png = await decodePng(files[`proj_${String(f + 1).padStart(4, '0')}.png`]);
        const ref = render(f);
        let d = 0; for (let i = 0; i < ref.length; i++) d = Math.max(d, Math.abs(png[i] - ref[i]));
        maxDiff = Math.max(maxDiff, d);
      }
      return {
        fileCount: res.frameCount,
        pngCount: names.filter((n) => n.endsWith('.png')).length,
        hasTiming: !!files['timing.json'],
        first: names[0], timingFrames: timing.frames.length, fps: timing.fps, maxDiff,
      };
    });
    expect(r.pngCount).toBe(FC);          // 프레임 수 = 문서 프레임 수(합치기 안 함)
    expect(r.hasTiming).toBe(true);
    expect(r.timingFrames).toBe(FC);
    expect(r.fps).toBe(10);
    expect(r.first).toBe('proj_0001.png');
    expect(r.maxDiff).toBeLessThanOrEqual(1); // 무손실 PNG → renderFrame 과 사실상 동일
  });

  test('[스프라이트 시트] sheet.json 좌표로 자른 조각 == 프레임', async ({ page }) => {
    await page.goto('/');
    const { D, FC } = await makeDoc(page);
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { effects } = await import('/src/effects/registry.js');
      const { exportSpriteSheet } = await import('/src/export/index.js');
      const { readZip } = await import('/src/export/zip.js');
      const D = window.__D, FC = window.__FC;
      const createCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      const doc = createDoc({ width: D, height: D, fps: 10, frameCount: FC });
      const s = createLayer('shape', { name: 'box' });
      s.shape = { kind: 'rect', w: 12, h: 12, fill: '#ff3030', stroke: null };
      s.transform.x = { value: 8, keys: [{ f: 0, v: 8, ease: 'linear' }, { f: FC - 1, v: D - 8, ease: 'linear' }] };
      s.transform.y.value = D / 2;
      doc.layers[s.id] = s; doc.order.push(s.id);

      const res = await exportSpriteSheet(doc, { name: 'proj', createCanvas, effects });
      const files = readZip(new Uint8Array(await res.blob.arrayBuffer()));
      const meta = JSON.parse(new TextDecoder().decode(files['proj_sheet.json']));

      const bmp = await createImageBitmap(new Blob([files['proj_sheet.png']], { type: 'image/png' }));
      const sc = createCanvas(bmp.width, bmp.height); sc.getContext('2d').drawImage(bmp, 0, 0);
      const sctx = sc.getContext('2d');

      const engine = createRenderEngine({ createCanvas, effects });
      function render(f) {
        const c = createCanvas(D, D);
        engine.renderFrame(c.getContext('2d', { willReadFrequently: true }), doc, f, { scale: 1 });
        return c.getContext('2d').getImageData(0, 0, D, D).data;
      }
      let maxDiff = 0;
      for (const fr of meta.frames) {
        const piece = sctx.getImageData(fr.x, fr.y, fr.w, fr.h).data;
        const ref = render(fr.index);
        let d = 0; for (let i = 0; i < ref.length; i++) d = Math.max(d, Math.abs(piece[i] - ref[i]));
        maxDiff = Math.max(maxDiff, d);
      }
      return {
        hasPng: !!files['proj_sheet.png'], hasJson: !!files['proj_sheet.json'],
        cols: meta.cols, rows: meta.rows, frameCount: meta.frames.length,
        sheetW: bmp.width, sheetH: bmp.height, maxDiff,
      };
    });
    expect(r.hasPng).toBe(true);
    expect(r.hasJson).toBe(true);
    expect(r.cols).toBe(Math.ceil(Math.sqrt(FC))); // 기본 열 수 = ⌈√n⌉
    expect(r.frameCount).toBe(FC);
    expect(r.maxDiff).toBeLessThanOrEqual(1);
  });

  test('[한계 초과] 큰 시트는 막고 줄일 비율을 돌려준다', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { effects } = await import('/src/effects/registry.js');
      const { exportSpriteSheet } = await import('/src/export/index.js');
      const createCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      // 큰 캔버스 × 많은 프레임 → 시트가 16384 를 넘는다.
      const doc = createDoc({ width: 2000, height: 2000, fps: 10, frameCount: 100 });
      const s = createLayer('shape', { name: 'box' });
      s.shape = { kind: 'rect', w: 100, h: 100, fill: '#30a0ff', stroke: null };
      doc.layers[s.id] = s; doc.order.push(s.id);
      try {
        await exportSpriteSheet(doc, { name: 'big', createCanvas, effects, allowLargeMemory: true });
        return { threw: false };
      } catch (e) {
        return { threw: true, code: e.code, hasWarning: !!e.warning };
      }
    });
    expect(r.threw).toBe(true);
    expect(r.code).toBe('sheet-too-large');
    expect(r.hasWarning).toBe(true);
  });

  test('[zip 왕복] buildZip → readZip 바이트 보존 + CRC', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { buildZip, readZip } = await import('/src/export/zip.js');
      const a = new Uint8Array([1, 2, 3, 4, 5]);
      const b = new TextEncoder().encode('안녕하세요 zip');
      const zip = buildZip([{ name: 'a.bin', data: a }, { name: '폴더/b.txt', data: b }]);
      const out = readZip(zip);
      const eq = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
      return { names: Object.keys(out).sort(), aOk: eq(out['a.bin'], a), bOk: eq(out['폴더/b.txt'], b) };
    });
    expect(r.names).toEqual(['a.bin', '폴더/b.txt']);
    expect(r.aOk).toBe(true);
    expect(r.bOk).toBe(true);
  });
});
