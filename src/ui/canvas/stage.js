import { createRenderEngine } from '../../core/render/frame.js';
import { docToScreen, screenToDoc, docOrigin } from './transform.js';
import { drawOverlay } from './gizmo.js';
import { initDrag } from './drag.js';
import { initView } from './view.js';
import { initTextEdit } from './text-edit.js';
import { initPathEdit } from './path-edit.js';
import { initEffectCoordEdit } from './effect-coord.js';
import { initMaskEdit } from './mask-edit.js';
import { initToolExtras } from './tool-extras.js';
import { createAssets } from '../assets.js';
import { effects as effectsRegistry } from '../../effects/registry.js';
import motionRegistry from '../../motions/registry.js';
import { clearTextLayoutCache } from '../../core/render/layers/text.js';
import { applyVariant } from '../../core/doc/variants.js';
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

  // R12-2 앞뒤 프레임 겹쳐 보기: 문서가 바뀔 때마다 epoch 를 올려 온니언 캐시를 무효화한다.
  let _docEpoch = 0;
  let _onionCanvases = [];   // 재사용 캔버스(슬롯별) — 렌더 경로에서 매번 새로 만들지 않기 위해
  let _onion = null;         // { key, items:[{ slot, alpha }] }
  const ONION_ALPHAS = [0.30, 0.15, 0.08]; // 가까운 것부터(멀수록 흐리게)
  const ONION_COLOR_BEFORE = '#ff4030'; // 앞(이전) = 빨강 계열
  const ONION_COLOR_AFTER  = '#3a9dff'; // 뒤(다음) = 파랑 계열

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

  // 세트 변형 미리보기용 복사본 캐시 — 같은 (변형 id · 문서 epoch)면 다시 복제하지 않는다.
  let _variantCache = null; // { id, epoch, doc }
  function _effectiveDoc(doc, es) {
    const id = es.previewVariantId;
    if (!id || !doc.variants) { _variantCache = null; return doc; }
    const row = (doc.variants.rows ?? []).find((r) => r && r.id === id);
    if (!row) { _variantCache = null; return doc; }
    if (_variantCache && _variantCache.id === id && _variantCache.epoch === _docEpoch) return _variantCache.doc;
    const applied = applyVariant(doc, row);
    _variantCache = { id, epoch: _docEpoch, doc: applied };
    return applied;
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

    // 투명 격자(체커) — 화면 아래 줄 토글. 기본 켜짐(지금 동작과 동일).
    if (es.checker !== false) _drawChecker(ctx, zoom, panX, panY, _cssW, _cssH, docW, docH, dpr);

    const { ox, oy } = docOrigin(zoom, panX, panY, _cssW, _cssH, docW, docH);
    const visDocX0 = Math.max(0, (-ox) / zoom);
    const visDocY0 = Math.max(0, (-oy) / zoom);
    const visDocX1 = Math.min(docW, (_cssW - ox) / zoom);
    const visDocY1 = Math.min(docH, (_cssH - oy) / zoom);

    if (visDocX1 <= visDocX0 || visDocY1 <= visDocY0) return;

    const offW = Math.max(1, Math.ceil((visDocX1 - visDocX0) * zoom * dpr));
    const offH = Math.max(1, Math.ceil((visDocY1 - visDocY0) * zoom * dpr));

    // R23c 미리보기 해상도. 'auto' 는 지금 규칙 그대로(픽셀 단위 동일) — 아래 경로를 건드리지 않는다.
    //   full/half/quarter 는 명시 배율: 작은 오프스크린에 그려 확대해 깐다(내보내기와 무관).
    const pr = es.previewRes ?? 'auto';
    let quality = (_draftMode || _autoDraft) ? 'draft' : 'final';
    let drawScale = 1;
    if (pr === 'full')         { quality = 'final'; _autoDraft = false; }
    else if (pr === 'half')    { quality = 'final'; drawScale = 0.5; }
    else if (pr === 'quarter') { quality = 'final'; drawScale = 0.25; }

    const rOffW = (drawScale === 1) ? offW : Math.max(1, Math.round(offW * drawScale));
    const rOffH = (drawScale === 1) ? offH : Math.max(1, Math.round(offH * drawScale));
    const offscreen = _getOffscreen(rOffW, rOffH);
    const offCtx = offscreen.getContext('2d');
    offCtx.clearRect(0, 0, rOffW, rOffH);

    const t0 = performance.now();

    // 세트 변형 미리보기(R13-1) — 문서는 바꾸지 않고 렌더에만 변형 값을 적용한 복사본을 쓴다.
    const rdoc = _effectiveDoc(doc, es);

    engine.renderFrame(offCtx, rdoc, f, {
      scale: zoom * dpr * drawScale,
      quality,
      view: { x: visDocX0, y: visDocY0, w: visDocX1 - visDocX0, h: visDocY1 - visDocY0 },
    });

    const elapsed = performance.now() - t0;
    _lastRenderMs = elapsed;

    // 느린 프레임 판단: 에셋 로딩 중 프레임은 제외(첫 로딩은 원래 느림).
    // 한 번 느렸다고 켜지지 말고 최근 몇 프레임 평균으로 자동 절반 해상도를 켠다. (auto 에서만)
    if ((assets.pendingCount?.() ?? 0) === 0) {
      _recentMs.push(elapsed);
      if (_recentMs.length > 5) _recentMs.shift();
    }
    if (pr === 'auto' && !_draftMode && !_autoDraft && _recentMs.length >= 2) {
      const avg = _recentMs.reduce((a, b) => a + b, 0) / _recentMs.length;
      if (avg > 16) _autoDraft = true;
    }

    const blitX = Math.max(0, ox) * dpr;
    const blitY = Math.max(0, oy) * dpr;

    // 온니언(앞뒤 프레임)은 장면 아래에 깐다 — 장면보다 먼저 그린다(변형 미리보기도 반영).
    _drawOnion(ctx, rdoc, es, f, {
      scale: zoom * dpr, quality,
      view: { x: visDocX0, y: visDocY0, w: visDocX1 - visDocX0, h: visDocY1 - visDocY0 },
      offW, offH, blitX, blitY,
    });

    // drawScale===1 이면 소스·대상 크기가 같아 지금과 픽셀 단위로 동일. 아니면 확대해 깐다.
    if (drawScale === 1) ctx.drawImage(offscreen, blitX, blitY);
    else ctx.drawImage(offscreen, 0, 0, rOffW, rOffH, blitX, blitY, offW, offH);

    // 자동 절반 해상도일 때: 드래그·재생이 계속되면 매 프레임 타이머가 리셋돼 흐린 상태 유지.
    // 입력/재생이 멎으면(일정 시간 새 요청 없음) 한 번 원래 해상도로 다시 그린다. (auto 에서만)
    if (pr === 'auto' && _autoDraft && !_draftMode) {
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

  // 겹칠 프레임 목록 [{ idx, color, alpha }] — 앞(빨강)·뒤(파랑), 멀수록 흐리게. 루프면 0의 앞은 마지막 프레임.
  function _onionList(doc, es, f) {
    const fc = doc.meta.frameCount ?? 1;
    if (fc <= 1) return [];
    const before = Math.max(0, Math.min(3, es.onionBefore ?? 1));
    const after  = Math.max(0, Math.min(3, es.onionAfter ?? 1));
    const wrap = (es.loopMode ?? doc.meta.playback ?? 'loop') !== 'once';
    const list = [];
    for (let i = 1; i <= before; i++) {
      let fi = f - i;
      if (fi < 0) { if (!wrap) continue; fi = ((fi % fc) + fc) % fc; }
      if (fi !== f) list.push({ idx: fi, color: ONION_COLOR_BEFORE, alpha: ONION_ALPHAS[i - 1] });
    }
    for (let i = 1; i <= after; i++) {
      let fi = f + i;
      if (fi > fc - 1) { if (!wrap) continue; fi = fi % fc; }
      if (fi !== f) list.push({ idx: fi, color: ONION_COLOR_AFTER, alpha: ONION_ALPHAS[i - 1] });
    }
    return list;
  }

  function _onionCanvas(slot, w, h) {
    let c = _onionCanvases[slot];
    if (!c) { c = document.createElement('canvas'); _onionCanvases[slot] = c; }
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }

  // 온니언 그리기 — 재생 중엔 숨김. 끌기 중엔 절반 해상도. 같은 프레임·문서·보기면 다시 렌더하지 않고 다시 깐다.
  function _drawOnion(ctx, doc, es, f, p) {
    if (!es.onion || es.playing) { _onion = null; return; }
    const list = _onionList(doc, es, f);
    if (!list.length) { _onion = null; return; }

    const half = drag.isDragging();
    const rw = half ? Math.max(1, Math.ceil(p.offW / 2)) : p.offW;
    const rh = half ? Math.max(1, Math.ceil(p.offH / 2)) : p.offH;
    const rscale = half ? p.scale / 2 : p.scale;
    const key = [_docEpoch, f, p.offW, p.offH, Math.round(p.view.x), Math.round(p.view.y),
      es.onionBefore, es.onionAfter, (es.loopMode ?? doc.meta.playback), p.quality, half ? 1 : 0].join('|');

    if (!_onion || _onion.key !== key) {
      // 다시 렌더(프레임·보기·문서가 바뀜).
      const items = [];
      list.forEach((entry, slot) => {
        const c = _onionCanvas(slot, rw, rh);
        const oc = c.getContext('2d');
        oc.setTransform(1, 0, 0, 1, 0, 0);
        oc.clearRect(0, 0, rw, rh);
        engine.renderFrame(oc, doc, entry.idx, { scale: rscale, quality: p.quality, view: p.view });
        // 물들이기 — 불투명 픽셀만 색 쪽으로(실루엣·투명도 보존).
        oc.save();
        oc.globalCompositeOperation = 'source-atop';
        oc.globalAlpha = 0.55;
        oc.fillStyle = entry.color;
        oc.fillRect(0, 0, rw, rh);
        oc.restore();
        items.push({ slot, alpha: entry.alpha });
      });
      _onion = { key, items };
    }

    // 장면 아래에 깐다.
    for (let i = 0; i < _onion.items.length; i++) {
      const { slot, alpha } = _onion.items[i];
      const c = _onionCanvases[slot];
      if (!c) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(c, 0, 0, c.width, c.height, p.blitX, p.blitY, p.offW, p.offH);
      ctx.restore();
    }
  }

  function _doOverlay() {
    _overlayReq = false;
    const doc = store.get();
    const es  = editorState.get();
    const dpr = window.devicePixelRatio || 1;

    const ctx = overlayCanvas.getContext('2d');
    ctx.save();
    ctx.scale(dpr, dpr);
    drawOverlay(ctx, doc, es, _snapLines, _cssW, _cssH, assets);
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
  const effectCoordEdit = initEffectCoordEdit(overlayCanvas, store, editorState);
  const maskEdit = initMaskEdit(overlayCanvas, store, editorState, () => assets);
  const toolExtras = initToolExtras(overlayCanvas, store, editorState);

  store.subscribe({ any: true }, () => {
    _docEpoch++;            // 온니언 캐시 무효화
    requestScene();
    requestOverlay();
  });

  editorState.subscribe((patch) => {
    const needsScene = 'zoom' in patch || 'panX' in patch || 'panY' in patch || 'f' in patch
      || 'onion' in patch || 'onionBefore' in patch || 'onionAfter' in patch
      || 'playing' in patch || 'loopMode' in patch || 'previewVariantId' in patch
      || 'previewRes' in patch || 'checker' in patch;
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
      textEdit?.destroy?.();
      pathEdit?.destroy?.();
      effectCoordEdit?.destroy?.();
      maskEdit?.destroy?.();
      toolExtras?.destroy?.();
      clearTimeout(_settleTimer);
    },
  };
}
