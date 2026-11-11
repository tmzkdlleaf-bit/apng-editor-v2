// R23d 2부(item 7) — 공용 테스트 fixture.
//   지금까지 테스트는 콘솔을 보지 않아 첫 화면 로드 때마다 나던 아이콘 오류 15개를 놓쳤다.
//   이 fixture 는 page 의 console.error 와 pageerror 를 모아, 테스트가 (다른 이유로 실패하지 않았는데도)
//   콘솔 오류를 남겼으면 실패시킨다.
//
//   쓰기: 모든 spec 에서 `import { test, expect } from './helpers/fixtures.js';`
//   일부러 오류를 내는 테스트는 fixture 인자 allowConsoleErrors 로 패턴을 허용한다:
//     test('...', async ({ page, allowConsoleErrors }) => { allowConsoleErrors(/패턴/); ... });
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  // page 를 건드리지 않고(덮어쓰지 않고) 자동으로 콘솔을 지켜본다.
  _consoleGuard: [async ({ page }, use, testInfo) => {
    const errors = [];
    const allow = [];
    const onConsole = (msg) => {
      if (msg.type() !== 'error') return;
      const t = msg.text();
      if (allow.some((re) => re.test(t))) return;
      errors.push('console.error: ' + t);
    };
    const onPageError = (e) => {
      const t = String(e?.stack || e?.message || e);
      if (allow.some((re) => re.test(t))) return;
      errors.push('pageerror: ' + t);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    await use({ allow: (re) => allow.push(re) });

    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    // 테스트가 이미 다른 이유로 실패했으면 중복 보고하지 않는다(진짜 원인을 가리지 않게).
    if (errors.length && testInfo.errors.length === 0) {
      throw new Error(`콘솔 오류 ${errors.length}개(허용 목록에 없음):\n` + errors.join('\n'));
    }
  }, { auto: true }],

  // 테스트 안에서 특정 오류를 허용(정규식). 호출한 테스트만 보고에 적는다.
  allowConsoleErrors: async ({ _consoleGuard }, use) => {
    await use((re) => _consoleGuard.allow(re));
  },
});

export { expect };
