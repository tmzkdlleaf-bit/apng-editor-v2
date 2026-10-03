// 이펙트 레이어 — registry에서 render를 찾아 호출
import { createRng } from '../rng.js';
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';

export function renderEffectLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const {
    effects, pool, docWidth, docHeight, width, height,
    viewOffsetX = 0, viewOffsetY = 0,
    f, frameCount, renderScale = 1,
  } = rctx;
  if (!effects) return;

  const effectId = layer.effectId;
  const effect   = effects.get?.(effectId);
  if (!effect?.render) return;

  const scope = layer.scope ?? 'full';
  const box   = layer.box;
  const wx    = worldTr.x ?? 0;
  const wy    = worldTr.y ?? 0;

  // ew/eh: 이펙트에 전달하는 의미 크기(점 밀도·위치 기준) — 캔버스 크기와 무관
  // scope=full: 문서 전체 픽셀 크기; scope=box: box.w/h
  const fullW = docWidth  ?? width;
  const fullH = docHeight ?? height;
  const ew = (scope === 'box' && box) ? Math.max(1, Math.round(box.w ?? 100)) : fullW;
  const eh = (scope === 'box' && box) ? Math.max(1, Math.round(box.h ?? 100)) : fullH;

  const seed = (layer.seed ?? 1) >>> 0;
  const rng  = createRng(seed);

  // scope=full: view 크기 + PAD_PX 여유(경계 밖 이펙트 도형 블리드 허용)
  // scope=box: box 크기 그대로
  const PAD_PX = 20;
  const contentW = (scope === 'full') ? width  + PAD_PX * 2 : ew;
  const contentH = (scope === 'full') ? height + PAD_PX * 2 : eh;

  const contentCanvas = pool.borrow(contentW, contentH);
  const contentCtx    = contentCanvas.getContext('2d');

  if (scope === 'full') {
    // PAD_PX 여유분 + view 오프셋 적용 (viewOffset=0이어도 항상 적용)
    contentCtx.translate(-viewOffsetX + PAD_PX, -viewOffsetY + PAD_PX);
  }

  effect.render(contentCtx, {
    f,
    frameCount,
    w: ew,    // 이펙트는 항상 문서 크기 기준으로 점 위치를 계산
    h: eh,
    rng,
    sources: [],
    scale: renderScale,
  }, layer.params ?? {});

  const hasMask = !!(layer.mask && rctx.renderMask);

  if (hasMask) {
    // 마스크 경로: view 크기 작업 캔버스
    const tmp  = pool.borrow(width, height);
    const tmpC = tmp.getContext('2d');

    if (scope === 'full') {
      // PAD_PX 잘라내기 + worldTr(wx,wy) 오프셋 유지
      tmpC.drawImage(contentCanvas, PAD_PX, PAD_PX, width, height, wx, wy, width, height);
    } else {
      // scope=box: view 오프셋 + worldTr 적용 후 box contentCanvas를 그림
      tmpC.save();
      tmpC.translate(-viewOffsetX, -viewOffsetY);
      applyTransform(tmpC, worldTr);
      tmpC.drawImage(contentCanvas, -ew / 2, -eh / 2);
      tmpC.restore();
    }

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

    // tmp는 물리 픽셀 기준(view 오프셋 내재) — outputCtx를 identity로 리셋 후 blit
    outputCtx.save();
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    outputCtx.drawImage(tmp, 0, 0);
    outputCtx.restore();
    pool.release(tmp);
  } else {
    // 마스크 없음: contentCanvas를 직접 blit
    outputCtx.save();
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    if (scope === 'full') {
      // PAD_PX 잘라내기 + worldTr(wx,wy) 오프셋 유지
      outputCtx.drawImage(contentCanvas, PAD_PX, PAD_PX, width, height, wx, wy, width, height);
    } else {
      // scope=box: identity 기준으로 view 오프셋 + worldTr 적용
      outputCtx.translate(-viewOffsetX, -viewOffsetY);
      applyTransform(outputCtx, worldTr);
      outputCtx.drawImage(contentCanvas, -ew / 2, -eh / 2);
    }
    outputCtx.restore();
  }

  pool.release(contentCanvas);
}
