// 보정 레이어 — 아래 화면에 보정(+흐림)·효과 쌓기·가리기·불투명도를 적용(R22a).
//   순서: 아래 사본 → applyAdjust/blur → fx 스택 → 가리기(masks + 트랙 매트) → 불투명도로 덮기.
//   가리기·효과·불투명도가 없으면 기존 전체 캔버스 경로와 픽셀이 같다.
import { applyAdjust, applyBlur } from '../adjust.js';
import { blendToComposite } from '../blend.js';
import { hasActiveFx, runFxStack } from '../fx-stack.js';
import { hasActiveMasks, applyMasksToWork } from '../shape-mask.js';

export function renderAdjustLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { width, height, cache, pool, f, frameCount, effects, renderScale = 1, rawDocWidth, rawDocHeight } = rctx;

  const hasFx   = !!(effects && hasActiveFx(layer, effects));
  const hasMask = hasActiveMasks(layer) || !!layer.mask;
  const blendNormal = !layer.blend || layer.blend === 'normal';

  // 빠른 경로: 가리기·효과 없음, 불투명도 1, 보통 블렌드 → 기존과 픽셀 동일.
  if (!hasFx && !hasMask && Math.abs(totalAlpha - 1) < 1e-6 && blendNormal) {
    const id = outputCtx.getImageData(0, 0, width, height);
    applyAdjust(id, layer.adjust);
    if (layer.adjust?.blur > 0) applyBlur(id, layer.adjust.blur * (worldTr.scale ?? 1));
    cache.incAdjustCount();
    outputCtx.putImageData(id, 0, 0);
    return;
  }

  // 1) 아래 화면 사본
  const snap = pool.borrow(width, height);
  const sc = snap.getContext('2d');
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.clearRect(0, 0, snap.width, snap.height);
  sc.drawImage(outputCtx.canvas, 0, 0);

  // 2) 보정 + 흐림
  const id = sc.getImageData(0, 0, width, height);
  applyAdjust(id, layer.adjust);
  if (layer.adjust?.blur > 0) applyBlur(id, layer.adjust.blur * (worldTr.scale ?? 1));
  cache.incAdjustCount();
  sc.putImageData(id, 0, 0);

  // 3) 효과 쌓기 — 사본(문서 좌표)에 적용. below 소스 효과는 사본을 소스로 받는다.
  if (hasFx) {
    sc.setTransform(1, 0, 0, 1, 0, 0);
    runFxStack(snap, {
      f, frameCount, pool, effects, renderScale,
      k: renderScale, dW: rawDocWidth ?? Math.round(width / renderScale), dH: rawDocHeight ?? Math.round(height / renderScale), pad: 0,
    }, layer);
  }

  // 4) 가리기 — 펜/도형(masks, 문서 크기 자체 좌표) + 트랙 매트(layer.mask)
  if (hasActiveMasks(layer)) {
    applyMasksToWork(snap, {
      f, k: renderScale, pad: 0,
      dW: rawDocWidth ?? Math.round(width / renderScale), dH: rawDocHeight ?? Math.round(height / renderScale),
      W: width, H: height, pool, cache,
    }, layer);
  }
  if (layer.mask && rctx.renderMask) {
    const { sourceId, mode = 'alpha', invert = false, feather = 0 } = layer.mask;
    const sourceLayer = rctx.doc.layers[sourceId];
    if (sourceLayer) {
      const maskCanvas = rctx.renderMask(sourceLayer, f, width, height, { mode, invert, feather });
      if (maskCanvas) {
        sc.setTransform(1, 0, 0, 1, 0, 0);
        sc.globalCompositeOperation = 'destination-in';
        sc.drawImage(maskCanvas, 0, 0);
        sc.globalCompositeOperation = 'source-over';
        pool.release(maskCanvas);
      }
    }
  }

  // 5) 불투명도(= totalAlpha, layer.opacity×alpha 반영)로 아래 화면 위에 덮는다.
  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(snap, 0, 0);
  outputCtx.restore();
  pool.release(snap);
}
