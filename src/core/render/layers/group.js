// 그룹 레이어 렌더러 — 오프스크린 캔버스에 자식 그린 뒤 합성
import { blendToComposite } from '../blend.js';

export function renderGroupLayer(outputCtx, layer, worldTr, totalAlpha, rctx, renderLayerFn) {
  const { doc, pool, width, height, f } = rctx;

  const offscreen = pool.borrow(width, height);
  const offCtx    = offscreen.getContext('2d');

  // 자식에게 넘기는 parentTr: 위치·회전·축척은 그대로, alpha=1 (불투명도는 합성할 때만 적용)
  const childParentTr = { ...worldTr, alpha: 1 };

  const childOrder = layer.childOrder ?? [];
  for (const childId of childOrder) {
    const child = doc.layers[childId];
    if (!child || child.visible === false) continue;
    renderLayerFn(offCtx, child, childParentTr, rctx);
  }

  // 그룹 마스크
  if (layer.mask && rctx.renderMask) {
    const { sourceId, mode = 'alpha', invert = false, feather = 0 } = layer.mask;
    const sourceLayer = doc.layers[sourceId];
    if (sourceLayer) {
      const maskCanvas = rctx.renderMask(sourceLayer, f, width, height, { mode, invert, feather });
      if (maskCanvas) {
        offCtx.setTransform(1, 0, 0, 1, 0, 0);
        offCtx.globalAlpha = 1;
        offCtx.globalCompositeOperation = 'destination-in';
        offCtx.drawImage(maskCanvas, 0, 0);
        offCtx.globalCompositeOperation = 'source-over';
        pool.release(maskCanvas);
      }
    }
  }

  // totalAlpha = worldTr.alpha * layer.opacity (한 번만 적용)
  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(offscreen, 0, 0);
  outputCtx.restore();
  pool.release(offscreen);
}
