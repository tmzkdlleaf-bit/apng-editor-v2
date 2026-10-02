// 그룹 레이어 렌더러 — 오프스크린 캔버스에 자식 그린 뒤 합성
import { blendToComposite } from '../blend.js';

export function renderGroupLayer(outputCtx, layer, worldTr, totalAlpha, rctx, renderLayerFn) {
  const { doc, pool, docWidth, docHeight, width, height, f } = rctx;

  // 전체 문서 크기 오프스크린: 자식이 어떤 위치에 있어도 잘리지 않음
  const offW = docWidth  ?? width;
  const offH = docHeight ?? height;

  const offscreen = pool.borrow(offW, offH);
  const offCtx    = offscreen.getContext('2d');

  // 자식에게 넘기는 parentTr: 위치·회전·축척은 그대로, alpha=1
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
      const maskCanvas = rctx.renderMask(sourceLayer, f, offW, offH, { mode, invert, feather });
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

  // setTransform 리셋 없음 — outputCtx의 view 오프셋 translate 유지
  outputCtx.save();
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(offscreen, 0, 0);
  outputCtx.restore();
  pool.release(offscreen);
}
