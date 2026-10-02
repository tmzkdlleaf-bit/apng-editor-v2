import { createRenderEngine } from '../../core/render/frame.js';
import { docToScreen, screenToDoc, docOrigin } from './transform.js';
import { drawOverlay } from './gizmo.js';
import { initDrag } from './drag.js';
import { initView } from './view.js';

export function initStage(containerEl, store, editorState) {
  containerEl.innerHTML = '';
  containerEl.style.position = 'relative';

  const sceneCanvas   = document.createElement('canvas');
  sceneCanvas.className = 'stage-scene';
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.className = 'stage-overlay';

  containerEl.appendChild(sceneCanvas);
  containerEl.appendChild(overlayCanvas);

  // 렌더 엔진 (DOM 캔버스 사용 — src/ui/ 에서는 document 허용)
  const engine = createRenderEngine({
    createCanvas: (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    },
  });

  let _sceneRenderCount = 0;
  let _sceneReq = false;
  let _overlayReq = false;
  let _draftMode = false;
  let _snapLines = [];
  let _offscreen = null;

  function _getOffscreen(w, h) {
    if (!_offscreen || _offscreen.width !== w || _offscreen.height !== h) {
      if (!_offscreen) _offscreen = document.createElement('canvas');
      _offscreen.width = w;
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

    const doc = store.get();
    const es  = editorState.get();
    const { zoom, panX, panY, f } = es;
    const { width: docW, height: docH } = doc.meta;
    const W = sceneCanvas.width;
    const H = sceneCanvas.height;
    if (!W || !H) return;

    const ctx = sceneCanvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // 체커보드 (문서 영역만)
    _drawChecker(ctx, zoom, panX, panY, W, H, docW, docH);

    const renderW = Math.max(1, Math.round(docW * zoom));
    const renderH = Math.max(1, Math.round(docH * zoom));
    const offscreen = _getOffscreen(renderW, renderH);

    const quality = _draftMode ? 'draft' : 'final';
    engine.renderFrame(offscreen.getContext('2d'), doc, f, { scale: zoom, quality });

    const { ox, oy } = docOrigin(zoom, panX, panY, W, H, docW, docH);
    ctx.drawImage(offscreen, ox, oy);
  }

  function _doOverlay() {
    _overlayReq = false;
    const doc = store.get();
    const es  = editorState.get();
    const ctx = overlayCanvas.getContext('2d');
    drawOverlay(ctx, doc, es, _snapLines);
  }

  function _drawChecker(ctx, zoom, panX, panY, W, H, docW, docH) {
    const { ox, oy } = docOrigin(zoom, panX, panY, W, H, docW, docH);
    const dw = docW * zoom;
    const dh = docH * zoom;
    const x0 = Math.max(0, ox);
    const y0 = Math.max(0, oy);
    const x1 = Math.min(W, ox + dw);
    const y1 = Math.min(H, oy + dh);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();

    const sz = 8;
    for (let gy = Math.floor(y0 / sz) * sz; gy < y1; gy += sz) {
      for (let gx = Math.floor(x0 / sz) * sz; gx < x1; gx += sz) {
        const even = ((Math.floor((gx - ox) / sz) + Math.floor((gy - oy) / sz)) & 1) === 0;
        ctx.fillStyle = even ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.15)';
        ctx.fillRect(gx, gy, sz, sz);
      }
    }
    ctx.restore();
  }

  // 뷰 변환 헬퍼 (외부 공개용)
  function _docToScreen(docX, docY) {
    const es = editorState.get();
    const doc = store.get();
    const W = overlayCanvas.width;
    const H = overlayCanvas.height;
    return docToScreen(docX, docY, es.zoom, es.panX, es.panY, W, H, doc.meta.width, doc.meta.height);
  }

  function _screenToDoc(sx, sy) {
    const es = editorState.get();
    const doc = store.get();
    const W = overlayCanvas.width;
    const H = overlayCanvas.height;
    return screenToDoc(sx, sy, es.zoom, es.panX, es.panY, W, H, doc.meta.width, doc.meta.height);
  }

  // 드래그 초기화 (스냅 라인 콜백)
  function _onSnapLines(lines) {
    _snapLines = lines;
    requestOverlay();
  }
  const cleanupDrag = initDrag(overlayCanvas, store, editorState, _onSnapLines);

  // 뷰 컨트롤 초기화
  const cleanupView = initView(containerEl, overlayCanvas, store, editorState);

  // 스토어 변경 → scene + overlay 재렌더
  store.subscribe({ any: true }, () => {
    requestScene();
    requestOverlay();
  });

  // 에디터 상태 변경: zoom/pan/f → scene + overlay; 나머지 → overlay만
  editorState.subscribe((patch) => {
    const needsScene = 'zoom' in patch || 'panX' in patch || 'panY' in patch || 'f' in patch;
    if (needsScene) requestScene();
    requestOverlay();
  });

  // ResizeObserver: 캔버스 크기 동기화
  const ro = new ResizeObserver(entries => {
    for (const e of entries) {
      const { width, height } = e.contentRect;
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      sceneCanvas.width   = w;
      sceneCanvas.height  = h;
      overlayCanvas.width  = w;
      overlayCanvas.height = h;
    }
    requestScene();
    requestOverlay();
  });
  ro.observe(containerEl);

  requestScene();
  requestOverlay();

  // draft 모드 활성화/비활성화 (드래그 중 성능 향상)
  function setDraftMode(on) {
    if (_draftMode === on) return;
    _draftMode = on;
    if (!on) requestScene();
  }

  return {
    sceneCanvas,
    overlayCanvas,
    engine,
    docToScreen: _docToScreen,
    screenToDoc: _screenToDoc,
    requestScene,
    requestOverlay,
    setDraftMode,
    get sceneRenderCount() { return _sceneRenderCount; },
    destroy() {
      ro.disconnect();
      cleanupDrag();
      cleanupView();
    },
  };
}
