// 이펙트 레이어 — registry에서 evaluate를 찾아 호출
import { createRng } from '../rng.js';

function _blendOp(blend) {
  const MAP = {
    normal:'source-over', multiply:'multiply', screen:'screen', overlay:'overlay',
    darken:'darken', lighten:'lighten', 'color-dodge':'color-dodge', 'color-burn':'color-burn',
    'hard-light':'hard-light', 'soft-light':'soft-light', difference:'difference', exclusion:'exclusion',
  };
  return MAP[blend] ?? 'source-over';
}

export function renderEffectLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { effects, pool, width, height, f, frameCount } = rctx;
  if (!effects) return;

  const effectId = layer.effectId;
  const effect   = effects.get?.(effectId);
  if (!effect?.evaluate) return;

  const tmp  = pool.borrow(width, height);
  const tmpC = tmp.getContext('2d');

  // 이펙트별 seed로 rng 초기화 (매 프레임 동일한 seed에서 시작)
  const seed = (layer.seed ?? 1) >>> 0;
  const rng  = createRng(seed);

  effect.evaluate(tmpC, f, layer.params ?? {}, { width, height, frameCount, rng });

  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = _blendOp(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
