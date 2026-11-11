// R16 — 효과 수치 키프레임(paramAnim): 값 보간 종류 확장·evalEffectParams·명령·마이그레이션·왕복·렌더.
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

// ── R16-1. 값 계산 확장 ──────────────────────────────────────────────────

test('evalProp: 숫자 보간은 기존과 비트 단위로 같다', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { evalProp } = await import('/src/core/anim/prop.js');
    const prop = { value: 0, keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100, ease: 'linear' }] };
    return evalProp(prop, 5) === 50 && evalProp(prop, 3) === 30 ? 'ok' : 'fail';
  });
  expect(ok).toBe('ok');
});

test('evalProp: 색 #000000→#ffffff 가운데 ≈ #808080', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { evalProp } = await import('/src/core/anim/prop.js');
    const prop = { keys: [{ f: 0, v: '#000000', ease: 'linear' }, { f: 12, v: '#ffffff', ease: 'linear' }] };
    return evalProp(prop, 6);
  });
  // ±1 (128 = 0x80)
  const n = parseInt(r.slice(1), 16);
  const g = (n >> 8) & 255;
  expect(Math.abs(g - 128)).toBeLessThanOrEqual(1);
});

test('evalProp: 좌표 {x,y} 는 축별 같은 비율로 보간', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { evalProp } = await import('/src/core/anim/prop.js');
    const prop = { keys: [{ f: 0, v: { x: 0, y: 0 }, ease: 'linear' }, { f: 10, v: { x: 10, y: 20 }, ease: 'linear' }] };
    return evalProp(prop, 5);
  });
  expect(r.x).toBeCloseTo(5, 6);
  expect(r.y).toBeCloseTo(10, 6);
});

test('evalProp: select(문자열)·bool 은 계단(앞 키 유지)', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { evalProp } = await import('/src/core/anim/prop.js');
    const sel = { keys: [{ f: 0, v: 'a', ease: 'linear' }, { f: 10, v: 'b', ease: 'linear' }] };
    const bl = { keys: [{ f: 0, v: false, ease: 'linear' }, { f: 10, v: true, ease: 'linear' }] };
    return (evalProp(sel, 5) === 'a' && evalProp(sel, 10) === 'b' &&
            evalProp(bl, 5) === false && evalProp(bl, 10) === true) ? 'ok' : 'fail';
  });
  expect(ok).toBe('ok');
});

test("evalProp: 'hold'(정지 키) 는 다음 키 전까지 앞 값 유지", async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { evalProp } = await import('/src/core/anim/prop.js');
    const { EASE_LABELS } = await import('/src/core/anim/easing.js');
    const p = { keys: [{ f: 0, v: 0, ease: 'hold' }, { f: 10, v: 100, ease: 'linear' }] };
    return (evalProp(p, 5) === 0 && evalProp(p, 9) === 0 && evalProp(p, 10) === 100 && EASE_LABELS.hold === '정지') ? 'ok' : 'fail';
  });
  expect(ok).toBe('ok');
});

// ── R16-2. evalEffectParams ──────────────────────────────────────────────

test('evalEffectParams: 정적 params + default 채움 + 키 값이 이긴다', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { evalEffectParams } = await import('/src/core/anim/params.js');
    const { getEffect } = await import('/src/effects/registry.js');
    const eff = getEffect('glow');
    const layer = { type: 'effect', params: { radius: 0.5 }, paramAnim: {
      intensity: { keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 12, v: 1, ease: 'linear' }] },
    } };
    const p0 = evalEffectParams(layer, eff, 0);
    const p6 = evalEffectParams(layer, eff, 6);
    // radius 는 정적, intensity 는 키(0→0.5→1), color 는 default 채움
    return (p0.radius === 0.5 && p0.intensity === 0 && Math.abs(p6.intensity - 0.5) < 1e-6
            && p0.color === '#ffd27a') ? 'ok' : JSON.stringify({ p0, p6 });
  });
  expect(ok).toBe('ok');
});

test('evalEffectParams: float 는 min/max, int 는 반올림 후 막는다', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { evalEffectParams } = await import('/src/core/anim/params.js');
    const eff = { params: [
      { key: 'a', type: 'float', default: 0.5, min: 0, max: 1 },
      { key: 'b', type: 'int', default: 1, min: 0, max: 6 },
    ] };
    const p = evalEffectParams({ params: { a: 5, b: 2.7 } }, eff, 0);
    return (p.a === 1 && p.b === 3) ? 'ok' : JSON.stringify(p);
  });
  expect(ok).toBe('ok');
});

