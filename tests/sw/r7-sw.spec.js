// R7-1 — 오프라인 설치: 새 버전은 "대기"하고, "새로고침" 버튼으로만 교체된다.
// dist 를 빌드해 띄우고(설정에서), 다시 빌드해 새 버전을 만든 뒤 registration.update() 로 검사.
import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

test('R7-1 — 새 버전 대기 → 막대 → 버튼 → 다시 열림, 새 캐시만 남음', async ({ page }) => {
  // 1) 첫 방문: 서비스 워커 설치·활성·제어 (localhost 이므로 ?sw=1 로 켠다)
  await page.goto('/?sw=1');
  await page.waitForFunction(() => !!window.__store, null, { timeout: 30000 });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 });
  // 모듈이 캐시에 담기도록 온라인 재로드
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 });
  await page.waitForTimeout(500);

  const v1 = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('apng2-')));
  expect(v1.length).toBe(1);

  // 2) 새 버전 빌드(버전 문자열이 빌드 시각이라 달라진다)
  execSync('npm run build', { stdio: 'inherit' });

  // 3) 등록 업데이트 → 새 워커가 "대기(waiting)" 상태로 들어와야 한다(바로 활성화 X)
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg.update();
  });
  const waiting = await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg && reg.waiting);
  }, null, { timeout: 30000 }).then(() => true).catch(() => false);
  expect(waiting).toBe(true);

  // 막대 표시
  await expect(page.locator('.pwa-update-bar')).toBeVisible({ timeout: 10000 });

  // 4) 버튼 클릭 → skip-waiting → controllerchange → location.reload
  await page.evaluate(() => { window.__r7ReloadMarker = true; });
  await page.locator('.pwa-update-bar button').click();
  // 새 문서로 다시 열리면 마커가 사라진다
  await page.waitForFunction(() => window.__r7ReloadMarker === undefined, null, { timeout: 30000 });
  await page.waitForFunction(() => !!window.__store, null, { timeout: 30000 });
  await page.waitForTimeout(500);

  // 5) 새 캐시만 남는다(이전 버전 캐시 제거)
  const v2 = await page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('apng2-')));
  expect(v2.length).toBe(1);
  expect(v2[0]).not.toBe(v1[0]);
});
