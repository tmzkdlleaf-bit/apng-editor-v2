const ZOOM_MIN = 0.1;
const ZOOM_MAX = 16;
const ZOOM_STEPS = [0.1, 0.125, 0.167, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];

function _clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function _nearestStep(z) {
  let best = ZOOM_STEPS[0], bestDiff = Math.abs(z - best);
  for (const s of ZOOM_STEPS) {
    const d = Math.abs(z - s);
    if (d < bestDiff) { bestDiff = d; best = s; }
  }
  return best;
}

function _nextStep(z, dir) {
  const steps = ZOOM_STEPS;
  if (dir > 0) {
    return steps.find(s => s > z + 1e-6) ?? steps[steps.length - 1];
  }
  return [...steps].reverse().find(s => s < z - 1e-6) ?? steps[0];
}

export function initView(containerEl, overlayCanvas, store, editorState) {
  // Zoom indicator
  const zoomEl = document.createElement('span');
  zoomEl.className = 'stage-zoom';
  containerEl.appendChild(zoomEl);

  // Tool buttons
  const toolWrap = document.createElement('div');
  toolWrap.className = 'stage-tools';
  toolWrap.innerHTML = `
    <button data-tool="select" title="선택 (V)" class="active">V</button>
    <button data-tool="hand"   title="손 도구 (H)">H</button>
  `;
  containerEl.appendChild(toolWrap);

  function _updateZoomEl() {
    const { zoom } = editorState.get();
    zoomEl.textContent = `${Math.round(zoom * 100)}%`;
  }

  function _setZoom(newZoom, pivotX, pivotY) {
    const es = editorState.get();
    const doc = store.get();
    const W = overlayCanvas.width;
    const H = overlayCanvas.height;
    const { width: docW, height: docH } = doc.meta;
    const oldZoom = es.zoom;
    const clamped = _clampZoom(newZoom);

    // pivot 기준으로 pan 보정 (커서 위치 유지)
    const ox = W / 2 - docW * oldZoom / 2 + es.panX;
    const oy = H / 2 - docH * oldZoom / 2 + es.panY;
    const docPX = (pivotX - ox) / oldZoom;
    const docPY = (pivotY - oy) / oldZoom;
    const newOx = pivotX - docPX * clamped;
    const newOy = pivotY - docPY * clamped;
    const newPanX = newOx - (W / 2 - docW * clamped / 2);
    const newPanY = newOy - (H / 2 - docH * clamped / 2);

    editorState.set({ zoom: clamped, panX: newPanX, panY: newPanY });
  }

  function _fitToCanvas() {
    const es = editorState.get();
    const doc = store.get();
    const W = overlayCanvas.width;
    const H = overlayCanvas.height;
    const { width: docW, height: docH } = doc.meta;
    const margin = 40;
    const fitZoom = _clampZoom(
      Math.min((W - margin * 2) / docW, (H - margin * 2) / docH),
    );
    editorState.set({ zoom: fitZoom, panX: 0, panY: 0 });
  }

  // Wheel: zoom
  function _onWheel(e) {
    e.preventDefault();
    const rect = overlayCanvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    _setZoom(editorState.get().zoom * factor, cx, cy);
  }

  // Space+drag: pan
  let _panning = false;
  let _panStart = null;

  function _onKeyDownView(e) {
    if (e.code === 'Space' && !e.repeat && !_isPanningTool()) {
      _panning = true;
      overlayCanvas.style.cursor = 'grab';
      e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); _fitToCanvas(); }
    if ((e.ctrlKey || e.metaKey) && e.key === '1') {
      e.preventDefault();
      const W = overlayCanvas.width;
      const H = overlayCanvas.height;
      editorState.set({ zoom: 1, panX: 0, panY: 0 });
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      const W = overlayCanvas.width;
      const H = overlayCanvas.height;
      _setZoom(_nextStep(editorState.get().zoom, 1), W / 2, H / 2);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      const W = overlayCanvas.width;
      const H = overlayCanvas.height;
      _setZoom(_nextStep(editorState.get().zoom, -1), W / 2, H / 2);
    }
  }

  function _onKeyUpView(e) {
    if (e.code === 'Space') {
      _panning = false;
      _panStart = null;
      overlayCanvas.style.cursor = '';
    }
  }

  function _isPanningTool() {
    return editorState.get().tool === 'hand';
  }

  function _onPanDown(e) {
    if (e.button !== 0) return;
    if (!_panning && !_isPanningTool()) return;
    _panStart = { x: e.clientX, y: e.clientY, panX: editorState.get().panX, panY: editorState.get().panY };
    overlayCanvas.style.cursor = 'grabbing';
    overlayCanvas.setPointerCapture(e.pointerId);
  }

  function _onPanMove(e) {
    if (!_panStart) return;
    const dx = e.clientX - _panStart.x;
    const dy = e.clientY - _panStart.y;
    editorState.set({ panX: _panStart.panX + dx, panY: _panStart.panY + dy });
  }

  function _onPanUp(e) {
    if (!_panStart) return;
    _panStart = null;
    overlayCanvas.style.cursor = _isPanningTool() ? 'grab' : (_panning ? 'grab' : '');
    overlayCanvas.releasePointerCapture(e.pointerId);
  }

  // Tool button clicks
  toolWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tool]');
    if (!btn) return;
    const tool = btn.dataset.tool;
    editorState.set({ tool });
    toolWrap.querySelectorAll('[data-tool]').forEach(b => {
      b.classList.toggle('active', b.dataset.tool === tool);
    });
    overlayCanvas.style.cursor = tool === 'hand' ? 'grab' : '';
  });

  editorState.subscribe((patch) => {
    if ('zoom' in patch) _updateZoomEl();
    if ('tool' in patch) {
      toolWrap.querySelectorAll('[data-tool]').forEach(b => {
        b.classList.toggle('active', b.dataset.tool === patch.tool);
      });
      overlayCanvas.style.cursor = patch.tool === 'hand' ? 'grab' : '';
    }
  });

  overlayCanvas.addEventListener('wheel', _onWheel, { passive: false });
  overlayCanvas.addEventListener('pointerdown', _onPanDown);
  overlayCanvas.addEventListener('pointermove', _onPanMove);
  overlayCanvas.addEventListener('pointerup', _onPanUp);
  document.addEventListener('keydown', _onKeyDownView);
  document.addEventListener('keyup', _onKeyUpView);

  _updateZoomEl();

  return () => {
    overlayCanvas.removeEventListener('wheel', _onWheel);
    overlayCanvas.removeEventListener('pointerdown', _onPanDown);
    overlayCanvas.removeEventListener('pointermove', _onPanMove);
    overlayCanvas.removeEventListener('pointerup', _onPanUp);
    document.removeEventListener('keydown', _onKeyDownView);
    document.removeEventListener('keyup', _onKeyUpView);
  };
}
