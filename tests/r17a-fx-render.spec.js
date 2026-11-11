// R17a — 레이어 효과 쌓기(fx): 렌더·데이터·명령. 화면(UI)은 R17b.
// 레이어는 도형(shape)으로 검증한다(에셋 없이 leaf fx 경로를 그대로 탄다).
import { test, expect } from './helpers/fixtures.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

// 공용 헬퍼를 페이지에 올리는 스크립트(각 evaluate 안에서 import).
const SETUP = `
  const H = await import('/tests/e1-helpers.js');
  const { createDoc, createLayer, createFx } = await import('/src/core/doc/schema.js');
  const { createStore } = await import('/src/core/doc/store.js');
  const { createRenderEngine } = await import('/src/core/render/frame.js');
  const effects = (await import('/src/effects/registry.js')).effects;
  const W = 80, Hh = 80;
  function sq(x = 40, extra = {}) {
    const doc = createDoc({ width: W, height: Hh, fps: 12, frameCount: 24 });
    const s = createLayer('shape', { name: 'sq' });
    s.shape = { kind: 'rect', w: 40, h: 40, radius: 0, fill: '#ff0000', stroke: null };
    s.transform.x.value = x; s.transform.y.value = 40;
    Object.assign(s, extra);
    doc.layers[s.id] = s; doc.order.push(s.id);
    return { doc, id: s.id };
  }
  function px(doc, f = 0) {
    const eng = createRenderEngine({ createCanvas: H.createCanvas, effects });
    const c = H.createCanvas(W, Hh); const cx = c.getContext('2d', { willReadFrequently: true });
    eng.invalidate?.(); eng.renderFrame(cx, doc, f, {});
    return cx.getImageData(0, 0, W, Hh).data;
  }
  function same(a, b) { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  function bbox(d) { let x0=1e9,y0=1e9,x1=-1,y1=-1; for (let y=0;y<Hh;y++) for (let x=0;x<W;x++){ const a=d[(y*W+x)*4+3]; if(a>20){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; } } return {x0,y0,x1,y1}; }
  function centroidX(d) { let s=0,sx=0; for (let y=0;y<Hh;y++) for (let x=0;x<W;x++){ const a=d[(y*W+x)*4+3]; s+=a; sx+=a*x; } return s?sx/s:0; }
  function diffCount(a, b) { let n=0; for (let i=0;i<a.length;i+=4){ if (Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])+Math.abs(a[i+3]-b[i+3])>8) n++; } return n; }
`;

test('fx 없음/비어 있음 = 기존 렌더와 픽셀 동일', async ({ page }) => {
  const ok = await page.evaluate(async (setup) => {
    eval('0'); // noop
    const run = new Function('return (async()=>{' + setup + `
      const base = sq().doc;
      const a = px(base);
      const withEmpty = sq().doc; // createLayer 가 이미 fx:{}, fxOrder:[] 를 넣음
      const b = px(withEmpty);
      // fx 필드를 아예 지운 것과도 같아야 한다
      const d3 = sq().doc; const lid = Object.keys(d3.layers)[0];
      delete d3.layers[lid].fx; delete d3.layers[lid].fxOrder;
      const c = px(d3);
      return same(a, b) && same(a, c) ? 'ok' : 'diff';
    })()`);
    return run();
  }, SETUP);
  expect(ok).toBe('ok');
});

test('효과 끄기 = 효과 없음 픽셀 동일, mix 0 = 효과 없음 픽셀 동일', async ({ page }) => {
  const ok = await page.evaluate(async (setup) => {
    const run = new Function('return (async()=>{' + setup + `
      const plain = px(sq().doc);
      // 꺼진 효과
      const d1 = sq().doc; const id1 = Object.keys(d1.layers)[0];
      d1.layers[id1].fx = { f1: createFx('glow', { enabled: false }) };
      d1.layers[id1].fxOrder = ['f1'];
      // mix 0
      const d2 = sq().doc; const id2 = Object.keys(d2.layers)[0];
      d2.layers[id2].fx = { f1: createFx('glow', { mix: { value: 0 } }) };
      d2.layers[id2].fxOrder = ['f1'];
      return (same(plain, px(d1)) && same(plain, px(d2))) ? 'ok' : 'diff';
    })()`);
    return run();
  }, SETUP);
  expect(ok).toBe('ok');
});

