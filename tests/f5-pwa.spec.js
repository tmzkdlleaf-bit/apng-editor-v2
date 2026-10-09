// F5-5 — 오프라인 설치(PWA): 서비스 워커 등록 → 오프라인 새로고침 시 앱 열림.
import { test, expect } from '@playwright/test';

test('F5-5 — 서비스 워커 설치 후 오프라인에서 새로고침 → 앱 열림·기존 프로젝트 열림', async ({ page, context }) => {
  await page.addInitScript(() => {
    window.__noReload = true;                 // 앱의 controllerchange 자동 reload 억제(테스트가 직접 reload)
    try { localStorage.setItem('apng2.onboarded', '1'); } catch {}
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);

  // 서비스 워커가 페이지를 제어할 때까지(활성화+claim)
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });

  // 온라인 재로드 — 모든 모듈 fetch 가 SW 를 거쳐 캐시에 담기게 한다
  await page.reload();
  await page.waitForFunction(() => !!window.__store);
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });
  await page.waitForTimeout(500); // 런타임 캐시 flush 여유

  const curId = await page.evaluate(() => window.__project?.getId?.() ?? null);

  // 오프라인으로 전환 후 새로고침 → 캐시에서 앱이 열려야 한다
  await context.setOffline(true);
  await page.reload();
  const ok = await page.waitForFunction(() => !!(window.__store && window.__stage), null, { timeout: 15000 }).then(() => true).catch(() => false);
  await context.setOffline(false);

  expect(ok).toBe(true);
  // 기존 프로젝트(IndexedDB)가 오프라인에서도 열림
  const curId2 = await page.evaluate(() => window.__project?.getId?.() ?? null);
  expect(curId2).toBe(curId);
});
