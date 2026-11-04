// 그룹 레이어 렌더러 — 오프스크린 캔버스에 자식 그린 뒤 합성
import { blendToComposite } from '../blend.js';
import { hasActiveFx, runFxStack } from '../fx-stack.js';
import { innerFrame, groupHidden } from '../../anim/time.js';

export function renderGroupLayer(outputCtx, layer, worldTr, totalAlpha, rctx, renderLayerFn) {
  const { doc, pool, width, height, viewOffsetX = 0, viewOffsetY = 0, f, frameCount, effects, renderScale = 1, rawDocWidth, rawDocHeight } = rctx;

  // R22b: 그룹 시간 — hide 범위면 아예 그리지 않는다. 자식은 안쪽 프레임으로 그린다.
  if (layer.time && groupHidden(layer, f, frameCount)) return;
  const innerF = layer.time ? innerFrame(layer, f, frameCount) : f;
  const childRctx = (innerF === f) ? rctx : { ...rctx, f: innerF };

  // view 크기 오프스크린: 자식도 view 오프셋 기준으로 그리므로 크기 충분
  const offW = width;
  const offH = height;

  const offscreen = pool.borrow(offW, offH);
  const offCtx    = offscreen.getContext('2d');

  // 자식이 doc 좌표로 그릴 수 있도록 view 오프셋 적용
  if (viewOffsetX || viewOffsetY) {
    offCtx.translate(-viewOffsetX, -viewOffsetY);
  }

  // 자식에게 넘기는 parentTr: 위치·회전·축척은 그대로, alpha=1
  const childParentTr = { ...worldTr, alpha: 1 };

  const childOrder = layer.childOrder ?? [];
  for (const childId of childOrder) {
    const child = doc.layers[childId];
    if (!child || child.visible === false) continue;
    renderLayerFn(offCtx, child, childParentTr, childRctx);
  }

  // R17: 그룹에 쌓은 효과 — 문서 좌표 작업 캔버스(offscreen)에 자식 전체를 그린 뒤 한 번 적용.
  if (effects && hasActiveFx(layer, effects)) {
    offCtx.setTransform(1, 0, 0, 1, 0, 0);
    runFxStack(offscreen, {
      f, frameCount, pool, effects, renderScale,
      k: renderScale, dW: rawDocWidth ?? Math.round(offW / renderScale), dH: rawDocHeight ?? Math.round(offH / renderScale), pad: 0,
    }, layer);
  }

  // 그룹 마스크: maskCanvas는 view 크기(view 오프셋 내재)
  if (layer.mask && rctx.renderMask) {
    const { sourceId, mode = 'alpha', invert = false, feather = 0 } = layer.mask;
    const sourceLayer = doc.layers[sourceId];
    if (sourceLayer) {
      const maskCanvas = rctx.renderMask(sourceLayer, f, offW, offH, { mode, invert, feather });
      if (maskCanvas) {
        offCtx.setTransform(1, 0, 0, 1, 0, 0);  // identity로 리셋 (자식 렌더 완료 후)
        offCtx.globalAlpha = 1;
        offCtx.globalCompositeOperation = 'destination-in';
        offCtx.drawImage(maskCanvas, 0, 0);
        offCtx.globalCompositeOperation = 'source-over';
        pool.release(maskCanvas);
      }
    }
  }

  // offscreen은 물리 픽셀 기준 — outputCtx를 identity로 리셋 후 blit
  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(offscreen, 0, 0);
  outputCtx.restore();
  pool.release(offscreen);
}