// ── R16-1 렌더: 빛무리 세기 0→1 → 밝기가 차례로 커진다 ──────────────────────

test('렌더: 빛무리 세기 0(f0)→1(f12) — f0<f6<f12 밝기', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const H = await import('/tests/e1-helpers.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createLayer, createDoc } = await import('/src/core/doc/schema.js');
    const effects = (await import('/src/effects/registry.js')).effects;

    const doc = createDoc({ width: 64, height: 64, fps: 12, frameCount: 24 });
    const fx = createLayer('effect', { name: 'glow', effectId: 'glow' });
    fx.params = { center: { x: 0.5, y: 0.5 }, radius: 0.45, intensity: 0, pulse: 0, color: '#ffffff' };
    fx.paramAnim = { intensity: { keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 12, v: 1, ease: 'linear' }] } };
    doc.layers[fx.id] = fx; doc.order.push(fx.id);
    const eng = createRenderEngine({ createCanvas: H.createCanvas, effects });
    const sumA = (f) => {
      const c = H.createCanvas(64, 64); const cx = c.getContext('2d', { willReadFrequently: true });
      eng.invalidate?.(); eng.renderFrame(cx, doc, f, {});
      const d = cx.getImageData(0, 0, 64, 64).data; let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i];
      return s;
    };
    return { a0: sumA(0), a6: sumA(6), a12: sumA(12) };
  });
  expect(r.a0).toBe(0);           // 세기 0 → 아무것도 안 그림
  expect(r.a6).toBeGreaterThan(r.a0);
  expect(r.a12).toBeGreaterThan(r.a6);
});

test('렌더: 같은 프레임 두 번 렌더가 동일(내보내기=미리보기 같은 함수)', async ({ page }) => {
  const same = await page.evaluate(async () => {
    const H = await import('/tests/e1-helpers.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createLayer, createDoc } = await import('/src/core/doc/schema.js');
    const effects = (await import('/src/effects/registry.js')).effects;
    const doc = createDoc({ width: 48, height: 48, fps: 12, frameCount: 24 });
    const fx = createLayer('effect', { name: 'glow', effectId: 'glow' });
    fx.params = { center: { x: 0.5, y: 0.5 }, radius: 0.5, intensity: 0.5, pulse: 0, color: '#88ccff' };
    fx.paramAnim = { intensity: { keys: [{ f: 0, v: 0.2, ease: 'linear' }, { f: 23, v: 1, ease: 'linear' }] } };
    doc.layers[fx.id] = fx; doc.order.push(fx.id);
    const eng = createRenderEngine({ createCanvas: H.createCanvas, effects });
    const px = () => { const c = H.createCanvas(48, 48); const cx = c.getContext('2d', { willReadFrequently: true }); eng.invalidate?.(); eng.renderFrame(cx, doc, 7, {}); return Array.from(cx.getImageData(0, 0, 48, 48).data); };
    const a = px(), b = px();
    let s = a.length === b.length; for (let i = 0; s && i < a.length; i++) if (a[i] !== b[i]) s = false;
    return s;
  });
  expect(same).toBe(true);
});

test('렌더: paramAnim 없는 효과는 기존과 같은 결과(정적 params)', async ({ page }) => {
  const same = await page.evaluate(async () => {
    const H = await import('/tests/e1-helpers.js');
    const { createRenderEngine } = await import('/src/core/render/frame.js');
    const { createLayer, createDoc } = await import('/src/core/doc/schema.js');
    const effects = (await import('/src/effects/registry.js')).effects;
    function render(withEmptyAnim) {
      const doc = createDoc({ width: 48, height: 48, fps: 12, frameCount: 12 });
      const fx = createLayer('effect', { name: 'glow', effectId: 'glow' });
      fx.params = { center: { x: 0.5, y: 0.5 }, radius: 0.4, intensity: 0.7, pulse: 2, color: '#ffd27a' };
      if (withEmptyAnim) fx.paramAnim = {}; else delete fx.paramAnim;
      doc.layers[fx.id] = fx; doc.order.push(fx.id);
      const eng = createRenderEngine({ createCanvas: H.createCanvas, effects });
      const c = H.createCanvas(48, 48); const cx = c.getContext('2d', { willReadFrequently: true });
      eng.invalidate?.(); eng.renderFrame(cx, doc, 4, {});
      return Array.from(cx.getImageData(0, 0, 48, 48).data);
    }
    const a = render(false), b = render(true);
    let s = a.length === b.length; for (let i = 0; s && i < a.length; i++) if (a[i] !== b[i]) s = false;
    return s;
  });
  expect(same).toBe(true);
});

// ── R16-3. 명령 ──────────────────────────────────────────────────────────

test('setParamAnim on/off: 되돌리기 1건, on→키 생성, off→params 로 굳힘', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createStore } = await import('/src/core/doc/store.js');
    const store = createStore(createDoc());
    const fx = createLayer('effect', { effectId: 'glow' });
    fx.params = { intensity: 0.4 };
    store.apply({ type: 'addLayer', layer: fx });
    const before = store.undoDepth();

    store.apply({ type: 'setParamAnim', id: fx.id, key: 'intensity', on: true, f: 0 });
    const a = store.get().layers[fx.id].paramAnim.intensity;
    if (!(a?.keys?.length === 1 && a.keys[0].v === 0.4 && a.keys[0].ease === 'linear')) return 'on 키 틀림: ' + JSON.stringify(a);
    if (store.undoDepth() !== before + 1) return 'on 되돌리기 1건 아님';

    // 다른 프레임에 키 추가 후 off → 현재(f6) 계산값을 params 로
    store.apply({ type: 'setProp', id: fx.id, path: 'paramAnim.intensity', value: 1, f: 12 });
    store.apply({ type: 'setParamAnim', id: fx.id, key: 'intensity', on: false, f: 6 });
    const l = store.get().layers[fx.id];
    if (l.paramAnim.intensity !== undefined) return 'off 후 paramAnim 남음';
    if (Math.abs(l.params.intensity - 0.7) > 1e-6) return 'off baked 값 틀림: ' + l.params.intensity;

    store.undo(); // off 취소 → 키 복원
    if (store.get().layers[fx.id].paramAnim.intensity?.keys?.length !== 2) return 'undo 후 키 복원 안 됨';
    return 'ok';
  });
  expect(ok).toBe('ok');
});

