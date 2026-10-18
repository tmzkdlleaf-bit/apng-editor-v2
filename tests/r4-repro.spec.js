// R4 — R1~R3 후속 재현. 고치기 전에는 실패/대기가 정상.
import { test, expect } from '@playwright/test';

test.describe('R4 재현', () => {
  // R4-1: 카메라 줌 2에서 도형을 끌면 커서와 같은 양만큼 움직여야 한다(2배 앞서면 버그).
  test('[R4-1] 카메라 줌 2 — 끌면 레이어 값이 화면 이동/줌만큼만 바뀐다', async ({ page }) => {
    await page.goto('/?demo=simple');
    await page.waitForSelector('.tl-row', { timeout: 10000 });
    await page.waitForFunction(() => !!window.__stage);
    const info = await page.evaluate(async () => {
      const { getDocWorldTr } = await import('/src/ui/canvas/hit.js');
      const { docToScreen } = await import('/src/ui/canvas/transform.js');
      const { evalProp } = await import('/src/core/anim/prop.js');
      const store = window.__store, esApi = window.__editorState;
      let id; const d0 = store.get();
      for (const i of d0.order) if (d0.layers[i].name === '사각형') id = i;
      store.apply({ type: 'setCameraProp', prop: 'zoom', value: 2 });
      esApi.set({ selection: [id], tool: 'select', snap: false, grid: false });
      const es = esApi.get();
      const doc = store.get();
      const wtr = getDocWorldTr(doc, id, es.f);
      const overlay = document.querySelector('.stage-overlay');
      const rect = overlay.getBoundingClientRect();
      const sp = docToScreen(wtr.x, wtr.y, es.zoom, es.panX, es.panY, rect.width, rect.height, doc.meta.width, doc.meta.height);
      return {
        id, zoom: es.zoom, camZoom: 2, f: es.f,
        sx: rect.left + sp.x, sy: rect.top + sp.y,
        x0: evalProp(doc.layers[id].transform.x, es.f),
      };
    });
    await page.mouse.move(info.sx, info.sy);
    await page.mouse.down();
    await page.mouse.move(info.sx + 40, info.sy, { steps: 4 });
    await page.mouse.up();
    const x1 = await page.evaluate(async (args) => {
      const { evalProp } = await import('/src/core/anim/prop.js');
      const doc = window.__store.get();
      return evalProp(doc.layers[args.id].transform.x, args.f);
    }, { id: info.id, f: info.f });
    // 화면 40px 이동 → 레이어 값 변화 = 40 / (편집배율 × 카메라줌)
    const expected = 40 / (info.zoom * info.camZoom);
    expect(Math.abs((x1 - info.x0) - expected)).toBeLessThanOrEqual(1.5);
  });

  // R4-1: 카메라 줌 2에서 "왼쪽 정렬"이 문서 왼쪽 끝(raw 0)에 붙어야 한다.
  test('[R4-1] 카메라 줌 2 — 정렬 왼쪽이 문서 왼쪽 끝에 붙는다', async ({ page }) => {
    await page.goto('/?demo=simple');
    await page.waitForSelector('.tl-row', { timeout: 10000 });
    const r = await page.evaluate(async () => {
      const { evalProp } = await import('/src/core/anim/prop.js');
      const store = window.__store, esApi = window.__editorState;
      let id; const d0 = store.get();
      for (const i of d0.order) if (d0.layers[i].name === '사각형') id = i;
      store.apply({ type: 'setCameraProp', prop: 'zoom', value: 2 });
      esApi.set({ selection: [id] });
      const btn = document.querySelector('.align-btn[data-align="left"]');
      btn.click();
      await new Promise((r) => setTimeout(r, 20));
      // R8-1 새 의미: "보이는 화면 기준" 왼쪽 정렬 → 레이어의 화면(카메라 적용) 왼쪽 끝이 출력 프레임 0 에 붙는다.
      const { getDocWorldTr, getLayerBounds } = await import('/src/ui/canvas/hit.js');
      const doc = store.get();
      const wtr = getDocWorldTr(doc, id, esApi.get().f, { camera: true });
      const b   = getLayerBounds(doc.layers[id]);
      const sx  = (wtr.scale ?? 1) * (wtr.scaleX ?? 1);
      const screenLeft = wtr.x + ((b.ox ?? 0) - b.hw) * sx;
      return { screenLeft };
    });
    // 화면(카메라 적용) 왼쪽 끝이 출력 프레임 왼쪽(0)에 붙는다.
    expect(Math.abs(r.screenLeft)).toBeLessThanOrEqual(1.5);
  });

  // R4-2: 재사용 인코더가 워커 로딩 실패/준비 대기 중 취소에도 끝나야 한다(무한 대기 금지).
  test('[R4-2] 재사용 인코더: 워커 로딩 실패·준비 중 취소로 끝난다', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto('/tests/e1-helpers.js');

    // (1) 로딩 실패(500) → 대기 없이 바로 오류로 끝난다(1회용·재사용 모두).
    await page.route('**/encode-worker.js', (route) => route.fulfill({ status: 500, contentType: 'text/javascript', body: '' }));
    const r1 = await page.evaluate(async () => {
      const { encode, createEncoder } = await import('/src/export/encode.js');
      const baked = { width: 4, height: 4, frames: [{ rgba: new Uint8ClampedArray(4 * 4 * 4), delayMs: 100 }] };
      const out = {};
      try { await encode(baked, 'apng', {}, {}); out.one = 'ok'; } catch (e) { out.one = e.name; }
      const enc = createEncoder();
      try { await enc.encode(baked, 'apng', {}, {}); out.reuse = 'ok'; } catch (e) { out.reuse = e.name; }
      enc.dispose();
      return out;
    });
    expect(r1.one).not.toBe('ok');     // 오류로 끝남(대기 아님)
    expect(r1.reuse).not.toBe('ok');

    // (2) 로딩이 느린 경우 준비 대기 중 취소 → 1초 안에 AbortError.
    await page.unroute('**/encode-worker.js');
    await page.route('**/encode-worker.js', async (route) => { await new Promise((r) => setTimeout(r, 4000)); route.abort(); });
    const r2 = await page.evaluate(async () => {
      const { createEncoder } = await import('/src/export/encode.js');
      const baked = { width: 4, height: 4, frames: [{ rgba: new Uint8ClampedArray(4 * 4 * 4), delayMs: 100 }] };
      const enc = createEncoder();
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 1000);
      let name;
      try { await enc.encode(baked, 'apng', {}, { signal: ac.signal }); name = 'ok'; } catch (e) { name = e.name; }
      clearTimeout(timer);
      enc.dispose();
      return { reuse: name };
    });
    expect(r2.reuse).toBe('AbortError');
  });
});
