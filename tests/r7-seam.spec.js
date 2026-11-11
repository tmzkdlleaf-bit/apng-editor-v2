// R7-8 — 루프 이음새 검사가 scaleX·scaleY(가로·세로 크기)의 처음·끝 차이도 잡아야 한다.
import { test, expect } from './helpers/fixtures.js';

test('R7-8 — 이음새 검사가 scaleX 차이를 잡는다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);

  const r = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { checkLoopSeam } = await import('/src/core/anim/seam.js');
    const motions = (await import('/src/motions/registry.js')).default;

    const doc = createDoc({ frameCount: 12 });
    const l = createLayer('shape', { name: '가로늘기' });
    // scaleX 가 0→12 에서 1→2 로 달라짐(이음새 불일치)
    l.transform.scaleX = { value: 1, keys: [{ f: 0, v: 1, ease: 'linear' }, { f: 12, v: 2, ease: 'linear' }] };
    doc.layers[l.id] = l; doc.order.push(l.id);

    const issues = checkLoopSeam(doc, motions);
    return { props: issues.filter((i) => i.layerId === l.id).map((i) => i.prop) };
  });

  expect(r.props).toContain('scaleX');
});