test('기존 키 명령이 paramAnim.<key> 경로에서 동작 + 이징 유지', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createStore } = await import('/src/core/doc/store.js');
    const store = createStore(createDoc());
    const fx = createLayer('effect', { effectId: 'glow' });
    fx.paramAnim = { intensity: { keys: [{ f: 0, v: 0, ease: 'easeInOut' }, { f: 10, v: 1, ease: 'linear' }] } };
    store.apply({ type: 'addLayer', layer: fx });
    const path = 'paramAnim.intensity';
    // setProp 로 값만 바꿔도 이징 유지(R2-3)
    store.apply({ type: 'setProp', id: fx.id, path, value: 0.3, f: 0 });
    const k0 = store.get().layers[fx.id].paramAnim.intensity.keys.find((k) => k.f === 0);
    if (!(k0.v === 0.3 && k0.ease === 'easeInOut')) return 'setProp 이징 유지 실패: ' + JSON.stringify(k0);
    // moveKeys
    store.apply({ type: 'moveKeys', id: fx.id, refs: [{ path, f: 10 }], delta: 2 });
    if (!store.get().layers[fx.id].paramAnim.intensity.keys.some((k) => k.f === 12)) return 'moveKeys 실패';
    // removeKey
    store.apply({ type: 'removeKey', id: fx.id, path, f: 0 });
    if (store.get().layers[fx.id].paramAnim.intensity.keys.some((k) => k.f === 0)) return 'removeKey 실패';
    return 'ok';
  });
  expect(ok).toBe('ok');
});

// ── 루프 이음새 ───────────────────────────────────────────────────────────

test('checkLoopSeam: 효과 수치가 처음≠끝 → param 항목', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { checkLoopSeam } = await import('/src/core/anim/seam.js');
    const doc = createDoc({ frameCount: 24 });
    const fx = createLayer('effect', { effectId: 'glow' });
    fx.paramAnim = { intensity: { keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 23, v: 1, ease: 'linear' }] } };
    doc.layers[fx.id] = fx; doc.order.push(fx.id);
    const issues = checkLoopSeam(doc, new Map());
    return issues.some((i) => i.kind === 'param' && i.key === 'intensity') ? 'ok' : JSON.stringify(issues);
  });
  expect(ok).toBe('ok');
});

