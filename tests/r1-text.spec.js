// R1 추가 — 글자 정렬·간격·정적/타자기 조합에서 그려진 범위가 실측 폭과 맞고
// (잘림 없음), 같은 정렬끼리 위치가 같은지. 선택 상자 폭이 실측 폭 수준인지.
import { test, expect } from '@playwright/test';

const BBOX_FN = `
  (cx, w, h) => {
    const d = cx.getImageData(0, 0, w, h).data;
    let minX = Infinity, maxX = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 128) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    }
    return maxX < 0 ? null : { minX, maxX };
  }`;

test('[R1-text] 정렬·간격·타자기 조합에서 잘림 없고 정렬 기준점이 일정', async ({ page }) => {
  await page.goto('/tests/e1-helpers.js');
  const r = await page.evaluate(async (BB) => {
    const bbox = eval(BB);
    const H = await import('/tests/e1-helpers.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { measureTextBounds } = await import('/src/core/render/layers/text.js');
    const W = 3000, AX = 1500, TXT = '가나다라마바사아자차카타파하';

    function draw(align, ls, mode) {
      const doc = createDoc({ width: W, height: 200, fps: 10, frameCount: 2 });
      const t = createLayer('text', { name: 't' });
      Object.assign(t, { text: TXT, size: 48, align, color: '#ff0000', letterSpacing: ls, font: 'sans-serif' });
      if (mode === 'reveal') t.reveal = { mode: 'char', startF: 0, endF: 0, loop: 'once', cursor: false };
      t.transform.x.value = AX; t.transform.y.value = 100;
      doc.layers[t.id] = t; doc.order.push(t.id);
      const eng = createRenderEngine({ createCanvas: H.createCanvas });
      const c = H.createCanvas(W, 200); const cx = c.getContext('2d', { willReadFrequently: true });
      eng.renderFrame(cx, doc, 1, {});
      const b = bbox(cx, W, 200);
      const bounds = measureTextBounds(t);
      return { start: b.minX - AX, end: b.maxX - AX, span: b.maxX - b.minX, boxW: bounds.w, boxOx: bounds.ox };
    }

    const mc = H.createCanvas(1, 1).getContext('2d'); mc.font = '400 48px sans-serif';
    const tw = mc.measureText(TXT).width;

    const res = {};
    for (const align of ['left', 'center', 'right'])
      for (const ls of [0, 2])
        for (const mode of ['static', 'reveal'])
          res[`${align}_${ls}_${mode}`] = draw(align, ls, mode);
    return { tw, res };
  }, BBOX_FN);

  const { tw, res } = r;

  // 모든 조합: 잘림 없음(그려진 폭이 실측의 95% 이상), 과도하게 넓지도 않음.
  for (const [k, v] of Object.entries(res)) {
    expect(v.span, k + ' span').toBeGreaterThan(tw * 0.95);
    expect(v.span, k + ' span').toBeLessThan(tw + 48 * 3);  // 글자 간격 2×13 + 여유
  }

  // 정렬 기준점: left 는 앵커에서 시작(start≈0), right 는 앵커에서 끝(end≈0), center 는 대칭.
  for (const k of Object.keys(res)) {
    const v = res[k];
    if (k.startsWith('left'))   { expect(Math.abs(v.start), k).toBeLessThanOrEqual(6); }
    if (k.startsWith('right'))  { expect(Math.abs(v.end), k).toBeLessThanOrEqual(6); }
    if (k.startsWith('center')) { expect(Math.abs(v.start + v.end), k).toBeLessThanOrEqual(8); }
  }

  // 왼쪽 정렬끼리(간격·정적/타자기 달라도) 시작 위치가 ±3px 안에서 같다.
  // (center/right 는 전체폭 측정과 글자별 합산 폭의 미세차가 있어 위 '정렬 기준점' 검사로 본다.)
  {
    const keys = Object.keys(res).filter((k) => k.startsWith('left'));
    const base = res[keys[0]].start;
    for (const k of keys) expect(Math.abs(res[k].start - base), k).toBeLessThanOrEqual(3);
  }

  // 선택 상자 폭이 실측 폭 + 여백 수준(2배 넓지 않음).
  for (const [k, v] of Object.entries(res)) {
    expect(v.boxW, k + ' boxW').toBeGreaterThan(tw * 0.9);
    expect(v.boxW, k + ' boxW').toBeLessThan(tw * 1.4);
  }

  // 선택 상자 중심(boxOx): left 는 +폭/2, right 는 -폭/2, center 는 0.
  expect(res.left_0_static.boxOx).toBeGreaterThan(tw * 0.4);
  expect(res.right_0_static.boxOx).toBeLessThan(-tw * 0.4);
  expect(Math.abs(res.center_0_static.boxOx)).toBeLessThanOrEqual(2);
});
