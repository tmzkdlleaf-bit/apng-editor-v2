// 렌더 엔진 — createRenderEngine() + renderFrame(ctx, doc, f, opts)
import { evalCamera } from '../anim/evaluate.js';
import { localWithFollow } from '../anim/world.js';
import { composeTransforms, applyCamera, cameraScreenTr } from './matrix.js';
import { blendToComposite } from './blend.js';

const _IDENTITY_TR = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1 };
import { createPool }  from './pool.js';
import { createCache } from './cache.js';
import { renderMask as _renderMask } from './mask.js';
import { createGLContext }   from './gpu/context.js';
import { createTexturePool } from './gpu/textures.js';
import { createUploader }    from './gpu/upload.js';
import { createGpuBlur }     from './gpu/blur.js';

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
//   renderer: 'cpu' | 'gpu' (선택, 기본 'cpu') — 'gpu' 인데 WebGL2 가 없으면 조용히 CPU 로 동작한다.
//     R34a 단계: GPU 는 아직 흐림(blur)만 담당한다. 합성·효과는 CPU. stats().renderer 에 실제 쓴 값을 남긴다.
export function createRenderEngine(opts = {}) {
  const { createCanvas, effects, assets, motions, maxCachePx, renderer } = opts;
  if (!createCanvas) throw new Error('createCanvas 함수가 필요합니다.');

  const pool  = createPool(createCanvas);
  const cache = createCache(createCanvas, maxCachePx);

  // R34a: GPU 렌더(시험). 'gpu' 요청 + WebGL2 가능할 때만 _gpu 가 생긴다. 실패·분실 시 CPU 로 동작.
  let _gpu = null;
  let _rendererActual = 'cpu';
  if (renderer === 'gpu') {
    _gpu = _setupGpu(createCanvas);
    _rendererActual = _gpu ? 'gpu' : 'cpu';
  }
  function _setupGpu(mk) {
    try {
      const glctx = createGLContext(mk);
      if (!glctx) return null;
      const texPool  = createTexturePool(glctx.gl);
      const uploader = createUploader(glctx.gl);
      const blur     = createGpuBlur(glctx.gl, texPool, uploader);
      return { glctx, texPool, uploader, blur };
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('GPU 렌더 준비 실패 — CPU 로 동작합니다.', err);
      return null;
    }
  }

  let _totalRenders = 0;
  let _totalHits    = 0;
  let _totalMisses  = 0;
  let _lastAdjustRuns = 0;
  let _lastMs       = 0;

  function invalidate(layerId) { cache.invalidate(layerId); }

  // 지금 프레임에 쓸 흐림 서비스. GPU 가 살아 있으면 GPU 흐림, 아니면 null(소비자가 CPU blur.js 사용).
  //   컨텍스트를 잃었으면 CPU 로 영구 전환(경고는 context.js 가 한 번만 냈다).
  function _activeBlur() {
    if (!_gpu) return null;
    if (_gpu.glctx.isLost()) { _gpu = null; _rendererActual = 'cpu'; return null; }
    return _gpu.blur;
  }

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

    _doRender(workCtx, doc, f, renderW, renderH, renderScale, view, quality);

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

  function _doRender(ctx, doc, f, width, height, renderScale = 1, view, quality = 'final') {
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
      fps:          doc.meta.fps || 12, // R30: 실사 효과가 실제 시간(초)을 계산할 때
      motions:      motions      ?? null,
      effects:      effects      ?? null,
      assets:       assets       ?? { getBitmap: () => null, getAnimFrames: () => null },
      pool,
      cache,
      createCanvas,
      renderScale,
      quality,           // R20-C: draft(절반)·재생 중이면 번짐 samples 를 줄인다
      camScr,            // R8-1: leaf 에서 applyCamera 로 얹는 카메라(가운데 축척+이동)
      blur:         _activeBlur(), // R34a: GPU 흐림 서비스(없으면 null → CPU blur.js). 효과 env 로도 내려간다.
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
    // R20-A: 따라가기(follow) 포함 로컬 변형. follow 없으면 evalTransform 과 동일(결과 불변).
    const localTr   = localWithFollow(doc, layer.id, f, mot);
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

    // R20-C: 움직임 번짐 — 문서·레이어 스위치가 둘 다 켜진 leaf(image/anim/text/shape)만.
    if (_blurActive(doc, layer, type) && _drawLeafBlur(outputCtx, layer, type, parentTr, totalAlpha, rctx)) return;

    _drawLeafAt(outputCtx, layer, type, sTr, totalAlpha, rctx);
  }

  function _drawLeafAt(outputCtx, layer, type, sTr, totalAlpha, rctx) {
    if      (type === 'image')  renderImageLayer(outputCtx, layer, sTr, totalAlpha, rctx);
    else if (type === 'anim')   renderAnimLayer(outputCtx, layer, sTr, totalAlpha, rctx);
    else if (type === 'text')   renderTextLayer(outputCtx, layer, sTr, totalAlpha, rctx);
    else if (type === 'shape')  renderShapeLayer(outputCtx, layer, sTr, totalAlpha, rctx);
    else if (type === 'adjust') renderAdjustLayer(outputCtx, layer, sTr, totalAlpha, rctx);
    else if (type === 'effect') renderEffectLayer(outputCtx, layer, sTr, totalAlpha, rctx);
  }

  // 번짐이 실제로 동작하는가(leaf 종류 + 문서 스위치 + 레이어 스위치).
  function _blurActive(doc, layer, type) {
    if (!(type === 'image' || type === 'anim' || type === 'text' || type === 'shape')) return false;
    return !!(doc.meta?.motionBlur?.on && layer.motionBlur);
  }

  // 하위 프레임 래핑(반복/핑퐁/한번). frameCount 로 접는다.
  function _wrapSubFrame(sub, fc, playback) {
    if (fc <= 0) return 0;
    if (sub >= 0 && sub <= fc) return sub;
    if (playback === 'pingpong') {
      const m = ((sub % (2 * fc)) + 2 * fc) % (2 * fc);
      return m > fc ? 2 * fc - m : m;
    }
    if (playback === 'once') return Math.max(0, Math.min(fc, sub));
    return ((sub % fc) + fc) % fc; // loop
  }

  function _trEqual(a, b) {
    return Math.abs((a.x ?? 0) - (b.x ?? 0)) < 1e-4 && Math.abs((a.y ?? 0) - (b.y ?? 0)) < 1e-4
      && Math.abs((a.scale ?? 1) - (b.scale ?? 1)) < 1e-6 && Math.abs((a.rotation ?? 0) - (b.rotation ?? 0)) < 1e-4
      && Math.abs((a.scaleX ?? 1) - (b.scaleX ?? 1)) < 1e-6 && Math.abs((a.scaleY ?? 1) - (b.scaleY ?? 1)) < 1e-6;
  }

  // 번짐 그리기: 내용(프레임 f)은 그대로, 변형만 하위 프레임으로 N번 바꿔 평균. 처리했으면 true.
  //   R22b: 그룹 안이면 rctx.f 는 이미 안쪽 프레임이므로 worldTr(루트부터 재변환) 대신 parentTr
  //   위에 로컬 변형만 얹는다 — 그룹 시간이 두 번 적용되는 것을 막는다(그룹 밖에서는 결과 동일).
  function _drawLeafBlur(outputCtx, layer, type, parentTr, totalAlpha, rctx) {
    const { doc, f, motions: mot, renderScale, camScr, pool, quality } = rctx;
    const mb = doc.meta.motionBlur;
    const cap = (quality === 'draft') ? 3 : 999;
    const N = Math.max(2, Math.min((mb.samples | 0) || 8, cap));
    const shutter = mb.shutter ?? 180, phase = mb.phase ?? -90;
    const fc = doc.meta.frameCount || 1;

    // 하위 프레임별 화면 변형(내용은 f 고정 → sTr 만 바뀜)
    const trs = [];
    let allSame = true;
    for (let i = 0; i < N; i++) {
      const sub = f + (phase + shutter * (i / (N - 1))) / 360;
      const wf = _wrapSubFrame(sub, fc, doc.meta.playback);
      const w = composeTransforms(parentTr, localWithFollow(doc, layer.id, wf, mot));
      const sTr = _scaleWorldTr(applyCamera(w, camScr), renderScale);
      trs.push(sTr);
      if (i > 0 && !_trEqual(sTr, trs[0])) allSame = false;
    }
    if (allSame) return false; // 움직임 없음 → 일반 경로(픽셀 동일)

    const cnv = outputCtx.canvas;
    const W = cnv.width, H = cnv.height;
    const base = outputCtx.getTransform();
    const acc = pool.borrow(W, H);
    const ac = acc.getContext('2d');
    ac.setTransform(1, 0, 0, 1, 0, 0); ac.clearRect(0, 0, acc.width, acc.height);
    const sub = pool.borrow(W, H);
    const sc = sub.getContext('2d');
    const plain = { ...layer, blend: 'normal', motionBlur: false, opacity: 1 };
    for (let i = 0; i < N; i++) {
      sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, sub.width, sub.height);
      sc.setTransform(base);                 // 출력과 같은 좌표계(view 오프셋 포함)
      _drawLeafAt(sc, plain, type, trs[i], 1, rctx);
      ac.setTransform(1, 0, 0, 1, 0, 0);
      ac.globalCompositeOperation = 'lighter';
      ac.globalAlpha = 1 / N;                 // 1/N 로 'lighter' 누적 = 평균
      ac.drawImage(sub, 0, 0);
    }
    ac.globalAlpha = 1; ac.globalCompositeOperation = 'source-over';

    outputCtx.save();
    outputCtx.setTransform(1, 0, 0, 1, 0, 0);  // acc 는 이미 출력 픽셀 좌표계
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    outputCtx.drawImage(acc, 0, 0);
    outputCtx.restore();
    pool.release(sub); pool.release(acc);
    return true;
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
      renderer:     _rendererActual,                   // R34a: 실제로 쓴 렌더러('cpu'|'gpu')
      gpuUploads:   _gpu ? _gpu.uploader.uploads   : 0, // GPU↔CPU 왕복 횟수(성능 보고용)
      gpuDownloads: _gpu ? _gpu.uploader.downloads : 0,
    };
  }

  // R34a: GPU 왕복 카운터 초기화(성능 측정에서 프레임 묶음마다 다시 센다).
  function resetGpuStats() { if (_gpu) _gpu.uploader.reset(); }

  return { renderFrame, invalidate, prepare, stats, resetGpuStats, pool, cache };
}
