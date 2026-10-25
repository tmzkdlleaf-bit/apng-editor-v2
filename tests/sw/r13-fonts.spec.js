// R13-3 — 처음 열 때 글꼴 미리 받기 줄이기.
//   (1) sw-files.json 에 글자 레이어용 글꼴(Noto Sans/Serif KR·Black Han Sans·IBM Plex Light)이 없고
//       화면용 글꼴(IBM Plex 400/500/700·JetBrains Mono)만 있는지 + 처음 받는 총 용량 보고.
//   (2) 글자 레이어용 글꼴을 한 번 받은 뒤 오프라인 새로고침에서도 글꼴 캐시에서 나오는지.
import { test, expect } from '@playwright/test';

// 글자 레이어 전용(미리 받지 않아야 하는) 글꼴 파일.
const TEXT_ONLY = ['NotoSansKR-VF.woff2', 'NotoSerifKR-VF.woff2', 'BlackHanSans-Regular.woff2', 'IBMPlexSansKR-Light.woff2'];
// 화면(UI)용(미리 받아야 하는) 글꼴 파일.
const UI_FONTS = ['IBMPlexSansKR-Regular.woff2', 'IBMPlexSansKR-Medium.woff2', 'IBMPlexSansKR-Bold.woff2', 'JetBrainsMono-VF.woff2'];

test('R13-3 — sw-files.json 은 화면용 글꼴만 미리 받는다', async ({ page }) => {
  const res = await page.request.get('/sw-files.json');
  const files = await res.json();
  const fonts = files.filter((f) => /\/vendor\/fonts\/.+\.woff2$/i.test(f)).map((f) => f.split('/').pop());

  for (const t of TEXT_ONLY) expect(fonts, `글자용 글꼴 ${t} 는 미리 받지 않아야 한다`).not.toContain(t);
  for (const u of UI_FONTS) expect(fonts, `화면용 글꼴 ${u} 는 미리 받아야 한다`).toContain(u);

  // 처음 받는 총 용량(참고 보고). 글꼴 제외로 크게 줄어든다.
  let total = 0;
  for (const f of files) {
    const r = await page.request.get(f.replace(/^\./, ''));
    const b = await r.body();
    total += b.length;
  }
  console.log(`[R13-3] 처음 설치 미리 받기 파일 ${files.length}개 · 총 ${(total / 1024 / 1024).toFixed(2)} MB`);
  expect(total).toBeLessThan(8 * 1024 * 1024); // 글꼴 12MB 를 뺐으므로 넉넉히 8MB 미만
});

test('R13-3 — 글자용 글꼴을 한 번 받으면 오프라인에서도 글꼴 캐시에서 나온다', async ({ page, context }) => {
  await page.goto('/?sw=1');
  await page.waitForFunction(() => !!window.__store, null, { timeout: 30000 });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 30000 });

  const FONT = '/vendor/fonts/NotoSansKR-VF.woff2'; // 글자 레이어 전용(미리 안 받음)

  // 1) 온라인에서 한 번 받는다(= 서비스 워커가 글꼴 캐시에 저장).
  const first = await page.evaluate(async (url) => {
    const r = await fetch(url);
    const b = await r.arrayBuffer();
    return { ok: r.ok, len: b.byteLength };
  }, FONT);
  expect(first.ok).toBe(true);
  expect(first.len).toBeGreaterThan(0);

  // 글꼴 캐시(apng2-fonts)에 담겼는지.
  const cachedLen = await page.evaluate(async (url) => {
    const fc = await caches.open('apng2-fonts');
    const hit = await fc.match(url);
    return hit ? (await hit.arrayBuffer()).byteLength : -1;
  }, FONT);
  expect(cachedLen).toBe(first.len);

  // 2) 오프라인으로 전환 후 다시 받으면 캐시에서 같은 바이트가 나와야 한다.
  await context.setOffline(true);
  const offline = await page.evaluate(async (url) => {
    const r = await fetch(url);
    const b = await r.arrayBuffer();
    return { ok: r.ok, len: b.byteLength };
  }, FONT);
  await context.setOffline(false);

  expect(offline.ok).toBe(true);
  expect(offline.len).toBe(first.len); // 오프라인에서도 같은 글꼴(글꼴 캐시에서)
});
