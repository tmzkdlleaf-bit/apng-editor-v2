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
//   effects:  Map<effectId, { render }> (선택)
//   assets:   { getBitmap, getAnimFrames } (선택)
//   motions:  Map<motionId, { evaluate }> (선택)
//   maxCachePx: number (선택, 기본 64MP)
export function createRenderEngine(opts = {}) {
  const { createCanvas, effects, assets, motions, maxCachePx } = opts;
  if (!createCanvas) throw new Error('createCanvas 함수가 필요합니다.');

  const pool  = createPool(createCanvas);
  const cache = createCache(createCanvas, maxCachePx);

  let _totalRenders = 0;
  let _totalHits    = 0;
  let _totalMisses  = 0;
  let _lastAdjustRuns = 0;
  let _lastMs       = 0;

  function invalidate(layerId) { cache.invalidate(layerId); }

  async function prepare(_doc) {
    // 에셋 사전 로드, 캐시 준비 등 (현재는 stub)
  }

  // ─── 메인 렌더 함수 ────────────────────────────────────────────────────
  // ctx: CanvasRenderingContext2D (또는 OffscreenCanvasRenderingContext2D)
  // doc: 문서 스냅샷
  // f:   프레임 번호 (0-based; f=frameCount도 허용, 루프 보장)
  // opts: { scale=1, quality='final', view? }
  //   scale:   출력 캔버스 크기 = 문서 크기(또는 view 크기) × scale
  //   quality: 'final' | 'draft' (draft는 절반 해상도로 렌더 후 확대)
  //   view:    { x, y, w, h } doc 좌표 가시 영역 — 지정 시 해당 영역만 렌더
  function renderFrame(ctx, doc, f, frameOpts = {}) {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    const { scale = 1, quality = 'final', view } = frameOpts;
    const { width, height } = doc.meta;

    cache.resetFrameStats();

    const renderScale = (quality === 'draft') ? scale * 0.5 : scale;

    // view 있으면 view 영역만, 없으면 전체 문서 크기
    const renderW = view
      ? Math.max(1, Math.ceil(view.w * renderScale))
      : Math.max(1, Math.round(width  * renderScale));
    const renderH = view
      ? Math.max(1, Math.ceil(view.h * renderScale))
      : Math.max(1, Math.round(height * renderScale));

    let workCtx    = ctx;
    let workCanvas = null;

    if (renderScale !== 1 || quality === 'draft' || view) {
      workCanvas = pool.borrow(renderW, renderH);
      workCtx    = workCanvas.getContext('2d');
    }

    _doRender(workCtx, doc, f, renderW, renderH, renderScale, view);

    if (workCanvas) {
      const outW = view
        ? Math.max(1, Math.ceil(view.w * scale))
        : Math.max(1, Math.round(width  * scale));
      const outH = view
        ? Math.max(1, Math.ceil(view.h * scale))
        : Math.max(1, Math.round(height * scale));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, outW, outH);
      ctx.drawImage(workCanvas, 0, 0, outW, outH);
      pool.release(workCanvas);
    }

    _totalRenders++;
    _totalHits    += cache.getLastHits();
    _totalMisses  += cache.getLastMisses();
    _lastAdjustRuns = cache.getAdjustCount();
    _lastMs = (typeof performance !== 'undefined') ? performance.now() - t0 : 0;
  }

  function _doRender(ctx, doc, f, width, height, renderScale = 1, view) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // 배경 doc.meta.background에서 읽기
    const bg = doc.meta.background;
    if (bg) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (bg.type === 'solid' && bg.color) {
        ctx.fillStyle = bg.color;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
    }

    // view 있으면 doc 좌표 (view.x, view.y)를 캔버스 (0, 0)에 대응
    // composeTransforms는 scale=1 시 camTr.x 오프셋 영향 없으므로 ctx.translate 사용
    if (view) {
      ctx.translate(-view.x * renderScale, -view.y * renderScale);
    }

    const { frameCount } = doc.meta;

    // scope=full 이펙트·마스크·퇴장 효과 등 전체 캔버스 중간체는 문서 전체 크기를 써야 함
    // rctx.docWidth/docHeight = doc.meta.width/height × renderScale
    const docWidth  = Math.max(1, Math.round(doc.meta.width  * renderScale));
    const docHeight = Math.max(1, Math.round(doc.meta.height * renderScale));

    const cam   = evalCamera(doc, f);
    const camTr = {
      x:        (cam.x ?? 0) * renderScale,
      y:        (cam.y ?? 0) * renderScale,
      scale:    (cam.zoom ?? 1) * renderScale,
      rotation: 0,
      alpha:    1,
    };

    const rctx = {
      doc,
      f,
      width,
      height,
      docWidth,
      docHeight,
      frameCount,
      motions:      motions      ?? null,
      effects:      effects      ?? null,
      assets:       assets       ?? { getBitmap: () => null, getAnimFrames: () => null },
      pool,
      cache,
      createCanvas,
      renderScale,
      renderMask: null,
    };

    rctx.renderMask = function renderMaskFn(sourceLayer, frame, w, h, maskOpts) {
      return _renderMask(sourceLayer, frame, w, h, maskOpts, pool, (maskCtx) => {
        if (sourceLayer.visible !== false) {
          _renderLayer(maskCtx, sourceLayer, camTr, rctx);
        }
      });
    };

    for (const layerId of doc.order) {
      const layer = doc.layers[layerId];
      if (!layer || layer.visible === false) continue;
      _renderLayer(ctx, layer, camTr, rctx);
    }
  }

  function _renderLayer(outputCtx, layer, parentTr, rctx) {
    const { doc, f, motions: mot } = rctx;
    const localTr   = evalTransform(doc, layer.id, f, mot);
    const worldTr   = composeTransforms(parentTr, localTr);
    const opacity   = layer.opacity ?? 1;
    const totalAlpha = (worldTr.alpha ?? 1) * opacity;

    if (totalAlpha < 0.004) return;

    const type = layer.type;
    const childRenderFn = (offCtx, child, groupParentTr, childRctx) => {
      _renderLayer(offCtx, child, groupParentTr, childRctx ?? rctx);
    };

    if      (type === 'image')    renderImageLayer(outputCtx, layer, worldTr, totalAlpha, rctx);
    else if (type === 'anim')     renderAnimLayer(outputCtx, layer, worldTr, totalAlpha, rctx);
    else if (type === 'text')     renderTextLayer(outputCtx, layer, worldTr, totalAlpha, rctx);
    else if (type === 'shape')    renderShapeLayer(outputCtx, layer, worldTr, totalAlpha, rctx);
    else if (type === 'group')    renderGroupLayer(outputCtx, layer, worldTr, totalAlpha, rctx, childRenderFn);
    else if (type === 'instance') renderInstanceLayer(outputCtx, layer, worldTr, totalAlpha, rctx, childRenderFn);
    else if (type === 'adjust')   renderAdjustLayer(outputCtx, layer, worldTr, totalAlpha, rctx);
    else if (type === 'effect')   renderEffectLayer(outputCtx, layer, worldTr, totalAlpha, rctx);
  }

  function stats() {
    return {
      renders:    _totalRenders,
      cacheHits:  _totalHits,
      cacheMisses: _totalMisses,
      adjustRuns: _lastAdjustRuns,
      lastMs:     _lastMs,
    };
  }

  return { renderFrame, invalidate, prepare, stats, pool, cache };
}
