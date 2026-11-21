// R33-1 — 좁은 화면: 캔버스·아래 줄·타임라인 머리가 오른쪽 패널 밑으로 넘치지 않는다.
//   아래 줄은 폭이 모자라면 덜 중요한 칸을 "더 보기"로 옮긴다. 넓어지면 되돌린다.
//   좁아지는 순간 왼쪽 패널을 접는다(R33-2).
import { test, expect } from './helpers/fixtures.js';

async function openApp(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(300);
}

// 캔버스(.stage-overlay)·아래 줄(.stage-bottombar)·타임라인 머리(.timeline-head)의
// 오른쪽 끝이 오른쪽 패널 왼쪽 끝을 넘지 않는지(±1px).
async function assertNoOverflow(page, label) {
  const r = await page.evaluate(() => {
    const rect = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect() : null; };
    const dock = rect('.panel-dock-right');
    const out = { dockLeft: dock ? dock.left : null };
    for (const sel of ['.stage-overlay', '.stage-bottombar', '.timeline-head']) {
      const b = rect(sel);
      out[sel] = b ? b.right : null;
    }
    return out;
  });
  for (const sel of ['.stage-overlay', '.stage-bottombar', '.timeline-head']) {
    expect(r[sel], `${label} ${sel} right(${r[sel]}) <= dockLeft(${r.dockLeft})`).toBeLessThanOrEqual(r.dockLeft + 1);
  }
}

test('[넘침] 1400에서 1024·900·800 으로 줄여도 넘치지 않는다', async ({ page }) => {
  await openApp(page, 1400, 900);
  await assertNoOverflow(page, '1400');
  for (const w of [1024, 900, 800]) {
    await page.setViewportSize({ width: w, height: 700 });
    await page.waitForTimeout(400);
    await assertNoOverflow(page, String(w));
  }
});

test('[처음부터 좁게] 1024×700 으로 처음 열어도 넘치지 않는다', async ({ page }) => {
  await openApp(page, 1024, 700);
  await assertNoOverflow(page, '처음부터 1024');
});

test('[저장된 배치] 왼쪽 패널 펼침 배치를 넣고 1024 로 열어도 넘치지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('apng2.ws.left', JSON.stringify({ width: 240, collapsed: false, active: 'project' })); } catch {}
  });
  await openApp(page, 1024, 700);
  // 저장된 펼침 배치는 존중한다(접지 않음). 그래도 넘치지 않아야 한다.
  expect(await page.locator('.panel-dock-left.is-collapsed').count()).toBe(0);
  await assertNoOverflow(page, '저장된 배치 1024');
});

test('[더 보기] 900 에서 숨은 칸이 더 보기에 들어 있고, 거기서 격자를 켜면 상태가 켜진다', async ({ page }) => {
  await openApp(page, 900, 700);
  const more = page.locator('.bb-more');
  await expect(more).toBeVisible();
  await more.click();
  const menu = page.locator('.bb-more-menu');
  await expect(menu).toBeVisible();
  // 숨겨진 칸에 "격자"가 들어 있다.
  const hasGrid = await page.evaluate(() => {
    const menu = document.querySelector('.bb-more-menu');
    return [...menu.querySelectorAll('.bb-check')].some((c) => c.querySelector('span')?.textContent === '격자');
  });
  expect(hasGrid).toBe(true);
  // 더 보기에서 격자 체크 → editorState.grid (넓은 화면에서 켠 것과 같은 상태값)
  expect(await page.evaluate(() => !!window.__editorState.get().grid)).toBe(false);
  await page.evaluate(() => {
    const menu = document.querySelector('.bb-more-menu');
    const gridCheck = [...menu.querySelectorAll('.bb-check')].find((c) => c.querySelector('span')?.textContent === '격자');
    gridCheck.querySelector('input').click();
  });
  expect(await page.evaluate(() => !!window.__editorState.get().grid)).toBe(true);
});

test('[되살림] 다시 1400 으로 넓히면 더 보기가 사라지고 칸이 모두 바로 돌아온다', async ({ page }) => {
  await openApp(page, 900, 700);
  await expect(page.locator('.bb-more')).toBeVisible();
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForTimeout(400);
  await expect(page.locator('.bb-more')).toBeHidden();
  // 숨어 있던 칸(격자·겹침·안전 영역)이 모두 아래 줄(.stage-bottombar) 안으로 돌아왔다.
  const back = await page.evaluate(() => {
    const bb = document.querySelector('.stage-bottombar');
    const labels = [...bb.querySelectorAll('.bb-check span')].map((s) => s.textContent);
    return ['투명 격자', '가이드', '안전 영역', '격자', '스냅', '겹침'].every((l) => labels.includes(l));
  });
  expect(back).toBe(true);
});

test('[자동 접기] 1400→1024 로 줄이면 왼쪽 패널이 접힌다. 펼친 뒤 1100 으로 바꿔도 접히지 않는다', async ({ page }) => {
  await openApp(page, 1400, 900);
  expect(await page.locator('.panel-dock-left.is-collapsed').count()).toBe(0);
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.waitForTimeout(400);
  await expect(page.locator('.panel-dock-left.is-collapsed')).toHaveCount(1);
  // 사용자가 직접 펼친다.
  await page.locator('.panel-dock-left .panel-collapse').click();
  await expect(page.locator('.panel-dock-left.is-collapsed')).toHaveCount(0);
  // 좁은 폭 안에서 더 바꿔도(건너감 없음) 다시 접지 않는다.
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.waitForTimeout(400);
  await expect(page.locator('.panel-dock-left.is-collapsed')).toHaveCount(0);
});
