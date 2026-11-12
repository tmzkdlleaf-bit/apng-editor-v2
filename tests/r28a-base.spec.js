// R28a — 새 효과 토대: 한 번(once)형 표시·진행 방식·소스 2개·흐림 공용·가지 선.
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!window.__store); });

test('progressOf: 자동/직접/방향/이징', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { progressOf } = await import('/src/effects/_fx-util.js');
    const { ease } = await import('/src/core/anim/easing.js');
    const lin = { progStart: 4, progLength: 8, progEase: 'linear' };
    return {
      before: progressOf(2, lin, ease), mid: progressOf(8, lin, ease), after: progressOf(20, lin, ease),
      out: progressOf(8, { ...lin, progDir: 'out' }, ease), outEnd: progressOf(20, { ...lin, progDir: 'out' }, ease),
      manual: progressOf(99, { progMode: 'manual', progress: 0.3, progEase: 'linear' }, ease),
      eased: progressOf(6, { progStart: 4, progLength: 8, progEase: 'easeIn' }, ease),
    };
  });
  expect(r.before).toBe(0);
  expect(r.mid).toBeCloseTo(0.5, 6);
  expect(r.after).toBe(1);
  expect(r.out).toBeCloseTo(0.5, 6);
  expect(r.outEnd).toBe(0);
  expect(r.manual).toBeCloseTo(0.3, 6);
  expect(r.eased).toBeLessThan(0.25); // 천천히 시작
});

test('once 효과가 있으면 내보내기 경고, 반복 1회면 경고 없음', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { getExportWarnings } = await import('/src/export/index.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const effects = new Map([['x-once', { id: 'x-once', name: '시험 한 번', once: true, render() {} }]]);
    const doc = createDoc();
    const L = createLayer('effect', { effectId: 'x-once' }); doc.layers[L.id] = L; doc.order.push(L.id);
    const w0 = getExportWarnings(doc, { loops: 0, effects }).filter((w) => w.type === 'oneshot');
    const w1 = getExportWarnings(doc, { loops: 1, effects }).filter((w) => w.type === 'oneshot');
    return { n0: w0.length, msg: w0[0]?.message ?? '', n1: w1.length };
  });
  expect(r.n0).toBe(1);
  expect(r.msg).toContain('시험 한 번');
  expect(r.n1).toBe(0);
});

test('소스 2개: 효과에 두 소스가 따로 전달되고, 프로젝트 파일 왕복에서 유지', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { buildProjectFile, importProjectFile } = await import('/src/core/io/project-file.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    let seen = null;
    const effects = new Map([['two', { id: 'two', name: '둘', sources: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }],
      render(ctx, env) { seen = env.sources.map((s) => ({ key: s.key, has: !!s.canvas })); } }]]);
    const doc = createDoc({ width: 50, height: 50 });
    const A = createLayer('shape'); A.shape = { kind: 'rect', w: 10, h: 10, fill: '#f00', stroke: null }; A.visible = false;
    const B = createLayer('shape'); B.shape = { kind: 'rect', w: 10, h: 10, fill: '#00f', stroke: null }; B.visible = false;
    const F = createLayer('effect', { effectId: 'two' }); F.sources = [{ key: 'a', sourceId: A.id }, { key: 'b', sourceId: B.id }];
    for (const L of [A, B, F]) { doc.layers[L.id] = L; doc.order.push(L.id); }
    createRenderEngine({ createCanvas: mk, effects }).renderFrame(mk(50, 50).getContext('2d'), doc, 0, {});
    const file = JSON.parse(JSON.stringify(await buildProjectFile(doc)));
    const { doc: back } = await importProjectFile(file);
    return { seen, back: back.layers[F.id].sources };
  });
  expect(r.seen).toEqual([{ key: 'a', has: true }, { key: 'b', has: true }]);
  expect(r.back.map((s) => s.key)).toEqual(['a', 'b']);
});

test('흐림 공용: blurCanvas 는 흐리고, variableBlur 는 amount 0 인 곳을 원본 그대로 둔다', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { blurCanvas, variableBlur } = await import('/src/core/render/blur.js');
    const { createPool } = await import('/src/core/render/pool.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const pool = createPool(mk);
    const src = mk(120, 120); const g = src.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 60, 120); // 왼쪽 반 흰색, 오른쪽 투명
    const b = blurCanvas(src, 12, pool.borrow, pool.release);
    const edge = b.getContext('2d').getImageData(60, 60, 1, 1).data[3];
    const out = mk(120, 120);
    variableBlur(out.getContext('2d'), src, 0, 0, 12, (u) => (u > 0.75 ? 1 : 0), pool.borrow, pool.release);
    const d = out.getContext('2d').getImageData(0, 0, 120, 120).data;
    const A = (x, y) => d[(y * 120 + x) * 4 + 3];
    return { edge, sharpLeftEdge: [A(59, 60), A(60, 60)] };
  });
  expect(r.edge, '경계가 흐려짐(중간 알파)').toBeGreaterThan(40);
  expect(r.edge).toBeLessThan(215);
  expect(r.sharpLeftEdge, 'amount 0 영역은 원본 그대로').toEqual([255, 0]);
});

test('가지 선: 결정론, 진행이 늘면 그린 선분 수가 늘어남', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { branchSegments } = await import('/src/effects/_fx-util.js');
    const { createRng } = await import('/src/core/render/rng.js');
    const a = branchSegments(createRng(5), { x: 0, y: 0, angle: 0, length: 100, depth: 2, branch: 0.4 });
    const b = branchSegments(createRng(5), { x: 0, y: 0, angle: 0, length: 100, depth: 2, branch: 0.4 });
    const cnt = (p) => a.filter((s) => s.t0 < p).length;
    return { same: JSON.stringify(a) === JSON.stringify(b), c3: cnt(0.3), c7: cnt(0.7), c10: cnt(1.01), n: a.length };
  });
  expect(r.same).toBe(true);
  expect(r.c3).toBeLessThan(r.c7);
  expect(r.c7).toBeLessThanOrEqual(r.c10);
  expect(r.c10).toBe(r.n);
});
