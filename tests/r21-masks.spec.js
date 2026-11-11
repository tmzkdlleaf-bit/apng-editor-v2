// R21a — 펜/도형 가리기: 데이터·렌더·속성 패널. (펜/점 편집/모양 키 캔버스 편집은 R21b)
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

// 64x64 흰 사각형(doc 전체) + 가리기들을 렌더해 imageData 반환.
function _setup() {
  return async ({ masks, f, x, y, rot }) => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const doc = createDoc({ width: 64, height: 64, fps: 12, frameCount: 10 });
    const s = createLayer('shape', { name: 's' });
    s.shape = { kind: 'rect', w: 64, h: 64, fill: '#ffffff', stroke: null };
    s.transform.x = { value: x ?? 32 }; s.transform.y = { value: y ?? 32 };
    if (rot) s.transform.rotation = { value: rot };
    if (masks) s.masks = masks;
    doc.layers[s.id] = s; doc.order.push(s.id);
    const eng = createRenderEngine({ createCanvas: mk });
    const c = mk(64, 64); const ctx = c.getContext('2d', { willReadFrequently: true });
    eng.renderFrame(ctx, doc, f ?? 0, {});
    const d = ctx.getImageData(0, 0, 64, 64).data;
    return { data: Array.from(d), stats: eng.stats() };
  };
}
const A = (d, x, y) => d[(y * 64 + x) * 4 + 3]; // alpha at (x,y)

const rectMask = (id, mode, x, y, w, h, extra = {}) => ({
  id, name: id, mode, invert: false,
  path: { value: { closed: true, pts: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }].map(p => ({ ...p, ix: 0, iy: 0, ox: 0, oy: 0 })) } },
  feather: { value: 0 }, expand: { value: 0 }, opacity: { value: 1 }, ...extra,
});

test('가리기 없음 = 픽셀 동일', async ({ page }) => {
  const same = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    const a = await setup({});
    const b = await setup({ masks: { order: [], items: {} } });
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
    return true;
  }, _setup().toString());
  expect(same).toBe(true);
});

test('사각형 add: 안쪽만 보이고 바깥 알파 0', async ({ page }) => {
  const r2 = await page.evaluate(async (args) => {
    const setup = (new Function('return ' + args.src))();
    return setup({ masks: { order: ['m1'], items: { m1: args.mask } } });
  }, { src: _setup().toString(), mask: rectMask('m1', 'add', 0, 0, 32, 64) });
  expect(A(r2.data, 16, 32)).toBeGreaterThan(200); // 왼쪽 안
  expect(A(r2.data, 48, 32)).toBe(0);              // 오른쪽 바깥
});

test('subtract 하나=구멍, add+subtract=도넛', async ({ page }) => {
  const r = await page.evaluate(async (args) => {
    const setup = (new Function('return ' + args.src))();
    const sub = await setup({ masks: { order: ['m1'], items: { m1: args.subLeft } } });
    const donut = await setup({ masks: { order: ['a', 'b'], items: { a: args.full, b: args.center } } });
    return { sub: sub.data, donut: donut.data };
  }, { src: _setup().toString(),
    subLeft: rectMask('m1', 'subtract', 0, 0, 32, 64),
    full: rectMask('a', 'add', 0, 0, 64, 64),
    center: rectMask('b', 'subtract', 16, 16, 32, 32) });
  // subtract 왼쪽 → 왼쪽 비고 오른쪽 보임
  expect(A(r.sub, 16, 32)).toBe(0);
  expect(A(r.sub, 48, 32)).toBeGreaterThan(200);
  // 도넛: 가운데 구멍, 가장자리 보임
  expect(A(r.donut, 32, 32)).toBe(0);
  expect(A(r.donut, 4, 32)).toBeGreaterThan(200);
  expect(A(r.donut, 32, 4)).toBeGreaterThan(200);
});

