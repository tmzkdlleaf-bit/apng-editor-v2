// 견본 시트 생성(npm run sheets) — docs/fx-sheets/<id>.png.
// 효과: 어두운/밝은 배경 두 줄 × frame 0·¼·½·¾ 네 장(각 256px) + 이름·기본 파라미터·프레임당 ms.
// 모션: 시험 도형에 적용한 경로 그림 + 같은 4장.
import { test } from '@playwright/test';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '..', '..', 'docs', 'fx-sheets');
mkdirSync(OUT, { recursive: true });

function save(id, dataUrl) {
  const b64 = dataUrl.split(',')[1];
  writeFileSync(join(OUT, id + '.png'), Buffer.from(b64, 'base64'));
}

test('효과 견본 시트', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const sheets = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { effects, getAllEffects } = await import('/src/effects/registry.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const CELL = 256, LABEL = 46;
    const out = [];
    for (const eff of getAllEffects()) {
      const sheet = mk(CELL * 4, CELL * 2 + LABEL);
      const sctx = sheet.getContext('2d');
      const doc = createDoc({ width: CELL, height: CELL, fps: 12, frameCount: 24 });
      const fx = createLayer('effect', { name: 'p', effectId: eff.id });
      doc.layers[fx.id] = fx; doc.order.push(fx.id);
      const eng = createRenderEngine({ createCanvas: mk, effects });
      const frames = [0, 6, 12, 18];
      let ms = 0, n = 0;
      [['#101216', 0], ['#e9ebee', CELL]].forEach(([bg, rowY]) => {
        doc.meta.background = { type: 'solid', color: bg }; // renderFrame 이 직접 배경을 칠하게
        frames.forEach((f, i) => {
          const cell = mk(CELL, CELL); const cctx = cell.getContext('2d');
          const t0 = performance.now();
          try { eng.renderFrame(cctx, doc, f, {}); } catch {}
          ms += performance.now() - t0; n++;
          sctx.drawImage(cell, i * CELL, rowY);
        });
      });
      sctx.fillStyle = '#111'; sctx.fillRect(0, CELL * 2, CELL * 4, LABEL);
      sctx.fillStyle = '#eee'; sctx.font = '14px sans-serif'; sctx.textBaseline = 'middle';
      const pv = (eff.params ?? []).map((p) => `${p.label ?? p.key}=${p.default}`).join('  ');
      sctx.fillText(`${eff.name}  [${eff.category ?? ''}]   ${(ms / n).toFixed(2)}ms/frame`, 8, CELL * 2 + 16);
      sctx.fillStyle = '#9aa'; sctx.font = '11px sans-serif';
      sctx.fillText(pv.slice(0, 160), 8, CELL * 2 + 34);
      out.push({ id: eff.id, url: sheet.toDataURL('image/png'), ms: ms / n });
    }
    return out;
  });
  for (const s of sheets) save(s.id, s.url);
  console.log('효과 시트 ' + sheets.length + '개: ' + sheets.map((s) => `${s.id}(${s.ms.toFixed(1)}ms)`).join(', '));
});

test('모션 견본 시트', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const sheets = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const motionsRegistry = (await import('/src/motions/registry.js')).default;
    const { getAllMotions } = await import('/src/motions/registry.js');
    const { createDoc, createLayer, createClip } = await import('/src/core/doc/schema.js');
    const { evalTransform } = await import('/src/core/anim/evaluate.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const CELL = 256, LABEL = 46;
    const out = [];
    for (const m of getAllMotions()) {
      const sheet = mk(CELL * 5, CELL + LABEL);
      const sctx = sheet.getContext('2d');
      const doc = createDoc({ width: CELL, height: CELL, fps: 12, frameCount: m.defaultLength ?? 24 });
      doc.meta.background = { type: 'solid', color: '#101216' };
      const sh = createLayer('shape', { name: 's' });
      sh.shape = { kind: 'ellipse', w: 48, h: 48, fill: '#f0a35e', stroke: null };
      sh.transform.x.value = CELL / 2; sh.transform.y.value = CELL / 2;
      sh.clips = [createClip(m, { start: 0 })];
      doc.layers[sh.id] = sh; doc.order.push(sh.id);
      const eng = createRenderEngine({ createCanvas: mk, motions: motionsRegistry });
      const fc = doc.meta.frameCount;
      // 경로 셀
      const pc = mk(CELL, CELL); const pctx = pc.getContext('2d');
      pctx.fillStyle = '#101216'; pctx.fillRect(0, 0, CELL, CELL);
      pctx.strokeStyle = '#f0a35e'; pctx.globalAlpha = 0.7; pctx.beginPath();
      for (let f = 0; f <= fc; f++) {
        const tr = evalTransform(doc, sh.id, f, motionsRegistry);
        const x = CELL / 2 + (tr.x ?? 0), y = CELL / 2 + (tr.y ?? 0);
        f ? pctx.lineTo(x, y) : pctx.moveTo(x, y);
      }
      pctx.stroke(); pctx.globalAlpha = 1;
      sctx.drawImage(pc, 0, 0);
      // 4장
      const frames = [0, Math.floor(fc / 4), Math.floor(fc / 2), Math.floor(fc * 3 / 4)];
      frames.forEach((f, i) => {
        const cell = mk(CELL, CELL); const cctx = cell.getContext('2d');
        cctx.fillStyle = '#101216'; cctx.fillRect(0, 0, CELL, CELL);
        try { eng.renderFrame(cctx, doc, f, {}); } catch {}
        sctx.drawImage(cell, (i + 1) * CELL, 0);
      });
      sctx.fillStyle = '#111'; sctx.fillRect(0, CELL, CELL * 5, LABEL);
      sctx.fillStyle = '#eee'; sctx.font = '14px sans-serif'; sctx.textBaseline = 'middle';
      sctx.fillText(`${m.name}  [${m.category ?? m.kind}]  길이 ${m.defaultLength ?? 24}f`, 8, CELL + 16);
      sctx.fillStyle = '#9aa'; sctx.font = '11px sans-serif';
      const pv = (m.params ?? []).map((p) => `${p.label ?? p.key}=${p.default}`).join('  ');
      sctx.fillText(pv.slice(0, 200), 8, CELL + 34);
      out.push({ id: 'motion-' + m.id, url: sheet.toDataURL('image/png') });
    }
    return out;
  });
  for (const s of sheets) save(s.id, s.url);
  console.log('모션 시트 ' + sheets.length + '개: ' + sheets.map((s) => s.id).join(', '));
});