test('도형 + 색수차(clip): 레이어 모양 밖은 비고 안쪽 색이 어긋난다', async ({ page }) => {
  const r = await page.evaluate(async (setup) => {
    const run = new Function('return (async()=>{' + setup + `
      const plainDoc = sq().doc; const plain = px(plainDoc);
      const d = sq().doc; const id = Object.keys(d.layers)[0];
      d.layers[id].fx = { f1: createFx('chromatic', { clip: true, params: { offset: 1, range: 'full', direction: 0 } }) };
      d.layers[id].fxOrder = ['f1'];
      const a = px(d);
      const bp = bbox(plain), ba = bbox(a);
      return JSON.stringify({ changed: diffCount(plain, a), bp, ba });
    })()`);
    return run();
  }, SETUP);
  const { changed, bp, ba } = JSON.parse(r);
  expect(changed).toBeGreaterThan(0);          // 색이 어긋남
  expect(ba.x0).toBeGreaterThanOrEqual(bp.x0 - 1); // clip: 모양 밖으로 안 넘침
  expect(ba.x1).toBeLessThanOrEqual(bp.x1 + 1);
});

test('도형 + 빛무리(clip 끔): 레이어 밖까지 번지고, 옮기면 빛도 옮겨진다', async ({ page }) => {
  const r = await page.evaluate(async (setup) => {
    const run = new Function('return (async()=>{' + setup + `
      function glowDoc(x) {
        const { doc, id } = sq(x);
        doc.layers[id].fx = { f1: createFx('glow', { clip: false, params: { radius: 1.2, intensity: 1, pulse: 0, color: '#ffffff', center: { x: 0.5, y: 0.5 } } }) };
        doc.layers[id].fxOrder = ['f1'];
        return doc;
      }
      const a = px(glowDoc(40));
      const b = px(glowDoc(58));
      const ba = bbox(a);
      // 모양(20..60) 밖 왼쪽에 빛이 있나
      let leftGlow = 0; for (let y=0;y<Hh;y++){ const al=a[(y*W+10)*4+3]; if(al>10) leftGlow++; }
      return JSON.stringify({ leftGlow, ca: centroidX(a), cb: centroidX(b) });
    })()`);
    return run();
  }, SETUP);
  const { leftGlow, ca, cb } = JSON.parse(r);
  expect(leftGlow).toBeGreaterThan(0);  // 레이어 밖까지 번짐
  expect(cb).toBeGreaterThan(ca + 5);   // 레이어를 옮기면 빛도 같이
});

test('순서 바꾸기 → 결과 달라지고, 되돌리기 1번에 원래대로', async ({ page }) => {
  const ok = await page.evaluate(async (setup) => {
    const run = new Function('return (async()=>{' + setup + `
      const { doc, id } = sq();
      const store = createStore(doc);
      store.apply({ type: 'addFx', id, effectId: 'chromatic', fxId: 'fx_c', init: { params: { offset: 1, range: 'full' } } });
      store.apply({ type: 'addFx', id, effectId: 'glow', fxId: 'fx_g', init: { clip: false, params: { radius: 1.2, intensity: 1, pulse: 0 } } });
      const order1 = px(store.get()); // [c, g]
      const depth0 = store.undoDepth();
      store.apply({ type: 'moveFx', id, fxId: 'fx_g', index: 0 }); // [g, c]
      const order2 = px(store.get());
      if (store.undoDepth() !== depth0 + 1) return 'move 되돌리기 1건 아님';
      if (same(order1, order2)) return '순서 바꿔도 같음';
      store.undo();
      const back = px(store.get());
      return same(order1, back) ? 'ok' : 'undo 복원 실패';
    })()`);
    return run();
  }, SETUP);
  expect(ok).toBe('ok');
});