test('invert·intersect·difference', async ({ page }) => {
  const r = await page.evaluate(async (args) => {
    const setup = (new Function('return ' + args.src))();
    const inv = await setup({ masks: { order: ['m'], items: { m: args.invLeft } } });
    const inter = await setup({ masks: { order: ['a', 'b'], items: { a: args.left, b: args.top } } });
    const diff = await setup({ masks: { order: ['a', 'b'], items: { a: args.left2, b: args.top2 } } });
    return { inv: inv.data, inter: inter.data, diff: diff.data };
  }, { src: _setup().toString(),
    invLeft: { ...rectMask('m', 'add', 0, 0, 32, 64), invert: true },
    left: rectMask('a', 'add', 0, 0, 32, 64), top: rectMask('b', 'intersect', 0, 0, 64, 32),
    left2: rectMask('a', 'add', 0, 0, 32, 64), top2: rectMask('b', 'difference', 0, 0, 64, 32) });
  // invert add 왼쪽 → 오른쪽만 보임
  expect(A(r.inv, 48, 32)).toBeGreaterThan(200);
  expect(A(r.inv, 16, 32)).toBe(0);
  // intersect 왼쪽∩위 → 좌상단만
  expect(A(r.inter, 16, 16)).toBeGreaterThan(200);
  expect(A(r.inter, 16, 48)).toBe(0);
  expect(A(r.inter, 48, 16)).toBe(0);
  // difference 왼쪽 xor 위 → 좌하단·우상단만(겹친 좌상단 제외)
  expect(A(r.diff, 16, 16)).toBe(0);
  expect(A(r.diff, 16, 48)).toBeGreaterThan(200);
  expect(A(r.diff, 48, 16)).toBeGreaterThan(200);
});

test('feather: 경계에 반투명 띠 / expand +10·-10 경계 이동', async ({ page }) => {
  const r = await page.evaluate(async (args) => {
    const setup = (new Function('return ' + args.src))();
    const fe = await setup({ masks: { order: ['m'], items: { m: args.feather } } });
    const ex = await setup({ masks: { order: ['m'], items: { m: args.expand } } });
    const sh = await setup({ masks: { order: ['m'], items: { m: args.shrink } } });
    // feather: y=32 에서 경계(x≈32) 근처 반투명 열 수
    let band = 0; for (let x = 20; x <= 44; x++) { const a = fe.data[(32 * 64 + x) * 4 + 3]; if (a > 10 && a < 245) band++; }
    return { band, ex10: ex.data[(32 * 64 + 10) * 4 + 3], sh20: sh.data[(32 * 64 + 20) * 4 + 3] };
  }, { src: _setup().toString(),
    feather: { ...rectMask('m', 'add', 0, 0, 32, 64), feather: { value: 8 } },
    expand: { ...rectMask('m', 'add', 16, 0, 32, 64), expand: { value: 10 } },  // 왼경계 16→6
    shrink: { ...rectMask('m', 'add', 16, 0, 32, 64), expand: { value: -10 } } }); // 왼경계 16→26
  expect(r.band).toBeGreaterThan(3);         // 반투명 띠 존재
  expect(r.ex10).toBeGreaterThan(200);       // +10 넓혀 x=10 이 안쪽
  expect(r.sh20).toBe(0);                    // -10 좁혀 x=20 이 바깥
});

test('레이어를 옮기고 돌리면 가리기도 같이 이동·회전', async ({ page }) => {
  const r = await page.evaluate(async (args) => {
    const setup = (new Function('return ' + args.src))();
    const base = await setup({ masks: { order: ['m'], items: { m: args.left } } });                 // 왼쪽 보임
    const moved = await setup({ masks: { order: ['m'], items: { m: args.left } }, x: 48 });          // 내용 +16
    const rot = await setup({ masks: { order: ['m'], items: { m: args.left } }, rot: 180 });         // 뒤집힘
    return { base: base.data, moved: moved.data, rot: rot.data };
  }, { src: _setup().toString(), left: rectMask('m', 'add', 0, 0, 32, 64) });
  expect(A(r.base, 40, 32)).toBe(0);              // 기준: x40 은 바깥
  expect(A(r.moved, 40, 32)).toBeGreaterThan(200);// 옮기면 x40 이 안쪽으로
  expect(A(r.rot, 48, 32)).toBeGreaterThan(200);  // 180° → 오른쪽이 보임
  expect(A(r.rot, 16, 32)).toBe(0);
});

