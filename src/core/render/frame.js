// 렌더 엔진 — createRenderEngine() + renderFrame(ctx, doc, f, opts)
import { evalTransform, evalCamera } from '../anim/evaluate.js';
import { composeTransforms, applyCamera, cameraScreenTr } from './matrix.js';

const _IDENTITY_TR = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1 };
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
    pool.resetBorrowStats();

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
      // A1: pool 정렬로 캔버스가 renderW×renderH보다 클 수 있음 → 실제 내용 영역만 지정
      ctx.drawImage(workCanvas, 0, 0, renderW, renderH, 0, 0, outW, outH);
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
    if (view) {
      ctx.translate(-view.x * renderScale, -view.y * renderScale);
    }

    const { frameCount } = doc.meta;

    // docWidth/docHeight: renderScale 적용 픽셀 크기 (레이어 좌표 변환 기준)
    const docWidth  = Math.max(1, Math.round(doc.meta.width  * renderScale));
    const docHeight = Math.max(1, Math.round(doc.meta.height * renderScale));

    // view 오프셋(물리 픽셀) — 레이어 렌더러가 작업 캔버스에 translate로 적용
    const viewOffsetX = view ? Math.round(view.x * renderScale) : 0;
    const viewOffsetY = view ? Math.round(view.y * renderScale) : 0;

    // 합성은 전부 문서 단위로 한다. renderScale 은 leaf 렌더러에 넘기기 직전
    // (_renderLayer)에서 한 번만 곱한다 — 배율에 따라 위치가 틀어지지 않도록.
    // R8-1: 카메라는 더 이상 합성 부모가 아니다(줌 1에서 이동 불가). 가운데 축척+이동 아핀으로
    //   리프마다 applyCamera 로 얹는다. 루트 부모는 항등. 그룹/인스턴스는 문서 단위로 합성된다.
    const cam   = evalCamera(doc, f);
    const camScr = cameraScreenTr(cam, doc.meta.width, doc.meta.height);

    const rctx = {
      doc,
      f,
      width,
      height,
      docWidth,
      docHeight,
      rawDocWidth:  doc.meta.width,   // 이펙트에 전달하는 문서 단위 크기
      rawDocHeight: doc.meta.height,
      viewOffsetX,
      viewOffsetY,
      frameCount,
      motions:      motions      ?? null,
      effects:      effects      ?? null,
      assets:       assets       ?? { getBitmap: () => null, getAnimFrames: () => null },
      pool,
      cache,
      createCanvas,
      renderScale,
      camScr,            // R8-1: leaf 에서 applyCamera 로 얹는 카메라(가운데 축척+이동)
      renderMask: null,
    };

    rctx.renderMask = function renderMaskFn(sourceLayer, frame, w, h, maskOpts) {
      return _renderMask(sourceLayer, frame, w, h, maskOpts, pool, (maskCtx) => {
        // 마스크 캔버스도 view 크기: view 오프셋을 먼저 적용해 좌표 일치
        if (viewOffsetX || viewOffsetY) {
          maskCtx.translate(-viewOffsetX, -viewOffsetY);
        }
        // 효과 소스 슬롯(ignoreVisible)은 숨김 레이어도 재료로 그린다.
        if (maskOpts?.ignoreVisible || sourceLayer.visible !== false) {
          _renderLayer(maskCtx, sourceLayer, _IDENTITY_TR, rctx);
        }
      });
    };

    for (const layerId of doc.order) {
      const layer = doc.layers[layerId];
      if (!layer || layer.visible === false) continue;
      // 레이어 하나가 터져도 프레임 전체가 멈추지 않게 그 레이어만 건너뛴다(R7-6). 경고는 한 번만.
      try { _renderLayer(ctx, layer, _IDENTITY_TR, rctx); }
      catch (err) { _warnLayerError(layer?.id, err); }
    }
  }

  let _warnedLayerError = false;
  function _warnLayerError(layerId, err) {
    if (_warnedLayerError) return;
    _warnedLayerError = true;
    if (typeof console !== 'undefined') console.warn('레이어 렌더 중 오류 — 해당 레이어를 건너뜁니다:', layerId, err);
  }

  function _renderLayer(outputCtx, layer, parentTr, rctx) {
    const { doc, f, motions: mot, renderScale, camScr } = rctx;
    const localTr   = evalTransform(doc, layer.id, f, mot);
    const worldTr   = composeTransforms(parentTr, localTr);  // 문서 단위(카메라 없음)
    const opacity   = layer.opacity ?? 1;
    const totalAlpha = (worldTr.alpha ?? 1) * opacity;

    if (totalAlpha < 0.004) return;

    const type = layer.type;
    const childRenderFn = (offCtx, child, groupParentTr, childRctx) => {
      _renderLayer(offCtx, child, groupParentTr, childRctx ?? rctx);
    };

    // group·instance 는 geometry 를 직접 쓰지 않고 자식에게 worldTr 을 그대로 넘긴다
    // → 문서 단위 worldTr 을 그대로 전달하고, renderScale 은 각 leaf 가 곱한다.
    if (type === 'group') {
      renderGroupLayer(outputCtx, layer, worldTr, totalAlpha, rctx, childRenderFn);
      return;
    }
    if (type === 'instance') {
      renderInstanceLayer(outputCtx, layer, worldTr, totalAlpha, rctx, childRenderFn);
      return;
    }

    // leaf: 카메라(가운데 축척+이동)를 얹은 뒤, renderScale 을 여기서 한 번만 곱한다.
    //   그룹/인스턴스는 위에서 문서 단위 worldTr 로 처리했고, 자식 leaf 들이 각자 카메라를 얹는다.
    //   scope=full 이펙트는 출력 프레임 전체를 덮는 후처리라 카메라로 옮기지 않는다(소스는 이미 카메라 적용됨).
    const isFullEffect = (type === 'effect') && (!layer.scope || layer.scope === 'full');
    const screenTr = isFullEffect ? worldTr : applyCamera(worldTr, camScr);
    const sTr = _scaleWorldTr(screenTr, renderScale);

    if      (type === 'image')  renderImageLayer(outputCtx, layer, sTr, totalAlpha, rctx);
    else if (type === 'anim')   renderAnimLayer(outputCtx, layer, sTr, totalAlpha, rctx);
    else if (type === 'text')   renderTextLayer(outputCtx, layer, sTr, totalAlpha, rctx);
    else if (type === 'shape')  renderShapeLayer(outputCtx, layer, sTr, totalAlpha, rctx);
    else if (type === 'adjust') renderAdjustLayer(outputCtx, layer, sTr, totalAlpha, rctx);
    else if (type === 'effect') renderEffectLayer(outputCtx, layer, sTr, totalAlpha, rctx);
  }

  // 문서 단위 worldTr 에 renderScale 을 곱해 물리 픽셀 worldTr 로 만든다.
  // 위치(x,y)와 전체 축척(scale)만 곱한다. scaleX/scaleY(비율)·회전·alpha 는 그대로.
  function _scaleWorldTr(tr, rs) {
    if (!rs || rs === 1) return tr;
    return {
      ...tr,
      x:     (tr.x ?? 0) * rs,
      y:     (tr.y ?? 0) * rs,
      scale: (tr.scale ?? 1) * rs,
    };
  }

  function stats() {
    const { maxBorrowW, maxBorrowH } = pool.getBorrowStats();
    return {
      renders:    _totalRenders,
      cacheHits:  _totalHits,
      cacheMisses: _totalMisses,
      adjustRuns: _lastAdjustRuns,
      lastMs:     _lastMs,
      maxBorrowW,
      maxBorrowH,
    };
  }

  return { renderFrame, invalidate, prepare, stats, pool, cache };
}
