// R19 — 그래프 편집기(손잡이↔bezier·이어진 손잡이·F9·정지 키·이름 이징 근사·전환/편집).
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('손잡이 → bezier 변환 왕복 (오차 0.5 이하, 사실상 0)', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { segHandles, handleToBezier } = await import('/src/ui/timeline/graph-canvas.js');
    const k0 = { f: 0, v: 0, ease: 'cubicBezier', bezier: [0.25, 0.6, 0.7, 0.9] };
    const k1 = { f: 10, v: 100 };
    const h = segHandles(k0, k1);
    const bOut = handleToBezier(k0, k1, 'out', h.out.f, h.out.v); // x1,y1 복원
    const bIn  = handleToBezier(k0, k1, 'in',  h.in.f,  h.in.v);  // x2,y2 복원
    return { bOut, bIn };
  });
  expect(Math.abs(r.bOut[0] - 0.25)).toBeLessThan(1e-6);
  expect(Math.abs(r.bOut[1] - 0.6)).toBeLessThan(1e-6);
  expect(Math.abs(r.bIn[2] - 0.7)).toBeLessThan(1e-6);
  expect(Math.abs(r.bIn[3] - 0.9)).toBeLessThan(1e-6);
});

test('이어진 손잡이: 끌고 난 뒤 양쪽 실제 기울기 차이 1% 이하', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { handleToBezier, smoothLinkBezier, segSlope } = await import('/src/ui/timeline/graph-canvas.js');
    const keys = [
      { f: 0,  v: 0,   ease: 'cubicBezier', bezier: [0.3, 0.3, 0.7, 0.7] },
      { f: 10, v: 100, ease: 'cubicBezier', bezier: [0.3, 0.2, 0.7, 0.8], smooth: true },
      { f: 20, v: 40 },
    ];
    // 가운데 키의 나가는 손잡이를 새 위치로 끎
    const newBz = handleToBezier(keys[1], keys[2], 'out', 13, 60);
    const link = smoothLinkBezier(keys, 1, 'out', newBz); // 반대쪽(키0) bezier 조정
    const slopeOut = segSlope(keys[1], keys[2], 'out', newBz);
    const slopeIn  = segSlope(keys[0], keys[1], 'in',  link.bezier);
    return { slopeOut, slopeIn, linkF: link.f };
  });
  expect(r.linkF).toBe(0);
  expect(Math.abs(r.slopeOut - r.slopeIn) / Math.abs(r.slopeOut)).toBeLessThan(0.01);
});

test('F9: 가운데 키 앞뒤 구간 bezier 설정, 시작 키는 한쪽만', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { createDoc, createLayer } = await import('/src/core/doc/schema.js');
    const { createStore } = await import('/src/core/doc/store.js');
    const { easyEaseCommands } = await import('/src/ui/timeline/graph-canvas.js');
    const doc = createDoc();
    const l = createLayer('shape');
    l.transform.x = { value: 0, keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100, ease: 'linear' }, { f: 20, v: 0, ease: 'linear' }] };
    doc.layers[l.id] = l; doc.order.push(l.id);
    const store = createStore(doc);
    const path = 'transform.x';
    // 가운데 키 both
    const mid = easyEaseCommands(store.get(), [{ id: l.id, path, f: 10 }], 'both');
    store.apply(mid.length === 1 ? mid[0] : { type: 'batch', cmds: mid });
    const ks = () => store.get().layers[l.id].transform.x.keys;
    const k0 = ks().find(k => k.f === 0), k1 = ks().find(k => k.f === 10);
    const midOk = k1.ease === 'cubicBezier' && Math.abs(k1.bezier[0] - 0.33) < 1e-9 && k1.bezier[1] === 0
      && k0.ease === 'cubicBezier' && Math.abs(k0.bezier[2] - 0.67) < 1e-9 && k0.bezier[3] === 1;
    // 시작 키 both → 한쪽(나가는)만 명령
    const startCmds = easyEaseCommands(store.get(), [{ id: l.id, path, f: 0 }], 'both');
    return { midOk, startLen: startCmds.length, startF: startCmds[0]?.frames?.[0] };
  });
  expect(r.midOk).toBe(true);
  expect(r.startLen).toBe(1);
  expect(r.startF).toBe(0);
});

test('정지 키: 다음 키 전까지 값이 같다', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { evalProp } = await import('/src/core/anim/prop.js');
    const prop = { value: 0, keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100, ease: 'hold' }, { f: 20, v: 200, ease: 'linear' }] };
    return { f5: evalProp(prop, 5), f12: evalProp(prop, 12), f18: evalProp(prop, 18) };
  });
  expect(r.f5).toBeCloseTo(50, 5);   // 0→100 선형
  expect(r.f12).toBe(100);           // hold: 다음 키 전까지 유지
  expect(r.f18).toBe(100);
});

