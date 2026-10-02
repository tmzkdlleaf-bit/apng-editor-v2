// 이펙트 레이어 — registry에서 render를 찾아 호출
import { createRng } from '../rng.js';
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';

export function renderEffectLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { effects, pool, width, height, f, frameCount, renderScale = 1 } = rctx;
  if (!effects) return;

  const effectId = layer.effectId;
  const effect   = effects.get?.(effectId);
  if (!effect?.render) return;

  const scope = layer.scope ?? 'full';
  const box   = layer.box;

  // 로컬 렌더 크기:
  //   full  → 렌더 해상도(rctx.width×rctx.height), 위치 이동만 적용
  //   box   → 박스 문서 좌표 그대로(worldTr.scale이 renderScale 포함), 전체 변환 적용
  const ew = (scope === 'box' && box) ? Math.max(1, Math.round(box.w ?? width)) : width;
  const eh = (scope === 'box' && box) ? Math.max(1, Math.round(box.h ?? height)) : height;

  const seed = (layer.seed ?? 1) >>> 0;
  const rng  = createRng(seed);

  const contentCanvas = pool.borrow(ew, eh);
  const contentCtx    = contentCanvas.getContext('2d');

  effect.render(contentCtx, {
    f,
    frameCount,
    w: ew,
    h: eh,
    rng,
    sources: [],
    scale: renderScale,
  }, layer.params ?? {});

  const hasMask = !!(layer.mask && rctx.renderMask);

  if (hasMask) {
    const tmp  = pool.borrow(width, height);
    const tmpC = tmp.getContext('2d');

    tmpC.save();
    if (scope === 'full') {
      // full: 위치 이동만 적용 (콘텐츠가 이미 렌더 해상도이므로 스케일 제외)
      tmpC.translate(worldTr.x ?? 0, worldTr.y ?? 0);
      tmpC.drawImage(contentCanvas, 0, 0);
    } else {
      // box: 전체 변환 적용, 중심에 그리기
      applyTransform(tmpC, worldTr);
      tmpC.drawImage(contentCanvas, -ew / 2, -eh / 2);
    }
    tmpC.restore();

    const { sourceId, mode = 'alpha', invert = false, feather = 0 } = layer.mask;
    const sourceLayer = rctx.doc.layers[sourceId];
    if (sourceLayer) {
      const maskCanvas = rctx.renderMask(sourceLayer, f, width, height, { mode, invert, feather });
      if (maskCanvas) {
        tmpC.setTransform(1, 0, 0, 1, 0, 0);
        tmpC.globalAlpha = 1;
        tmpC.globalCompositeOperation = 'destination-in';
        tmpC.drawImage(maskCanvas, 0, 0);
        tmpC.globalCompositeOperation = 'source-over';
        pool.release(maskCanvas);
      }
    }

    outputCtx.save();
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    outputCtx.drawImage(tmp, 0, 0);
    outputCtx.restore();
    pool.release(tmp);
  } else {
    // 마스크 없음: 변환 적용 후 직접 출력
    outputCtx.save();
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    if (scope === 'full') {
      outputCtx.translate(worldTr.x ?? 0, worldTr.y ?? 0);
      outputCtx.drawImage(contentCanvas, 0, 0);
    } else {
      applyTransform(outputCtx, worldTr);
      outputCtx.drawImage(contentCanvas, -ew / 2, -eh / 2);
    }
    outputCtx.restore();
  }

  pool.release(contentCanvas);
}
