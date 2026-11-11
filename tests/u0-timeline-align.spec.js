// U0-2 — 타임라인: 왼쪽 레이어 행과 오른쪽 트랙 행의 화면 y 가 어긋나지 않는다.
import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(150);
}

test('U0-2 — 레이어 행 y == 트랙 행 y (머리 칸이 눈금자와 정렬)', async ({ page }) => {
  await openApp(page);
  const r = await page.evaluate(() => {
    const ROW_H = 28;
    const headCell = document.querySelector('.tl-layers-head');
    const ruler    = document.querySelector('.track-header-wrap');
    const trackBody = document.querySelector('.track-body-wrap');
    const rows = [...document.querySelectorAll('.timeline-layers .tl-row')];
    const headH  = headCell.getBoundingClientRect().height;
    const rulerH = ruler.getBoundingClientRect().height;
    const tb = trackBody.getBoundingClientRect();
    const diffs = rows.map((el, i) => {
      const top = el.getBoundingClientRect().top;
      const expected = tb.top + i * ROW_H - trackBody.scrollTop;
      return Math.abs(top - expected);
    });
    return { headH, rulerH, rowCount: rows.length, maxDiff: diffs.length ? Math.max(...diffs) : 0 };
  });
  expect(r.rowCount).toBeGreaterThan(0);
  expect(Math.abs(r.headH - r.rulerH)).toBeLessThanOrEqual(1); // 머리 칸 높이 == 눈금자 높이
  expect(r.maxDiff).toBeLessThanOrEqual(1);                    // 모든 행 정렬(±1px)
});

test('U0-2 — [+ 레이어]는 목록 머리 칸으로 옮겨졌다', async ({ page }) => {
  await openApp(page);
  const inHead = await page.evaluate(() => {
    const head = document.querySelector('.tl-layers-head');
    return !!head && !!head.querySelector('.tl-add-btn');
  });
  expect(inHead).toBe(true);
});

test('U0-5 — Space 재생/멈춤, 입력 칸에서는 무시', async ({ page }) => {
  await openApp(page);
  const playing = () => page.evaluate(() => !!window.__editorState.get().playing);
  // 입력이 아닌 중립 위치(좌상단)를 눌러 포커스를 비운다 — 화면 아래 줄 컨트롤 위를 눌러 체크박스에 포커스가
  // 가면 Space 가 그 체크박스를 토글해 재생 토글이 무시된다(R23d: 아래 줄이 넓어짐).
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  expect(await playing()).toBe(false);
  await page.keyboard.press('Space');
  expect(await playing()).toBe(true);
  await page.keyboard.press('Space');
  expect(await playing()).toBe(false);

  // 입력 칸 포커스에서는 Space 가 재생 토글을 하지 않는다
  await page.evaluate(() => {
    const i = document.createElement('input');
    i.id = '__probe'; document.body.appendChild(i); i.focus();
  });
  await page.keyboard.press('Space');
  expect(await playing()).toBe(false);
});

test('U0-5 — 프레임 숫자 클릭 → 직접 입력', async ({ page }) => {
  await openApp(page);
  await page.click('.tl-frame-cur');
  await page.fill('.tl-frame-input', '5');
  await page.keyboard.press('Enter');
  const f = await page.evaluate(() => window.__editorState.get().f);
  expect(f).toBe(4); // 1-기반 표시 → 0-기반 f
});
