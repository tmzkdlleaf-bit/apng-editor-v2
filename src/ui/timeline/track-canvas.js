// 타임라인 트랙 캔버스 — 키프레임, 클립, 플레이헤드
const ROW_H    = 32;
const HEAD_H   = 24;
const PX_PER_F = 20;  // 프레임당 픽셀

// CSS 변수 값 읽기 (토큰 기반)
function _cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function initTrackCanvas(tracksEl, layersEl, store, editorState, playback) {
  // 헤더 캔버스 (수평 스크롤 동조, 세로 고정)
  const headWrap = document.createElement('div');
  headWrap.className = 'track-header-wrap';
  const headCanvas = document.createElement('canvas');
  headCanvas.className = 'track-header-canvas';
  headWrap.appendChild(headCanvas);

  // 바디 래퍼 (스크롤 컨테이너)
  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'track-body-wrap';
  const bodyCanvas = document.createElement('canvas');
  bodyCanvas.className = 'track-body-canvas';
  bodyWrap.appendChild(bodyCanvas);

  tracksEl.appendChild(headWrap);
  tracksEl.appendChild(bodyWrap);

  let _syncingScroll = false;

  // 수직 스크롤 동조 (레이어 목록 ↔ 바디)
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
    // 헤더 수평 스크롤 동조
    headWrap.scrollLeft = bodyWrap.scrollLeft;
    _syncingScroll = false;
  });
  headWrap.style.overflowX = 'hidden';

  // 클릭 → 프레임 이동
  bodyCanvas.addEventListener('click', (e) => {
    const rect = bodyCanvas.getBoundingClientRect();
    const x    = e.clientX - rect.left + bodyWrap.scrollLeft;
    const f    = Math.floor(x / PX_PER_F);
    const fc   = store.get().meta.frameCount ?? 1;
    playback.goTo(Math.max(0, Math.min(fc - 1, f)));
  });
  headCanvas.addEventListener('click', (e) => {
    const rect = headWrap.getBoundingClientRect();
    const x    = e.clientX - rect.left + bodyWrap.scrollLeft;
    const f    = Math.floor(x / PX_PER_F);
    const fc   = store.get().meta.frameCount ?? 1;
    playback.goTo(Math.max(0, Math.min(fc - 1, f)));
  });

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

    const totalW = Math.max(400, fc * PX_PER_F);
    const bodyH  = Math.max(ROW_H, ids.length * ROW_H);

    // 컨테이너 너비로 헤더 정렬
    const wrapW = tracksEl.clientWidth || 400;

    // 헤더
    headCanvas.width   = Math.round(Math.max(wrapW, totalW) * dpr);
    headCanvas.height  = Math.round(HEAD_H * dpr);
    headCanvas.style.width  = Math.max(wrapW, totalW) + 'px';
    headCanvas.style.height = HEAD_H + 'px';
    headWrap.style.width = Math.max(wrapW, totalW) + 'px';

    // 바디
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

    // 5프레임 단위 눈금
    const step = fc > 60 ? 10 : 5;
    for (let f = 0; f < fc; f += step) {
      const x = f * PX_PER_F + PX_PER_F / 2;
      ctx.fillStyle = lineColor;
      ctx.fillRect(x, HEAD_H - 6, 1, 6);
      ctx.fillStyle = textColor;
      ctx.fillText(String(f), x, HEAD_H - 8);
    }
    // 플레이헤드 (헤더)
    const px = curF * PX_PER_F + PX_PER_F / 2;
    ctx.fillStyle = accColor;
    ctx.fillRect(px - 1, 0, 2, HEAD_H);
    // 삼각형 마커
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
    const fxBg      = _cssVar('--fxbg')   || '#243446';
    const selRow    = _cssVar('--selrow')  || '#2a241e';
    const dimColor  = _cssVar('--dim')     || '#9a9ea6';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, totalW, totalH);

    const sel = new Set(es.selection);

    // 세로 프레임 선
    ctx.fillStyle = line2;
    for (let f = 0; f < fc; f++) {
      const x = f * PX_PER_F;
      if (f % 5 === 0) ctx.fillRect(x, 0, 1, totalH);
    }

    for (let i = 0; i < ids.length; i++) {
      const id    = ids[i];
      const layer = doc.layers[id];
      if (!layer) continue;
      const y0 = i * ROW_H;

      // 행 배경
      if (sel.has(id)) {
        ctx.fillStyle = selRow;
        ctx.fillRect(0, y0, totalW, ROW_H);
      }

      // 클립 바 (motion clips)
      if (layer.clips?.length) {
        for (const clip of layer.clips) {
          const x  = clip.start * PX_PER_F;
          const cw = clip.length * PX_PER_F;
          ctx.fillStyle = clipBg;
          ctx.fillRect(x + 1, y0 + 4, cw - 2, ROW_H - 8);
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
        const kx = f * PX_PER_F + PX_PER_F / 2;
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

      // 행 구분선
      ctx.fillStyle = lineColor;
      ctx.fillRect(0, y0 + ROW_H - 1, totalW, 1);
    }

    // 플레이헤드 수직선
    const px = es.f * PX_PER_F + PX_PER_F / 2;
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

  return { destroy, PX_PER_F, HEAD_H };
}
