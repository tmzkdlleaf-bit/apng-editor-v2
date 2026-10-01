import { test, expect } from '@playwright/test';

test.describe('P3 - 애니메이션 평가', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ── 1. 이징 — fixture 비교 (old/ 의존 없음) ──

  test('이징 18종: fixture와 소수 6자리까지 일치', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const ref = await fetch('/tests/fixtures/easing-reference.json').then(r => r.json());
      const { ease } = await import('/src/core/anim/easing.js');
      const NAMES = Object.keys(ref.easings);
      const N = ref.easings[NAMES[0]].length - 1;
      for (const name of NAMES) {
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const expected = ref.easings[name][i];
          const actual   = ease(name, t);
          if (Math.abs(expected - actual) > 1e-6) {
            return `${name} i=${i} t=${t}: expected=${expected} actual=${actual}`;
          }
        }
      }
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('이징: cubicBezier fixture와 일치', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const ref = await fetch('/tests/fixtures/easing-reference.json').then(r => r.json());
      const { ease } = await import('/src/core/anim/easing.js');
      const { control, samples } = ref.cubicBezier;
      const N = samples.length - 1;
      for (let i = 0; i <= N; i++) {
        const t      = i / N;
        const actual = ease('cubicBezier', t, control);
        if (Math.abs(samples[i] - actual) > 1e-6) {
          return `cubicBezier i=${i}: expected=${samples[i]} actual=${actual}`;
        }
      }
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 2. evalProp ──

  test('evalProp: keys 없음 → value 반환', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalProp } = await import('/src/core/anim/prop.js');
      return evalProp({ value: 42 }, 10) === 42 ? 'ok' : 'fail';
    });
    expect(ok).toBe('ok');
  });

  test('evalProp: keys 1개 → 프레임 무관하게 그 값', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalProp } = await import('/src/core/anim/prop.js');
      const prop = { value: 0, keys: [{ f: 5, v: 99, ease: 'linear' }] };
      const [a, b, c] = [evalProp(prop, 0), evalProp(prop, 5), evalProp(prop, 10)];
      return (a === 99 && b === 99 && c === 99) ? 'ok' : `${a} ${b} ${c}`;
    });
    expect(ok).toBe('ok');
  });

  test('evalProp: keys 여러 개 - 선형 보간', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalProp } = await import('/src/core/anim/prop.js');
      const prop = { value: 0, keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100, ease: 'linear' }] };
      const at0 = evalProp(prop, 0), mid = evalProp(prop, 5), at10 = evalProp(prop, 10);
      if (at0 !== 0) return `f=0: ${at0}`;
      if (Math.abs(mid - 50) > 1e-9) return `f=5: ${mid}`;
      if (at10 !== 100) return `f=10: ${at10}`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('evalProp: 첫 키 앞은 첫 값, 마지막 키 뒤는 마지막 값', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalProp } = await import('/src/core/anim/prop.js');
      const prop = { value: 0, keys: [{ f: 5, v: 10, ease: 'linear' }, { f: 15, v: 20, ease: 'linear' }] };
      const before = evalProp(prop, 0), after = evalProp(prop, 20);
      return (before === 10 && after === 20) ? 'ok' : `before=${before} after=${after}`;
    });
    expect(ok).toBe('ok');
  });

  test('evalProp: 이징(easeInOut) 보간이 선형과 다르다', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalProp } = await import('/src/core/anim/prop.js');
      const linMid  = evalProp({ value: 0, keys: [{ f:0, v:0, ease:'linear'    }, { f:10, v:100, ease:'linear'    }] }, 2);
      const curvMid = evalProp({ value: 0, keys: [{ f:0, v:0, ease:'easeInOut' }, { f:10, v:100, ease:'easeInOut' }] }, 2);
      // easeInOut(0.2) = 2*(0.2)^2 = 0.08 → 8
      return (Math.abs(linMid - 20) < 1e-9 && Math.abs(curvMid - 8) < 1e-9) ? 'ok'
        : `linear=${linMid} easeInOut=${curvMid}`;
    });
    expect(ok).toBe('ok');
  });

  // ── 3. 클립 — 기존 동작 ──

  test('클립: 구간 중 - t=(f-start)/length', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalClips } = await import('/src/core/anim/clip.js');
      const motion = { evaluate: (t) => ({ y: t * 100 }) };
      const layer  = { clips: [{ id:'c1', motionId:'m1', start:0, length:10, gain:1 }] };
      const ctx    = { width:100, height:100, motions: new Map([['m1', motion]]) };
      const r = evalClips(layer, 5, ctx);  // t=0.5 → y=50
      return Math.abs(r.y - 50) < 1e-9 ? 'ok' : `y=${r.y}`;
    });
    expect(ok).toBe('ok');
  });

  test('클립: hold=after - 끝난 뒤 t=1 유지', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalClips } = await import('/src/core/anim/clip.js');
      const motion = { evaluate: (t) => ({ y: t * 100 }) };
      const layer  = { clips: [{ id:'c1', motionId:'m1', start:0, length:10, gain:1, hold:'after' }] };
      const ctx    = { width:100, height:100, motions: new Map([['m1', motion]]) };
      return Math.abs(evalClips(layer, 20, ctx).y - 100) < 1e-9 ? 'ok' : 'fail';
    });
    expect(ok).toBe('ok');
  });

  test('클립: hold=none - 끝난 뒤 효과 없음', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalClips } = await import('/src/core/anim/clip.js');
      const motion = { evaluate: (t) => ({ y: t * 100 }) };
      const layer  = { clips: [{ id:'c1', motionId:'m1', start:0, length:10, gain:1, hold:'none' }] };
      const ctx    = { width:100, height:100, motions: new Map([['m1', motion]]) };
      return evalClips(layer, 20, ctx).y === 0 ? 'ok' : 'fail';
    });
    expect(ok).toBe('ok');
  });

  test('클립: gain - x/y/rotation에 곱, scale/alpha는 1+(v-1)*gain', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalClips } = await import('/src/core/anim/clip.js');
      const motion = { evaluate: () => ({ x:10, y:20, rotation:30, scale:2, alpha:0.5 }) };
      const layer  = { clips: [{ id:'c1', motionId:'m1', start:0, length:10, gain:0.5 }] };
      const ctx    = { width:100, height:100, motions: new Map([['m1', motion]]) };
      const r = evalClips(layer, 5, ctx);
      return (
        Math.abs(r.x        - 5)    < 1e-9 &&  // 10*0.5
        Math.abs(r.y        - 10)   < 1e-9 &&  // 20*0.5
        Math.abs(r.rotation - 15)   < 1e-9 &&  // 30*0.5
        Math.abs(r.scale    - 1.5)  < 1e-9 &&  // 1+(2-1)*0.5
        Math.abs(r.alpha    - 0.75) < 1e-9     // 1+(0.5-1)*0.5
      ) ? 'ok' : `x=${r.x} y=${r.y} rot=${r.rotation} scale=${r.scale} alpha=${r.alpha}`;
    });
    expect(ok).toBe('ok');
  });

  test('클립: 두 클립 합산 - 더하기/곱하기 누적', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalClips } = await import('/src/core/anim/clip.js');
      const m1 = { evaluate: () => ({ x:10, scale:2 }) };
      const m2 = { evaluate: () => ({ x:20, scale:3 }) };
      const layer = { clips: [
        { id:'c1', motionId:'m1', start:0, length:10, gain:1 },
        { id:'c2', motionId:'m2', start:0, length:10, gain:1 },
      ]};
      const ctx = { width:100, height:100, motions: new Map([['m1',m1],['m2',m2]]) };
      const r = evalClips(layer, 5, ctx);
      return (Math.abs(r.x - 30) < 1e-9 && Math.abs(r.scale - 6) < 1e-9) ? 'ok'
        : `x=${r.x} scale=${r.scale}`;
    });
    expect(ok).toBe('ok');
  });

  // ── 4. 새 클립 규칙 (재현 테스트 — 변경 전 실패 확인용) ──

  test('[신규] 클립: hold=both(기본) - 시작 전도 t=0 상태 적용', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalClips } = await import('/src/core/anim/clip.js');
      // alpha: t=0→0.5, t=1→1.0. 시작 전(f=5<start=10)에 t=0 상태 적용 → alpha=0.5
      const motion = { evaluate: (t) => ({ alpha: 0.5 + 0.5 * t }) };
      const layer  = { clips: [{ id:'c1', motionId:'m1', start:10, length:10, gain:1 }] };
      const ctx    = { width:100, height:100, motions: new Map([['m1', motion]]) };
      const r = evalClips(layer, 5, ctx);
      // hold='both'(기본) before → t=0 → alpha=0.5 → mAlpha=1+(0.5-1)*1=0.5
      return Math.abs(r.alpha - 0.5) < 1e-9 ? 'ok' : `alpha=${r.alpha}`;
    });
    expect(ok).toBe('ok');
  });

  test('[신규] 확인 예: 페이드인(start=6,length=6) → f=0~5 alpha=0', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalClips } = await import('/src/core/anim/clip.js');
      // fade-in: alpha 0→1
      const motion = { evaluate: (t) => ({ alpha: t }) };
      const layer  = { clips: [{ id:'c1', motionId:'m1', start:6, length:6, gain:1 }] };
      const ctx    = { width:100, height:100, motions: new Map([['m1', motion]]) };
      // f=3(< start=6): hold='both' → t=0 → alpha=0 → mAlpha=1+(0-1)*1=0
      const r = evalClips(layer, 3, ctx);
      return Math.abs(r.alpha - 0) < 1e-9 ? 'ok' : `alpha=${r.alpha}`;
    });
    expect(ok).toBe('ok');
  });

  test('[신규] 클립: loop는 구간 [start,start+length) 안에서만, 이후 hold 적용', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalClips } = await import('/src/core/anim/clip.js');
      const motion = { evaluate: (t) => ({ y: t * 100 }) };
      // loop=true, [0,10), hold 미지정 → 기본 'both'
      const layer = { clips: [{ id:'c1', motionId:'m1', start:0, length:10, gain:1, loop:true }] };
      const ctx   = { width:100, height:100, motions: new Map([['m1', motion]]) };
      const r5  = evalClips(layer, 5, ctx).y;   // within: (5%10)/10=0.5 → 50
      const r15 = evalClips(layer, 15, ctx).y;  // after: hold='both' → t=1 → 100
      if (Math.abs(r5  - 50)  > 1e-9) return `f=5 y=${r5}`;
      if (Math.abs(r15 - 100) > 1e-9) return `f=15 y=${r15}`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('[신규] 클립: cycle로 반복 주기 제어', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalClips } = await import('/src/core/anim/clip.js');
      const motion = { evaluate: (t) => ({ y: t * 100 }) };
      // cycle=5, length=20: 4 cycles within the clip
      const layer = { clips: [{ id:'c1', motionId:'m1', start:0, length:20, cycle:5, gain:1, loop:true }] };
      const ctx   = { width:100, height:100, motions: new Map([['m1', motion]]) };
      const r7 = evalClips(layer, 7, ctx).y;  // (7%5)/5=0.4 → 40
      const r2 = evalClips(layer, 2, ctx).y;  // (2%5)/5=0.4 → 40
      if (Math.abs(r7 - 40) > 1e-9) return `f=7 y=${r7}`;
      if (Math.abs(r7 - r2) > 1e-9) return `f=7=${r7} != f=2=${r2}`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('[신규] 클립: hold=before - 시작 전 t=0, 끝난 뒤 적용 안 함', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { evalClips } = await import('/src/core/anim/clip.js');
      const motion = { evaluate: (t) => ({ y: t * 100 }) };
      const layer  = { clips: [{ id:'c1', motionId:'m1', start:5, length:5, gain:1, hold:'before' }] };
      const ctx    = { width:100, height:100, motions: new Map([['m1', motion]]) };
      const rBefore = evalClips(layer, 2, ctx).y;   // t=0 → 0
      const rAfter  = evalClips(layer, 15, ctx).y;  // skip → 0
      if (rBefore !== 0) return `before y=${rBefore}`;
      if (rAfter  !== 0) return `after  y=${rAfter}`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 5. createClip ──

  test('[신규] createClip: 기본값 확인', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createClip } = await import('/src/core/doc/schema.js');
      const MOTIONS = (await import('/src/motions/registry.js')).default;
      const motion = MOTIONS.get('test-float');
      const clip = createClip(motion, { length: 24 });
      if (!clip.id.startsWith('clp_'))         return `id=${clip.id}`;
      if (clip.motionId !== 'test-float')       return `motionId=${clip.motionId}`;
      if (clip.start  !== 0)                    return `start=${clip.start}`;
      if (clip.length !== 24)                   return `length=${clip.length}`;
      if (clip.cycle  !== 24)                   return `cycle=${clip.cycle}`;
      if (clip.params.amplitude !== 20)         return `amplitude=${clip.params.amplitude}`;
      if (clip.gain   !== 1)                    return `gain=${clip.gain}`;
      if (clip.ease   !== null)                 return `ease=${clip.ease}`;
      if (clip.loop   !== true)                 return `loop=${clip.loop}`;
      if (clip.hold   !== 'both')               return `hold=${clip.hold}`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  test('[신규] createClip: init으로 override', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createClip } = await import('/src/core/doc/schema.js');
      const MOTIONS = (await import('/src/motions/registry.js')).default;
      const motion = MOTIONS.get('test-float');
      const clip = createClip(motion, { length: 12, cycle: 6, gain: 0.5, hold: 'none' });
      if (clip.length !== 12) return `length=${clip.length}`;
      if (clip.cycle  !== 6)  return `cycle=${clip.cycle}`;
      if (clip.gain   !== 0.5) return `gain=${clip.gain}`;
      if (clip.hold   !== 'none') return `hold=${clip.hold}`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 6. 루프 모션 계약 ──

  test('루프 모션 전체: evaluate(0) === evaluate(1)', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const MOTIONS = (await import('/src/motions/registry.js')).default;
      for (const [id, motion] of MOTIONS) {
        if (motion.group !== 'loop') continue;
        const r0 = motion.evaluate(0, {}, { width:100, height:100 });
        const r1 = motion.evaluate(1, {}, { width:100, height:100 });
        for (const key of ['x','y','rotation','scale','alpha']) {
          const v0 = r0[key] ?? (key==='scale'||key==='alpha' ? 1 : 0);
          const v1 = r1[key] ?? (key==='scale'||key==='alpha' ? 1 : 0);
          if (Math.abs(v0 - v1) > 1e-9) return `${id} ${key}: t=0→${v0} t=1→${v1}`;
        }
      }
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 7. checkLoopSeam ──

  test('[신규] checkLoopSeam: cycle 10(24프레임) → 목록에 나옴', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const { checkLoopSeam } = await import('/src/core/anim/seam.js');
      const MOTIONS = (await import('/src/motions/registry.js')).default;

      const store = createStore(createDoc({ frameCount: 24 }));
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      store.apply({ type: 'addClip', id: layer.id, clip: {
        id: 'clp_s1', motionId: 'test-float', start: 0, length: 24,
        cycle: 10, loop: true, gain: 1, params: { amplitude: 20 },
      }});

      const issues = checkLoopSeam(store.get(), MOTIONS);
      return issues.length > 0 ? 'ok' : `issues empty (cycle=10 should cause seam)`;
    });
    expect(ok).toBe('ok');
  });

  test('[신규] checkLoopSeam: cycle 12(24프레임) → 빈 목록', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const { checkLoopSeam } = await import('/src/core/anim/seam.js');
      const MOTIONS = (await import('/src/motions/registry.js')).default;

      const store = createStore(createDoc({ frameCount: 24 }));
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      store.apply({ type: 'addClip', id: layer.id, clip: {
        id: 'clp_s2', motionId: 'test-float', start: 0, length: 24,
        cycle: 12, loop: true, gain: 1, params: { amplitude: 20 },
      }});

      const issues = checkLoopSeam(store.get(), MOTIONS);
      return issues.length === 0 ? 'ok' : `unexpected issues: ${JSON.stringify(issues)}`;
    });
    expect(ok).toBe('ok');
  });

  test('[P3보완] checkLoopSeam: 페이드인 clip(0~6, loop=false) → alpha 항목', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { checkLoopSeam } = await import('/src/core/anim/seam.js');

      // alpha 0→1 페이드인 모션 (비-루프)
      const doc = {
        meta: { frameCount: 24, width: 100, height: 100 },
        camera: { x: {value:0}, y: {value:0}, zoom: {value:1} },
        order: ['lyr_fade'],
        layers: {
          'lyr_fade': {
            type: 'image', name: 'fade',
            visible: true, locked: false, blend: 'normal', opacity: 1,
            transform: {
              x: {value:0}, y: {value:0}, scale: {value:1},
              rotation: {value:0}, alpha: {value:1},
            },
            anchor: {x:0.5, y:0.5},
            clips: [{
              id: 'clp_f1', motionId: 'fade-test',
              start: 0, length: 6, cycle: 6,
              loop: false, gain: 1, hold: 'both', params: {},
            }],
            mask: null, adjust: null, tint: null, outline: null, exit: null,
          },
        },
        assets: {},
      };

      const motions = new Map([['fade-test', { evaluate: (t) => ({ alpha: t }) }]]);
      const issues = checkLoopSeam(doc, motions);
      const hasAlpha = issues.some(i => i.prop === 'alpha');
      return hasAlpha ? 'ok' : `alpha 항목 없음: ${JSON.stringify(issues)}`;
    });
    expect(ok).toBe('ok');
  });

  test('[P3보완] checkLoopSeam: 키프레임 y 0→100(f=23) → y 항목', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { checkLoopSeam } = await import('/src/core/anim/seam.js');

      const doc = {
        meta: { frameCount: 24, width: 100, height: 100 },
        camera: { x: {value:0}, y: {value:0}, zoom: {value:1} },
        order: ['lyr_key'],
        layers: {
          'lyr_key': {
            type: 'image', name: 'key',
            visible: true, locked: false, blend: 'normal', opacity: 1,
            transform: {
              x: {value:0},
              y: { value: 0, keys: [{f:0, v:0, ease:'linear'}, {f:23, v:100}] },
              scale: {value:1}, rotation: {value:0}, alpha: {value:1},
            },
            anchor: {x:0.5, y:0.5},
            clips: [],
            mask: null, adjust: null, tint: null, outline: null, exit: null,
          },
        },
        assets: {},
      };

      const issues = checkLoopSeam(doc, new Map());
      const hasY = issues.some(i => i.prop === 'y');
      return hasY ? 'ok' : `y 항목 없음: ${JSON.stringify(issues)}`;
    });
    expect(ok).toBe('ok');
  });

  // ── 8. 클립 삭제 후 기본값 복원 ──

  test('클립 삭제 후 evalTransform이 Prop 기본값과 같다', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
      const { createStore } = await import('/src/core/doc/store.js');
      const { evalTransform } = await import('/src/core/anim/evaluate.js');
      const MOTIONS = (await import('/src/motions/registry.js')).default;

      const store = createStore(createDoc());
      const layer = createLayer('image');
      store.apply({ type: 'addLayer', layer });
      const clipId = 'clp_p3test';
      store.apply({ type: 'addClip', id: layer.id, clip: {
        id: clipId, motionId: 'test-float', start: 0, length: 24,
        gain: 1, params: { amplitude: 50 },
      }});
      // f=3: t=3/24≈0.125, y=50*sin(2π*0.125)≈35 (비영)
      const withClip = evalTransform(store.get(), layer.id, 3, MOTIONS);
      if (Math.abs(withClip.y) < 1) return `클립 y가 너무 작음: ${withClip.y}`;

      store.apply({ type: 'removeClip', id: layer.id, clipId });
      const wc = evalTransform(store.get(), layer.id, 3, MOTIONS);
      if (Math.abs(wc.y)       > 1e-9) return `삭제 후 y=${wc.y}`;
      if (Math.abs(wc.x)       > 1e-9) return `삭제 후 x=${wc.x}`;
      if (Math.abs(wc.scale-1) > 1e-9) return `삭제 후 scale=${wc.scale}`;
      if (Math.abs(wc.alpha-1) > 1e-9) return `삭제 후 alpha=${wc.alpha}`;
      return 'ok';
    });
    expect(ok).toBe('ok');
  });

  // ── 9. evalCamera ──

  test('evalCamera: Prop 기본값 반환', async ({ page }) => {
    const ok = await page.evaluate(async () => {
      const { createDoc } = await import('/src/core/doc/schema.js');
      const { evalCamera } = await import('/src/core/anim/evaluate.js');
      const cam = evalCamera(createDoc(), 0);
      return (cam.x === 0 && cam.y === 0 && cam.zoom === 1) ? 'ok'
        : `x=${cam.x} y=${cam.y} zoom=${cam.zoom}`;
    });
    expect(ok).toBe('ok');
  });
});
