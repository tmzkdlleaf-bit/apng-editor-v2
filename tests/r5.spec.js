// R5 마무리 — R5-3(스냅 후보가 다른 레이어의 축척·앵커 오프셋 반영)·R5-4(내보내기 재열기 비트맵 정리).
import { test, expect } from '@playwright/test';

test('R5-3 — 스냅 후보가 다른 레이어의 축척을 반영한다(축척 모서리로 스냅)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const r = await page.evaluate(async () => {
    const { computeSnap } = await import('/src/ui/canvas/snap.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    // 폭 1000: 캔버스 중심(500)·3등분(333·667)이 모두 400 에서 멀어 후보 오염이 없다.
    const doc = createDoc({ width: 1000, height: 620, fps: 12, frameCount: 12 });
    const target = createLayer('shape', { name: '대상' });
    target.shape = { kind: 'rect', w: 100, h: 100, fill: '#ffffff', stroke: null };
    target.transform.x.value = 300; target.transform.y.value = 300;
    target.transform.scale.value = 2;   // 반폭 50×2=100 → 오른쪽 모서리 400 (축척 미반영이면 350)
    doc.layers[target.id] = target; doc.order.push(target.id);

    const mover = createLayer('shape', { name: '이동' });
    mover.shape = { kind: 'rect', w: 20, h: 20, fill: '#ffffff', stroke: null };
    doc.layers[mover.id] = mover; doc.order.push(mover.id);

    const es = { snap: true, grid: false, zoom: 1, gridStep: 50, f: 0 };
    // 축척 모서리(400) 근처 397. 축척을 안 쓰면 후보는 350/300/250 뿐 → 스냅 안 됨.
    const atEdge = computeSnap(397, 500, doc, es, [mover.id], false);
    // 축척 중심(300) 근처 303 → 중심으로.
    const atCenter = computeSnap(303, 500, doc, es, [mover.id], false);
    return { edgeX: atEdge.x, centerX: atCenter.x };
  });
  expect(r.edgeX).toBeCloseTo(400, 1);    // 축척 반영한 모서리로 스냅
  expect(r.centerX).toBeCloseTo(300, 1);  // 중심은 그대로
});

test('R5-4 — 내보내기 재열기 시 이전 비트맵 정리(굽는 중 닫고 다시 열기 → 누수 0)', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__exportUI));
  await page.waitForTimeout(150);
  page.on('dialog', (d) => d.accept());  // '취소하고 닫을까요?' 자동 승인

  const r = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    let created = 0, closed = 0;
    const origCIB = window.createImageBitmap;
    window.createImageBitmap = async function (...a) { const b = await origCIB.apply(this, a); created++; return b; };
    const origClose = ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function () { closed++; return origClose.apply(this, arguments); };
    try {
      const ui = window.__exportUI;
      ui.open();
      for (let i = 0; i < 150 && !ui.depsReady(); i++) await sleep(20);
      const created1 = created;

      // 내보내기 시작 → running=true (setBusy 는 동기).
      ui.el.querySelector('#ex-run').click();
      const busyHit = ui.isBusy();

      // 굽는 중 닫고 곧바로 재열기: 옛 deps 정리가 run finally 로 미뤄진 채 재열림.
      ui.close();
      ui.open();

      // deps2 준비 + 취소된 run1 finally 가 옛 비트맵을 닫을 시간.
      for (let i = 0; i < 150 && !ui.depsReady(); i++) await sleep(20);
      await sleep(500);
      ui.close();
      await sleep(400);
      return { created, closed, created1, busyHit };
    } finally {
      window.createImageBitmap = origCIB;
      ImageBitmap.prototype.close = origClose;
    }
  });

  expect(r.created1).toBeGreaterThan(0);  // 데모 이미지 비트맵이 만들어졌다
  expect(r.busyHit).toBe(true);           // 실제로 굽는 중이었다(미뤄진 정리 경로)
  expect(r.closed).toBe(r.created);       // 만든 만큼 닫힘 = 누수 0 (고치기 전이면 옛 세션 몫이 샌다)
});
