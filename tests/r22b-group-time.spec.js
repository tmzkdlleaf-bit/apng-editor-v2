// R22b — 그룹 시간: 시작 어긋남·속도·범위 밖(hold/loop/hide)·다시 매기기·안쪽 프레임 키·이음새·왕복.
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

// 움직이는 자식(검은 사각형, 안쪽 f0 x=16 → f8 x=48)을 담은 그룹. time 옵션을 주고 한 프레임을 렌더한다.
function _setup() {
  return async ({ time = null, rf = 0 }) => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const doc = createDoc({ width: 64, height: 64, fps: 12, frameCount: 10 });
    const child = createLayer('shape', { name: 'child' });
    child.shape = { kind: 'rect', w: 8, h: 8, fill: '#000000', stroke: null };
    child.transform.x = { value: 16, keys: [
      { f: 0, v: 16, ease: 'linear' }, { f: 8, v: 48, ease: 'linear' },
    ] };
    child.transform.y = { value: 32 };
    const g = createLayer('group', { name: 'g' });
    g.childOrder = [child.id];
    child.parentId = g.id;
    g.time = time;
    doc.layers[g.id] = g; doc.layers[child.id] = child;
    doc.order.push(g.id);

    const eng = createRenderEngine({ createCanvas: mk });
    const c = mk(64, 64); const ctx = c.getContext('2d', { willReadFrequently: true });
    eng.renderFrame(ctx, doc, rf, {});
    const data = Array.from(ctx.getImageData(0, 0, 64, 64).data);
    // 자식(검은 사각형)의 가로 중심을 알파로 추정
    let sum = 0, cnt = 0;
    for (let x = 0; x < 64; x++) { const a = data[(32 * 64 + x) * 4 + 3]; if (a > 10) { sum += x; cnt++; } }
    return { data, cx: cnt ? sum / cnt : null, cnt };
  };
}
const _eq = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };

test('offset 6: 그룹 안 0프레임 모습이 바깥 6프레임에 나온다 (렌더 동일)', async ({ page }) => {
  const r = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    const base = await setup({ time: null, rf: 2 }); // 시간 없음, 안쪽 2프레임
    const timed = await setup({ time: { offset: 4, speed: 1, outside: 'hold', length: null }, rf: 6 }); // 6-4=2
    return { base: base.data, timed: timed.data, cx: timed.cx };
  }, _setup().toString());
  expect(_eq(r.base, r.timed)).toBe(true);
});

test('speed 2: 바깥 3에서 안쪽 6 모습', async ({ page }) => {
  const r = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    const base = await setup({ time: null, rf: 6 });
    const timed = await setup({ time: { offset: 0, speed: 2, outside: 'hold', length: null }, rf: 3 });
    return { same: (function(a,b){for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;})(base.data, timed.data) };
  }, _setup().toString());
  expect(r.same).toBe(true);
});

test('범위 밖: loop 반복 · hold 끝값 유지 · hide 안 보임', async ({ page }) => {
  const r = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    // 안쪽 길이 8. 바깥 9 → 날 안쪽 9(>8).
    const loop9 = await setup({ time: { offset: 0, speed: 1, outside: 'loop', length: 8 }, rf: 9 }); // 9%8=1
    const base1 = await setup({ time: null, rf: 1 });
    const hold9 = await setup({ time: { offset: 0, speed: 1, outside: 'hold', length: 8 }, rf: 9 }); // clamp 8
    const base8 = await setup({ time: null, rf: 8 });
    const hide9 = await setup({ time: { offset: 0, speed: 1, outside: 'hide', length: 8 }, rf: 9 }); // 안 보임
    const hide5 = await setup({ time: { offset: 0, speed: 1, outside: 'hide', length: 8 }, rf: 5 }); // 보임
    const eq = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    return {
      loopEq: eq(loop9.data, base1.data),
      holdEq: eq(hold9.data, base8.data),
      hideHidden: hide9.cnt, hideShown: hide5.cnt,
    };
  }, _setup().toString());
  expect(r.loopEq).toBe(true);
  expect(r.holdEq).toBe(true);
  expect(r.hideHidden).toBe(0);      // hide 범위 밖 → 그룹이 안 그려짐
  expect(r.hideShown).toBeGreaterThan(0);
});

test('remap 키 (0→8, 8→0): 거꾸로 재생', async ({ page }) => {
  const r = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    const remap = { value: 8, keys: [{ f: 0, v: 8, ease: 'linear' }, { f: 8, v: 0, ease: 'linear' }] };
    const b0 = await setup({ time: { offset: 0, speed: 1, outside: 'hold', length: null, remap }, rf: 0 }); // 안쪽 8
    const base8 = await setup({ time: null, rf: 8 });
    const b8 = await setup({ time: { offset: 0, speed: 1, outside: 'hold', length: null, remap }, rf: 8 }); // 안쪽 0
    const base0 = await setup({ time: null, rf: 0 });
    const eq = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    return { startEq: eq(b0.data, base8.data), endEq: eq(b8.data, base0.data) };
  }, _setup().toString());
  expect(r.startEq).toBe(true);
  expect(r.endEq).toBe(true);
});

