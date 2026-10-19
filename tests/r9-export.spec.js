// R9 — 용량 맞추기 방식(점수) · 큰 캔버스(메모리) 내보내기.
import { test, expect } from '@playwright/test';

async function gotoDemo(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(200);
}

test.describe('R9-1 맞추기 방식', () => {
  // 세 방식이 규칙대로: 크기 유지=배율1, 색 유지=화질 최고(무손실), 화질 우선=점수 최고.
  test('[방식] keepSize=배율1 · keepColor=최고화질 · quality=점수최고', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { fitToTarget } = await import('/src/export/fit.js');
      const doc = H.movingShapeDoc({ width: 160, height: 160, fps: 10, frameCount: 6, x0: 16, x1: 144 });
      const deps = { createCanvas: H.createCanvas };
      const full = await fitToTarget(doc, { id: 'p', format: 'apng', targetBytes: Number.MAX_SAFE_INTEGER }, deps, {});
      const target = full.bytes - 1; // 1배 무손실 바로 아래 — 작은 크기(무손실)는 확실히 든다
      const run = async (mode) => {
        const logs = [];
        const res = await fitToTarget(doc, { id: 'p', format: 'apng', targetBytes: target }, { ...deps, mode }, { onLog: (e) => logs.push(e) });
        const chosen = logs.filter((l) => l.chosen).map((l) => l.score);
        return { scaleMul: res.settings.scaleMul, colors: res.settings.colors, reached: res.reached, score: res.settings.score, maxScore: chosen.length ? Math.max(...chosen) : null };
      };
      return { keepSize: await run('keepSize'), keepColor: await run('keepColor'), quality: await run('quality') };
    });
    // 크기 유지: 항상 배율 1
    expect(r.keepSize.scaleMul).toBe(1);
    // 색 유지: 화질 최고(APNG 무손실=colors 0) 고정, 크기만 조절
    expect(r.keepColor.colors).toBe(0);
    // 화질 우선: 점수 최고 후보가 선택됨
    expect(r.quality.reached).toBe(true);
    expect(r.quality.score).toBeCloseTo(r.quality.maxScore, 5);
  });

  // 화질 우선 점수 규칙: "75% 크기 고화질"이 "1배 저화질"보다 점수가 높다(예전 방식이 뒤집힌다).
  test('[화질 우선] 점수 규칙: 작은 크기 고화질 > 1배 저화질', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { qualityCoef } = await import('/src/export/fit.js');
      const s = (mul, o) => mul * mul * qualityCoef('apng', o);
      return {
        full32: s(1, { colors: 32 }),          // 0.45
        three256: s(0.75, { colors: 256 }),    // 0.5175
        threeLossless: s(0.75, { colors: 0 }), // 0.5625
        halfLossless: s(0.5, { colors: 0 }),   // 0.25
      };
    });
    expect(r.three256).toBeGreaterThan(r.full32);       // 75% 256색 > 1배 32색
    expect(r.threeLossless).toBeGreaterThan(r.full32);  // 75% 무손실 > 1배 32색
    expect(r.full32).toBeGreaterThan(r.halfLossless);   // 1배 32색 > 50% 무손실(균형)
  });

  // 가지치기: 큰 크기에서 괜찮은 화질이 맞으면 작은 크기는 굽지 않는다(굽기 1회).
  test('[가지치기] 1배에서 맞으면 bake 1회', async ({ page }) => {
    await gotoDemo(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { fitToTarget } = await import('/src/export/fit.js');
      const { getPreset } = await import('/src/export/presets.js');
      const { doc, deps } = await H.demoDeps();
      const res = await fitToTarget(doc, getPreset('ccfolia-apng'), deps, {});
      return { bakeCount: res.bakeCount, scaleMul: res.settings.scaleMul, reached: res.reached };
    });
    expect(r.reached).toBe(true);
    expect(r.scaleMul).toBe(1);
    expect(r.bakeCount).toBe(1);
  });
});

