// F3-5 — 모션 기록: 키 줄이기 + 녹화 적용(입력과 오차 2px 이내) + 버튼.
import { test, expect } from '@playwright/test';

test('F3-5 — reduceKeys: 직선 위 중간 점 제거, 꺾이는 점 유지', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => true);
  const r = await page.evaluate(async () => {
    const { reduceKeys } = await import('/src/ui/motion-record.js');
    // 0,10,20,30,40 → 직선(v=f*2): 중간 다 제거(양끝만)
    const line = [0, 1, 2, 3, 4].map((i) => ({ f: i * 10, v: i * 20 }));
    const red1 = reduceKeys(line, 2);
    // 가운데서 확 꺾임 → 그 점 유지
    const bent = [{ f: 0, v: 0 }, { f: 10, v: 0 }, { f: 20, v: 100 }, { f: 30, v: 100 }];
    const red2 = reduceKeys(bent, 2);
    return { red1: red1.length, red2: red2.map((k) => k.f) };
  });
  expect(r.red1).toBe(2);                 // 직선 → 양끝만
  expect(r.red2).toContain(20);           // 꺾이는 점 유지
});

test('F3-5 — 녹화 적용: 재생 시 경로가 입력과 오차 2px 이내', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  const r = await page.evaluate(async () => {
    const { applyRecordedPath } = await import('/src/ui/motion-record.js');
    const { evalProp } = await import('/src/core/anim/prop.js');
    const doc = window.__store.get();
    const id = doc.order.find((x) => doc.layers[x]?.type === 'image');
    // 2초(24프레임) 동안 원을 그리는 입력 샘플
    const samples = [];
    const N = 24;
    for (let f = 0; f < N; f++) {
      const a = (f / N) * Math.PI * 2;
      samples.push({ f, x: 384 + Math.cos(a) * 100, y: 384 + Math.sin(a) * 100 });
    }
    applyRecordedPath(window.__store, id, samples, 2);
    const L = window.__store.get().layers[id];
    // 각 프레임에서 입력과 비교
    let maxErr = 0;
    for (const s of samples) {
      const dx = evalProp(L.transform.x, s.f) - s.x;
      const dy = evalProp(L.transform.y, s.f) - s.y;
      maxErr = Math.max(maxErr, Math.hypot(dx, dy));
    }
    return { xKeys: L.transform.x.keys.length, maxErr };
  });
  expect(r.xKeys).toBeGreaterThan(2);    // 키가 생겼고(줄였지만 곡선이라 여러 개)
  expect(r.maxErr).toBeLessThanOrEqual(2); // 입력과 오차 2px 이내
});

test('F3-5 — 기록 버튼이 머리줄에 있다', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await expect(page.locator('.timeline-head .tl-rec-btn')).toBeVisible();
});
