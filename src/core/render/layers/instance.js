// 인스턴스 레이어 — 마스터 그룹을 참조해 오버라이드 적용 후 렌더
import { blendToComposite } from '../blend.js';

export function renderInstanceLayer(outputCtx, layer, worldTr, totalAlpha, rctx, renderLayerFn) {
  const { doc, pool, width, height, f } = rctx;
  const masterId = layer.masterId;
  const master   = masterId ? doc.layers[masterId] : null;
  if (!master || master.type !== 'group') return;

  const overrides  = layer.overrides ?? {};
  const childOrder = master.childOrder ?? [];
  const offscreen  = pool.borrow(width, height);
  const offCtx     = offscreen.getContext('2d');

  const childParentTr = { ...worldTr, alpha: 1 };

  for (const childId of childOrder) {
    const childBase = doc.layers[childId];
    if (!childBase || childBase.visible === false) continue;

    const child = overrides[childId]
      ? { ...childBase, ...overrides[childId] }
      : childBase;

    renderLayerFn(offCtx, child, childParentTr, rctx);
  }

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

  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(offscreen, 0, 0);
  outputCtx.restore();
  pool.release(offscreen);
}
