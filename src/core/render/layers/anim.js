import { applyAdjust, hasAdjust, applyBlur } from '../adjust.js';

// 애니메이션 소스의 재생 프레임 계산 (old/src/core/render/layer-image.js:95 이식)
function _animSourceFrameIndex(timing, srcFrameCount, frameIndex, frameCount) {
  const { mode = 'loop', speed = 1, offset = 0 } = timing ?? {};
  const n = Math.max(1, srcFrameCount);
  if (mode === 'hold')    return Math.min(n - 1, Math.max(0, Math.round(offset)));
  if (mode === 'once')    return Math.max(0, Math.min(n - 1, Math.floor(frameIndex * speed + offset)));
  if (mode === 'stretch') {
    const t = frameCount <= 1 ? 0 : frameIndex / (frameCount - 1);
    return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))));
  }
  // loop (default)
  const idx = Math.floor(frameIndex * speed + offset);
  return ((idx % n) + n) % n;
}

function _blendOp(blend) {
  const MAP = {
    normal:'source-over', multiply:'multiply', screen:'screen', overlay:'overlay',
    darken:'darken', lighten:'lighten', 'color-dodge':'color-dodge', 'color-burn':'color-burn',
    'hard-light':'hard-light', 'soft-light':'soft-light', difference:'difference', exclusion:'exclusion',
  };
  return MAP[blend] ?? 'source-over';
}

function _applyTransform(ctx, worldTr, w, h) {
  ctx.translate(w / 2 + (worldTr.x ?? 0), h / 2 + (worldTr.y ?? 0));
  ctx.rotate((worldTr.rotation ?? 0) * Math.PI / 180);
  ctx.scale(worldTr.scale ?? 1, worldTr.scale ?? 1);
}

export function renderAnimLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { assets, pool, cache, width, height, f, frameCount } = rctx;
  const frames = assets.getAnimFrames?.(layer.assetId);
  if (!frames || !frames.length) return;

  const srcIdx   = _animSourceFrameIndex(layer.timing, frames.length, f, frameCount);
  const bitmap   = frames[srcIdx];
  if (!bitmap) return;

  const bW = bitmap.width  ?? bitmap.naturalWidth  ?? 0;
  const bH = bitmap.height ?? bitmap.naturalHeight ?? 0;
  if (!bW || !bH) return;

  const ax = layer.anchor?.x ?? 0.5;
  const ay = layer.anchor?.y ?? 0.5;

  // 애니메이션은 프레임마다 소스가 달라지므로 캐시 키에 srcIdx 포함
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
    _applyTransform(outputCtx, worldTr, width, height);
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = _blendOp(layer.blend);
    outputCtx.drawImage(contentCanvas, -bW * ax, -bH * ay);
    outputCtx.restore();
    return;
  }

  const tmp  = pool.borrow(width, height);
  const tmpC = tmp.getContext('2d');

  tmpC.save();
  _applyTransform(tmpC, worldTr, width, height);
  tmpC.drawImage(contentCanvas, -bW * ax, -bH * ay);
  tmpC.restore();

  if (blur > 0) {
    const id = tmpC.getImageData(0, 0, width, height);
    applyBlur(id, blur * (worldTr.scale ?? 1));
    tmpC.putImageData(id, 0, 0);
  }

  if (layer.mask && rctx.renderMask) {
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
  }

  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = _blendOp(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
