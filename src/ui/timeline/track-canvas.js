// 타임라인 트랙 캔버스 — 키프레임, 클립, 플레이헤드, 하위 속성 행
import { computeRows, keyedProps, TRANSFORM_PROPS } from './rows.js';
import { EASE_LABELS } from '../../core/anim/easing.js';

const ROW_H    = 28;  // C3: 28px
const HEAD_H   = 24;
const PX_PER_F_DEFAULT = 20; // 기본 프레임당 픽셀
const KF_HIT   = 7;   // 키프레임 히트 반경 (px)
const CLIP_HIT = 6;   // 클립 끝단 히트 폭 (px)
const HANDLE_W = 10;  // 스트레치 핸들 폭 (px)
const DRAG_THRESH = 4; // 드래그 판정 임계 (px)

function _cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 레이어의 키 있는 속성 프레임 전부 (합집합)
function _mergedKeyFrames(layer) {
  const set = new Set();
  for (const p of keyedProps(layer)) {
    const key = p.path.split('.')[1];
    for (const kf of (layer.transform[key].keys ?? [])) set.add(kf.f);
  }
  return set;
}

function _camKeyFrames(doc) {
  const set = new Set();
  for (const k of ['x', 'y', 'zoom']) {
    for (const kf of (doc.camera?.[k]?.keys ?? [])) set.add(kf.f);
  }
  return set;
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

  let _pxPerF = PX_PER_F_DEFAULT;  // C13
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

  // ── 헤더 스크럽 (C5) ──────────────────────────────────────────────────
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
    editorState.set({ focusRegion: 'timeline' });
    _scrubbing = true;
    headCanvas.setPointerCapture(e.pointerId);
    _scrubAt(e.clientX);
  });
  headCanvas.addEventListener('pointermove', (e) => { if (_scrubbing) _scrubAt(e.clientX); });
  headCanvas.addEventListener('pointerup', () => { _scrubbing = false; });
  headCanvas.addEventListener('pointercancel', () => { _scrubbing = false; });

  // ── Ctrl+휠 확대/축소 (C13) ──────────────────────────────────────────
  tracksEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    _pxPerF = Math.max(4, Math.min(80, _pxPerF + (e.deltaY > 0 ? -2 : 2)));
    requestDraw();
  }, { passive: false });

  // ── 좌표 변환 ─────────────────────────────────────────────────────────
  function _bodyXY(e) {
    const rect = bodyCanvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left + bodyWrap.scrollLeft,
      y: e.clientY - rect.top  + bodyWrap.scrollTop,
    };
  }
  function _xToFrame(x) { return Math.round((x - _pxPerF / 2) / _pxPerF); }
  function _frameToX(f) { return f * _pxPerF + _pxPerF / 2; }

  // 현재 행 목록 (hit test용 — draw와 동일 계산)
  function _rows() {
    return computeRows(store.get(), editorState.get().expanded);
  }

  // ── 히트 테스트 ───────────────────────────────────────────────────────
  // 반환: { kind:'keyframe'|'clip-start'|'clip-end'|'handle'|'empty', ... }
  function _hit(x, y) {
    const doc  = store.get();
    const es   = editorState.get();
    const rows = _rows();
    const rowI = Math.floor(y / ROW_H);
    const fc   = doc.meta.frameCount ?? 1;
    if (rowI < 0 || rowI >= rows.length) return { kind: 'empty', f: _xToFrame(x), rowI };
    const row = rows[rowI];
    const y0  = rowI * ROW_H;

    // 스트레치 핸들 (선택 키가 이 행에 2개 이상일 때)
    const handle = _handleRectForRow(row, es);
    if (handle && x >= handle.x && x <= handle.x + HANDLE_W
        && y >= y0 + 4 && y <= y0 + ROW_H - 4) {
      return { kind: 'handle', row, minF: handle.minF, maxF: handle.maxF };
    }

    // 키프레임
    if (row.kind === 'layer') {
      const layer = doc.layers[row.id];
      if (layer) {
        // 클립 끝단
        if (layer.clips?.length) {
          for (const clip of layer.clips) {
            const x0 = clip.start * _pxPerF;
            const x1 = (clip.start + clip.length) * _pxPerF;
            if (Math.abs(x - x0) <= CLIP_HIT) return { kind: 'clip-start', id: row.id, clipId: clip.id, origStart: clip.start, origLength: clip.length };
            if (Math.abs(x - x1) <= CLIP_HIT) return { kind: 'clip-end',   id: row.id, clipId: clip.id, origStart: clip.start, origLength: clip.length };
          }
        }
        for (const f of _mergedKeyFrames(layer)) {
          if (f < 0 || f >= fc) continue;
          if (Math.abs(x - _frameToX(f)) <= KF_HIT) {
            // 이 프레임의 모든 키 있는 속성 ref
            const refs = keyedProps(layer)
              .filter(p => (layer.transform[p.path.split('.')[1]].keys ?? []).some(k => k.f === f))
              .map(p => ({ id: row.id, path: p.path, f }));
            return { kind: 'keyframe', refs, f, row };
          }
        }
      }
    } else if (row.kind === 'prop') {
      const layer = doc.layers[row.id];
      const key   = row.path.split('.')[1];
      for (const kf of (layer?.transform?.[key]?.keys ?? [])) {
        if (kf.f < 0 || kf.f >= fc) continue;
        if (Math.abs(x - _frameToX(kf.f)) <= KF_HIT) {
          return { kind: 'keyframe', refs: [{ id: row.id, path: row.path, f: kf.f }], f: kf.f, row };
        }
      }
    }

    return { kind: 'empty', f: _xToFrame(x), rowI, row };
  }

  // 선택 키가 있는 행의 스트레치 핸들 위치 (키 2개 이상)
  function _handleRectForRow(row, es) {
    if (!row || (row.kind !== 'layer' && row.kind !== 'prop')) return null;
    const frames = [];
    for (const r of es.kfSelection) {
      if (r.id !== row.id) continue;
      if (row.kind === 'prop' && r.path !== row.path) continue;
      frames.push(r.f);
    }
    if (frames.length < 2) return null;
    const minF = Math.min(...frames), maxF = Math.max(...frames);
    return { x: _frameToX(maxF) + KF_HIT, minF, maxF };
  }

  function _selKey(id, path, f) { return `${id}|${path}|${f}`; }
  function _selSet(es) {
    const s = new Set();
    for (const r of es.kfSelection) s.add(_selKey(r.id, r.path, r.f));
    return s;
  }

  // ── 포인터 상호작용 ───────────────────────────────────────────────────
  let _drag = null;      // 진행 중 드래그
  let _pending = null;   // 아직 임계 미만 (클릭 후보)
  let _boxSel = null;    // 박스 선택 사각형

  bodyCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    editorState.set({ focusRegion: 'timeline' });
    const { x, y } = _bodyXY(e);
    const hit = _hit(x, y);
    const es  = editorState.get();

    if (hit.kind === 'handle') {
      store.begin('키 스트레치');
      _drag = { type: 'stretch', label: '키 스트레치', row: hit.row,
        minF: hit.minF, maxF: hit.maxF, startX: x, lastK: 1 };
      bodyCanvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (hit.kind === 'clip-start' || hit.kind === 'clip-end') {
      store.begin('클립 트림');
      _drag = { type: hit.kind, label: '클립 트림', id: hit.id, clipId: hit.clipId,
        origStart: hit.origStart, origLength: hit.origLength, startX: x };
      bodyCanvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    if (hit.kind === 'keyframe') {
      // 선택 갱신
      const selSet = _selSet(es);
      const hitKeys = hit.refs.map(r => _selKey(r.id, r.path, r.f));
      const alreadySel = hitKeys.every(k => selSet.has(k));
      let newSel;
      if (e.shiftKey) {
        // 토글 추가
        newSel = [...es.kfSelection];
        for (const r of hit.refs) {
          const k = _selKey(r.id, r.path, r.f);
          if (selSet.has(k)) newSel = newSel.filter(x2 => _selKey(x2.id, x2.path, x2.f) !== k);
          else newSel.push(r);
        }
      } else if (alreadySel) {
        newSel = es.kfSelection;  // 유지 — 그룹 드래그 준비
      } else {
        newSel = hit.refs;
      }
      editorState.set({ kfSelection: newSel });
      // 드래그 후보 (임계 넘으면 이동)
      _pending = { type: 'kf-move', startX: x, anchorF: hit.f };
      bodyCanvas.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // 빈 곳 — 클릭이면 재생선 이동, 드래그면 박스 선택
    _pending = { type: 'empty', startX: x, startY: y };
    bodyCanvas.setPointerCapture(e.pointerId);
  });

  bodyCanvas.addEventListener('pointermove', (e) => {
    const { x, y } = _bodyXY(e);

    // 대기 → 드래그 전환
    if (_pending && !_drag) {
      if (Math.abs(x - _pending.startX) < DRAG_THRESH &&
          (_pending.type !== 'empty' || Math.abs(y - _pending.startY) < DRAG_THRESH)) {
        return;
      }
      if (_pending.type === 'kf-move') {
        store.begin('키 이동');
        _drag = { type: 'kf-move', label: '키 이동', startX: _pending.startX, anchorF: _pending.anchorF, lastDelta: 0 };
      } else {
        _boxSel = { x0: _pending.startX, y0: _pending.startY, x1: x, y1: y };
      }
      _pending = null;
    }

    if (_boxSel) {
      _boxSel.x1 = x; _boxSel.y1 = y;
      requestDraw();
      return;
    }

    if (!_drag) return;
    const fc = store.get().meta.frameCount ?? 1;

    if (_drag.type === 'kf-move') {
      let delta = Math.round((x - _drag.startX) / _pxPerF);
      delta = _snapKeyDelta(_drag.anchorF, delta);
      if (delta === _drag.lastDelta) return;
      _drag.lastDelta = delta;
      _previewMoveKeys(delta);
    } else if (_drag.type === 'stretch') {
      const span = Math.max(1, _drag.maxF - _drag.minF);
      let k = (x - _frameToX(_drag.minF)) / (span * _pxPerF);
      k = Math.max(0.05, k);
      _previewStretch(k);
    } else if (_drag.type === 'clip-start') {
      const d = Math.round((x - _drag.startX) / _pxPerF);
      let newStart  = Math.max(0, _drag.origStart + d);
      newStart = _snapClipEdge(newStart);
      const newLength = Math.max(1, _drag.origLength - (newStart - _drag.origStart));
      _resetClip({ start: newStart, length: newLength });
    } else if (_drag.type === 'clip-end') {
      const d = Math.round((x - _drag.startX) / _pxPerF);
      let newEnd = _snapClipEdge(_drag.origStart + Math.max(1, _drag.origLength + d));
      const newLength = Math.max(1, newEnd - _drag.origStart);
      _resetClip({ length: newLength });
    }
  });

  bodyCanvas.addEventListener('pointerup', (e) => {
    const { x, y } = _bodyXY(e);

    if (_boxSel) {
      _finishBox();
      _boxSel = null;
      requestDraw();
      _pending = null;
      return;
    }

    if (_drag) {
      store.commit();
      _drag = null;
      return;
    }

    // 클릭(드래그 안 함)
    if (_pending) {
      if (_pending.type === 'empty') {
        const fc = store.get().meta.frameCount ?? 1;
        playback.goTo(Math.max(0, Math.min(fc - 1, _xToFrame(x))));
        // 빈 곳 클릭 → 키 선택 해제
        if (editorState.get().kfSelection.length) editorState.set({ kfSelection: [] });
      }
      _pending = null;
    }
  });

  function _endCancel() {
    if (_drag) { store.cancel(); _drag = null; }
    if (_boxSel) { _boxSel = null; requestDraw(); }
    _pending = null;
  }
  bodyCanvas.addEventListener('pointercancel', _endCancel);
  bodyCanvas.addEventListener('lostpointercapture', () => {
    // 정상 up 이후에도 발생 — 진행 중일 때만 취소
    if (_drag || _boxSel) _endCancel();
  });

  // 더블클릭 → 키 삭제 (C3-item3)
  bodyCanvas.addEventListener('dblclick', (e) => {
    const { x, y } = _bodyXY(e);
    const hit = _hit(x, y);
    if (hit.kind !== 'keyframe') return;
    e.preventDefault();
    _deleteRefs(hit.refs);
  });

  // 우클릭 → 이징 메뉴 (item 5)
  bodyCanvas.addEventListener('contextmenu', (e) => {
    const { x, y } = _bodyXY(e);
    const hit = _hit(x, y);
    if (hit.kind !== 'keyframe') return;
    e.preventDefault();
    const es = editorState.get();
    const selSet = _selSet(es);
    let targets = es.kfSelection;
    // 선택 안 된 키를 우클릭하면 그 키만 대상
    if (!hit.refs.every(r => selSet.has(_selKey(r.id, r.path, r.f)))) {
      targets = hit.refs;
      editorState.set({ kfSelection: hit.refs });
    }
    _showEaseMenu(e.clientX, e.clientY, targets);
  });

  // ── 키프레임 조작 ─────────────────────────────────────────────────────
  function _snapKeyDelta(anchorF, delta) {
    const es = editorState.get();
    if (!es.tlSnap) return delta;
    const thr = Math.max(1, Math.round(6 / _pxPerF));
    const target = anchorF + delta;
    // 스냅 후보: 재생선 + 선택 안 된 모든 키
    const selSet = _selSet(es);
    const doc = store.get();
    const cands = new Set([es.f]);
    for (const id of doc.order) {
      const layer = doc.layers[id];
      if (!layer) continue;
      for (const p of keyedProps(layer)) {
        const key = p.path.split('.')[1];
        for (const kf of layer.transform[key].keys) {
          if (!selSet.has(_selKey(id, p.path, kf.f))) cands.add(kf.f);
        }
      }
    }
    let best = null, bestD = thr + 1;
    for (const c of cands) {
      const d = Math.abs(c - target);
      if (d <= thr && d < bestD) { best = c; bestD = d; }
    }
    return best === null ? delta : best - anchorF;
  }

  function _groupByLayerPath(refs) {
    const map = new Map(); // key "id|path" → { id, path, frames:[] }
    for (const r of refs) {
      const k = `${r.id}|${r.path}`;
      if (!map.has(k)) map.set(k, { id: r.id, path: r.path, frames: [] });
      map.get(k).frames.push(r.f);
    }
    return [...map.values()];
  }

  function _previewMoveKeys(delta) {
    store.cancel(); store.begin('키 이동');
    const es = editorState.get();
    const fc = store.get().meta.frameCount ?? 1;
    // 범위 밖으로 나가면 delta 클램프
    let d = delta;
    for (const r of es.kfSelection) {
      if (r.f + d < 0) d = Math.max(d, -r.f);
      if (r.f + d > fc - 1) d = Math.min(d, fc - 1 - r.f);
    }
    const cmds = _groupByLayerPath(es.kfSelection).map(g => ({
      type: 'moveKeys', id: g.id,
      refs: g.frames.map(f => ({ path: g.path, f })),
      delta: d,
    }));
    if (cmds.length) store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    // 선택도 새 프레임으로 갱신
    editorState.set({ kfSelection: es.kfSelection.map(r => ({ ...r, f: r.f + d })) });
  }

  function _previewStretch(k) {
    const es = editorState.get();
    const fc = store.get().meta.frameCount ?? 1;
    // 각 그룹에서 선택 프레임을 minF 기준 비례 재배치
    const groups = _groupByLayerPath(es.kfSelection);
    // 전체 유효성 먼저 검사
    const plan = [];
    for (const g of groups) {
      const minF = Math.min(...g.frames);
      const moves = [];
      const seen = new Set();
      for (const f of g.frames) {
        let to = minF + Math.round((f - minF) * k);
        if (to < 0 || to > fc - 1) return;          // 범위 밖 → 중단(막기)
        if (seen.has(to)) return;                    // 겹침 → 막기
        seen.add(to);
        moves.push({ from: f, to });
      }
      // 선택 안 된 키와 겹치는지
      const layer = store.get().layers[g.id];
      const key   = g.path.split('.')[1];
      const otherF = new Set((layer?.transform?.[key]?.keys ?? [])
        .map(kf => kf.f).filter(ff => !g.frames.includes(ff)));
      for (const m of moves) if (otherF.has(m.to)) return; // 막기
      plan.push({ g, moves });
    }
    store.cancel(); store.begin('키 스트레치');
    const cmds = plan.map(p => ({ type: 'retimeKeys', id: p.g.id, path: p.g.path, moves: p.moves }));
    if (cmds.length) store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    // 선택 갱신
    const newSel = [];
    for (const p of plan) {
      const toMap = new Map(p.moves.map(m => [m.from, m.to]));
      for (const f of p.g.frames) newSel.push({ id: p.g.id, path: p.g.path, f: toMap.get(f) });
    }
    editorState.set({ kfSelection: newSel });
  }

  function _snapClipEdge(f) {
    const es = editorState.get();
    if (!es.tlSnap) return f;
    const thr = Math.max(1, Math.round(6 / _pxPerF));
    const doc = store.get();
    const cands = new Set([es.f]);
    const layer = doc.layers[_drag.id];
    for (const p of keyedProps(layer ?? {})) {
      const key = p.path.split('.')[1];
      for (const kf of layer.transform[key].keys) cands.add(kf.f);
    }
    let best = null, bestD = thr + 1;
    for (const c of cands) {
      const d = Math.abs(c - f);
      if (d <= thr && d < bestD) { best = c; bestD = d; }
    }
    return best === null ? f : best;
  }

  function _resetClip(patch) {
    store.cancel(); store.begin('클립 트림');
    store.preview({ type: 'setClip', id: _drag.id, clipId: _drag.clipId, patch });
  }

  function _deleteRefs(refs) {
    if (!refs.length) return;
    const cmds = refs.map(r => ({ type: 'removeKey', id: r.id, path: r.path, f: r.f }));
    store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    editorState.set({ kfSelection: [] });
  }

  function _finishBox() {
    const b = _boxSel;
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
    const y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    const rows = _rows();
    const doc  = store.get();
    const fc   = doc.meta.frameCount ?? 1;
    const refs = [];
    for (let i = 0; i < rows.length; i++) {
      const ry0 = i * ROW_H, ry1 = ry0 + ROW_H;
      if (ry1 < y0 || ry0 > y1) continue;
      const row = rows[i];
      if (row.kind === 'layer') {
        const layer = doc.layers[row.id];
        if (!layer) continue;
        for (const p of keyedProps(layer)) {
          const key = p.path.split('.')[1];
          for (const kf of layer.transform[key].keys) {
            if (kf.f < 0 || kf.f >= fc) continue;
            const kx = _frameToX(kf.f);
            if (kx >= x0 && kx <= x1) refs.push({ id: row.id, path: p.path, f: kf.f });
          }
        }
      } else if (row.kind === 'prop') {
        const layer = doc.layers[row.id];
        const key   = row.path.split('.')[1];
        for (const kf of (layer?.transform?.[key]?.keys ?? [])) {
          if (kf.f < 0 || kf.f >= fc) continue;
          const kx = _frameToX(kf.f);
          if (kx >= x0 && kx <= x1) refs.push({ id: row.id, path: row.path, f: kf.f });
        }
      }
    }
    editorState.set({ kfSelection: refs });
  }

  // ── 이징 메뉴 ─────────────────────────────────────────────────────────
  let _easeMenu = null;
  function _closeEaseMenu() { if (_easeMenu) { _easeMenu.remove(); _easeMenu = null; } }

  function _showEaseMenu(clientX, clientY, targets) {
    _closeEaseMenu();
    const menu = document.createElement('div');
    menu.className = 'kf-ease-menu';
    for (const [name, label] of Object.entries(EASE_LABELS)) {
      const item = document.createElement('button');
      item.className = 'kf-ease-item';
      item.textContent = label;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        _applyEase(targets, name);
        _closeEaseMenu();
      });
      menu.appendChild(item);
    }
    document.body.appendChild(menu);
    menu.style.left = Math.min(clientX, window.innerWidth  - menu.offsetWidth  - 8) + 'px';
    menu.style.top  = Math.min(clientY, window.innerHeight - menu.offsetHeight - 8) + 'px';
    _easeMenu = menu;
    setTimeout(() => document.addEventListener('pointerdown', _onDocDown, { once: true }), 0);
  }
  function _onDocDown(e) {
    if (_easeMenu && !_easeMenu.contains(e.target)) _closeEaseMenu();
  }

  function _applyEase(refs, ease) {
    const groups = _groupByLayerPath(refs);
    const cmds = groups.map(g => ({ type: 'setKeysEase', id: g.id, path: g.path, frames: g.frames, ease }));
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  // ── 그리기 ────────────────────────────────────────────────────────────
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
    const rows = computeRows(doc, es.expanded);
    const dpr  = window.devicePixelRatio || 1;

    const totalW = Math.max(400, fc * _pxPerF);
    const bodyH  = Math.max(ROW_H, rows.length * ROW_H);
    const wrapW  = tracksEl.clientWidth || 400;

    headCanvas.width   = Math.round(Math.max(wrapW, totalW) * dpr);
    headCanvas.height  = Math.round(HEAD_H * dpr);
    headCanvas.style.width  = Math.max(wrapW, totalW) + 'px';
    headCanvas.style.height = HEAD_H + 'px';
    headWrap.style.width    = Math.max(wrapW, totalW) + 'px';

    bodyCanvas.width   = Math.round(totalW * dpr);
    bodyCanvas.height  = Math.round(bodyH  * dpr);
    bodyCanvas.style.width  = totalW + 'px';
    bodyCanvas.style.height = bodyH  + 'px';

    const hCtx = headCanvas.getContext('2d');
    const bCtx = bodyCanvas.getContext('2d');
    hCtx.scale(dpr, dpr);
    bCtx.scale(dpr, dpr);

    _drawHeader(hCtx, fc, es.f, Math.max(wrapW, totalW));
    _drawBody(bCtx, doc, rows, es, fc, totalW, bodyH);
  }

  function _drawHeader(ctx, fc, curF, totalW) {
    const bgColor   = _cssVar('--tl')    || '#1a1c1f';
    const textColor = _cssVar('--dim')   || '#9a9ea6';
    const accColor  = _cssVar('--acc')   || '#f0a35e';
    const lineColor = _cssVar('--line2') || '#2b2e33';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, totalW, HEAD_H);
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';

    const step = _pxPerF >= 20 ? 5 : (fc > 60 ? 10 : 5);
    for (let f = 0; f < fc; f += step) {
      const x = _frameToX(f);
      ctx.fillStyle = lineColor;
      ctx.fillRect(x, HEAD_H - 6, 1, 6);
      ctx.fillStyle = textColor;
      ctx.fillText(String(f), x, HEAD_H - 8);
    }

    const px = _frameToX(curF);
    ctx.fillStyle = accColor;
    ctx.fillRect(px - 1, 0, 2, HEAD_H);
    ctx.beginPath();
    ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 8);
    ctx.closePath(); ctx.fill();
  }

  function _diamond(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy);
    ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy);
    ctx.closePath();
  }

  function _drawBody(ctx, doc, rows, es, fc, totalW, totalH) {
    const bgColor   = _cssVar('--tl')      || '#1a1c1f';
    const lineColor = _cssVar('--rowline') || '#24272b';
    const line2     = _cssVar('--line2')   || '#2b2e33';
    const accColor  = _cssVar('--acc')     || '#f0a35e';
    const clipBg    = _cssVar('--clipbg')  || '#4a3524';
    const selRow    = _cssVar('--selrow')  || '#2a241e';
    const dimColor  = _cssVar('--dim')     || '#9a9ea6';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, totalW, totalH);

    const sel    = new Set(es.selection);
    const selSet = _selSet(es);

    ctx.fillStyle = line2;
    for (let f = 0; f < fc; f++) {
      if (f % 5 === 0) ctx.fillRect(f * _pxPerF, 0, 1, totalH);
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const y0  = i * ROW_H;
      const cy  = y0 + ROW_H / 2;

      if (row.kind === 'camera') {
        for (const f of _camKeyFrames(doc)) {
          if (f < 0 || f >= fc) continue;
          ctx.fillStyle = dimColor;
          _diamond(ctx, _frameToX(f), cy, 5); ctx.fill();
        }
        ctx.fillStyle = lineColor;
        ctx.fillRect(0, y0 + ROW_H - 1, totalW, 1);
        continue;
      }

      const layer = doc.layers[row.id];
      if (!layer) continue;

      if (row.kind === 'layer' && sel.has(row.id)) {
        ctx.fillStyle = selRow;
        ctx.fillRect(0, y0, totalW, ROW_H);
      }

      // 클립 (레이어 행만)
      if (row.kind === 'layer' && layer.clips?.length) {
        for (const clip of layer.clips) {
          const x  = clip.start * _pxPerF;
          const cw = clip.length * _pxPerF;
          ctx.fillStyle = clipBg;
          ctx.fillRect(x + 1, y0 + 4, cw - 2, ROW_H - 8);
          ctx.fillStyle = accColor;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(x, y0 + 4, 3, ROW_H - 8);
          ctx.fillRect(x + cw - 3, y0 + 4, 3, ROW_H - 8);
          ctx.globalAlpha = 1;
        }
      }

      // 키프레임 다이아몬드
      let frames, pathForSel;
      if (row.kind === 'layer') {
        frames = _mergedKeyFrames(layer);
        pathForSel = null; // 병합: id+f로 판정
      } else {
        const key = row.path.split('.')[1];
        frames = new Set((layer.transform?.[key]?.keys ?? []).map(k => k.f));
        pathForSel = row.path;
      }
      for (const f of frames) {
        if (f < 0 || f >= fc) continue;
        const isSel = pathForSel
          ? selSet.has(_selKey(row.id, pathForSel, f))
          : keyedProps(layer).some(p => selSet.has(_selKey(row.id, p.path, f)));
        _diamond(ctx, _frameToX(f), cy, row.kind === 'prop' ? 4 : 5);
        ctx.fillStyle = isSel ? '#ffffff' : accColor;
        ctx.fill();
        if (isSel) { ctx.strokeStyle = accColor; ctx.lineWidth = 1.5; ctx.stroke(); }
      }

      // 스트레치 핸들
      const handle = _handleRectForRow(row, es);
      if (handle) {
        ctx.fillStyle = accColor;
        ctx.fillRect(handle.x, y0 + 6, HANDLE_W, ROW_H - 12);
      }

      ctx.fillStyle = lineColor;
      ctx.fillRect(0, y0 + ROW_H - 1, totalW, 1);
    }

    // 재생선
    const px = _frameToX(es.f);
    ctx.fillStyle = accColor;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(px - 1, 0, 2, totalH);
    ctx.globalAlpha = 1;

    // 박스 선택 사각형
    if (_boxSel) {
      const bx = Math.min(_boxSel.x0, _boxSel.x1);
      const by = Math.min(_boxSel.y0, _boxSel.y1);
      const bw = Math.abs(_boxSel.x1 - _boxSel.x0);
      const bh = Math.abs(_boxSel.y1 - _boxSel.y0);
      ctx.strokeStyle = accColor;
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = accColor;
      ctx.fillRect(bx, by, bw, bh);
      ctx.globalAlpha = 1;
    }
  }

  const unsubStore = store.subscribe({ any: true }, requestDraw);
  const unsubES    = editorState.subscribe(requestDraw);
  const ro = new ResizeObserver(() => requestDraw());
  ro.observe(tracksEl);
  requestDraw();

  function destroy() {
    unsubStore(); unsubES(); ro.disconnect();
    _closeEaseMenu();
  }

  // 외부에서 쓰는 키 삭제 (Delete 키 — keys.js에서 호출)
  function deleteSelectedKeys() {
    const es = editorState.get();
    if (!es.kfSelection.length) return false;
    _deleteRefs(es.kfSelection);
    return true;
  }

  return { destroy, deleteSelectedKeys,
    get PX_PER_F() { return _pxPerF; }, HEAD_H };
}
