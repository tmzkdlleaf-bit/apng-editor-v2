import { createRenderEngine } from '../../core/render/frame.js';
import { docToScreen, screenToDoc, docOrigin } from './transform.js';
import { drawOverlay } from './gizmo.js';
import { initDrag } from './drag.js';
import { initView } from './view.js';
import { createAssets } from '../assets.js';
import { effects as effectsRegistry } from '../../effects/registry.js';
import motionRegistry from '../../motions/registry.js';

export function initStage(containerEl, store, editorState) {
  containerEl.innerHTML = '';
  containerEl.style.position = 'relative';

  const sceneCanvas   = document.createElement('canvas');
  sceneCanvas.className = 'stage-scene';
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.className = 'stage-overlay';

  containerEl.appendChild(sceneCanvas);
  containerEl.appendChild(overlayCanvas);

  // 에셋 어댑터: doc.assets → canvas 비트맵
  const assets = createAssets(store, (_assetId) => {
    // 비트맵 디코딩 완료 시 씬 재렌더
    requestScene();
  });

  const engine = createRenderEngine({
    createCanvas: (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    },
    effects: effectsRegistry,
    motions: motionRegistry,
    assets,
  });

  let _sceneRenderCount = 0;
  let _sceneReq  = false;
  let _overlayReq = false;
  let _draftMode = false;
  let _autoDraft = false;
  let _lastRenderMs = 0;
  let _snapLines = [];
  let _offscreen  = null;
  let _cssW = 1, _cssH = 1;

  // 드래그 지연 측정
  let _lastPointerMoveTime = 0;
  let _latencies = [];

  function _getOffscreen(w, h) {
    if (!_offscreen || _offscreen.width !== w || _offscreen.height !== h) {
      if (!_offscreen) _offscreen = document.createElement('canvas');
      _offscreen.width  = w;
      _offscreen.height = h;
    }
    return _offscreen;
  }

  function requestScene() {
    if (_sceneReq) return;
    _sceneReq = true;
    requestAnimationFrame(_doScene);
  }

  function requestOverlay() {
    if (_overlayReq) return;
    _overlayReq = true;
    requestAnimationFrame(_doOverlay);
  }

  function _doScene() {
    _sceneReq = false;
    _sceneRenderCount++;

    // 드래그 지연 측정: rAF 시작 시점과 마지막 pointermove 시점의 차이
    if (_lastPointerMoveTime > 0) {
      const latency = performance.now() - _lastPointerMoveTime;
      if (latency < 200) _latencies.push(latency);
      _lastPointerMoveTime = 0;
    }

    const dpr  = window.devicePixelRatio || 1;
    const doc  = store.get();
    const es   = editorState.get();
    const { zoom, panX, panY, f } = es;
    const { width: docW, height: docH } = doc.meta;

    if (!_cssW || !_cssH) return;

    const ctx = sceneCanvas.getContext('2d');
    ctx.clearRect(0, 0, sceneCanvas.width, sceneCanvas.height);

    _drawChecker(ctx, zoom, panX, panY, _cssW, _cssH, docW, docH, dpr);

    const { ox, oy } = docOrigin(zoom, panX, panY, _cssW, _cssH, docW, docH);
    const visDocX0 = Math.max(0, (-ox) / zoom);
    const visDocY0 = Math.max(0, (-oy) / zoom);
    const visDocX1 = Math.min(docW, (_cssW - ox) / zoom);
    const visDocY1 = Math.min(docH, (_cssH - oy) / zoom);

    if (visDocX1 <= visDocX0 || visDocY1 <= visDocY0) return;

    const offW = Math.max(1, Math.ceil((visDocX1 - visDocX0) * zoom * dpr));
    const offH = Math.max(1, Math.ceil((visDocY1 - visDocY0) * zoom * dpr));
    const offscreen = _getOffscreen(offW, offH);
    const offCtx = offscreen.getContext('2d');
    offCtx.clearRect(0, 0, offW, offH);

    const quality = (_draftMode || _autoDraft) ? 'draft' : 'final';
    const t0 = performance.now();

    engine.renderFrame(offCtx, doc, f, {
      scale: zoom * dpr,
      quality,
      view: { x: visDocX0, y: visDocY0, w: visDocX1 - visDocX0, h: visDocY1 - visDocY0 },
    });

    const elapsed = performance.now() - t0;
    _lastRenderMs = elapsed;
    if (elapsed > 16 && !_draftMode) _autoDraft = true;

    const blitX = Math.max(0, ox) * dpr;
    const blitY = Math.max(0, oy) * dpr;
    ctx.drawImage(offscreen, blitX, blitY);
  }

  function _doOverlay() {
    _overlayReq = false;
    const doc = store.get();
    const es  = editorState.get();
    const dpr = window.devicePixelRatio || 1;

    const ctx = overlayCanvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    drawOverlay(ctx, doc, es, _snapLines, _cssW, _cssH);
    ctx.restore();
  }

  function _drawChecker(ctx, zoom, panX, panY, W, H, docW, docH, dpr) {
    const { ox, oy } = docOrigin(zoom, panX, panY, W, H, docW, docH);
    const dw = docW * zoom;
    const dh = docH * zoom;
    const x0 = Math.max(0, ox) * dpr;
    const y0 = Math.max(0, oy) * dpr;
    const x1 = Math.min(W, ox + dw) * dpr;
    const y1 = Math.min(H, oy + dh) * dpr;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();

    const sz = 8 * dpr;
    for (let gy = Math.floor(y0 / sz) * sz; gy < y1; gy += sz) {
      for (let gx = Math.floor(x0 / sz) * sz; gx < x1; gx += sz) {
        const even = ((Math.floor((gx - ox * dpr) / sz) + Math.floor((gy - oy * dpr) / sz)) & 1) === 0;
        ctx.fillStyle = even ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.15)';
        ctx.fillRect(gx, gy, sz, sz);
      }
    }
    ctx.restore();
  }

  function _docToScreen(docX, docY) {
    const es  = editorState.get();
    const doc = store.get();
    return docToScreen(docX, docY, es.zoom, es.panX, es.panY, _cssW, _cssH, doc.meta.width, doc.meta.height);
  }

  function _screenToDoc(sx, sy) {
    const es  = editorState.get();
    const doc = store.get();
    return screenToDoc(sx, sy, es.zoom, es.panX, es.panY, _cssW, _cssH, doc.meta.width, doc.meta.height);
  }

  function _onSnapLines(lines) {
    _snapLines = lines;
    requestOverlay();
  }

  function setDraftMode(on) {
    if (_draftMode === on) return;
    _draftMode = on;
    if (!on) { _autoDraft = false; requestScene(); }
  }

  function _onDraftMode(on) {
    setDraftMode(on);
    if (!on) _autoDraft = false;
  }

  // pointermove 시각 기록 (capture phase, passive)
  overlayCanvas.addEventListener('pointermove', () => {
    _lastPointerMoveTime = performance.now();
  }, { capture: true, passive: true });

  const drag = initDrag(overlayCanvas, store, editorState, _onSnapLines, _onDraftMode, () => _lastRenderMs > 16, assets);
  const cleanupView = initView(containerEl, overlayCanvas, store, editorState);

  store.subscribe({ any: true }, () => {
    requestScene();
    requestOverlay();
  });

  editorState.subscribe((patch) => {
    const needsScene = 'zoom' in patch || 'panX' in patch || 'panY' in patch || 'f' in patch;
    if (needsScene) requestScene();
    requestOverlay();
  });

  const ro = new ResizeObserver(entries => {
    for (const e of entries) {
      const { width, height } = e.contentRect;
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      const dpr = window.devicePixelRatio || 1;

      _cssW = w;
      _cssH = h;

      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      sceneCanvas.width   = pw; sceneCanvas.height  = ph;
      overlayCanvas.width  = pw; overlayCanvas.height = ph;

      sceneCanvas.style.width   = w + 'px'; sceneCanvas.style.height  = h + 'px';
      overlayCanvas.style.width  = w + 'px'; overlayCanvas.style.height = h + 'px';
    }
    requestScene();
    requestOverlay();
  });
  ro.observe(containerEl);

  requestScene();
  requestOverlay();

  return {
    sceneCanvas,
    overlayCanvas,
    engine,
    assets,
    docToScreen:  _docToScreen,
    screenToDoc:  _screenToDoc,
    requestScene,
    requestOverlay,
    setDraftMode,
    isDragging: () => drag.isDragging(),
    getLatencyStats() {
      if (!_latencies.length) return null;
      const avg = _latencies.reduce((a, b) => a + b, 0) / _latencies.length;
      const max = Math.max(..._latencies);
      return { avg, max, count: _latencies.length };
    },
    get sceneRenderCount() { return _sceneRenderCount; },
    get offscreenCanvas() { return _offscreen; },
    destroy() {
      ro.disconnect();
      drag.cleanup();
      cleanupView();
    },
  };
}
