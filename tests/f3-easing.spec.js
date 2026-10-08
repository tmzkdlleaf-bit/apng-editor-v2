// F3-6 — 이징: 곡선 미리보기 + 커스텀 베지어(저장·불러오기 유지).
import { test, expect } from '@playwright/test';

test('F3-6 — easeCurveSvg 가 이징별 곡선 path 를 만든다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => true);
  const r = await page.evaluate(async () => {
    const { easeCurveSvg } = await import('/src/ui/controls/ease-preview.js');
    const lin = easeCurveSvg('linear');
    const io = easeCurveSvg('easeInOut');
    const bz = easeCurveSvg('cubicBezier', { bezier: [0.6, 0, 0.4, 1] });
    return { hasLin: lin.includes('<path'), hasIO: io.includes('<path'), hasBz: bz.includes('<path'), diff: lin !== io };
  });
  expect(r.hasLin).toBe(true);
  expect(r.hasIO).toBe(true);
  expect(r.hasBz).toBe(true);
  expect(r.diff).toBe(true); // 이징마다 곡선이 다르다
});

test('F3-6 — 커스텀 베지어 키가 문서에 저장·불러오기 후 유지', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  const r = await page.evaluate(async () => {
    const { buildProjectFile, importProjectFile } = await import('/src/core/io/project-file.js');

    // 레이어 하나에 x 키 2개 + 앞 키에 cubicBezier 적용
    const doc = window.__store.get();
    const id = doc.order.find((x) => doc.layers[x]?.type === 'image');
    window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 100, f: 0 });
    window.__store.apply({ type: 'setProp', id, path: 'transform.x', value: 300, f: 12 });
    window.__store.apply({ type: 'setKeysEase', id, path: 'transform.x', frames: [0], ease: 'cubicBezier', bezier: [0.6, 0, 0.4, 1] });

    const key0 = window.__store.get().layers[id].transform.x.keys.find((k) => k.f === 0);
    const before = { ease: key0.ease, bezier: key0.bezier };

    // 저장 → 불러오기
    const payload = await buildProjectFile(window.__store.get());
    const { doc: doc2 } = await importProjectFile(JSON.parse(JSON.stringify(payload)));
    const key0b = doc2.layers[id].transform.x.keys.find((k) => k.f === 0);
    return { before, after: { ease: key0b.ease, bezier: key0b.bezier } };
  });
  expect(r.before.ease).toBe('cubicBezier');
  expect(r.before.bezier).toEqual([0.6, 0, 0.4, 1]);
  expect(r.after.ease).toBe('cubicBezier');
  expect(r.after.bezier).toEqual([0.6, 0, 0.4, 1]); // 불러오기 후 유지
});

test('F3-6 — cubicBezier 로 평가가 바뀐다(linear 와 다름)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => true);
  const r = await page.evaluate(async () => {
    const { evalProp } = await import('/src/core/anim/prop.js');
    const lin = { keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100 }] };
    const bz = { keys: [{ f: 0, v: 0, ease: 'cubicBezier', bezier: [0.9, 0, 1, 0.3] }, { f: 10, v: 100 }] };
    return { lin5: evalProp(lin, 5), bz5: evalProp(bz, 5) };
  });
  expect(r.lin5).toBeCloseTo(50, 1);
  expect(Math.abs(r.bz5 - r.lin5)).toBeGreaterThan(5); // 베지어가 곡선을 바꾼다
});
