// 렌더 엔진 — createRenderEngine() + renderFrame(ctx, doc, f, opts)
import { evalTransform, evalCamera } from '../anim/evaluate.js';
import { composeTransforms } from './matrix.js';
import { createPool }  from './pool.js';
import { createCache } from './cache.js';
import { renderMask as _renderMask } from './mask.js';

import { renderImageLayer }    from './layers/image.js';
import { renderAnimLayer }     from './layers/anim.js';
import { renderTextLayer }     from './layers/text.js';
import { renderShapeLayer }    from './layers/shape.js';
import { renderGroupLayer }    from './layers/group.js';
import { renderInstanceLayer } from './layers/instance.js';
import { renderAdjustLayer }   from './layers/adjust-layer.js';
import { renderEffectLayer }   from './layers/effect.js';

// opts:
//   createCanvas: (w, h) => canvas (필수)
//   effects: Map<effectId, { evaluate }> (선택)
//   assets:  { getBitmap, getAnimFrames } (선택)
//   maxCachePx: number (선택, 기본 64MP)
export function createRenderEngine(opts = {}) {
  const { createCanvas, effects, assets, maxCachePx } = opts;
  if (!createCanvas) throw new Error('createCanvas 함수가 필요합니다.');

  const pool  = createPool(createCanvas);
  const cache = createCache(createCanvas, maxCachePx);

  function invalidate(layerId) { cache.invalidate(layerId); }

  // ─── 메인 렌더 함수 ────────────────────────────────────────────────────
  // ctx: CanvasRenderingContext2D (또는 OffscreenCanvasRenderingContext2D)
  // doc: 문서 스냅샷
  // f:   프레임 번호 (0-based)
  // frameOpts: { motions, background, clear }
  // 반환값: 이 프레임에서 applyAdjust를 실제 수행한 횟수 (캐시 검증용)
  function renderFrame(ctx, doc, f, frameOpts = {}) {
    const { motions = null, background = null, clear = true } = frameOpts;
    const { width, height, frameCount } = doc.meta;

    cache.resetAdjustCount();

    if (clear) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
    }

    if (background) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    // 카메라 변환: 최상위 parentTr로 사용
    const cam   = evalCamera(doc, f);
    const camTr = {
      x:        cam.x    ?? 0,
      y:        cam.y    ?? 0,
      scale:    cam.zoom ?? 1,
      rotation: 0,
      alpha:    1,
    };

    // rctx: 레이어 렌더러에 넘기는 공유 컨텍스트
    // renderMask는 아래에서 rctx 생성 후 추가
    const rctx = {
      doc,
      f,
      width,
      height,
      frameCount,
      motions,
      effects: effects ?? null,
      assets:  assets  ?? { getBitmap: () => null, getAnimFrames: () => null },
      pool,
      cache,
      renderMask: null, // 아래에서 할당
    };

    // renderMask 클로저: 마스크 소스 레이어를 렌더해 마스크 캔버스 반환
    rctx.renderMask = function renderMaskFn(sourceLayer, frame, w, h, maskOpts) {
      return _renderMask(sourceLayer, frame, w, h, maskOpts, pool, (maskCtx) => {
        if (sourceLayer.visible !== false) {
          _renderLayer(maskCtx, sourceLayer, camTr, rctx);
        }
      });
    };

    // doc.order: [bottommost ... topmost], 최상위 레이어만 포함
    // 그룹 자식은 group.childOrder에만 있고 doc.order에는 없음
    for (const layerId of doc.order) {
      const layer = doc.layers[layerId];
      if (!layer || layer.visible === false) continue;
      _renderLayer(ctx, layer, camTr, rctx);
    }

    return cache.getAdjustCount();
  }

  // ─── 단일 레이어 렌더 (재귀 진입점) ─────────────────────────────────────
  // parentTr: 카메라 변환 또는 그룹 worldTr
  function _renderLayer(outputCtx, layer, parentTr, rctx) {
    const { doc, f, motions } = rctx;
    const localTr  = evalTransform(doc, layer.id, f, motions);
    const worldTr  = composeTransforms(parentTr, localTr);
    const opacity  = layer.opacity ?? 1;
    const totalAlpha = (worldTr.alpha ?? 1) * opacity;

    if (totalAlpha < 0.004) return;

    const type = layer.type;
    const childRenderFn = (offCtx, child, groupWorldTr, childRctx) => {
      _renderLayer(offCtx, child, groupWorldTr, childRctx ?? rctx);
    };

    if      (type === 'image')    renderImageLayer(outputCtx, layer, worldTr, totalAlpha, rctx);
    else if (type === 'anim')     renderAnimLayer(outputCtx, layer, worldTr, totalAlpha, rctx);
    else if (type === 'text')     renderTextLayer(outputCtx, layer, worldTr, totalAlpha, rctx);
    else if (type === 'shape')    renderShapeLayer(outputCtx, layer, worldTr, totalAlpha, rctx);
    else if (type === 'group')    renderGroupLayer(outputCtx, layer, worldTr, totalAlpha, rctx, childRenderFn);
    else if (type === 'instance') renderInstanceLayer(outputCtx, layer, worldTr, totalAlpha, rctx, childRenderFn);
    else if (type === 'adjust')   renderAdjustLayer(outputCtx, layer, worldTr, totalAlpha, rctx);
    else if (type === 'effect')   renderEffectLayer(outputCtx, layer, worldTr, totalAlpha, rctx);
    // 알 수 없는 type 조용히 무시
  }

  return { renderFrame, invalidate, pool, cache };
}