test('확대 300%: fx 경로가 내용을 해상도 k 로 구워 가장자리가 더 뭉개지지 않는다', async ({ page }) => {
  const r = await page.evaluate(async (setup) => {
    const run = new Function('return (async()=>{' + setup + `
      // 20px 사각형을 3배로. 가장자리의 부분 알파(0<a<255) 픽셀 수로 선명도 비교.
      function mk(withFx) {
        const doc = createDoc({ width: W, height: Hh, fps: 12, frameCount: 24 });
        const s = createLayer('shape', { name: 'sq' });
        s.shape = { kind: 'rect', w: 8, h: 8, radius: 0, fill: '#ffffff', stroke: null };
        s.transform.x.value = 40; s.transform.y.value = 40; s.transform.scale.value = 3;
        if (withFx) { s.fx = { f1: createFx('glow', { mix: { value: 0 } }) }; s.fxOrder = ['f1']; } // mix 0: 효과 없이 fx 경로만
        doc.layers[s.id] = s; doc.order.push(s.id);
        return doc;
      }
      const edge = (d) => { let n=0; for (let i=3;i<d.length;i+=4){ if (d[i]>8 && d[i]<247) n++; } return n; };
      const ePlain = edge(px(mk(false)));
      const eFx = edge(px(mk(true)));
      return JSON.stringify({ ePlain, eFx });
    })()`);
    return run();
  }, SETUP);
  const { ePlain, eFx } = JSON.parse(r);
  // fx 경로는 k 해상도로 구워 blit 하므로 가장자리가 plain(네이티브 업스케일)보다 많지 않아야 한다.
  expect(eFx).toBeLessThanOrEqual(ePlain + 2);
});

test('그룹에 효과: 자식 전체에 한 번 적용(결과가 달라지고 결정론)', async ({ page }) => {
  const ok = await page.evaluate(async (setup) => {
    const run = new Function('return (async()=>{' + setup + `
      function groupDoc(withFx) {
        const doc = createDoc({ width: W, height: Hh, fps: 12, frameCount: 24 });
        const a = createLayer('shape', { name: 'a' }); a.shape = { kind:'rect', w:20, h:20, fill:'#ff0000', stroke:null }; a.transform.x.value=30; a.transform.y.value=40;
        const b = createLayer('shape', { name: 'b' }); b.shape = { kind:'rect', w:20, h:20, fill:'#00ff00', stroke:null }; b.transform.x.value=55; b.transform.y.value=40;
        const g = createLayer('group', { name: 'g', childOrder: [a.id, b.id] });
        a.parentId = g.id; b.parentId = g.id;
        if (withFx) { g.fx = { f1: createFx('chromatic', { clip: true, params: { offset: 1, range: 'full' } }) }; g.fxOrder = ['f1']; }
        doc.layers[a.id]=a; doc.layers[b.id]=b; doc.layers[g.id]=g; doc.order.push(g.id);
        return doc;
      }
      const plain = px(groupDoc(false));
      const fx1 = px(groupDoc(true));
      const fx2 = px(groupDoc(true));
      if (same(plain, fx1)) return '그룹 효과가 결과를 안 바꿈';
      if (!same(fx1, fx2)) return '그룹 효과 비결정론';
      return 'ok';
    })()`);
    return run();
  }, SETUP);
  expect(ok).toBe('ok');
});

