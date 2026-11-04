// 인스턴스 레이어 — 마스터 그룹을 참조해 오버라이드 적용 후 렌더
import { blendToComposite } from '../blend.js';
import { hasActiveFx, runFxStack } from '../fx-stack.js';
import { innerFrame, groupHidden } from '../../anim/time.js';

export function renderInstanceLayer(outputCtx, layer, worldTr, totalAlpha, rctx, renderLayerFn) {
  const { doc, pool, width, height, viewOffsetX = 0, viewOffsetY = 0, f, frameCount, effects, renderScale = 1, rawDocWidth, rawDocHeight } = rctx;
  const masterId = layer.masterId;
  const master   = masterId ? doc.layers[masterId] : null;
  if (!master || master.type !== 'group') return;

  // R22b: 인스턴스 자체에도 그룹 시간을 줄 수 있다(같은 함수). hide 면 안 그린다.
  if (layer.time && groupHidden(layer, f, frameCount)) return;
  const innerF = layer.time ? innerFrame(layer, f, frameCount) : f;
  const childRctx = (innerF === f) ? rctx : { ...rctx, f: innerF };

  const overrides  = layer.overrides ?? {};
  const childOrder = master.childOrder ?? [];
  const offscreen  = pool.borrow(width, height);
  const offCtx     = offscreen.getContext('2d');

  // 자식이 doc 좌표로 그릴 수 있도록 view 오프셋 적용 (group.js 와 동일)
  if (viewOffsetX || viewOffsetY) {
    offCtx.translate(-viewOffsetX, -viewOffsetY);
  }

  const childParentTr = { ...worldTr, alpha: 1 };

  for (const childId of childOrder) {
    const childBase = doc.layers[childId];
    if (!childBase || childBase.visible === false) continue;

    const child = overrides[childId]
      ? { ...childBase, ...overrides[childId] }
      : childBase;

    renderLayerFn(offCtx, child, childParentTr, childRctx);
  }

  // R17: 인스턴스에 쌓은 효과 — 문서 좌표 작업 캔버스에 한 번 적용(그룹과 같은 방식).
  if (effects && hasActiveFx(layer, effects)) {
    offCtx.setTransform(1, 0, 0, 1, 0, 0);
    runFxStack(offscreen, {
      f, frameCount, pool, effects, renderScale,
      k: renderScale, dW: rawDocWidth ?? Math.round(width / renderScale), dH: rawDocHeight ?? Math.round(height / renderScale), pad: 0,
    }, layer);
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
