// P6 보완2 성능 표 측정 (item 19) — dpr 1 / dpr 2
// 실행: npx playwright test tests/perf/table.spec.js --config=playwright.perf.config.js
import { test } from '@playwright/test';

async function measure(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage && window.__editorState));
  await page.waitForTimeout(300);

  // 레이어 하나 선택 (드래그 측정용)
  await page.evaluate(() => {
    const doc = window.__store.get();
    const id = doc.order.find(i => doc.layers[i].name === '사각형') ?? doc.order[1];
    window.__editorState.set({ selection: [id] });
  });
  await page.waitForTimeout(100);

  // 1) 스크럽 중 장면 그리기 전체(체커 포함) 평균
  const scrub = await page.evaluate(async () => {
    const st = window.__stage, es = window.__editorState;
    const fc = window.__store.get().meta.frameCount ?? 24;
    st.resetSceneStats();
    for (let pass = 0; pass < 3; pass++) {
      for (let f = 0; f < fc; f++) {
        es.set({ f });
        await new Promise(r => requestAnimationFrame(r));
      }
    }
    return st.getSceneStats();
  });

  // 2) 레이어 드래그 중 화면 반영 (pointermove → scene 지연)
  const box = await page.locator('.stage-overlay').boundingBox();
  const start = await page.evaluate(() => {
    const doc = window.__store.get();
    const id  = window.__editorState.get().selection[0];
    const l   = doc.layers[id];
    const s   = window.__stage.docToScreen(l.transform.x.value, l.transform.y.value);
    return { sx: s.x, sy: s.y };
  });
  const cx = box.x + start.sx, cy = box.y + start.sy;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) {
    await page.mouse.move(cx + i * 2, cy + i, { steps: 1 });
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  const latency = await page.evaluate(() => window.__stage.getLatencyStats());

  // 3) 보조 표시만 바뀐 경우 장면 재렌더 0회 (선택 변경)
  const sceneRerender = await page.evaluate(async () => {
    const st = window.__stage, es = window.__editorState;
    const doc = window.__store.get();
    const before = st.sceneRenderCount;
    // 선택만 토글 (scene 트리거 아님)
    const other = doc.order.find(i => doc.layers[i].name === '원') ?? doc.order[2];
    es.set({ selection: [other] });
    await new Promise(r => requestAnimationFrame(r));
    await new Promise(r => requestAnimationFrame(r));
    return st.sceneRenderCount - before;
  });

  const dpr = await page.evaluate(() => window.devicePixelRatio);
  return { dpr, scrub, latency, sceneRerender };
}

function report(label, r) {
  const line = (k, v) => console.log(`  [${label}] ${k}: ${v}`);
  console.log(`\n=== 성능 표 (${label}, dpr=${r.dpr}) ===`);
  line('스크럽 장면 그리기 평균(ms)', r.scrub ? r.scrub.avg.toFixed(2) : 'n/a');
  line('스크럽 장면 그리기 최대(ms)', r.scrub ? r.scrub.max.toFixed(2) : 'n/a');
  line('드래그 지연 평균(ms)',       r.latency ? r.latency.avg.toFixed(2) : 'n/a');
  line('드래그 지연 최대(ms)',       r.latency ? r.latency.max.toFixed(2) : 'n/a');
  line('선택만 변경 시 scene 재렌더(회)', r.sceneRerender);
}

test.describe('성능 표 dpr1', () => {
  test('측정', async ({ page }) => { report('dpr1', await measure(page)); });
});

test.describe('성능 표 dpr2', () => {
  test.use({ deviceScaleFactor: 2 });
  test('측정', async ({ page }) => { report('dpr2', await measure(page)); });
});
