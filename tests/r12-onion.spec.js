// R12-2 — 앞뒤 프레임 겹쳐 보기. 켜면 장면이 달라지고(겹쳐 그려짐), 끄면 원래대로,
// 재생 중엔 숨김(= 끈 것과 같음), 내보내기 바이트는 켜기 전후 같음(미리보기 전용).
// 배경 체커가 캔버스를 덮어 "칠해진 픽셀 수"로는 못 재므로, 두 상태의 픽셀 차이로 판정한다.
// 주의: 화면 전체 픽셀을 Node 로 옮기면(Array.from) 바쁠 때 직렬화가 느려 흔들린다.
// 캡처는 브라우저 window 에 보관하고, 차이 계산도 브라우저 안에서 해서 "수"만 돌려받는다.
import { test, expect } from './helpers/fixtures.js';

async function setup(page) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window.__store && window.__stage && window.__editorState));
  await page.evaluate(async () => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const store = window.__store;
    const fc = store.get().meta.frameCount ?? 24;
    const s = createLayer('shape', { name: 'mover' });
    s.shape = { kind: 'rect', w: 40, h: 40, fill: '#20c060', stroke: null };
    const W = store.get().meta.width;
    s.transform.x = { value: 60, keys: [{ f: 0, v: 60, ease: 'linear' }, { f: fc - 1, v: W - 60, ease: 'linear' }] };
    s.transform.y.value = store.get().meta.height / 2;
    store.apply({ type: 'addLayer', layer: s, index: 0 });
    // 배율을 100%로 고정(R23d 자동 맞춤이 겹침 픽셀 수를 바꾸지 않게). viewUserAdjusted 로 다시 안 맞춤.
    window.__editorState.set({ f: 5, onion: false, onionBefore: 1, onionAfter: 1, zoom: 1, panX: 0, panY: 0, viewUserAdjusted: true });
  });
}

// 현재 장면 캔버스 픽셀을 브라우저 window 슬롯에 보관한다(2 rAF 기다려 렌더 반영).
async function capture(page, slot) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.evaluate((slot) => {
    const c = window.__stage.sceneCanvas;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const id = ctx.getImageData(0, 0, c.width, c.height);
    (window.__onionCaps ||= {})[slot] = id.data; // Uint8ClampedArray — Node 로 옮기지 않는다
  }, slot);
}

// 두 캡처의 픽셀 차이 개수를 브라우저 안에서 세어 수만 돌려받는다(임계값은 기존과 동일: RGB>16).
async function diffCount(page, slotA, slotB) {
  return page.evaluate(([a, b]) => {
    const A = window.__onionCaps[a], B = window.__onionCaps[b];
    let n = 0;
    for (let i = 0; i < A.length; i += 4) {
      if (Math.abs(A[i] - B[i]) > 16 || Math.abs(A[i + 1] - B[i + 1]) > 16 || Math.abs(A[i + 2] - B[i + 2]) > 16) n++;
    }
    return n;
  }, [slotA, slotB]);
}

test.describe('R12-2 앞뒤 프레임 겹쳐 보기', () => {
  test('[켜기/끄기] 켜면 장면이 달라지고 끄면 원래대로', async ({ page }) => {
    await setup(page);
    await capture(page, 'off1');
    await page.evaluate(() => window.__editorState.set({ onion: true }));
    await capture(page, 'on');
    await page.evaluate(() => window.__editorState.set({ onion: false }));
    await capture(page, 'off2');

    const onDiff = await diffCount(page, 'off1', 'on');
    const offDiff = await diffCount(page, 'off1', 'off2');
    expect(onDiff).toBeGreaterThan(500);   // 켜면 앞뒤 프레임이 겹쳐 눈에 띄게 달라짐
    expect(offDiff).toBeLessThanOrEqual(50); // 끄면 원래대로
  });

  test('[재생 중 숨김] playing=true 면 겹쳐 보기가 숨는다', async ({ page }) => {
    await setup(page);
    await capture(page, 'off');
    await page.evaluate(() => window.__editorState.set({ onion: true, playing: true }));
    await capture(page, 'playingOn');
    expect(await diffCount(page, 'off', 'playingOn')).toBeLessThanOrEqual(50); // 재생 중엔 끈 것과 같다
  });

  test('[내보내기 무관] 겹쳐 보기 켜기 전후 내보내기 바이트 동일', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(async () => {
      const { exportAnimation } = await import('/src/export/index.js');
      const createCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      const doc = window.__store.get();
      window.__editorState.set({ onion: false });
      const a = await exportAnimation(doc, { format: 'apng', createCanvas, name: 't' });
      window.__editorState.set({ onion: true, onionBefore: 3, onionAfter: 3 });
      const b = await exportAnimation(doc, { format: 'apng', createCanvas, name: 't' });
      return { a: a.bytes, b: b.bytes };
    });
    expect(r.b).toBe(r.a);
  });
});