// ── R16-5. 타임라인 animatedProps ────────────────────────────────────────

test('animatedProps: 변형 키 + 효과 paramAnim 키(효과 라벨)', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { animatedProps } = await import('/src/ui/timeline/rows.js');
    const { getProp } = await import('/src/core/anim/props.js');
    const layer = {
      type: 'effect', effectId: 'glow',
      transform: { x: { value: 0, keys: [{ f: 0, v: 0 }, { f: 5, v: 10 }] }, y: { value: 0 }, scale: { value: 1 }, rotation: { value: 0 }, alpha: { value: 1 } },
      paramAnim: { intensity: { keys: [{ f: 0, v: 0 }, { f: 10, v: 1 }] } },
    };
    const ap = animatedProps(layer);
    const paths = ap.map((p) => p.path);
    const intensity = ap.find((p) => p.path === 'paramAnim.intensity');
    const gp = getProp(layer, 'paramAnim.intensity');
    return (paths.includes('transform.x') && paths.includes('paramAnim.intensity')
            && intensity.label === '세기' && gp?.keys?.length === 2) ? 'ok' : JSON.stringify({ paths, label: intensity?.label });
  });
  expect(ok).toBe('ok');
});

// ── 마이그레이션 · 왕복 · 복제 ──────────────────────────────────────────────

test('migrate: v3 문서 → 최신(paramAnim 없이 그대로), 버전만 올림', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { migrate, CURRENT_VERSION } = await import('/src/core/io/migrate.js');
    const { createLayer } = await import('/src/core/doc/schema.js');
    const fx = createLayer('effect', { effectId: 'glow' });
    delete fx.paramAnim; fx.params = { intensity: 0.7 };
    const v3 = {
      format: 'apng-editor', version: 3,
      meta: { width: 64, height: 64, fps: 12, frameCount: 24 },
      camera: { x: { value: 0 }, y: { value: 0 }, zoom: { value: 1 } },
      order: [fx.id], layers: { [fx.id]: fx }, assets: {},
    };
    const d = migrate(v3);
    if (d.version !== CURRENT_VERSION) return 'version != CURRENT_VERSION';
    if (d.layers[fx.id].params.intensity !== 0.7) return 'params 유실';
    return 'ok';
  });
  expect(ok).toBe('ok');
});

test('프로젝트 파일 왕복: paramAnim 유지', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { buildProjectFile, importProjectFile } = await import('/src/core/io/project-file.js');
    const doc = createDoc();
    const fx = createLayer('effect', { effectId: 'glow' });
    fx.paramAnim = { intensity: { keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 12, v: 1, ease: 'linear' }] },
                     center: { keys: [{ f: 0, v: { x: 0.2, y: 0.3 }, ease: 'linear' }] } };
    doc.layers[fx.id] = fx; doc.order.push(fx.id);
    const file = JSON.parse(JSON.stringify(await buildProjectFile(doc)));
    const { doc: back } = await importProjectFile(file);
    const a = back.layers[fx.id]?.paramAnim;
    return (a?.intensity?.keys?.length === 2 && a.center.keys[0].v.x === 0.2 && back.version >= 4) ? 'ok' : JSON.stringify(a);
  });
  expect(ok).toBe('ok');
});

test('duplicateLayers: paramAnim 그대로 복제', async ({ page }) => {
  const ok = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createStore } = await import('/src/core/doc/store.js');
    const store = createStore(createDoc());
    const fx = createLayer('effect', { effectId: 'glow' });
    fx.paramAnim = { intensity: { keys: [{ f: 0, v: 0 }, { f: 10, v: 1 }] } };
    store.apply({ type: 'addLayer', layer: fx });
    store.apply({ type: 'duplicateLayers', ids: [fx.id] });
    const doc = store.get();
    const dupId = doc.order.find((id) => id !== fx.id);
    const a = doc.layers[dupId]?.paramAnim?.intensity;
    // 복제본은 독립(원본 키 바꿔도 영향 없음)
    const independent = a && a !== doc.layers[fx.id].paramAnim.intensity;
    return (a?.keys?.length === 2 && independent) ? 'ok' : JSON.stringify(a);
  });
  expect(ok).toBe('ok');
});