test('미리보기 = 내보내기(같은 프레임 두 번 렌더 동일) · 저장 왕복에서 fx 유지', async ({ page }) => {
  const ok = await page.evaluate(async (setup) => {
    const run = new Function('return (async()=>{' + setup + `
      const { buildProjectFile, importProjectFile } = await import('/src/core/io/project-file.js');
      const { doc, id } = sq();
      const store = createStore(doc);
      store.apply({ type: 'addFx', id, effectId: 'glow', fxId: 'fx_g', init: { clip: false, params: { radius: 1, intensity: 0.8, pulse: 0 } } });
      store.apply({ type: 'setProp', id, path: 'fx.fx_g.mix', value: 0.5 }); // mix 는 Prop — setProp 경로가 그대로 먹힘
      const a = px(store.get(), 3), b = px(store.get(), 3);
      if (!same(a, b)) return '같은 프레임 비결정론';
      const file = JSON.parse(JSON.stringify(await buildProjectFile(store.get())));
      const { doc: back } = await importProjectFile(file);
      const fx = back.layers[id]?.fx?.fx_g;
      if (!(fx && fx.effectId === 'glow' && fx.clip === false && fx.mix.value === 0.5)) return 'fx 유실: ' + JSON.stringify(fx);
      if (!(back.layers[id].fxOrder || []).includes('fx_g')) return 'fxOrder 유실';
      return 'ok';
    })()`);
    return run();
  }, SETUP);
  expect(ok).toBe('ok');
});

test('복제: fx id 가 새로 바뀌고 fxOrder 도 같이 바뀐다', async ({ page }) => {
  const ok = await page.evaluate(async (setup) => {
    const run = new Function('return (async()=>{' + setup + `
      const { doc, id } = sq();
      const store = createStore(doc);
      store.apply({ type: 'addFx', id, effectId: 'glow', fxId: 'fx_g', init: {} });
      store.apply({ type: 'duplicateLayers', ids: [id] });
      const d = store.get();
      const dupId = d.order.find((x) => x !== id);
      const dup = d.layers[dupId];
      const origFxId = Object.keys(d.layers[id].fx)[0];
      const dupFxId = Object.keys(dup.fx)[0];
      if (dupFxId === origFxId) return 'fx id 동일(새로 안 바뀜)';
      if (!dup.fxOrder.includes(dupFxId)) return 'fxOrder 가 새 id 를 안 가리킴';
      if (dup.fx[dupFxId].effectId !== 'glow') return 'fx 내용 유실';
      return 'ok';
    })()`);
    return run();
  }, SETUP);
  expect(ok).toBe('ok');
});

test('명령: addFx/removeFx/setFx/duplicateFx 각 되돌리기 1건', async ({ page }) => {
  const ok = await page.evaluate(async (setup) => {
    const run = new Function('return (async()=>{' + setup + `
      const { doc, id } = sq();
      const store = createStore(doc);
      const d0 = store.undoDepth();
      store.apply({ type: 'addFx', id, effectId: 'glow', fxId: 'fx_g' });
      if (store.undoDepth() !== d0 + 1) return 'addFx 기록';
      if (!store.get().layers[id].fx.fx_g) return 'addFx 반영 안 됨';
      store.apply({ type: 'setFx', id, fxId: 'fx_g', patch: { enabled: false } });
      if (store.undoDepth() !== d0 + 2) return 'setFx 기록';
      if (store.get().layers[id].fx.fx_g.enabled !== false) return 'setFx 반영';
      store.apply({ type: 'duplicateFx', id, fxId: 'fx_g', newId: 'fx_g2' });
      if (store.get().layers[id].fxOrder.join() !== 'fx_g,fx_g2') return 'duplicateFx 순서';
      store.apply({ type: 'removeFx', id, fxId: 'fx_g' });
      if (store.get().layers[id].fx.fx_g) return 'removeFx 반영';
      if (store.get().layers[id].fxOrder.join() !== 'fx_g2') return 'removeFx fxOrder';
      store.undo();
      if (!store.get().layers[id].fx.fx_g) return 'removeFx undo 복원';
      return 'ok';
    })()`);
    return run();
  }, SETUP);
  expect(ok).toBe('ok');
});
