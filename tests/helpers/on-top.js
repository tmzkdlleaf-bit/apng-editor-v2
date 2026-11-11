// R23d 공용 검사 — 요소가 실제로 "맨 위에 보이는지" 확인한다.
//   toBeVisible() 은 다른 요소에 가려짐·부모에 잘림을 못 잡는다(메뉴가 도구 막대 밑에 깔려도 통과했다).
//   expectOnTop 은 상자의 가운데·네 귀퉁이 안쪽 점에서 elementFromPoint 가 그 요소(또는 그 안쪽 요소)인지,
//   그리고 상자가 화면(viewport) 안에 있는지 본다.
import { expect } from '@playwright/test';

export async function expectOnTop(page, locator, { inset = 3 } = {}) {
  const box = await locator.boundingBox();
  expect(box, '요소에 보이는 상자가 있어야 함').not.toBeNull();
  expect(box.width, '상자 너비 > 0').toBeGreaterThan(0);
  expect(box.height, '상자 높이 > 0').toBeGreaterThan(0);

  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  expect(box.x, '상자가 화면 왼쪽 안').toBeGreaterThanOrEqual(-0.5);
  expect(box.y, '상자가 화면 위 안').toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width, '상자가 화면 오른쪽 안').toBeLessThanOrEqual(vp.width + 0.5);
  expect(box.y + box.height, '상자가 화면 아래 안').toBeLessThanOrEqual(vp.height + 0.5);

  const pts = [
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { x: box.x + inset,              y: box.y + inset },
    { x: box.x + box.width - inset,  y: box.y + inset },
    { x: box.x + inset,              y: box.y + box.height - inset },
    { x: box.x + box.width - inset,  y: box.y + box.height - inset },
  ];
  const results = await locator.evaluate((el, pts) => pts.map((p) => {
    const top = document.elementFromPoint(p.x, p.y);
    return !!top && (top === el || el.contains(top));
  }), pts);
  for (let i = 0; i < results.length; i++) {
    expect(results[i], `점 ${i}(${JSON.stringify(pts[i])}) 에서 요소가 맨 위가 아님`).toBe(true);
  }
}
