import { applyAdjust, hasAdjust, applyBlur } from '../adjust.js';
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';

function _animSourceFrameIndex(timing, srcFrameCount, frameIndex, frameCount) {
  const { mode = 'loop', speed = 1, offset = 0 } = timing ?? {};
  const n = Math.max(1, srcFrameCount);
  if (mode === 'hold')    return Math.min(n - 1, Math.max(0, Math.round(offset)));
  if (mode === 'once')    return Math.max(0, Math.min(n - 1, Math.floor(frameIndex * speed + offset)));
  if (mode === 'stretch') {
    const t = frameCount <= 1 ? 0 : frameIndex / (frameCount - 1);
    return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
  }
  const idx = Math.floor(frameIndex * speed + offset);
  return ((idx % n) + n) % n;
}

export function renderAnimLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { assets, pool, cache, width, height, viewOffsetX = 0, viewOffsetY = 0, f, frameCount } = rctx;
  const frames = assets.getAnimFrames?.(layer.assetId);
  if (!frames || !frames.length) return;

  const srcIdx = _animSourceFrameIndex(layer.timing, frames.length, f, frameCount);
  const bitmap = frames[srcIdx];
  if (!bitmap) return;

  const bW = bitmap.width  ?? bitmap.naturalWidth  ?? 0;
  const bH = bitmap.height ?? bitmap.naturalHeight ?? 0;
  if (!bW || !bH) return;

  const ax = layer.anchor?.x ?? 0.5;
  const ay = layer.anchor?.y ?? 0.5;

  const cacheKey = `${layer.id}:anim:${layer.assetId}:${srcIdx}:${JSON.stringify([layer.adjust, layer.tint])}`;
  let contentCanvas = cache.get(cacheKey);

  if (!contentCanvas) {
    const cc  = pool.borrow(bW, bH);
    const ccx = cc.getContext('2d');
    ccx.drawImage(bitmap, 0, 0, bW, bH);

    if (hasAdjust(layer.adjust)) {
      const id = ccx.getImageData(0, 0, bW, bH);
      applyAdjust(id, layer.adjust);
      ccx.putImageData(id, 0, 0);
      cache.incAdjustCount();
    }

    if (layer.tint) {
      const { color, strength = 1 } = layer.tint;
      const amt = Math.max(0, Math.min(1, strength));
      if (color && amt > 0) {
        ccx.globalCompositeOperation = 'source-atop';
        ccx.globalAlpha = amt;
        ccx.fillStyle = color;
        ccx.fillRect(0, 0, bW, bH);
        ccx.globalCompositeOperation = 'source-over';
        ccx.globalAlpha = 1;
      }
    }

    contentCanvas = cc;
    cache.set(cacheKey, contentCanvas);
  }

  const blur = layer.adjust?.blur ?? 0;

  if (!blur && !layer.mask) {
    outputCtx.save();
    applyTransform(outputCtx, worldTr);
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    outputCtx.drawImage(contentCanvas, -bW * ax, -bH * ay);
    outputCtx.restore();
    return;
  }

  // 복잡한 경로: view 크기 작업 캔버스 — 내용은 view 오프셋 후 worldTr로 배치
  const tmpW = width;
  const tmpH = height;
  const tmp  = pool.borrow(tmpW, tmpH);
  const tmpC = tmp.getContext('2d');

  tmpC.save();
  tmpC.translate(-viewOffsetX, -viewOffsetY);
  applyTransform(tmpC, worldTr);
  tmpC.drawImage(contentCanvas, -bW * ax, -bH * ay);
  tmpC.restore();  // identity로 복원

  if (blur > 0) {
    const id = tmpC.getImageData(0, 0, tmpW, tmpH);
    applyBlur(id, blur * (worldTr.scale ?? 1));
    tmpC.putImageData(id, 0, 0);
  }

  if (layer.mask && rctx.renderMask) {
    const { sourceId, mode = 'alpha', invert = false, feather = 0 } = layer.mask;
    const sourceLayer = rctx.doc.layers[sourceId];
    if (sourceLayer) {
      const maskCanvas = rctx.renderMask(sourceLayer, f, tmpW, tmpH, { mode, invert, feather });
      if (maskCanvas) {
        tmpC.setTransform(1, 0, 0, 1, 0, 0);
        tmpC.globalAlpha = 1;
        tmpC.globalCompositeOperation = 'destination-in';
        tmpC.drawImage(maskCanvas, 0, 0);
        tmpC.globalCompositeOperation = 'source-over';
        pool.release(maskCanvas);
      }
    }
  }

  // tmp는 물리 픽셀 기준 — outputCtx를 identity로 리셋 후 blit
  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
