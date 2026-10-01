// 이펙트 레이어 — registry에서 render를 찾아 호출
import { createRng } from '../rng.js';
import { blendToComposite } from '../blend.js';

export function renderEffectLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { effects, pool, width, height, f, frameCount } = rctx;
  if (!effects) return;

  const effectId = layer.effectId;
  const effect   = effects.get?.(effectId);
  if (!effect?.render) return;

  const tmp  = pool.borrow(width, height);
  const tmpC = tmp.getContext('2d');

  // 이펙트별 seed로 rng 초기화 (매 프레임 동일한 seed에서 시작)
  const seed = (layer.seed ?? 1) >>> 0;
  const rng  = createRng(seed);

  // 효과 계약: render(ctx, { f, frameCount, w, h, rng, sources, scale }, params)
  effect.render(tmpC, {
    f,
    frameCount,
    w: width,
    h: height,
    rng,
    sources: [],
    scale: 1,
  }, layer.params ?? {});

  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
