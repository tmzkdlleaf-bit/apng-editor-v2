// 레이어 썸네일(F2-4, 보완2) — 행 이름 앞 작은 미리보기.
// frame 0 기준(스크럽/재생과 무관), 내용(레이어 객체)이 바뀔 때만 다시 그림(서명 캐시).
//
// 보완: 캔버스 전체를 줄이지 않고 "레이어 자신의 불투명 경계 상자"만 잘라 size 안에 맞춘다.
//   100px 짜리 이미지가 3px 점이 되지 않는다(회전·크기는 실제 렌더 픽셀에서 측정되어 자동 반영).
//   전체 화면 이펙트·조정 레이어는 썸네일 대신 종류 아이콘(getThumb null → 호출 측이 아이콘).
//   에셋이 아직 디코딩 중이면 그 썸네일을 "임시"로만 캐시하고, 준비가 끝나면 그 레이어만 무효화 후 갱신.
import { createRenderEngine } from '../../core/render/frame.js';
import { effects as effectsRegistry } from '../../effects/registry.js';
import motionRegistry from '../../motions/registry.js';

const MEAS = 192; // 경계 측정용 중간 렌더 해상도(최대 변 기준)

export function createThumbnailer(assets, size = 20, onUpdate = null) {
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
  const px  = Math.max(1, Math.round(size * dpr));
  const eng = createRenderEngine({
    createCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; },
    effects: effectsRegistry, motions: motionRegistry, assets,
  });
  const cache = new Map();        // layerId -> { sig, canvas, pending }
  const _layerAssets = new Map(); // assetId -> Set(layerId) (임시 썸네일이 이 에셋을 기다림)
  let _renders = 0;

  // 에셋 준비가 끝나면, 그 에셋을 기다리던 레이어 썸네일만 무효화하고 갱신 요청.
  let _unsub = null;
  if (assets?.subscribeReady) {
    _unsub = assets.subscribeReady((assetId) => {
      const set = _layerAssets.get(assetId);
      if (!set || !set.size) return;
      for (const id of set) cache.delete(id);
      _layerAssets.delete(assetId);
      onUpdate?.();
    });
  }

  // 내용 서명 — frame 과 무관(항상 frame 0 렌더). 레이어 객체 직렬화.
  function _sig(layer) { try { return JSON.stringify(layer); } catch { return String(Math.random()); } }

  function getThumb(doc, layer) {
    const sig = _sig(layer);
    const hit = cache.get(layer.id);
    if (hit && hit.sig === sig && !hit.pending) return hit.canvas;
    const { canvas, pending, assetId } = _render(doc, layer);
    cache.set(layer.id, { sig, canvas, pending });
    if (pending && assetId != null) {
      if (!_layerAssets.has(assetId)) _layerAssets.set(assetId, new Set());
      _layerAssets.get(assetId).add(layer.id);
    }
    _renders++;
    return canvas;
  }

  // 레이어를 중간 해상도로 그린 뒤 불투명 픽셀 경계를 찾아 px×px 안에 맞춰 담는다.
  //   반환 { canvas|null, pending, assetId }.
  function _render(doc, layer) {
    // 전체 화면 레이어(이펙트·조정)는 썸네일을 그리지 않고 호출 측이 종류 아이콘을 쓴다.
    if (layer.type === 'effect' || layer.type === 'adjust') return { canvas: null, pending: false, assetId: null };

    const assetId = (layer.type === 'image' || layer.type === 'anim') ? (layer.assetId ?? null) : null;
    // 에셋이 필요한데 아직 준비 안 됨 → 임시(pending). getBitmap/getAnimFrames 는 로드를 시작시킨다.
    let pending = false;
    if (assetId != null) {
      const ready = layer.type === 'anim' ? !!assets?.getAnimFrames?.(assetId) : !!assets?.getBitmap?.(assetId);
      pending = !ready;
    }

    const docW = doc.meta.width, docH = doc.meta.height;
    const mscale = MEAS / Math.max(docW, docH);
    const mw = Math.max(1, Math.round(docW * mscale));
    const mh = Math.max(1, Math.round(docH * mscale));
    const tmp = document.createElement('canvas'); tmp.width = mw; tmp.height = mh;
    const tctx = tmp.getContext('2d');
    const mini = {
      ...doc,
      order: [layer.id],
      layers: { [layer.id]: { ...layer, visible: true, parentId: null } },
      camera: { x: { value: 0 }, y: { value: 0 }, zoom: { value: 1 } },
    };
    if (layer.type === 'group') { _collectGroup(doc, layer.id, mini.layers); mini.order = [layer.id]; }
    try { eng.renderFrame(tctx, mini, 0, { scale: mscale }); } catch { return { canvas: null, pending, assetId }; }

    const out = document.createElement('canvas'); out.width = px; out.height = px;
    const octx = out.getContext('2d');

    // 불투명 픽셀 경계 상자
    let data;
    try { data = tctx.getImageData(0, 0, mw, mh).data; }
    catch { octx.drawImage(tmp, 0, 0, px, px); return { canvas: out, pending, assetId }; }
    let minX = mw, minY = mh, maxX = -1, maxY = -1;
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        if (data[(y * mw + x) * 4 + 3] > 8) {
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX) return { canvas: out, pending, assetId }; // 빈(투명) 그림 — 빈 캔버스

    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    const pad = 1;
    const s = Math.min((px - pad * 2) / bw, (px - pad * 2) / bh);
    const dw = Math.max(1, Math.round(bw * s)), dh = Math.max(1, Math.round(bh * s));
    const dx = Math.round((px - dw) / 2), dy = Math.round((px - dh) / 2);
    octx.imageSmoothingEnabled = true;
    octx.drawImage(tmp, minX, minY, bw, bh, dx, dy, dw, dh);
    return { canvas: out, pending, assetId };
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
    destroy() { _unsub?.(); },
    size,
  };
}
