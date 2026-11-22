// 타임라인 트랙 캔버스 — 키프레임, 클립, 플레이헤드, 하위 속성 행
//   그리기·기하(그림만 그리는 함수)는 track-draw.js 로 나눴다(R23d item 12). 여기는 상호작용·드래그 상태.
import { computeRows, animatedProps } from './rows.js';
import { getProp } from '../../core/anim/props.js';
import { outerFrame, localSpeed, hasTimedAncestor } from '../../core/anim/time.js';
import {
  ROW_H, HEAD_H, HANDLE_W,
  selKey, selSet, mergedKeyFrames, drawHeader, drawBody,
} from './track-draw.js';
import { createTrackMenus } from './track-menus.js';
import { hitTest, handleRectForRow, KF_HIT } from './track-hit.js';

const PX_PER_F_DEFAULT = 20; // 기본 프레임당 픽셀
const DRAG_THRESH = 4; // 드래그 판정 임계 (px)

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
  // item 5: 기본은 "전체 프레임이 트랙 폭에 꼭 맞게"(fit). Ctrl+휠로 배율을 바꾸면 그 배율 유지(fit 해제),
  //   "맞춤" 버튼으로 다시 fit. fit 모드에서는 매 그리기마다 트랙 폭÷프레임수로 _pxPerF 를 다시 계산한다.
  let _fitMode = true;
  let _syncingScroll = false;

  function _computePxPerF(fc, wrapW) {
    if (!_fitMode) return _pxPerF;
    const base = Math.max(wrapW, 400);
    return Math.max(2, base / Math.max(1, fc));
  }

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
    _fitMode = false; // 수동 배율 → fit 해제(그 배율 유지)
    _pxPerF = Math.max(4, Math.min(80, _pxPerF + (e.deltaY > 0 ? -2 : 2)));
    requestDraw();
  }, { passive: false });

  // "맞춤" — 전체 프레임이 트랙 폭에 꼭 맞게 되돌림.
  function fitWidth() { _fitMode = true; requestDraw(); }

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

  // R22b: 그룹 안 레이어의 키는 저장은 안쪽 프레임, 표시는 바깥 위치(바깥 f = offset + 안쪽 f / speed).
  //   시간 그룹 밖이면 그대로라 기존 동작과 같다. remap 줄은 바깥 f 로 바로 저장되므로 변환하지 않는다.
  function _keyX(doc, layerId, f, isRemap) {
    if (isRemap || !layerId || !hasTimedAncestor(doc, layerId)) return _frameToX(f);
    return _frameToX(outerFrame(doc, layerId, f));
  }

  // 현재 행 목록 (hit test용 — draw와 동일 계산)
  function _rows() {
    return computeRows(store.get(), editorState.get().expanded);
  }

  // ── 히트 테스트 — track-hit.js (R23d item 12) ──
  function _geom() { return { pxPerF: _pxPerF, frameToX: _frameToX, xToFrame: _xToFrame, keyX: _keyX }; }
  function _hit(x, y) { return hitTest(x, y, store.get(), editorState.get(), _rows(), _geom()); }
  function _handleRectForRow(row, es) { return handleRectForRow(row, es, _geom()); }

  // selKey·selSet 은 track-draw.js 와 공유(같은 선택 키 형식). 아래 상호작용 코드는 예전 이름 그대로 쓴다.
  const _selKey = selKey;
  const _selSet = selSet;

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
        minF: hit.minF, maxF: hit.maxF, startX: x, lastK: 1,
        origSel: es.kfSelection.map(r => ({ ...r })) };  // 드래그 시작 때 원래 선택 고정
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
        _drag = { type: 'kf-move', label: '키 이동', startX: _pending.startX, anchorF: _pending.anchorF, lastDelta: 0,
          origSel: editorState.get().kfSelection.map(r => ({ ...r })) };  // 드래그 시작 때 원래 선택 고정
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

  // 우클릭 → 키프레임이면 이징 메뉴, 클립 몸통이면 클립 메뉴(F3-3)
  bodyCanvas.addEventListener('contextmenu', (e) => {
    const { x, y } = _bodyXY(e);
    const hit = _hit(x, y);
    if (hit.kind === 'keyframe') {
      e.preventDefault();
      const es = editorState.get();
      const selSet = _selSet(es);
      let targets = es.kfSelection;
      if (!hit.refs.every(r => selSet.has(_selKey(r.id, r.path, r.f)))) {
        targets = hit.refs;
        editorState.set({ kfSelection: hit.refs });
      }
      _showEaseMenu(e.clientX, e.clientY, targets);
    } else if (hit.kind === 'clip-body' || hit.kind === 'clip-start' || hit.kind === 'clip-end') {
      e.preventDefault();
      _showClipMenu(e.clientX, e.clientY, hit.id, hit.clipId);
    }
  });

  // ── 클립 메뉴·이징 메뉴·베지어 편집은 track-menus.js (R23d item 12) ──
  const _menus = createTrackMenus({ store, editorState, applyEase: (refs, ease, bz) => _applyEase(refs, ease, bz) });
  const _showClipMenu = _menus.showClipMenu;
  const _showEaseMenu = _menus.showEaseMenu;
  const _closeEaseMenu = _menus.closeAll;

  // ── 키프레임 조작 ─────────────────────────────────────────────────────
  function _snapKeyDelta(anchorF, delta) {
    const es = editorState.get();
    if (!es.tlSnap) return delta;
    // 시간 그룹 안 키는 바깥↔안쪽 환산이 섞여 스냅 기준이 어긋나므로 스냅을 건너뛴다(R22b).
    const doc0 = store.get();
    if ((_drag?.origSel ?? es.kfSelection).some(r => hasTimedAncestor(doc0, r.id))) return delta;
    const thr = Math.max(1, Math.round(6 / _pxPerF));
    const target = anchorF + delta;
    // 스냅 후보: 재생선 + 선택 안 된 모든 키
    const selSet = _selSet(es);
    const doc = store.get();
    const cands = new Set([es.f]);
    for (const id of doc.order) {
      const layer = doc.layers[id];
      if (!layer) continue;
      for (const p of animatedProps(layer)) {
        for (const kf of (getProp(layer, p.path)?.keys ?? [])) {
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
    // 항상 "원래 선택 + 이번 delta" 로 계산한다(매번 되돌린 뒤 다시 적용하므로 누적 금지).
    const orig = _drag.origSel ?? editorState.get().kfSelection;
    const doc = store.get();
    const fc = doc.meta.frameCount ?? 1;
    // R22b: delta 는 바깥 프레임 단위. 그룹 안 키는 안쪽 프레임이 저장 단위라 그룹 speed 만큼 환산한다.
    //   레이어마다 속도가 다를 수 있으므로 그룹(id)별로 안쪽 delta 를 따로 계산한다.
    const groups = _groupByLayerPath(orig);
    const innerDelta = new Map();
    for (const g of groups) {
      const sp = hasTimedAncestor(doc, g.id) ? localSpeed(doc, g.id) : 1;
      innerDelta.set(g, Math.round(delta * sp));
    }
    // 범위 밖으로 나가면 각 그룹 delta 클램프(안쪽 프레임 기준)
    for (const g of groups) {
      let d = innerDelta.get(g);
      for (const f of g.frames) {
        if (f + d < 0) d = Math.max(d, -f);
        if (f + d > fc - 1) d = Math.min(d, fc - 1 - f);
      }
      innerDelta.set(g, d);
    }
    const cmds = groups.map(g => ({
      type: 'moveKeys', id: g.id,
      refs: g.frames.map(f => ({ path: g.path, f })),
      delta: innerDelta.get(g),
    }));
    if (cmds.length) store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    // 선택도 원래 선택 + 그룹별 안쪽 delta 로 갱신
    const dByKey = new Map();
    for (const g of groups) for (const f of g.frames) dByKey.set(`${g.id}|${g.path}|${f}`, innerDelta.get(g));
    editorState.set({ kfSelection: orig.map(r => ({ ...r, f: r.f + (dByKey.get(`${r.id}|${r.path}|${r.f}`) ?? 0) })) });
  }

  function _previewStretch(k) {
    // 항상 원래 선택 기준으로 비례 재배치(누적 금지). 겹침 검사는 현재 비선택 키 기준.
    const orig = _drag.origSel ?? editorState.get().kfSelection;
    const curSel = editorState.get().kfSelection;
    const fc = store.get().meta.frameCount ?? 1;
    const doc = store.get();
    const groups = _groupByLayerPath(orig);
    // 전체 유효성 먼저 검사(실패하면 직전 미리보기 유지)
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
      // 선택 안 된 키와 겹치는지 — 현재 doc 키 중 '현재 선택 위치'가 아닌 것(움직이지 않는 키)
      const curSelF = new Set(curSel.filter(r => r.id === g.id && r.path === g.path).map(r => r.f));
      const otherF = new Set((getProp(doc.layers[g.id], g.path)?.keys ?? [])
        .map(kf => kf.f).filter(ff => !curSelF.has(ff)));
      for (const m of moves) if (otherF.has(m.to)) return; // 막기
      plan.push({ g, moves });
    }
    store.cancel(); store.begin('키 스트레치');
    const cmds = plan.map(p => ({ type: 'retimeKeys', id: p.g.id, path: p.g.path, moves: p.moves }));
    if (cmds.length) store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    // 선택 갱신 (원래 프레임 → 새 프레임)
    const newSel = [];
    for (const p of plan) for (const m of p.moves) newSel.push({ id: p.g.id, path: p.g.path, f: m.to });
    editorState.set({ kfSelection: newSel });
  }

  function _snapClipEdge(f) {
    const es = editorState.get();
    if (!es.tlSnap) return f;
    const thr = Math.max(1, Math.round(6 / _pxPerF));
    const doc = store.get();
    const cands = new Set([es.f]);
    const layer = doc.layers[_drag.id];
    for (const p of animatedProps(layer ?? {})) {
      for (const kf of (getProp(layer, p.path)?.keys ?? [])) cands.add(kf.f);
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
        for (const p of animatedProps(layer)) {
          if (p.remap) continue; // 다시 매기기 키는 선택 대상 아님
          for (const kf of (getProp(layer, p.path)?.keys ?? [])) {
            if (kf.f < 0 || kf.f >= fc) continue;
            const kx = _keyX(doc, row.id, kf.f, false);
            if (kx >= x0 && kx <= x1) refs.push({ id: row.id, path: p.path, f: kf.f });
          }
        }
      } else if (row.kind === 'prop') {
        if (row.remap) continue;
        const layer = doc.layers[row.id];
        for (const kf of (getProp(layer, row.path)?.keys ?? [])) {
          if (kf.f < 0 || kf.f >= fc) continue;
          const kx = _keyX(doc, row.id, kf.f, false);
          if (kx >= x0 && kx <= x1) refs.push({ id: row.id, path: row.path, f: kf.f });
        }
      }
    }
    editorState.set({ kfSelection: refs });
  }

  function _applyEase(refs, ease, bezier = null) {
    const groups = _groupByLayerPath(refs);
    const cmds = groups.map(g => ({ type: 'setKeysEase', id: g.id, path: g.path, frames: g.frames, ease, ...(bezier ? { bezier } : {}) }));
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

    const wrapW  = tracksEl.clientWidth || 400;
    _pxPerF = _computePxPerF(fc, wrapW); // fit 모드면 트랙 폭에 맞춰 재계산
    const totalW = Math.max(400, fc * _pxPerF);
    const bodyH  = Math.max(ROW_H, rows.length * ROW_H);

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

    drawHeader(hCtx, { fc, curF: es.f, totalW: Math.max(wrapW, totalW), pxPerF: _pxPerF });
    drawBody(bCtx, {
      doc, rows, es, fc, totalW, totalH: bodyH, pxPerF: _pxPerF,
      boxSel: _boxSel, keyX: _keyX, handleRectForRow: _handleRectForRow,
    });
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

  return { destroy, deleteSelectedKeys, fitWidth,
    get PX_PER_F() { return _pxPerF; }, get fitMode() { return _fitMode; }, HEAD_H };
}