test('이름 이징 → 근사 베지어 오차 보고 이내 (≤0.05), 탄성·바운스는 null', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const { ease, cubicBezierEval, easeToBezier } = await import('/src/core/anim/easing.js');
    const names = ['easeIn', 'easeOut', 'easeInOut', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
      'easeOutQuint', 'easeInOutQuint', 'easeInOutSine', 'easeOutBack', 'easeInOutBack',
      'cssEase', 'cssEaseIn', 'cssEaseOut', 'cssEaseInOut'];
    let worst = 0, worstName = '';
    for (const n of names) {
      const bz = easeToBezier(n);
      let m = 0;
      for (let i = 0; i <= 100; i++) { const t = i / 100; m = Math.max(m, Math.abs(ease(n, t) - cubicBezierEval(bz[0], bz[1], bz[2], bz[3], t))); }
      if (m > worst) { worst = m; worstName = n; }
    }
    return { worst, worstName, elastic: easeToBezier('easeOutElastic'), bounce: easeToBezier('easeOutBounce'), hold: easeToBezier('hold') };
  });
  expect(r.worst).toBeLessThan(0.05);
  expect(r.elastic).toBeNull();
  expect(r.bounce).toBeNull();
  expect(r.hold).toBeNull();
});

test('UI: 그래프 전환(Shift+F3)·선택 유지·값 편집 되돌리기 1건', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage && window.__editorState));
  const id = await page.evaluate(async () => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const l = createLayer('shape', { name: '그래프' });
    l.shape = { kind: 'rect', w: 40, h: 40, fill: '#88ccff', stroke: null };
    l.transform.x = { value: 0, keys: [{ f: 0, v: 50, ease: 'linear' }, { f: 12, v: 300, ease: 'linear' }] };
    window.__store.apply({ type: 'addLayer', layer: l });
    window.__editorState.set({ selection: [l.id], kfSelection: [{ id: l.id, path: 'transform.x', f: 12 }], focusRegion: 'timeline' });
    return l.id;
  });

  // 그래프 버튼 → 켜짐
  await page.getByRole('button', { name: '그래프 편집기' }).click();
  await page.waitForTimeout(40);
  expect(await page.evaluate(() => window.__editorState.get().graphMode)).toBe(true);
  const on = await page.evaluate(() => document.querySelector('.timeline-tracks')?.classList.contains('graph-on'));
  expect(on).toBe(true);

  // 전환해도 키 선택 유지
  const selKept = await page.evaluate(() => {
    const s = window.__editorState.get().kfSelection;
    return s.length === 1 && s[0].f === 12;
  });
  expect(selKept).toBe(true);

  // 값 편집(아래 숫자 칸) → 키 v 변경 + 되돌리기 1건
  const r = await page.evaluate((lid) => {
    const d0 = window.__store.undoDepth();
    // 아래 숫자 칸: [0]=프레임, [1]=값
    const vInput = document.querySelectorAll('.graph-footer .graph-num-input')[1];
    vInput.value = '123';
    vInput.dispatchEvent(new Event('change', { bubbles: true }));
    const k = window.__store.get().layers[lid].transform.x.keys.find(k => k.f === 12);
    return { d0, d1: window.__store.undoDepth(), v: k.v };
  }, id);
  expect(r.v).toBe(123);
  expect(r.d1).toBe(r.d0 + 1);
});

test('UI: F9·Ctrl+Alt+H 단축키가 선택 키에 먹는다', async ({ page }) => {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__editorState));
  const id = await page.evaluate(async () => {
    const { createLayer } = await import('/src/core/doc/schema.js');
    const l = createLayer('shape', { name: 'F9' });
    l.transform.x = { value: 0, keys: [{ f: 0, v: 0, ease: 'linear' }, { f: 10, v: 100, ease: 'linear' }, { f: 20, v: 0, ease: 'linear' }] };
    window.__store.apply({ type: 'addLayer', layer: l });
    window.__editorState.set({ selection: [l.id], kfSelection: [{ id: l.id, path: 'transform.x', f: 10 }], focusRegion: 'timeline' });
    return l.id;
  });
  await page.keyboard.press('F9');
  await page.waitForTimeout(30);
  const afterF9 = await page.evaluate((lid) => {
    const k = window.__store.get().layers[lid].transform.x.keys.find(k => k.f === 10);
    return k.ease === 'cubicBezier';
  }, id);
  expect(afterF9).toBe(true);

  await page.keyboard.press('Control+Alt+h');
  await page.waitForTimeout(30);
  const afterHold = await page.evaluate((lid) => {
    const k = window.__store.get().layers[lid].transform.x.keys.find(k => k.f === 10);
    return k.ease;
  }, id);
  expect(afterHold).toBe('hold');
});
