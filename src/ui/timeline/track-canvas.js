// 타임라인 트랙 캔버스 — 키프레임, 클립, 플레이헤드
const ROW_H    = 28;  // C3: 28px
const HEAD_H   = 24;
const PX_PER_F_DEFAULT = 20; // 기본 프레임당 픽셀

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

  // 바디 클릭 → 프레임 이동 (C5와 분리)
  bodyCanvas.addEventListener('click', (e) => {
    const rect = bodyCanvas.getBoundingClientRect();
    const x    = e.clientX - rect.left + bodyWrap.scrollLeft;
    const f    = Math.floor(x / _pxPerF);
    const fc   = store.get().meta.frameCount ?? 1;
    playback.goTo(Math.max(0, Math.min(fc - 1, f)));
  });

  // C13: Ctrl+휠 → 가로 확대/축소
  tracksEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -2 : 2;
    _pxPerF = Math.max(4, Math.min(80, _pxPerF + delta));
    requestDraw();
  }, { passive: false });

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

      if (layer.clips?.length) {
        for (const clip of layer.clips) {
          const x  = clip.start * _pxPerF;
          const cw = clip.length * _pxPerF;
          ctx.fillStyle = clipBg;
          ctx.fillRect(x + 1, y0 + 4, cw - 2, ROW_H - 8);
        }
      }

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
