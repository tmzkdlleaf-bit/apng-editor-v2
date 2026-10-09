// F5-1 — PSD 가져오기: 외부 네트워크(CDN) 차단 상태에서도 레이어/그룹/블렌드/숨김을 유지해 가져온다.
import { test, expect } from '@playwright/test';

test('F5-1 — 오프라인(CDN 차단)에서 PSD 가져오기: 폴더→그룹, blend/opacity/숨김 유지, 미지원 블렌드 경고', async ({ page, context }) => {
  // 외부 출처(구글 폰트 등 CDN)를 전부 막아 "실행 중 외부에서 코드를 받지 않음"을 보장한다.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => r.abort());

  await page.addInitScript(() => {
    window.__noReload = true; // SW claim 시 자동 reload 억제(테스트 안정성)
    try { localStorage.setItem('apng2.onboarded', '1'); } catch {}
  });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store && !!window.__importPsd);

  const result = await page.evaluate(async () => {
    const buf  = await (await fetch('/tests/fixtures/sample.psd')).arrayBuffer();
    const file = new File([buf], 'sample.psd', { type: 'image/vnd.adobe.photoshop' });
    const r    = await window.__importPsd(file, { confirmResize: () => true });
    const doc  = window.__store.get();
    const pick = (l) => ({ type: l.type, name: l.name, blend: l.blend, opacity: l.opacity, visible: l.visible, parentId: l.parentId, childOrder: l.childOrder });
    const layers = {};
    for (const [k, l] of Object.entries(doc.layers)) layers[k] = pick(l);
    return { r, order: doc.order, layers, meta: { w: doc.meta.width, h: doc.meta.height } };
  });

  // 가져오기 성공 + 래스터 4개(윗글자느낌·빨강·초록숨김·바탕)
  expect(result.r.ok).toBe(true);
  expect(result.r.count).toBe(4);

  // 캔버스 크기를 PSD(200x160)에 맞춤
  expect(result.meta).toEqual({ w: 200, h: 160 });

  const all = Object.values(result.layers);
  const byName = (n) => all.find((l) => l.name === n);

  // 폴더 → 그룹(blend multiply, opacity ~0.5, 자식 2개)
  const group = byName('배경폴더');
  expect(group?.type).toBe('group');
  expect(group.blend).toBe('multiply');
  expect(Math.abs(group.opacity - 0.5)).toBeLessThan(0.02);
  expect(group.childOrder.length).toBe(2);

  // 그룹 자식들은 parentId 가 그룹을 가리킨다
  const groupId = Object.keys(result.layers).find((k) => result.layers[k].name === '배경폴더');
  const red = byName('빨강');
  expect(red.parentId).toBe(groupId);

  // 숨김 유지
  expect(byName('초록숨김').visible).toBe(false);
  expect(byName('초록숨김').opacity).toBeGreaterThan(0.7);

  // 미지원 블렌드(vivid light)는 normal 로 두고 경고에 담는다
  expect(byName('윗글자느낌').blend).toBe('normal');
  expect(result.r.warnings.unsupportedBlends).toContain('vivid light');

  // 최상위 쌓임 순서: PSD 바닥(바탕)이 order[0], 최상위(윗글자느낌)가 끝
  const topNames = result.order.map((id) => result.layers[id].name);
  expect(topNames[0]).toBe('바탕');
  expect(topNames[topNames.length - 1]).toBe('윗글자느낌');
  expect(topNames).toContain('배경폴더');
});
