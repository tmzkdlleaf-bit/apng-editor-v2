// R21b — 가리기 화면 도구. 사각형/타원(끌어 그리기)·펜(점 찍기)·편집(점·손잡이 끌기).
//   단일 선택 레이어에만 동작. 좌표는 mask-space(레이어 자체 좌표). 모든 조작 되돌리기 1건.
//   그리는 중 미리보기는 editorState.maskDraft 로 gizmo 가 그린다(문서 변경 없음).
import { screenToMaskPt, maskPtToScreen } from './mask-space.js';
import { createMask, rectMaskPts, ellipseMaskPts } from '../../core/doc/schema.js';
import { evalProp } from '../../core/anim/prop.js';
import { showToast } from '../shell/status.js';

const HIT = 8, HHIT = 7;
const CREATE_TOOLS = new Set(['maskRect', 'maskEllipse']);

export function initMaskEdit(overlayCanvas, store, editorState, getAssets) {
  let _create = null;  // { kind, layerId, start }
  let _pen = null;      // { layerId, pts:[], down:null }
  let _edit = null;     // { id, maskId, kind, idx, side }

  function _view() {
    const r = overlayCanvas.getBoundingClientRect();
    const es = editorState.get();
    return { W: r.width, H: r.height, rect: r, zoom: es.zoom, panX: es.panX, panY: es.panY };
  }
  function _assets() { return getAssets?.() ?? null; }
  function _selLayer() {
    const es = editorState.get(), doc = store.get();
    if (es.selection.length !== 1) return null;
    return doc.layers[es.selection[0]] ?? null;
  }
  function _toMask(cx, cy, layer) { return screenToMaskPt(cx, cy, layer, store.get(), editorState.get().f, _view(), _assets()); }
  function _xy(e) { const r = overlayCanvas.getBoundingClientRect(); return { cx: e.clientX - r.left, cy: e.clientY - r.top }; }

  // ── 편집 대상 히트(선택 레이어의 가리기 점·손잡이) ──────────────────────
  function _resolvedMasks(layer) {
    const f = editorState.get().f;
    return (layer.masks?.order ?? []).map((mid) => ({ mid, path: evalProp(layer.masks.items[mid].path, f) })).filter((m) => m.path?.pts?.length);
  }
  function _hitEdit(cx, cy, layer) {
    const doc = store.get(), f = editorState.get().f, view = _view(), assets = _assets();
    for (const { mid, path } of _resolvedMasks(layer)) {
      for (let i = 0; i < path.pts.length; i++) {
        const p = path.pts[i];
        for (const side of ['o', 'i']) {
          const hx = side === 'o' ? (p.ox ?? 0) : (p.ix ?? 0), hy = side === 'o' ? (p.oy ?? 0) : (p.iy ?? 0);
          if (hx === 0 && hy === 0) continue;
          const hs = maskPtToScreen({ x: p.x + hx, y: p.y + hy }, layer, doc, f, view, assets);
          if (hs && (hs.x - cx) ** 2 + (hs.y - cy) ** 2 <= HHIT * HHIT) return { mid, kind: 'handle', idx: i, side };
        }
        const s = maskPtToScreen(p, layer, doc, f, view, assets);
        if (s && (s.x - cx) ** 2 + (s.y - cy) ** 2 <= HIT * HIT) return { mid, kind: 'point', idx: i };
      }
    }
    return null;
  }
  function _hitSegment(cx, cy, layer) {
    // 선분 위 Ctrl+클릭으로 점 추가 — 가장 가까운 선분 중점 근처.
    const doc = store.get(), f = editorState.get().f, view = _view(), assets = _assets();
    for (const { mid, path } of _resolvedMasks(layer)) {
      const n = path.pts.length, segs = path.closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const a = path.pts[i], b = path.pts[(i + 1) % n];
        const sa = maskPtToScreen(a, layer, doc, f, view, assets), sb = maskPtToScreen(b, layer, doc, f, view, assets);
        if (!sa || !sb) continue;
        const mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2;
        if ((mx - cx) ** 2 + (my - cy) ** 2 <= HIT * HIT) return { mid, segIndex: i, a, b };
      }
    }
    return null;
  }

  function _pathProp(id, mid) { return store.get().layers[id]?.masks?.items?.[mid]?.path; }
  function _writePath(id, mid, path, preview) {
    const prop = _pathProp(id, mid);
    const f = editorState.get().f;
    const cmd = (prop?.keys?.length)
      ? { type: 'setKey', id, path: `masks.items.${mid}.path`, f, v: path, ease: 'linear' }
      : { type: 'setMaskProp', id, maskId: mid, key: 'path', value: path };
    if (preview) store.preview(cmd); else store.apply(cmd);
  }

  // ── pointerdown ─────────────────────────────────────────────────────────
  function _onDown(e) {
    const tool = editorState.get().tool;
    if (e.button === 2) return;
    const { cx, cy } = _xy(e);

    // 편집 도구: 가리기 점/손잡이
    if (tool === 'edit') {
      const layer = _selLayer(); if (!layer || !layer.masks?.order?.length) return;
      const hit = _hitEdit(cx, cy, layer);
      if ((e.ctrlKey || e.metaKey) && hit && hit.kind === 'point') {
        // Ctrl+클릭 점 = 삭제(점 3개 미만이면 무시)
        e.preventDefault(); e.stopPropagation();
        const path = evalProp(_pathProp(layer.id, hit.mid), editorState.get().f);
        if (path.pts.length <= 2) return;
        const pts = path.pts.filter((_, i) => i !== hit.idx);
        _writePath(layer.id, hit.mid, { closed: path.closed, pts }, false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !hit) {
        const seg = _hitSegment(cx, cy, layer);
        if (seg) {
          e.preventDefault(); e.stopPropagation();
          const path = evalProp(_pathProp(layer.id, seg.mid), editorState.get().f);
          const mid = _toMask(cx, cy, layer);
          const pts = [...path.pts];
          pts.splice(seg.segIndex + 1, 0, { x: mid.x, y: mid.y, ix: 0, iy: 0, ox: 0, oy: 0 });
          _writePath(layer.id, seg.mid, { closed: path.closed, pts }, false);
          return;
        }
      }
      if (hit) {
        e.preventDefault(); e.stopPropagation();
        _edit = { id: layer.id, ...hit, alt: e.altKey };
        overlayCanvas.setPointerCapture?.(e.pointerId);
        store.begin('가리기 편집');
      }
      return;
    }

    // 생성 도구
    if (CREATE_TOOLS.has(tool) || tool === 'pen') {
      const layer = _selLayer();
      if (!layer) { showToast('레이어를 먼저 고르세요'); return; }
      const mp = _toMask(cx, cy, layer);
      if (!mp) return;
      e.preventDefault(); e.stopPropagation();
      if (tool === 'pen') { _penDown(layer, mp, cx, cy); overlayCanvas.setPointerCapture?.(e.pointerId); return; }
      _create = { kind: tool, layerId: layer.id, start: mp, alt: e.altKey, shift: e.shiftKey };
      overlayCanvas.setPointerCapture?.(e.pointerId);
      _updateCreateDraft(mp, e);
    }
  }

  // ── pointermove ───────────────────────────────────────────────────────────
  function _onMove(e) {
    const { cx, cy } = _xy(e);
    const layer0 = _selLayer();

    if (_create && layer0) { const mp = _toMask(cx, cy, layer0); if (mp) _updateCreateDraft(mp, e); return; }

    if (_pen && layer0) {
      const mp = _toMask(cx, cy, layer0);
      if (_pen.down && mp) {
        // 드래그 = 부드러운 점(마지막 점 손잡이)
        const last = _pen.pts[_pen.pts.length - 1];
        last.ox = mp.x - last.x; last.oy = mp.y - last.y; last.ix = -last.ox; last.iy = -last.oy;
      }
      _penDraft(cx, cy);
      return;
    }

    if (!_edit) return;
    const layer = store.get().layers[_edit.id]; if (!layer) return;
    const mp = _toMask(cx, cy, layer); if (!mp) return;
    const path = evalProp(_pathProp(_edit.id, _edit.mid), editorState.get().f);
    const pts = path.pts.map((p) => ({ ...p }));
    const p = pts[_edit.idx];
    if (_edit.kind === 'point') { p.x = mp.x; p.y = mp.y; }
    else {
      const ox = mp.x - p.x, oy = mp.y - p.y;
      if (_edit.side === 'o') { p.ox = ox; p.oy = oy; if (!_edit.alt) { p.ix = -ox; p.iy = -oy; } }
      else { p.ix = ox; p.iy = oy; if (!_edit.alt) { p.ox = -ox; p.oy = -oy; } }
    }
    _writePath(_edit.id, _edit.mid, { closed: path.closed, pts }, true);
  }

  // ── pointerup ───────────────────────────────────────────────────────────
  function _onUp(e) {
    if (_create) { _finishCreate(); overlayCanvas.releasePointerCapture?.(e.pointerId); return; }
    if (_pen) { _pen.down = null; return; }
    if (_edit) { store.commit(); _edit = null; overlayCanvas.releasePointerCapture?.(e.pointerId); }
  }
  function _onCancel() { if (_edit) { store.cancel(); _edit = null; } if (_create) { _create = null; _clearDraft(); } }

  // ── 사각형/타원 ────────────────────────────────────────────────────────
  function _rectFrom(start, cur, shift, alt) {
    let x0 = start.x, y0 = start.y, x1 = cur.x, y1 = cur.y;
    let w = x1 - x0, h = y1 - y0;
    if (shift) { const s = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * s; h = Math.sign(h || 1) * s; }
    if (alt) { x0 = start.x - w; y0 = start.y - h; w *= 2; h *= 2; }
    return { x: Math.min(x0, x0 + w), y: Math.min(y0, y0 + h), w: Math.abs(w), h: Math.abs(h) };
  }
  function _createPts(cur, e) {
    const r = _rectFrom(_create.start, cur, e.shiftKey, e.altKey);
    if (_create.kind === 'maskEllipse') return ellipseMaskPts(r.x + r.w / 2, r.y + r.h / 2, Math.max(1, r.w / 2), Math.max(1, r.h / 2));
    return rectMaskPts(r.x, r.y, Math.max(1, r.w), Math.max(1, r.h));
  }
  function _updateCreateDraft(cur, e) {
    editorState.set({ maskDraft: { layerId: _create.layerId, path: _createPts(cur, e) } });
  }
  function _finishCreate() {
    const draft = editorState.get().maskDraft;
    const id = _create.layerId; _create = null; _clearDraft();
    if (!draft?.path?.pts?.length) return;
    const n = (store.get().layers[id]?.masks?.order?.length ?? 0) + 1;
    store.apply({ type: 'addMask', id, mask: createMask({ name: `가리기 ${n}`, path: { value: draft.path } }) });
  }

  // ── 펜 ────────────────────────────────────────────────────────────────
  function _penDown(layer, mp, cx, cy) {
    if (_pen && _pen.pts.length >= 2) {
      // 첫 점 근처 클릭 = 닫기
      const first = _pen.pts[0];
      const fs = maskPtToScreen(first, layer, store.get(), editorState.get().f, _view(), _assets());
      if (fs && (fs.x - cx) ** 2 + (fs.y - cy) ** 2 <= HIT * HIT) { _finishPen(true); return; }
    }
    if (!_pen) _pen = { layerId: layer.id, pts: [], down: null };
    _pen.pts.push({ x: mp.x, y: mp.y, ix: 0, iy: 0, ox: 0, oy: 0 });
    _pen.down = mp;
    _penDraft(cx, cy);
  }
  function _penDraft(cx, cy) {
    if (!_pen) return;
    editorState.set({ maskDraft: { layerId: _pen.layerId, path: { closed: false, pts: _pen.pts.map((p) => ({ ...p })) }, cursor: { cx, cy } } });
  }
  function _finishPen(closed) {
    if (!_pen) return;
    const id = _pen.layerId, pts = _pen.pts;
    _pen = null; _clearDraft();
    if (pts.length < 2) return;
    const n = (store.get().layers[id]?.masks?.order?.length ?? 0) + 1;
    store.apply({ type: 'addMask', id, mask: createMask({ name: `가리기 ${n}`, path: { value: { closed, pts } } }) });
  }
  function _cancelPen() { _pen = null; _clearDraft(); }

  function _clearDraft() { if (editorState.get().maskDraft) editorState.set({ maskDraft: null }); }

  function _onKey(e) {
    if (!_pen) return;
    if (e.key === 'Enter') { e.preventDefault(); _finishPen(false); }
    else if (e.key === 'Escape') { e.preventDefault(); _cancelPen(); }
  }

  // 도구가 바뀌면 진행 중 펜·생성 취소
  const unsubTool = editorState.subscribe((p) => {
    if ('tool' in p) { if (_pen) _cancelPen(); if (_create) { _create = null; _clearDraft(); } }
  });

  overlayCanvas.addEventListener('pointerdown', _onDown, true);
  overlayCanvas.addEventListener('pointermove', _onMove, true);
  overlayCanvas.addEventListener('pointerup', _onUp, true);
  overlayCanvas.addEventListener('pointercancel', _onCancel, true);
  document.addEventListener('keydown', _onKey);

  function destroy() {
    overlayCanvas.removeEventListener('pointerdown', _onDown, true);
    overlayCanvas.removeEventListener('pointermove', _onMove, true);
    overlayCanvas.removeEventListener('pointerup', _onUp, true);
    overlayCanvas.removeEventListener('pointercancel', _onCancel, true);
    document.removeEventListener('keydown', _onKey);
    unsubTool();
  }
  return { destroy, isDragging: () => !!(_edit || _create || _pen) };
}
