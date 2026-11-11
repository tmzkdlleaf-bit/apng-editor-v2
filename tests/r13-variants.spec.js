// R13-1 — 세트 한 번에 만들기. normalizeDoc 보존·정리, collectAssetIds 포함, applyVariant 임시 복사본,
// setVariants 되돌리기 1건, exportSet zip(파일 3개·바뀐 이미지 픽셀·원본 불변).
import { test, expect } from './helpers/fixtures.js';

test.describe('R13-1 세트(바리에이션)', () => {
  test('[정리] normalizeDoc 이 세트를 보존하고 없는 레이어 슬롯은 정리', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { normalizeDoc } = await import('/src/core/io/migrate.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc = createDoc({ width: 32, height: 32 });
      const t = createLayer('text', { name: 't', text: 'A' });
      doc.layers[t.id] = t; doc.order.push(t.id);
      doc.variants = {
        slots: [
          { id: 's1', layerId: t.id, kind: 'text', label: '대사' },
          { id: 's2', layerId: 'lyr_missing', kind: 'image', label: '없음' }, // 없는 레이어 → 정리
          { id: 's3', layerId: t.id, kind: 'image', label: '종류불일치' },     // text 에 image → 정리
        ],
        rows: [{ id: 'r1', name: '성공', values: { s1: '성공!', s2: 'ast_x', s3: 'ast_y' } }],
      };
      const n = normalizeDoc(doc);
      return {
        slotCount: n.variants.slots.length,
        slotId: n.variants.slots[0]?.id,
        rowValueKeys: Object.keys(n.variants.rows[0].values), // 살아남은 슬롯 값만
        rowVal: n.variants.rows[0].values.s1,
      };
    });
    expect(r.slotCount).toBe(1);        // s2(없는 레이어)·s3(종류불일치) 정리
    expect(r.slotId).toBe('s1');
    expect(r.rowValueKeys).toEqual(['s1']);
    expect(r.rowVal).toBe('성공!');
  });

  test('[에셋] collectAssetIds 가 이미지 슬롯 값을 포함', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { collectAssetIds } = await import('/src/core/io/assets.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc = createDoc({ width: 32, height: 32 });
      const img = createLayer('image', { name: '그림', assetId: 'ast_base' });
      doc.layers[img.id] = img; doc.order.push(img.id);
      doc.variants = {
        slots: [{ id: 's1', layerId: img.id, kind: 'image', label: '그림' }],
        rows: [
          { id: 'r1', name: 'A', values: { s1: 'ast_a' } },
          { id: 'r2', name: 'B', values: { s1: 'ast_b' } },
        ],
      };
      const ids = [...collectAssetIds(doc)].sort();
      return { ids };
    });
    expect(r.ids).toEqual(['ast_a', 'ast_b', 'ast_base']);
  });

  test('[적용·되돌리기] applyVariant 는 복사본만 바꾸고, setVariants 는 기록 1건', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { applyVariant } = await import('/src/core/doc/variants.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const doc = createDoc({ width: 32, height: 32 });
      const t = createLayer('text', { name: 't', text: '원본' });
      const img = createLayer('image', { name: 'i', assetId: 'ast_base' });
      doc.layers[t.id] = t; doc.order.push(t.id);
      doc.layers[img.id] = img; doc.order.push(img.id);
      doc.variants = {
        slots: [
          { id: 's_t', layerId: t.id, kind: 'text', label: '대사' },
          { id: 's_i', layerId: img.id, kind: 'image', label: '그림' },
        ],
        rows: [{ id: 'r1', name: '크리티컬', values: { s_t: '크리티컬!', s_i: 'ast_crit' } }],
      };
      const temp = applyVariant(doc, doc.variants.rows[0]);
      const origText = doc.layers[t.id].text;         // 원본 그대로여야
      const origAsset = doc.layers[img.id].assetId;

      // setVariants 되돌리기 1건
      const store = createStore(doc);
      const d0 = store.undoDepth();
      store.apply({ type: 'setVariants', variants: { slots: doc.variants.slots, rows: [...doc.variants.rows, { id: 'r2', name: '펌블', values: { s_t: '펌블' } }] } });
      const added = store.undoDepth() - d0;
      const rowsAfter = store.get().variants.rows.length;
      store.undo();
      const rowsBack = store.get().variants.rows.length;
      return {
        tempText: temp.layers[t.id].text, tempAsset: temp.layers[img.id].assetId,
        origText, origAsset, added, rowsAfter, rowsBack,
      };
    });
    expect(r.tempText).toBe('크리티컬!');     // 복사본은 바뀌고
    expect(r.tempAsset).toBe('ast_crit');
    expect(r.origText).toBe('원본');          // 원본은 그대로
    expect(r.origAsset).toBe('ast_base');
    expect(r.added).toBe(1);                  // 세트 편집 = 기록 1건
    expect(r.rowsAfter).toBe(2);
    expect(r.rowsBack).toBe(1);               // 되돌리면 원래 행 수
  });

  test('[세트 내보내기] 글자+이미지 × 변형 3 → zip 파일 3개, 바뀐 이미지 픽셀, 원본 불변', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { exportSet } = await import('/src/export/index.js');
      const { readZip } = await import('/src/export/zip.js');
      const D = 32;
      const createCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

      // 변형별 이미지(단색) 비트맵을 만든다.
      async function solid(color) {
        const c = createCanvas(D, D); const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, D, D);
        return createImageBitmap(c);
      }
      const bmps = { ast_r: await solid('#ff0000'), ast_g: await solid('#00ff00'), ast_b: await solid('#0000ff') };
      const assets = { getBitmap: (id) => bmps[id] ?? null, getAnimFrames: () => null };

      const doc = createDoc({ width: D, height: D, fps: 10, frameCount: 2 });
      const img = createLayer('image', { name: 'i', assetId: 'ast_r' });
      img.transform.x.value = D / 2; img.transform.y.value = D / 2; // 캔버스 가운데(anchor 0.5)
      const t = createLayer('text', { name: 't', text: 'A', size: 10, color: '#ffffff' });
      t.transform.x.value = 5; t.transform.y.value = 5;
      doc.layers[img.id] = img; doc.order.push(img.id);
      doc.layers[t.id] = t; doc.order.push(t.id);
      doc.variants = {
        slots: [
          { id: 's_i', layerId: img.id, kind: 'image', label: '그림' },
          { id: 's_t', layerId: t.id, kind: 'text', label: '대사' },
        ],
        rows: [
          { id: 'r1', name: '빨강', values: { s_i: 'ast_r', s_t: '성공' } },
          { id: 'r2', name: '초록', values: { s_i: 'ast_g', s_t: '실패' } },
          { id: 'r3', name: '파랑', values: { s_i: 'ast_b', s_t: '크리' } },
        ],
      };
      const beforeAsset = doc.layers[img.id].assetId;
      const beforeText = doc.layers[t.id].text;

      const res = await exportSet(doc, { rows: doc.variants.rows, format: 'apng', name: 'proj', createCanvas, assets });
      const files = readZip(new Uint8Array(await res.blob.arrayBuffer()));
      const names = Object.keys(files).sort();

      // 각 파일 첫 프레임 중앙 픽셀 = 그 변형의 이미지 색.
      async function centerRGB(bytes) {
        const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const c = createCanvas(bmp.width, bmp.height); c.getContext('2d').drawImage(bmp, 0, 0);
        const d = c.getContext('2d').getImageData((bmp.width / 2) | 0, (bmp.height / 2) | 0, 1, 1).data;
        return [d[0], d[1], d[2]];
      }
      const red = await centerRGB(files['proj_빨강.png']);
      const grn = await centerRGB(files['proj_초록.png']);
      const blu = await centerRGB(files['proj_파랑.png']);
      return {
        names, count: res.count,
        red, grn, blu,
        afterAsset: doc.layers[img.id].assetId, afterText: doc.layers[t.id].text,
        beforeAsset, beforeText,
      };
    });
    expect(r.count).toBe(3);
    expect(r.names).toEqual(['proj_초록.png', 'proj_파랑.png', 'proj_빨강.png'].sort());
    expect(r.red[0]).toBeGreaterThan(200); expect(r.red[1]).toBeLessThan(60);   // 빨강
    expect(r.grn[1]).toBeGreaterThan(200); expect(r.grn[0]).toBeLessThan(60);   // 초록
    expect(r.blu[2]).toBeGreaterThan(200); expect(r.blu[0]).toBeLessThan(60);   // 파랑
    expect(r.afterAsset).toBe(r.beforeAsset); // 원본 문서 불변
    expect(r.afterText).toBe(r.beforeText);
  });
});