test('모양 키 2개(점 개수 같음): 가운데 프레임이 중간값, 개수 다르면 계단', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { evalProp } = await import('/src/core/anim/prop.js');
    const small = { closed: true, pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] };
    const big = { closed: true, pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }] };
    const prop = { value: small, keys: [{ f: 0, v: small, ease: 'linear' }, { f: 10, v: big, ease: 'linear' }] };
    const mid = evalProp(prop, 5);
    // 개수 다름 → 계단(앞 키 유지)
    const tri = { closed: true, pts: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 15, y: 30 }] };
    const stepProp = { value: small, keys: [{ f: 0, v: small, ease: 'linear' }, { f: 10, v: tri, ease: 'linear' }] };
    const stepMid = evalProp(stepProp, 5);
    return { midX: mid.pts[1].x, stepN: stepMid.pts.length };
  });
  expect(Math.abs(r.midX - 30)).toBeLessThan(0.5); // 20↔40 중간 = 30
  expect(r.stepN).toBe(4);                          // 계단 → 앞 키(4점) 유지
});

test('키 없는 가리기는 두 번째 렌더부터 캐시를 쓴다', async ({ page }) => {
  const r = await page.evaluate(async (args) => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const doc = createDoc({ width: 64, height: 64, fps: 12, frameCount: 10 });
    const s = createLayer('shape', { name: 's' });
    s.shape = { kind: 'rect', w: 64, h: 64, fill: '#ffffff', stroke: null };
    s.transform.x = { value: 32 }; s.transform.y = { value: 32 };
    s.masks = { order: ['m1'], items: { m1: args.mask } };
    doc.layers[s.id] = s; doc.order.push(s.id);
    const eng = createRenderEngine({ createCanvas: mk });
    const c = mk(64, 64); const ctx = c.getContext('2d', { willReadFrequently: true });
    eng.renderFrame(ctx, doc, 0, {}); const h0 = eng.stats().cacheHits;
    eng.renderFrame(ctx, doc, 1, {}); const h1 = eng.stats().cacheHits;
    return { gained: h1 - h0 };
  }, { mask: rectMask('m1', 'add', 0, 0, 32, 64) });
  expect(r.gained).toBeGreaterThan(0); // 두 번째 프레임에 마스크 캐시 적중
});

test('저장 왕복에서 masks 유지, 명령 되돌리기 1건', async ({ page }) => {
  const r = await page.evaluate(async (args) => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createStore } = await import('/src/core/doc/store.js');
    const { buildProjectFile, importProjectFile } = await import('/src/core/io/project-file.js');
    const doc = createDoc();
    const s = createLayer('shape', { name: 's' });
    s.shape = { kind: 'rect', w: 64, h: 64, fill: '#fff', stroke: null };
    doc.layers[s.id] = s; doc.order.push(s.id);
    const store = createStore(doc);
    const d0 = store.undoDepth();
    store.apply({ type: 'addMask', id: s.id, mask: args.mask });
    const added1 = store.undoDepth() === d0 + 1 && store.get().layers[s.id].masks.order.length === 1;
    const file = JSON.parse(JSON.stringify(await buildProjectFile(store.get())));
    const { doc: back } = await importProjectFile(file);
    const bm = back.layers[s.id].masks;
    const kept = bm && bm.order.length === 1 && bm.items[bm.order[0]].path.value.pts.length === 4;
    store.undo();
    const gone = !store.get().layers[s.id].masks || store.get().layers[s.id].masks.order.length === 0;
    return { added1, kept, gone };
  }, { mask: rectMask('m1', 'add', 0, 0, 32, 64) });
  expect(r.added1).toBe(true);
  expect(r.kept).toBe(true);
  expect(r.gone).toBe(true);
});