test.describe('R9-2 큰 캔버스 메모리', () => {
  // 새 굽기 경로(복사 없이 transfer)의 결과가 예전 경로(복사)와 바이트까지 같다.
  test('[바이트 동일] move=true 와 copy 의 결과 바이트가 같다(APNG/WebP/GIF)', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { encode } = await import('/src/export/encode.js');
      const out = {};
      for (const fmt of ['apng', 'webp', 'gif']) {
        const doc = H.movingShapeDoc({ width: 24, height: 24, fps: 10, frameCount: 4, x0: 2, x1: 20 });
        const eng = createRenderEngine({ createCanvas: H.createCanvas });
        const bakedA = await bakeFrames(eng, doc, { createCanvas: H.createCanvas });
        const bakedB = await bakeFrames(eng, doc, { createCanvas: H.createCanvas });
        const a = await encode(bakedA, fmt, { loops: 0 }, {});                 // 복사
        const b = await encode(bakedB, fmt, { loops: 0 }, { moveFrames: true }); // 복사 없음
        out[fmt] = { same: a.bytes === b.bytes, a: a.bytes, b: b.bytes,
          detached: bakedB.frames[0].rgba.byteLength === 0 };
      }
      return out;
    });
    for (const fmt of ['apng', 'webp', 'gif']) {
      expect(r[fmt].same).toBe(true);        // 바이트 동일
      expect(r[fmt].detached).toBe(true);    // move=true 면 메인쪽 프레임 버퍼가 떨어져 나감(복사 없음)
    }
  });

  // 단일 내보내기(exportAnimation)는 메인에 프레임을 남기지 않는다(버퍼가 워커로 넘어감).
  test('[메모리] 단일 내보내기 후 메인 프레임 버퍼 없음', async ({ page }) => {
    await page.goto('/');
    const detached = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { encode } = await import('/src/export/encode.js');
      const doc = H.movingShapeDoc({ width: 24, height: 24, fps: 10, frameCount: 4, x0: 2, x1: 20 });
      const eng = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(eng, doc, { createCanvas: H.createCanvas });
      await encode(baked, 'apng', { loops: 0 }, { moveFrames: true });
      // 모든 프레임 rgba 버퍼가 떨어져 나갔는지(길이 0)
      return baked.frames.every((f) => f.rgba.byteLength === 0);
    });
    expect(detached).toBe(true);
  });

  // 메모리 한도: 핑퐁은 되돌아오는 구간을 재사용하므로 추정이 왕복 전 길이로 과대평가되지 않는다.
  test('[한도] 핑퐁 추정이 기준 프레임 수 기준', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      // 10프레임 핑퐁 → 왕복 18프레임이지만 추정은 10프레임 기준.
      const doc = H.movingShapeDoc({ width: 256, height: 256, fps: 10, frameCount: 10, x0: 10, x1: 240 });
      const eng = createRenderEngine({ createCanvas: H.createCanvas });
      const bytesPerFrame = 256 * 256 * 4;
      // 한도를 10프레임보다 크고 18프레임보다 작게 두면: 과거(왕복) 추정은 경고, 새 추정은 통과.
      const limitMB = (bytesPerFrame * 14) / 1024 / 1024;
      const baked = await bakeFrames(eng, doc, { createCanvas: H.createCanvas, playback: 'pingpong', maxMemoryMB: limitMB });
      return { warned: !!baked.warning, frames: baked.frames?.length ?? 0 };
    });
    expect(r.warned).toBe(false);       // 기준 10프레임 기준이라 통과
    expect(r.frames).toBeGreaterThan(10); // 핑퐁 왕복 프레임이 실제로 만들어짐
  });

  // 메모리 경고 → "○○% 크기로 내보내기" 버튼이 뜨고 누르면 그 배율로 내보내진다.
  test('[버튼] 큰 문서 메모리 경고 → 크기 줄여 내보내기 버튼', async ({ page }) => {
    test.setTimeout(90000);
    await page.addInitScript(() => { try { localStorage.setItem('apng2.onboarded', '1'); } catch {} });
    await page.goto('/');
    await page.waitForFunction(() => !!(window.__store && window.__stage));
    // 단순 도형 하나 + 큰 캔버스로 메모리 경고 유발(굽기 비용은 낮게).
    await page.evaluate(async () => {
      const { createLayer } = await import('/src/core/doc/schema.js');
      const s = createLayer('shape', { name: '네모' });
      s.shape = { kind: 'rect', w: 400, h: 400, fill: '#3388ff', stroke: null };
      s.transform.x.value = 960; s.transform.y.value = 540;
      window.__store.apply({ type: 'setMeta', patch: { width: 1920, height: 1080, frameCount: 40 } });
      window.__store.apply({ type: 'addLayer', layer: s, index: 0 });
    });
    await page.keyboard.press('Control+e');
    await expect(page.locator('.export-modal')).toBeVisible();
    // 미리보기 예상이 끝나길 잠깐 기다린 뒤 내보내기
    await page.waitForTimeout(300);
    await page.locator('#ex-run').click();
    // 메모리 버튼이 뜬다
    const memBtn = page.locator('.ex-mem-btn');
    await expect(memBtn).toBeVisible({ timeout: 20000 });
    const label = await memBtn.textContent();
    expect(label).toMatch(/\d+% 크기로/);
    // 누르면 그 배율로 다시 내보내 결과가 나온다(크기 info 갱신)
    await memBtn.click();
    await expect(page.locator('.ex-preview')).toBeVisible({ timeout: 30000 });
    const info = await page.locator('#ex-info').textContent();
    expect(info).toMatch(/\d+ × \d+/);
  });
});
