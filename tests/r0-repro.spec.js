// R0 — 코드 검토에서 찾은 버그 재현 테스트.
// 이 파일의 테스트는 "고친 뒤의 올바른 동작"을 기대한다. 고치기 전에는 실패하는 것이 정상.
// R1~R3 묶음에서 해당 항목을 고치면 하나씩 통과해야 한다.
import { test, expect } from './helpers/fixtures.js';

// 빨간 픽셀(알파>128)의 왼쪽 위 좌표. 없으면 null.
const BBOX_FN = `
  (cx, w, h) => {
    const d = cx.getImageData(0, 0, w, h).data;
    let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 128) {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
    }
    return maxX < 0 ? null : { minX, minY, maxX, maxY };
  }`;

async function blank(page) { await page.goto('/tests/e1-helpers.js'); }

test.describe('R0 — 검토 재현', () => {
  // ── R1-1 배율에 따라 그룹 자식 위치가 달라짐 ─────────────────────────────
  test('[R1-1] 그룹 위치(기준점)가 0이 아니어도 배율 1·2·0.5 결과 위치가 같다', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async (BB) => {
      const bbox = eval(BB);
      const H = await import('/tests/e1-helpers.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = createDoc({ width: 100, height: 100, fps: 10, frameCount: 2 });
      const s = createLayer('shape', { name: 's' });
      s.shape = { kind: 'rect', w: 10, h: 10, fill: '#ff0000', stroke: null };
      s.transform.x.value = 70; s.transform.y.value = 70;
      const g = createLayer('group', { name: 'g', childOrder: [s.id] });
      g.transform.x.value = 50; g.transform.y.value = 50;
      s.parentId = g.id; doc.layers[s.id] = s; doc.layers[g.id] = g; doc.order.push(g.id);
      const out = {};
      for (const sc of [1, 2, 0.5]) {
        const eng = createRenderEngine({ createCanvas: H.createCanvas });
        const w = Math.round(100 * sc); const c = H.createCanvas(w, w);
        const cx = c.getContext('2d', { willReadFrequently: true });
        eng.renderFrame(cx, doc, 0, { scale: sc });
        out[sc] = bbox(cx, w, w).minX / sc;
      }
      return out;
    }, BBOX_FN);
    expect(r[1]).toBeCloseTo(65, 0);
    expect(Math.abs(r[2] - r[1])).toBeLessThanOrEqual(1);
    expect(Math.abs(r[0.5] - r[1])).toBeLessThanOrEqual(2);
  });

  // ── R1-1 배율에 따라 카메라 결과가 달라짐 ───────────────────────────────
  test('[R1-1] 카메라 x=20·줌 1.5 문서를 배율 1·2·3 으로 그려도 위치가 같다', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async (BB) => {
      const bbox = eval(BB);
      const H = await import('/tests/e1-helpers.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = createDoc({ width: 100, height: 100, fps: 10, frameCount: 2 });
      const s = createLayer('shape', { name: 's' });
      s.shape = { kind: 'rect', w: 10, h: 10, fill: '#ff0000', stroke: null };
      s.transform.x.value = 50; s.transform.y.value = 50;
      doc.layers[s.id] = s; doc.order.push(s.id);
      doc.camera.x.value = 20; doc.camera.zoom.value = 1.5;
      const out = {};
      for (const sc of [1, 2, 3]) {
        const eng = createRenderEngine({ createCanvas: H.createCanvas });
        const w = 100 * sc; const c = H.createCanvas(w, w);
        const cx = c.getContext('2d', { willReadFrequently: true });
        eng.renderFrame(cx, doc, 0, { scale: sc });
        const b = bbox(cx, w, w);
        out[sc] = b ? b.minX / sc : null;
      }
      return out;
    }, BBOX_FN);
    expect(r[1]).not.toBeNull();
    expect(Math.abs(r[2] - r[1])).toBeLessThanOrEqual(1);
    expect(Math.abs(r[3] - r[1])).toBeLessThanOrEqual(1);
  });

  // ── R1-2 인스턴스 레이어가 화면 일부만 그릴 때(view) 사라짐 ──────────────
  test('[R1-2] 인스턴스 레이어: view 로 일부만 그려도 그룹과 같은 자리', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async (BB) => {
      const bbox = eval(BB);
      const H = await import('/tests/e1-helpers.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = createDoc({ width: 100, height: 100, fps: 10, frameCount: 2 });
      const s = createLayer('shape', { name: 's' });
      s.shape = { kind: 'rect', w: 10, h: 10, fill: '#ff0000', stroke: null };
      s.transform.x.value = 70; s.transform.y.value = 70;
      const g = createLayer('group', { name: 'g', childOrder: [s.id] });
      s.parentId = g.id; g.visible = false;
      const inst = createLayer('instance', { name: 'i', masterId: g.id });
      doc.layers[s.id] = s; doc.layers[g.id] = g; doc.layers[inst.id] = inst; doc.order.push(g.id, inst.id);
      const view = { x: 40, y: 40, w: 60, h: 60 };
      const eng = createRenderEngine({ createCanvas: H.createCanvas });
      const c = H.createCanvas(60, 60); const cx = c.getContext('2d', { willReadFrequently: true });
      eng.renderFrame(cx, doc, 0, { scale: 1, view });
      return bbox(cx, 60, 60);
    }, BBOX_FN);
    expect(r).not.toBeNull();
    expect(r.minX).toBeCloseTo(25, 0);
    expect(r.minY).toBeCloseTo(25, 0);
  });

  // ── R1-3 글자: 왼쪽/오른쪽 정렬 잘림 + 글자 간격 켜면 정렬이 바뀜 ──────
  test('[R1-3] 한글 왼쪽·오른쪽 정렬이 잘리지 않고, 글자 간격 0.001 이어도 위치가 같다', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async (BB) => {
      const bbox = eval(BB);
      const H = await import('/tests/e1-helpers.js');
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const W = 3000, TXT = '가나다라마바사아자차카타파하';
      function box(align, ls) {
        const doc = createDoc({ width: W, height: 200, fps: 10, frameCount: 2 });
        const t = createLayer('text', { name: 't' });
        Object.assign(t, { text: TXT, size: 48, align, color: '#ff0000', letterSpacing: ls, font: 'sans-serif' });
        t.transform.x.value = 1500; t.transform.y.value = 100;
        doc.layers[t.id] = t; doc.order.push(t.id);
        const eng = createRenderEngine({ createCanvas: H.createCanvas });
        const c = H.createCanvas(W, 200); const cx = c.getContext('2d', { willReadFrequently: true });
        eng.renderFrame(cx, doc, 0, {});
        const b = bbox(cx, W, 200);
        return [b.minX - 1500, b.maxX - 1500];
      }
      const mc = H.createCanvas(1, 1).getContext('2d'); mc.font = '400 48px sans-serif';
      return {
        tw: mc.measureText(TXT).width,
        left0: box('left', 0), left1: box('left', 0.001),
        right0: box('right', 0), right1: box('right', 0.001),
        center0: box('center', 0), center1: box('center', 0.001),
      };
    }, BBOX_FN);
    const span = (b) => b[1] - b[0];
    // 잘림 없음: 그려진 폭이 실제 글자 폭의 95% 이상
    expect(span(r.left0)).toBeGreaterThan(r.tw * 0.95);
    expect(span(r.right0)).toBeGreaterThan(r.tw * 0.95);
    // 정렬 기준: 왼쪽 정렬은 앵커에서 시작, 오른쪽 정렬은 앵커에서 끝
    expect(r.left0[0]).toBeGreaterThanOrEqual(-4);
    expect(r.left0[0]).toBeLessThanOrEqual(8);
    expect(r.right0[1]).toBeLessThanOrEqual(4);
    expect(r.right0[1]).toBeGreaterThanOrEqual(-8);
    // 글자 간격(글자별 그리기 경로)으로 바뀌어도 같은 자리(±3px)
    for (const k of ['left', 'right', 'center']) {
      expect(Math.abs(r[k + '1'][0] - r[k + '0'][0])).toBeLessThanOrEqual(3);
    }
  });

  // ── R2-1 키 여러 칸 끌기 ───────────────────────────────────────────────
  test('[R2-1] 키를 한 칸씩 4번 끌면 4칸 이동, 선택도 따라간다', async ({ page }) => {
    await page.goto('/?demo=simple');
    await page.waitForSelector('.tl-row', { timeout: 10000 });
    const id = await page.evaluate(() => { const d = window.__store.get(); for (const i of d.order) if (d.layers[i].name === '사각형') return i; });
    await page.evaluate((id) => {
      window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 100, f: 2 });
      window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 200, f: 12 });
      window.__editorState.set({ tlSnap: false });
    }, id);
    await page.waitForTimeout(150);
    const box = await page.locator('.track-body-canvas').boundingBox();
    const info = await page.evaluate((id) => {
      const doc = window.__store.get(); const rows = [...doc.order].reverse();
      const cw = document.querySelector('.track-body-canvas').getBoundingClientRect().width;
      return { idx: rows.indexOf(id), cell: cw / doc.meta.frameCount };
    }, id);
    const y = box.y + info.idx * 28 + 14;
    const x0 = box.x + 2 * info.cell + info.cell / 2;
    await page.mouse.move(x0, y); await page.mouse.down();
    for (let k = 1; k <= 4; k++) { await page.mouse.move(x0 + k * info.cell, y); await page.waitForTimeout(20); }
    await page.mouse.up();
    const r = await page.evaluate((id) => ({
      keys: window.__store.get().layers[id].transform.x.keys.map((k) => k.f),
      sel: window.__editorState.get().kfSelection.map((s) => s.f),
      depth: window.__store.undoDepth(),
    }), id);
    expect(r.keys).toEqual([6, 12]);
    expect(r.sel).toEqual([6]);
  });

  // ── R2-2 드래그 중 되돌리기 ────────────────────────────────────────────
  test('[R2-2] begin~commit 사이 undo/redo 는 무시된다(기록이 꼬이지 않음)', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const doc = createDoc();
      const s = createLayer('shape', { name: 's' }); s.transform.x.value = 0;
      doc.layers[s.id] = s; doc.order.push(s.id);
      const st = createStore(doc);
      const X = () => st.get().layers[s.id].transform.x.value;
      st.apply({ type: 'setProp', id: s.id, path: 'transform.x', value: 10 });
      st.begin('drag');
      st.preview({ type: 'setProp', id: s.id, path: 'transform.x', value: 50 });
      st.undo(); st.redo();
      const mid = X();
      st.commit();
      const afterCommit = X();
      st.undo();
      const u1 = X();
      st.undo();
      const u2 = X();
      return { mid, afterCommit, u1, u2 };
    });
    expect(r).toEqual({ mid: 50, afterCommit: 50, u1: 10, u2: 0 });
  });

  // ── R2-3 키 값 수정 시 이징 유지 ───────────────────────────────────────
  test('[R2-3] 이미 있는 키의 값만 바꾸면 이징·베지어가 유지된다', async ({ page }) => {
    await blank(page);
    const k = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const doc = createDoc();
      const s = createLayer('shape', { name: 's' });
      s.transform.x = { value: 0, keys: [{ f: 0, v: 0, ease: 'cubicBezier', bezier: [0.2, 0, 0.2, 1] }, { f: 10, v: 50, ease: 'linear' }] };
      doc.layers[s.id] = s; doc.order.push(s.id);
      const st = createStore(doc);
      st.apply({ type: 'setProp', id: s.id, path: 'transform.x', value: 5, f: 0 });
      st.apply({ type: 'setCameraProp', prop: 'x', value: 1, f: 0, ease: 'easeIn' });
      st.apply({ type: 'setCameraProp', prop: 'x', value: 2, f: 0 });
      return { layerKey: st.get().layers[s.id].transform.x.keys[0], camKey: st.get().camera.x.keys[0] };
    });
    expect(k.layerKey).toEqual({ f: 0, v: 5, ease: 'cubicBezier', bezier: [0.2, 0, 0.2, 1] });
    expect(k.camKey.ease).toBe('easeIn');
  });

  // ── R2-4 캔버스 크기 바꾸기(가운데 맞춤) + 키프레임 ──────────────────────
  test('[R2-4] resizeCanvas recenter: 키프레임이 있는 위치도 같이 옮겨진다', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const { evalProp } = await import('/src/core/anim/prop.js');
      const doc = createDoc({ width: 100, height: 100 });
      const s = createLayer('shape', { name: 's' });
      s.transform.x = { value: 50, keys: [{ f: 0, v: 50, ease: 'linear' }, { f: 10, v: 60, ease: 'linear' }] };
      doc.layers[s.id] = s; doc.order.push(s.id);
      const st = createStore(doc);
      st.apply({ type: 'resizeCanvas', width: 200, height: 200, recenter: true });
      const x = st.get().layers[s.id].transform.x;
      st.undo();
      return { f0: evalProp(x, 0), f10: evalProp(x, 10), undone: evalProp(st.get().layers[s.id].transform.x, 0) };
    });
    expect(r).toEqual({ f0: 100, f10: 110, undone: 50 });
  });

  // ── R2-5 그룹과 그 자식을 함께 선택해 복제 ──────────────────────────────
  test('[R2-5] 그룹+자식 동시 복제: 모든 레이어가 정확히 한 부모에만 있다', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const doc = createDoc();
      const s = createLayer('shape', { name: 's' });
      const g = createLayer('group', { name: 'g', childOrder: [s.id] });
      s.parentId = g.id; doc.layers[s.id] = s; doc.layers[g.id] = g; doc.order.push(g.id);
      const st = createStore(doc);
      st.apply({ type: 'duplicateLayers', ids: [g.id, s.id] });
      const d = st.get(); const count = {};
      for (const id of d.order) count[id] = (count[id] ?? 0) + 1;
      for (const l of Object.values(d.layers)) for (const c of (l.childOrder ?? [])) count[c] = (count[c] ?? 0) + 1;
      return { n: Object.keys(d.layers).length, bad: Object.entries(count).filter(([, n]) => n !== 1).length };
    });
    expect(r.n).toBe(4);
    expect(r.bad).toBe(0);
  });

  // ── R2-6 움직이는 이미지 레이어 클릭 판정 ───────────────────────────────
  test('[R2-6] anim 레이어도 첫 프레임 크기로 클릭 범위를 계산한다', async ({ page }) => {
    await blank(page);
    const r = await page.evaluate(async () => {
      const { createLayer } = await import('/src/core/doc/schema.js');
      const { getLayerBounds } = await import('/src/ui/canvas/hit.js');
      const a = createLayer('anim', { name: 'a', assetId: 'A' });
      const bmp = await createImageBitmap(new ImageData(20, 10));
      return getLayerBounds(a, { getBitmap: () => null, getAnimFrames: () => ({ frames: [bmp], delays: [100] }) });
    });
    expect(r).not.toBeNull();
    expect(r.hw).toBe(10);
    expect(r.hh).toBe(5);
  });

  // ── R3-1 메모리 경고만 나오는 큰 문서: 크래시·무한 대기 없이 알림 ───────
  test('[R3-1] 큰 문서: fitToTarget 은 읽을 수 있는 오류, 인코더는 잘못된 입력에도 멈추지 않는다', async ({ page }) => {
    test.setTimeout(60000);
    await blank(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { fitToTarget } = await import('/src/export/fit.js');
      const doc = createDoc({ width: 1920, height: 1080, fps: 30, frameCount: 60 });
      const out = {};
      try { await fitToTarget(doc, { id: 'gif-any', format: 'gif' }, { createCanvas: H.createCanvas }); out.fit = 'ok'; }
      catch (e) { out.fit = e.message; out.fitCode = e.code ?? null; }
      // 인코더에 잘못된 입력이 가도 Promise 가 끝나야 한다(지금은 영원히 대기).
      const { encode } = await import('/src/export/encode.js');
      const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 5000);
      try { await encode({ width: 4, height: 4 /* frames 없음 */ }, 'apng', {}, { signal: ac.signal }); out.enc = 'ok'; }
      catch (e) { out.enc = e.name; }
      clearTimeout(timer);
      return out;
    });
    expect(r.fit).not.toMatch(/Cannot read|null|undefined/);
    expect(r.fitCode).toBe('memory');
    expect(r.enc).not.toBe('AbortError'); // 5초 안에 일반 오류로 끝나야 한다
  });
});
