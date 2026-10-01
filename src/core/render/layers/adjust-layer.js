// 보정 레이어 — 아래 레이어 전체에 ImageData 보정 적용
// getImageData 범위는 레이어 bbox; 없으면 전체 캔버스
import { applyAdjust, applyBlur } from '../adjust.js';

function _blendOp(blend) {
  const MAP = {
    normal:'source-over', multiply:'multiply', screen:'screen', overlay:'overlay',
    darken:'darken', lighten:'lighten', 'color-dodge':'color-dodge', 'color-burn':'color-burn',
    'hard-light':'hard-light', 'soft-light':'soft-light', difference:'difference', exclusion:'exclusion',
  };
  return MAP[blend] ?? 'source-over';
}

export function renderAdjustLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { width, height, cache } = rctx;

  // 보정 레이어는 캔버스 전체에 작용 (클리핑 불가)
  const id = outputCtx.getImageData(0, 0, width, height);
  applyAdjust(id, layer.adjust);
  if (layer.adjust?.blur > 0) applyBlur(id, layer.adjust.blur * (worldTr.scale ?? 1));
  cache.incAdjustCount();
  outputCtx.putImageData(id, 0, 0);
}