test('innerFrame·localFrame·outerFrame 계산', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { innerFrame, localFrame, outerFrame, groupHidden } = await import('/src/core/anim/time.js');
    const g = { time: { offset: 4, speed: 1, outside: 'hold', length: null } };
    const doc = {
      meta: { frameCount: 10 },
      layers: {
        g: { id: 'g', type: 'group', parentId: null, time: { offset: 4, speed: 1, outside: 'hold', length: null } },
        c: { id: 'c', type: 'shape', parentId: 'g' },
      },
    };
    return {
      inner6: innerFrame(g, 6, 10),               // 2
      speed2: innerFrame({ time: { offset: 0, speed: 2, length: 24 } }, 6, 10), // 12 (안쪽 길이 충분)
      local10: localFrame(doc, 'c', 10),          // 6
      outerBack: outerFrame(doc, 'c', 6),         // 10
      hideOut: groupHidden({ time: { outside: 'hide', length: 8 } }, 9, 10), // true
      hideIn: groupHidden({ time: { outside: 'hide', length: 8 } }, 5, 10),  // false
      noTime: innerFrame({ time: null }, 7, 10),  // 7
    };
  });
  expect(r.inner6).toBe(2);
  expect(r.speed2).toBe(12);
  expect(r.local10).toBe(6);
  expect(r.outerBack).toBe(10);
  expect(r.hideOut).toBe(true);
  expect(r.hideIn).toBe(false);
  expect(r.noTime).toBe(7);
});

test('그룹 안 레이어를 바깥 f=10(offset 4)에서 값 바꾸기 → 키가 안쪽 f=6에 생긴다', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { buildPropCmd } = await import('/src/ui/canvas/edit-prop.js');
    const doc = createDoc({ width: 64, height: 64, frameCount: 24 });
    const g = createLayer('group', { name: 'g' });
    const c = createLayer('shape', { name: 'c' });
    c.parentId = g.id; g.childOrder = [c.id]; g.time = { offset: 4, speed: 1, outside: 'hold', length: null };
    doc.layers[g.id] = g; doc.layers[c.id] = c; doc.order.push(g.id);
    const cmd = buildPropCmd(doc, c.id, 'transform.x', 123, 10, true); // autoKey, 바깥 f=10
    return { f: cmd.f, type: cmd.type };
  });
  expect(r.type).toBe('setProp');
  expect(r.f).toBe(6); // (10 - 4) * 1
});

test('time 없는(또는 항등) 문서는 픽셀 동일', async ({ page }) => {
  const r = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    const noTime = await setup({ time: null, rf: 4 });
    const identity = await setup({ time: { offset: 0, speed: 1, outside: 'hold', length: null, remap: null }, rf: 4 });
    const eq = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    return { same: eq(noTime.data, identity.data) };
  }, _setup().toString());
  expect(r.same).toBe(true);
});

test('저장 왕복: v8 문서 migrate → 그룹 time:null, time 설정 문서 JSON 왕복 보존', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { migrate, CURRENT_VERSION } = await import('/src/core/io/migrate.js');
    // v8 문서(그룹 포함, time 없음)
    const v8 = { version: 8, meta: { width: 64, height: 64, fps: 12, frameCount: 10 }, camera: {},
      order: ['g'], layers: { g: { id: 'g', type: 'group', transform: {}, childOrder: [] } }, assets: {} };
    const up = migrate(JSON.parse(JSON.stringify(v8)));
    const t = up.layers.g.time;
    // time 설정 문서 왕복
    const timedDoc = migrate(JSON.parse(JSON.stringify(v8)));
    timedDoc.layers.g.time = { offset: 3, speed: 2, outside: 'loop', length: 6, remap: null };
    const round = JSON.parse(JSON.stringify(timedDoc));
    return { ver: up.version, CURRENT_VERSION, groupTimeNull: t === null,
      keptOffset: round.layers.g.time.offset, keptSpeed: round.layers.g.time.speed, keptOutside: round.layers.g.time.outside };
  });
  expect(r.ver).toBe(r.CURRENT_VERSION);
  expect(r.groupTimeNull).toBe(true);
  expect(r.keptOffset).toBe(3);
  expect(r.keptSpeed).toBe(2);
  expect(r.keptOutside).toBe('loop');
});

test('기즈모 위치(worldTr) = 렌더 위치 (그룹 시간)', async ({ page }) => {
  const r = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { worldTr } = await import('/src/core/anim/world.js');
    // 렌더: offset 4, 바깥 6 → 안쪽 2 → 자식 중심 x
    const timed = await setup({ time: { offset: 4, speed: 1, outside: 'hold', length: null }, rf: 6 });
    // worldTr 로 같은 상황의 자식 x 를 계산
    const doc = createDoc({ width: 64, height: 64, frameCount: 10 });
    const g = createLayer('group'); const c = createLayer('shape');
    c.parentId = g.id; g.childOrder = [c.id]; g.time = { offset: 4, speed: 1, outside: 'hold', length: null };
    c.transform.x = { value: 16, keys: [{ f: 0, v: 16, ease: 'linear' }, { f: 8, v: 48, ease: 'linear' }] };
    c.transform.y = { value: 32 };
    doc.layers[g.id] = g; doc.layers[c.id] = c; doc.order.push(g.id);
    const w = worldTr(doc, c.id, 6, null);
    return { renderCx: timed.cx, worldX: w.x };
  }, _setup().toString());
  // 렌더로 잰 중심과 worldTr.x 가 1px 이내
  expect(Math.abs(r.renderCx - r.worldX)).toBeLessThan(1.5);
});

test('미리보기=내보내기: 그룹 시간 렌더는 결정론(두 번 호출 동일)', async ({ page }) => {
  const r = await page.evaluate(async (src) => {
    const setup = (new Function('return ' + src))();
    const a = await setup({ time: { offset: 2, speed: 1.5, outside: 'loop', length: 7 }, rf: 5 });
    const b = await setup({ time: { offset: 2, speed: 1.5, outside: 'loop', length: 7 }, rf: 5 });
    const eq = (x, y) => { for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; };
    return { same: eq(a.data, b.data) };
  }, _setup().toString());
  expect(r.same).toBe(true);
});
