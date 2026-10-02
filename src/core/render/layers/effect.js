// 이펙트 레이어 — registry에서 render를 찾아 호출
import { createRng } from '../rng.js';
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';

export function renderEffectLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { effects, pool, docWidth, docHeight, width, height, f, frameCount, renderScale = 1 } = rctx;
  if (!effects) return;

  const effectId = layer.effectId;
  const effect   = effects.get?.(effectId);
  if (!effect?.render) return;

  const scope = layer.scope ?? 'full';
  const box   = layer.box;

  // scope=full: 문서 전체 픽셀 크기 — 점 밀도·위치가 뷰 크기에 종속되지 않아야 함
  // scope=box : box.w/h를 문서 단위로 사용 (worldTr.scale이 renderScale 포함)
  const fullW = docWidth  ?? width;
  const fullH = docHeight ?? height;
  const ew = (scope === 'box' && box) ? Math.max(1, Math.round(box.w ?? 100)) : fullW;
  const eh = (scope === 'box' && box) ? Math.max(1, Math.round(box.h ?? 100)) : fullH;

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
    // 마스크 경로: docWidth×docHeight 작업 캔버스에 내용 + 마스크를 합성 후 blit
    // tmp는 항상 전체 문서 크기 — mask가 view 기준이 되면 위치 불일치
    const tmp  = pool.borrow(fullW, fullH);
    const tmpC = tmp.getContext('2d');

    tmpC.save();
    if (scope === 'full') {
      tmpC.translate(worldTr.x ?? 0, worldTr.y ?? 0);
      tmpC.drawImage(contentCanvas, 0, 0);
    } else {
      applyTransform(tmpC, worldTr);
      tmpC.drawImage(contentCanvas, -ew / 2, -eh / 2);
    }
    tmpC.restore();

    const { sourceId, mode = 'alpha', invert = false, feather = 0 } = layer.mask;
    const sourceLayer = rctx.doc.layers[sourceId];
    if (sourceLayer) {
      const maskCanvas = rctx.renderMask(sourceLayer, f, fullW, fullH, { mode, invert, feather });
      if (maskCanvas) {
        tmpC.setTransform(1, 0, 0, 1, 0, 0);
        tmpC.globalAlpha = 1;
        tmpC.globalCompositeOperation = 'destination-in';
        tmpC.drawImage(maskCanvas, 0, 0);
        tmpC.globalCompositeOperation = 'source-over';
        pool.release(maskCanvas);
      }
    }

    // setTransform 리셋 없음 — outputCtx의 view 오프셋 translate 유지
    // tmp 안에 이미 worldTr이 반영됐으므로 추가 변환 없이 (0,0)에 그림
    outputCtx.save();
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    outputCtx.drawImage(tmp, 0, 0);
    outputCtx.restore();
    pool.release(tmp);
  } else {
    // 마스크 없음: outputCtx에 직접 변환 후 그리기
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
