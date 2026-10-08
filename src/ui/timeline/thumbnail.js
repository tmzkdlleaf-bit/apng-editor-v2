// 레이어 썸네일(F2-4) — 행 이름 앞 작은 미리보기.
// frame 0 기준(스크럽/재생과 무관), 내용(레이어 객체)이 바뀔 때만 다시 그림(서명 캐시).
import { createRenderEngine } from '../../core/render/frame.js';
import { effects as effectsRegistry } from '../../effects/registry.js';
import motionRegistry from '../../motions/registry.js';

export function createThumbnailer(assets, size = 20) {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const px  = Math.max(1, Math.round(size * dpr));
  const eng = createRenderEngine({
    createCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
    effects: effectsRegistry, motions: motionRegistry, assets,
  });
  const cache = new Map(); // layerId -> { sig, canvas }
  let _renders = 0;

  // 내용 서명 — frame 과 무관(항상 frame 0 렌더). 레이어 객체 직렬화.
  function _sig(layer) { try { return JSON.stringify(layer); } catch { return String(Math.random()); } }

  function getThumb(doc, layer) {
    const sig = _sig(layer);
    const hit = cache.get(layer.id);
    if (hit && hit.sig === sig) return hit.canvas;
    const canvas = _render(doc, layer);
    cache.set(layer.id, { sig, canvas });
    _renders++;
    return canvas;
  }

  // 이 레이어만 보이는 임시 문서를 frame 0, 축소 배율로 그려 px×px 안에 담는다(미니 캔버스뷰).
  function _render(doc, layer) {
    const docW = doc.meta.width, docH = doc.meta.height;
    const scale = px / Math.max(docW, docH);
    const outW = Math.max(1, Math.round(docW * scale));
    const outH = Math.max(1, Math.round(docH * scale));
    const c = document.createElement('canvas'); c.width = outW; c.height = outH;
    const ctx = c.getContext('2d');
    const mini = {
      ...doc,
      order: [layer.id],
      layers: { [layer.id]: { ...layer, visible: true, parentId: null } },
      camera: { x: { value: 0 }, y: { value: 0 }, zoom: { value: 1 } },
    };
    // 그룹이면 자식도 포함해야 보인다 — 간단히 그룹과 그 하위 전체를 담는다.
    if (layer.type === 'group') {
      _collectGroup(doc, layer.id, mini.layers);
      mini.order = [layer.id];
    }
    try { eng.renderFrame(ctx, mini, 0, { scale }); } catch {}
    return c;
  }
  function _collectGroup(doc, gid, out) {
    const g = doc.layers[gid]; if (!g) return;
    for (const cid of (g.childOrder ?? [])) {
      if (doc.layers[cid]) { out[cid] = { ...doc.layers[cid], visible: doc.layers[cid].visible !== false }; _collectGroup(doc, cid, out); }
    }
  }

  return {
    getThumb,
    get renders() { return _renders; },
    resetRenders() { _renders = 0; },
    invalidate(id) { if (id) cache.delete(id); else cache.clear(); },
    size,
  };
}
