// R8-3 — 글꼴 내장: vendor/fonts 의 woff2 로 그린다. 인터넷이 없어도 같은 결과.
import { test, expect } from './helpers/fixtures.js';

async function renderNoto(page) {
  return await page.evaluate(async () => {
    const H = await import('/tests/e1-helpers.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { ensureDocFonts } = await import('/src/ui/fonts.js');
    const W = 96, Ht = 48;
    const doc = createDoc({ width: W, height: Ht, fps: 12, frameCount: 2 });
    const t = createLayer('text', { name: 't' });
    t.text = '가나다Ag'; t.size = 22; t.font = 'Noto Sans KR'; t.weight = 700; t.color = '#ffffff'; t.align = 'center';
    t.transform.x.value = 48; t.transform.y.value = 24;
    doc.layers[t.id] = t; doc.order.push(t.id);
    const { ok } = await ensureDocFonts(doc);
    const loaded = document.fonts.check('700 22px "Noto Sans KR"');
    const eng = createRenderEngine({ createCanvas: H.createCanvas });
    const c = H.createCanvas(W, Ht);
    eng.renderFrame(c.getContext('2d'), doc, 0, {});
    const data = [...c.getContext('2d').getImageData(0, 0, W, Ht).data];
    let drew = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 10) drew++;
    return { ok, loaded, data, drew };
  });
}

test('R8-3 — 번들 글꼴: 네트워크 없이도 Noto Sans KR 같은 픽셀', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.__store);
  const online = await renderNoto(page);
  expect(online.ok).toBe(true);
  expect(online.loaded).toBe(true);           // 번들 글꼴 로드됨
  expect(online.drew).toBeGreaterThan(20);     // 글자가 실제로 그려짐

  // 외부(인터넷) 요청을 모두 막고 새로고침 → 로컬 vendor 글꼴로만 그린다.
  await page.route('https://**', (r) => r.abort());
  await page.reload();
  await page.waitForFunction(() => !!window.__store);
  const offline = await renderNoto(page);
  expect(offline.ok).toBe(true);
  expect(offline.loaded).toBe(true);           // 오프라인에서도 글꼴 로드됨
  expect(offline.drew).toBeGreaterThan(20);

  // 번들 글꼴이라 네트워크 유무와 무관하게 픽셀이 같다.
  let diff = 0;
  for (let i = 0; i < online.data.length; i++) if (Math.abs(online.data[i] - offline.data[i]) > 1) diff++;
  expect(diff).toBe(0);
});

test('R8-3 — 소스에 구글 폰트 링크·CDN 참조 없음', async ({ page }) => {
  const html = await (await page.request.get('/')).text();
  expect(html).not.toContain('fonts.googleapis.com');
  expect(html).not.toContain('fonts.gstatic.com');
});
