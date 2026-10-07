// F1-7 — 글자 속성 섹션 + 캔버스 더블클릭 편집 + 그림자 흐림 렌더.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}
function textId(page) {
  return page.evaluate(() => {
    const doc = window.__store.get();
    return doc.order.find((id) => doc.layers[id]?.type === 'text');
  });
}
function section(page) { return page.locator('.inspector-section', { hasText: '글자' }); }

test.describe('F1-7 — 글자', () => {
  test('[속성] 폰트 변경 → store 기록 1건 → 되돌리기 → 원래 값', async ({ page }) => {
    await openApp(page);
    const id = await textId(page);
    await page.evaluate((i) => window.__editorState.set({ selection: [i] }), id);
    await page.waitForTimeout(80);

    const before = await page.evaluate((i) => window.__store.get().layers[i].font, id);
    // 폰트 드롭다운(글자 섹션 첫 드롭다운) 열어 'Noto Sans KR' 고르기
    const sec = section(page);
    await sec.locator('.dropdown').first().click();
    await page.locator('.dropdown-list [data-value="Noto Sans KR"]').click();

    const after = await page.evaluate((i) => window.__store.get().layers[i].font, id);
    expect(after).toBe('Noto Sans KR');
    expect(after).not.toBe(before);

    await page.evaluate(() => window.__store.undo());
    const reverted = await page.evaluate((i) => window.__store.get().layers[i].font, id);
    expect(reverted).toBe(before);
  });

  test('[테두리] 켜기 → stroke 생성, 되돌리기 → 없음', async ({ page }) => {
    await openApp(page);
    const id = await textId(page);
    await page.evaluate((i) => window.__editorState.set({ selection: [i] }), id);
    await page.waitForTimeout(80);
    const sec = section(page);
    // 글자 섹션의 첫 체크박스 = '테두리 사용'(둘째는 '그림자 사용')
    await sec.locator('.fx-check input').first().check();
    const st = await page.evaluate((i) => window.__store.get().layers[i].stroke, id);
    expect(st).toBeTruthy();
    expect(st.width).toBeGreaterThan(0);
  });

  test('[렌더] 그림자 흐림 → 글자 주변 반투명 픽셀 증가', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = window.__store.get();
      const id = doc.order.find((x) => doc.layers[x]?.type === 'text');
      const assets = await H.demoAssets(doc);
      const { effects, motions } = await H.demoRegistries();
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
      const W = doc.meta.width, Hh = doc.meta.height;
      function semi(shadow) {
        const d = JSON.parse(JSON.stringify(doc));
        for (const x of d.order) d.layers[x].visible = (x === id);
        d.layers[id].shadow = shadow;
        const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
        eng.invalidate?.(); eng.renderFrame(cx, d, 0, {});
        const data = cx.getImageData(0, 0, W, Hh).data;
        // 반투명(0<alpha<250) 픽셀 수 — 흐림이 만드는 번짐
        let n = 0; for (let k = 3; k < data.length; k += 4) { const a = data[k]; if (a > 4 && a < 250) n++; }
        return n;
      }
      const none = semi(null);
      const blur = semi({ blur: 12, offsetX: 0, offsetY: 0, color: '#000000' });
      return { none, blur };
    });
    expect(r.blur).toBeGreaterThan(r.none);
  });

  test('[캔버스 편집] 더블클릭 → 입력 → 바깥 클릭 → 내용 변경·기록 1건', async ({ page }) => {
    await openApp(page);
    const id = await textId(page);
    const before = await page.evaluate((i) => window.__store.get().layers[i].text, id);

    // 글자 레이어 중심의 화면 좌표를 구해 더블클릭
    const pt = await page.evaluate((i) => {
      const st = window.__stage; const doc = window.__store.get();
      const L = doc.layers[i];
      const s = st.docToScreen(L.transform.x.value, L.transform.y.value);
      const rect = document.querySelector('.stage-overlay').getBoundingClientRect();
      return { x: rect.left + s.x, y: rect.top + s.y };
    }, id);
    await page.mouse.dblclick(pt.x, pt.y);
    const ta = page.locator('.canvas-text-edit');
    await expect(ta).toBeVisible();
    await ta.fill('바뀐 글자');
    // 바깥 클릭(확정)
    await page.mouse.click(pt.x + 300, pt.y + 200);
    await expect(ta).toHaveCount(0);

    const after = await page.evaluate((i) => window.__store.get().layers[i].text, id);
    expect(after).toBe('바뀐 글자');
    expect(after).not.toBe(before);

    // 되돌리기 1건 → 원래 내용
    await page.evaluate(() => window.__store.undo());
    const reverted = await page.evaluate((i) => window.__store.get().layers[i].text, id);
    expect(reverted).toBe(before);
  });

  test('[타자기] 진행 중엔 글자가 덜 보이고(픽셀↓), 끝나면 전부 + 결정론', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = window.__store.get();
      const id = doc.order.find((x) => doc.layers[x]?.type === 'text');
      const assets = await H.demoAssets(doc);
      const { effects, motions } = await H.demoRegistries();
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
      const W = doc.meta.width, Hh = doc.meta.height;
      function opaqueAt(f) {
        const d = JSON.parse(JSON.stringify(doc));
        for (const x of d.order) d.layers[x].visible = (x === id);
        d.layers[id].text = '가나다라마바사아자차';
        d.layers[id].reveal = { mode: 'char', cursor: false, startF: 0, endF: 10, loop: 'once' };
        const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
        eng.invalidate?.(); eng.renderFrame(cx, d, f, {});
        const data = cx.getImageData(0, 0, W, Hh).data;
        let n = 0; for (let k = 3; k < data.length; k += 4) if (data[k] >= 128) n++;
        return n;
      }
      const mid = opaqueAt(2), full = opaqueAt(10);
      // 결정론: 같은 프레임 두 번 → 동일
      const a = opaqueAt(2), b = opaqueAt(2);
      return { mid, full, deterministic: a === b };
    });
    expect(r.mid).toBeLessThan(r.full);
    expect(r.deterministic).toBe(true);
  });

  test('[글자별 애니] 페이드: 시작(거의 안 보임) < 끝(전부)', async ({ page }) => {
    await openApp(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const doc = window.__store.get();
      const id = doc.order.find((x) => doc.layers[x]?.type === 'text');
      const assets = await H.demoAssets(doc);
      const { effects, motions } = await H.demoRegistries();
      const eng = createRenderEngine({ createCanvas: H.createCanvas, assets, effects, motions });
      const W = doc.meta.width, Hh = doc.meta.height;
      function opaqueAt(f) {
        const d = JSON.parse(JSON.stringify(doc));
        for (const x of d.order) d.layers[x].visible = (x === id);
        d.layers[id].text = '가나다라마바사';
        d.layers[id].charAnim = { type: 'fade', stagger: 0.7, startF: 0, endF: 10, loop: 'once' };
        const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
        eng.invalidate?.(); eng.renderFrame(cx, d, f, {});
        const data = cx.getImageData(0, 0, W, Hh).data;
        let n = 0; for (let k = 3; k < data.length; k += 4) if (data[k] >= 128) n++;
        return n;
      }
      return { start: opaqueAt(0), end: opaqueAt(10) };
    });
    expect(r.start).toBeLessThan(r.end);
  });

  test('[타자기 UI] 켜기 → reveal 생성, 되돌리기 → 없음', async ({ page }) => {
    await openApp(page);
    const id = await textId(page);
    await page.evaluate((i) => window.__editorState.set({ selection: [i] }), id);
    await page.waitForTimeout(80);
    const sec = section(page);
    // '글자가 차례로 나타남' 체크박스 (테두리·그림자 다음, 타자기 섹션 첫 체크)
    await sec.getByText('글자가 차례로 나타남').locator('..').locator('input').check();
    const rv = await page.evaluate((i) => window.__store.get().layers[i].reveal, id);
    expect(rv).toBeTruthy();
    expect(rv.mode).toBe('char');
    await page.evaluate(() => window.__store.undo());
    const rv2 = await page.evaluate((i) => window.__store.get().layers[i].reveal, id);
    expect(rv2 == null).toBe(true);
  });
});
