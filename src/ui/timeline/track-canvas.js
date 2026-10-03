// 타임라인 트랙 캔버스 — 키프레임, 클립, 플레이헤드
const ROW_H    = 28;  // C3: 28px
const HEAD_H   = 24;
const PX_PER_F_DEFAULT = 20; // 기본 프레임당 픽셀
const KF_HIT   = 8;  // 키프레임 히트 반경 (px)
const CLIP_HIT = 6;  // 클립 끝단 히트 폭 (px)

function _cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function initTrackCanvas(tracksEl, layersEl, store, editorState, playback) {
  const headWrap = document.createElement('div');
  headWrap.className = 'track-header-wrap';
  const headCanvas = document.createElement('canvas');
  headCanvas.className = 'track-header-canvas';
  headWrap.appendChild(headCanvas);

  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'track-body-wrap';
  const bodyCanvas = document.createElement('canvas');
  bodyCanvas.className = 'track-body-canvas';
  bodyWrap.appendChild(bodyCanvas);

  tracksEl.appendChild(headWrap);
  tracksEl.appendChild(bodyWrap);

  // C13: 프레임당 픽셀 (Ctrl+휠로 조절)
  let _pxPerF = PX_PER_F_DEFAULT;

  let _syncingScroll = false;

  layersEl.addEventListener('scroll', () => {
    if (_syncingScroll) return;
    _syncingScroll = true;
    bodyWrap.scrollTop = layersEl.scrollTop;
    _syncingScroll = false;
  });
  bodyWrap.addEventListener('scroll', () => {
    if (_syncingScroll) return;
    _syncingScroll = true;
    layersEl.scrollTop = bodyWrap.scrollTop;
    headWrap.scrollLeft = bodyWrap.scrollLeft;
    _syncingScroll = false;
  });
  headWrap.style.overflowX = 'hidden';

  // C5: 눈금자 드래그 스크럽
  let _scrubbing = false;

  function _scrubAt(clientX) {
    const rect = headWrap.getBoundingClientRect();
    const x    = clientX - rect.left + bodyWrap.scrollLeft;
    const f    = Math.floor(x / _pxPerF);
    const fc   = store.get().meta.frameCount ?? 1;
    playback.goTo(Math.max(0, Math.min(fc - 1, f)));
  }

  headCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    _scrubbing = true;
    headCanvas.setPointerCapture(e.pointerId);
    _scrubAt(e.clientX);
  });
  headCanvas.addEventListener('pointermove', (e) => {
    if (!_scrubbing) return;
    _scrubAt(e.clientX);
  });
  headCanvas.addEventListener('pointerup', () => { _scrubbing = false; });
  headCanvas.addEventListener('pointercancel', () => { _scrubbing = false; });

  // C13: Ctrl+휠 → 가로 확대/축소
  tracksEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -2 : 2;
    _pxPerF = Math.max(4, Math.min(80, _pxPerF + delta));
    requestDraw();
  }, { passive: false });

  // ── 바디 드래그 (C6 클립 트림, C7 키프레임 이동, C14 begin/commit) ──────
  let _bodyDrag = null;  // { type, ... }

  function _bodyCanvasXY(e) {
    const rect = bodyCanvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left + bodyWrap.scrollLeft,
      y: e.clientY - rect.top  + bodyWrap.scrollTop,
    };
  }

  // 바디 캔버스 좌표에서 히트 테스트
  // 반환: { type:'keyframe'|'clip-start'|'clip-end'|'frame', ... }
  function _hitBody(x, y) {
    const doc  = store.get();
    const ids  = [...doc.order].reverse();
    const rowI = Math.floor(y / ROW_H);
    if (rowI < 0 || rowI >= ids.length) return { type: 'frame', f: Math.floor(x / _pxPerF) };

    const id    = ids[rowI];
    const layer = doc.layers[id];
    if (!layer) return { type: 'frame', f: Math.floor(x / _pxPerF) };

    const y0 = rowI * ROW_H;
    const fc = doc.meta.frameCount ?? 1;

    // C7: 키프레임 히트
    const transform = layer.transform ?? {};
    const propKeys  = ['x', 'y', 'scale', 'rotation', 'alpha'];
    for (const pk of propKeys) {
      for (const kf of (transform[pk]?.keys ?? [])) {
        if (kf.f < 0 || kf.f >= fc) continue;
        const kx = kf.f * _pxPerF + _pxPerF / 2;
        const ky = y0 + ROW_H / 2;
        if (Math.abs(x - kx) <= KF_HIT && Math.abs(y - ky) <= KF_HIT) {
          return { type: 'keyframe', id, path: `transform.${pk}`, origF: kf.f };
        }
      }
    }

    // C6: 클립 끝단 히트
    if (layer.clips?.length) {
      for (const clip of layer.clips) {
        const x0 = clip.start * _pxPerF;
        const x1 = (clip.start + clip.length) * _pxPerF;
        if (Math.abs(x - x0) <= CLIP_HIT) {
          return { type: 'clip-start', id, clipId: clip.id, origStart: clip.start, origLength: clip.length };
        }
        if (Math.abs(x - x1) <= CLIP_HIT) {
          return { type: 'clip-end', id, clipId: clip.id, origStart: clip.start, origLength: clip.length };
        }
      }
    }

    return { type: 'frame', f: Math.floor(x / _pxPerF) };
  }

  bodyCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const { x, y } = _bodyCanvasXY(e);
    const hit = _hitBody(x, y);

    if (hit.type === 'frame') {
      // 프레임 이동 (단순 클릭)
      const fc = store.get().meta.frameCount ?? 1;
      playback.goTo(Math.max(0, Math.min(fc - 1, hit.f)));
      return;
    }

    // C7: 키프레임 드래그 시작 (C14: begin)
    if (hit.type === 'keyframe') {
      store.begin('키프레임 이동');
      _bodyDrag = { type: 'keyframe', label: '키프레임 이동',
        id: hit.id, path: hit.path, origF: hit.origF, startX: x, lastDelta: 0 };
      bodyCanvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // C6: 클립 트림 드래그 시작 (C14: begin)
    if (hit.type === 'clip-start' || hit.type === 'clip-end') {
      store.begin('클립 트림');
      _bodyDrag = { type: hit.type, label: '클립 트림',
        id: hit.id, clipId: hit.clipId,
        origStart: hit.origStart, origLength: hit.origLength, startX: x };
      bodyCanvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });

  // C14: cancel+begin+preview 패턴 — 매 이동마다 초기 상태에서 fresh하게 적용
  function _resetPreview(cmd) {
    store.cancel();
    store.begin(_bodyDrag.label);
    store.preview(cmd);
  }

  bodyCanvas.addEventListener('pointermove', (e) => {
    if (!_bodyDrag) return;
    const { x } = _bodyCanvasXY(e);
    const fc     = store.get().meta.frameCount ?? 1;

    if (_bodyDrag.type === 'keyframe') {
      const delta = Math.round((x - _bodyDrag.startX) / _pxPerF);
      if (delta === _bodyDrag.lastDelta) return;
      _bodyDrag.lastDelta = delta;
      const newF = Math.max(0, Math.min(fc - 1, _bodyDrag.origF + delta));
      const actualDelta = newF - _bodyDrag.origF;
      _resetPreview({
        type: 'moveKeys',
        id: _bodyDrag.id,
        refs: [{ path: _bodyDrag.path, f: _bodyDrag.origF }],
        delta: actualDelta,
      });
    } else if (_bodyDrag.type === 'clip-start') {
      const rawDelta  = Math.round((x - _bodyDrag.startX) / _pxPerF);
      const newStart  = Math.max(0, _bodyDrag.origStart + rawDelta);
      const newLength = Math.max(1, _bodyDrag.origLength - (newStart - _bodyDrag.origStart));
      _resetPreview({ type: 'setClip', id: _bodyDrag.id, clipId: _bodyDrag.clipId,
        patch: { start: newStart, length: newLength } });
    } else if (_bodyDrag.type === 'clip-end') {
      const rawDelta  = Math.round((x - _bodyDrag.startX) / _pxPerF);
      const newLength = Math.max(1, _bodyDrag.origLength + rawDelta);
      _resetPreview({ type: 'setClip', id: _bodyDrag.id, clipId: _bodyDrag.clipId,
        patch: { length: newLength } });
    }
  });

  bodyCanvas.addEventListener('pointerup', () => {
    if (!_bodyDrag) return;
    store.commit(); // C14: commit → 되돌리기 1건
    _bodyDrag = null;
  });
  bodyCanvas.addEventListener('pointercancel', () => {
    if (!_bodyDrag) return;
    store.cancel();
    _bodyDrag = null;
  });
  bodyCanvas.addEventListener('lostpointercapture', () => {
    if (!_bodyDrag) return;
    store.cancel();
    _bodyDrag = null;
  });

  // ── 그리기 ───────────────────────────────────────────────────────────────
  let _rafReq = false;
  function requestDraw() {
    if (_rafReq) return;
    _rafReq = true;
    requestAnimationFrame(() => { _rafReq = false; _draw(); });
  }

  function _draw() {
    const doc  = store.get();
    const es   = editorState.get();
    const fc   = doc.meta.frameCount ?? 1;
    const ids  = [...doc.order].reverse();
    const dpr  = window.devicePixelRatio || 1;

    const totalW = Math.max(400, fc * _pxPerF);
    const bodyH  = Math.max(ROW_H, ids.length * ROW_H);

    const wrapW = tracksEl.clientWidth || 400;

    headCanvas.width   = Math.round(Math.max(wrapW, totalW) * dpr);
    headCanvas.height  = Math.round(HEAD_H * dpr);
    headCanvas.style.width  = Math.max(wrapW, totalW) + 'px';
    headCanvas.style.height = HEAD_H + 'px';
    headWrap.style.width = Math.max(wrapW, totalW) + 'px';

    bodyCanvas.width   = Math.round(totalW * dpr);
    bodyCanvas.height  = Math.round(bodyH  * dpr);
    bodyCanvas.style.width  = totalW + 'px';
    bodyCanvas.style.height = bodyH  + 'px';

    const hCtx = headCanvas.getContext('2d');
    const bCtx = bodyCanvas.getContext('2d');
    hCtx.scale(dpr, dpr);
    bCtx.scale(dpr, dpr);

    _drawHeader(hCtx, fc, es.f, Math.max(wrapW, totalW));
    _drawBody(bCtx, doc, ids, es, fc, totalW, bodyH);
  }

  function _drawHeader(ctx, fc, curF, totalW) {
    const bgColor   = _cssVar('--tl')   || '#1a1c1f';
    const textColor = _cssVar('--dim')  || '#9a9ea6';
    const accColor  = _cssVar('--acc')  || '#f0a35e';
    const lineColor = _cssVar('--line2') || '#2b2e33';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, totalW, HEAD_H);

    ctx.fillStyle = textColor;
    ctx.font      = '10px monospace';
    ctx.textAlign = 'center';

    const step = _pxPerF >= 20 ? 5 : (fc > 60 ? 10 : 5);
    for (let f = 0; f < fc; f += step) {
      const x = f * _pxPerF + _pxPerF / 2;
      ctx.fillStyle = lineColor;
      ctx.fillRect(x, HEAD_H - 6, 1, 6);
      ctx.fillStyle = textColor;
      ctx.fillText(String(f), x, HEAD_H - 8);
    }

    const px = curF * _pxPerF + _pxPerF / 2;
    ctx.fillStyle = accColor;
    ctx.fillRect(px - 1, 0, 2, HEAD_H);
    ctx.beginPath();
    ctx.moveTo(px - 5, 0);
    ctx.lineTo(px + 5, 0);
    ctx.lineTo(px, 8);
    ctx.closePath();
    ctx.fill();
  }

  function _drawBody(ctx, doc, ids, es, fc, totalW, totalH) {
    const bgColor   = _cssVar('--tl')     || '#1a1c1f';
    const lineColor = _cssVar('--rowline') || '#24272b';
    const line2     = _cssVar('--line2')   || '#2b2e33';
    const accColor  = _cssVar('--acc')     || '#f0a35e';
    const clipBg    = _cssVar('--clipbg')  || '#4a3524';
    const selRow    = _cssVar('--selrow')  || '#2a241e';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, totalW, totalH);

    const sel = new Set(es.selection);

    ctx.fillStyle = line2;
    for (let f = 0; f < fc; f++) {
      const x = f * _pxPerF;
      if (f % 5 === 0) ctx.fillRect(x, 0, 1, totalH);
    }

    for (let i = 0; i < ids.length; i++) {
      const id    = ids[i];
      const layer = doc.layers[id];
      if (!layer) continue;
      const y0 = i * ROW_H;

      if (sel.has(id)) {
        ctx.fillStyle = selRow;
        ctx.fillRect(0, y0, totalW, ROW_H);
      }

      // 클립 바 (C6: 끝단에 밝은 핸들 표시)
      if (layer.clips?.length) {
        for (const clip of layer.clips) {
          const x  = clip.start * _pxPerF;
          const cw = clip.length * _pxPerF;
          ctx.fillStyle = clipBg;
          ctx.fillRect(x + 1, y0 + 4, cw - 2, ROW_H - 8);
          // 트림 핸들
          ctx.fillStyle = accColor;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(x, y0 + 4, 3, ROW_H - 8);
          ctx.fillRect(x + cw - 3, y0 + 4, 3, ROW_H - 8);
          ctx.globalAlpha = 1;
        }
      }

      // 키프레임 다이아몬드
      const transform = layer.transform ?? {};
      const propKeys  = ['x', 'y', 'scale', 'rotation', 'alpha'];
      const kfFrames  = new Set();
      for (const pk of propKeys) {
        for (const kf of (transform[pk]?.keys ?? [])) {
          kfFrames.add(kf.f);
        }
      }
      for (const f of kfFrames) {
        if (f < 0 || f >= fc) continue;
        const kx = f * _pxPerF + _pxPerF / 2;
        const ky = y0 + ROW_H / 2;
        const s  = 5;
        ctx.fillStyle = accColor;
        ctx.beginPath();
        ctx.moveTo(kx, ky - s);
        ctx.lineTo(kx + s, ky);
        ctx.lineTo(kx, ky + s);
        ctx.lineTo(kx - s, ky);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = lineColor;
      ctx.fillRect(0, y0 + ROW_H - 1, totalW, 1);
    }

    const px = es.f * _pxPerF + _pxPerF / 2;
    ctx.fillStyle = accColor;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(px - 1, 0, 2, totalH);
    ctx.globalAlpha = 1;
  }

  const unsubStore = store.subscribe({ any: true }, requestDraw);
  const unsubES    = editorState.subscribe(requestDraw);

  const ro = new ResizeObserver(() => requestDraw());
  ro.observe(tracksEl);

  requestDraw();

  function destroy() {
    unsubStore();
    unsubES();
    ro.disconnect();
  }

  return { destroy, get PX_PER_F() { return _pxPerF; }, HEAD_H };
}
