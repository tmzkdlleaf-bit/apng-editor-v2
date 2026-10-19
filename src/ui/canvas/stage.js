import { createRenderEngine } from '../../core/render/frame.js';
import { docToScreen, screenToDoc, docOrigin } from './transform.js';
import { drawOverlay } from './gizmo.js';
import { initDrag } from './drag.js';
import { initView } from './view.js';
import { initTextEdit } from './text-edit.js';
import { initPathEdit } from './path-edit.js';
import { createAssets } from '../assets.js';
import { effects as effectsRegistry } from '../../effects/registry.js';
import motionRegistry from '../../motions/registry.js';
import { clearTextLayoutCache } from '../../core/render/layers/text.js';
import { ensureDocFonts } from '../fonts.js';

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
  let _recentMs = [];      // 최근 렌더 시간 표본(에셋 로딩 프레임 제외)
  let _settleTimer = null; // 입력/재생이 멎으면 원해상도로 한 번 다시 그리기
  let _lastRenderMs = 0;
  let _sceneMsSamples = []; // 전체 장면 그리기(체커 포함) 시간 표본
  let _snapLines = [];
  let _offscreen  = null;
  let _cssW = 1, _cssH = 1;

  // A2: 체커보드 패턴 캐시
  let _checkerPattern = null;
  let _checkerPatDpr  = 0;

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

  // 폰트 로딩 전/후 글자 렌더가 달라진다 → 로딩이 끝나면 글자 레이어 캐시를 비우고 다시 그린다.
  // (document.fonts 는 각 웹 폰트가 로드될 때마다 loadingdone 을 쏜다.)
  if (typeof document !== 'undefined' && document.fonts?.addEventListener) {
    document.fonts.addEventListener('loadingdone', (ev) => {
      // 방금 로드된 폰트 패밀리만 추림.
      const loaded = new Set();
      for (const ff of (ev.fontfaces ?? [])) loaded.add(String(ff.family).replace(/^["']|["']$/g, ''));
      if (!loaded.size) return;
      const doc = store.get();
      let hit = false;
      for (const id of Object.keys(doc.layers ?? {})) {
        const ly = doc.layers[id];
        if (ly?.type === 'text' && loaded.has(ly.font)) { engine.invalidate(id); hit = true; }
      }
      // 그 폰트를 '실제로 쓰는' 글자 레이어가 있을 때만 다시 그린다(무관한 폰트 로딩은 무시).
      if (hit) { clearTextLayoutCache(); requestScene(); }
    });
  }

  function requestOverlay() {
    if (_overlayReq) return;
    _overlayReq = true;
    requestAnimationFrame(_doOverlay);
  }

  function _doScene() {
    _sceneReq = false;
    _sceneRenderCount++;
    const _sceneT0 = performance.now();

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

    // 느린 프레임 판단: 에셋 로딩 중 프레임은 제외(첫 로딩은 원래 느림).
    // 한 번 느렸다고 켜지지 말고 최근 몇 프레임 평균으로 자동 절반 해상도를 켠다.
    if ((assets.pendingCount?.() ?? 0) === 0) {
      _recentMs.push(elapsed);
      if (_recentMs.length > 5) _recentMs.shift();
    }
    if (!_draftMode && !_autoDraft && _recentMs.length >= 2) {
      const avg = _recentMs.reduce((a, b) => a + b, 0) / _recentMs.length;
      if (avg > 16) _autoDraft = true;
    }

    const blitX = Math.max(0, ox) * dpr;
    const blitY = Math.max(0, oy) * dpr;
    ctx.drawImage(offscreen, blitX, blitY);

    // 자동 절반 해상도일 때: 드래그·재생이 계속되면 매 프레임 타이머가 리셋돼 흐린 상태 유지.
    // 입력/재생이 멎으면(일정 시간 새 요청 없음) 한 번 원래 해상도로 다시 그린다.
    if (_autoDraft && !_draftMode) {
      clearTimeout(_settleTimer);
      _settleTimer = setTimeout(() => {
        _autoDraft = false;
        _recentMs = [];
        requestScene();
      }, 250);
    }

    _sceneMsSamples.push(performance.now() - _sceneT0);
    if (_sceneMsSamples.length > 240) _sceneMsSamples.shift();
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

  // A2: createPattern으로 한 번에 채우기
  function _makeCheckerPattern(ctx, dpr) {
    if (_checkerPattern && _checkerPatDpr === dpr) return _checkerPattern;
    const sz = Math.round(8 * dpr);
    const pc = document.createElement('canvas');
    pc.width  = sz * 2;
    pc.height = sz * 2;
    const pctx = pc.getContext('2d');
    pctx.fillStyle = 'rgba(255,255,255,0.07)';
    pctx.fillRect(0, 0, sz * 2, sz * 2);
    pctx.fillStyle = 'rgba(0,0,0,0.15)';
    pctx.fillRect(0, 0, sz, sz);
    pctx.fillRect(sz, sz, sz, sz);
    _checkerPattern = ctx.createPattern(pc, 'repeat');
    _checkerPatDpr  = dpr;
    return _checkerPattern;
  }

  function _drawChecker(ctx, zoom, panX, panY, W, H, docW, docH, dpr) {
    const { ox, oy } = docOrigin(zoom, panX, panY, W, H, docW, docH);
    const dw = docW * zoom;
    const dh = docH * zoom;
    const x0 = Math.max(0, ox) * dpr;
    const y0 = Math.max(0, oy) * dpr;
    const x1 = Math.min(W, ox + dw) * dpr;
    const y1 = Math.min(H, oy + dh) * dpr;
    if (x1 <= x0 || y1 <= y0) return;

    const sz  = Math.round(8 * dpr);
    const pat = _makeCheckerPattern(ctx, dpr);

    // 패턴 위상: doc 원점(ox,oy)에 체커 격자가 맞게 offset 계산
    const offX = ((Math.round(ox * dpr) % (sz * 2)) + sz * 2) % (sz * 2);
    const offY = ((Math.round(oy * dpr) % (sz * 2)) + sz * 2) % (sz * 2);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
    ctx.translate(offX, offY);
    ctx.fillStyle = pat;
    // clip이 실제 범위를 제한 — 충분히 큰 영역으로 채우기
    ctx.fillRect(x0 - offX, y0 - offY, x1 - x0 + offX + sz * 2, y1 - y0 + offY + sz * 2);
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
    if (!on) { _autoDraft = false; _recentMs = []; clearTimeout(_settleTimer); requestScene(); }
  }

  function _onDraftMode(on) {
    setDraftMode(on);
    if (!on) { _autoDraft = false; _recentMs = []; clearTimeout(_settleTimer); }
  }

  overlayCanvas.addEventListener('pointermove', () => {
    _lastPointerMoveTime = performance.now();
  }, { capture: true, passive: true });

  const drag = initDrag(overlayCanvas, store, editorState, _onSnapLines, _onDraftMode, () => _lastRenderMs > 16, assets);
  const cleanupView = initView(containerEl, overlayCanvas, store, editorState);
  const textEdit = initTextEdit(overlayCanvas, containerEl, store, editorState, assets);
  const pathEdit = initPathEdit(overlayCanvas, store, editorState);

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

      // dpr가 바뀌면 패턴 재생성
      _checkerPattern = null;
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
    // 썸네일: 현재 문서 frame 0을 긴 변 maxPx로 그려 PNG Blob 반환(자동 저장용)
    async renderThumbnail(maxPx = 256) {
      const doc = store.get();
      // 글꼴이 로드된 뒤 그린다(글자 썸네일이 폴백으로 달라지지 않게).
      try { await ensureDocFonts(doc); } catch {}
      const { width, height } = doc.meta;
      const scale = Math.min(1, maxPx / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      engine.renderFrame(c.getContext('2d'), doc, 0, { scale });
      return new Promise((resolve) => {
        if (c.toBlob) c.toBlob((b) => resolve(b), 'image/png');
        else resolve(null);
      });
    },
    getLatencyStats() {
      if (!_latencies.length) return null;
      const avg = _latencies.reduce((a, b) => a + b, 0) / _latencies.length;
      const max = Math.max(..._latencies);
      return { avg, max, count: _latencies.length };
    },
    get sceneRenderCount() { return _sceneRenderCount; },
    // 에셋 디코드가 모두 끝났는지(테스트가 "엔진 유휴"를 기다릴 수 있게). 0 = 유휴.
    get assetsPending() { return assets.pendingCount?.() ?? 0; },
    get offscreenCanvas() { return _offscreen; },
    resetSceneStats() { _sceneMsSamples = []; },
    getSceneStats() {
      if (!_sceneMsSamples.length) return null;
      const avg = _sceneMsSamples.reduce((a, b) => a + b, 0) / _sceneMsSamples.length;
      return { avg, max: Math.max(..._sceneMsSamples), count: _sceneMsSamples.length };
    },
    destroy() {
      ro.disconnect();
      drag.cleanup();
      cleanupView();
      clearTimeout(_settleTimer);
    },
  };
}
