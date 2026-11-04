// 모션 경로 편집(F3-4 + R18 곡선 손잡이) — 편집 모드(tool='edit')에서 경로 점·손잡이를 끈다.
//   점 끌기: 키 x/y 수정. Alt+점 끌기: 대칭 손잡이 새로 만들기.
//   손잡이 끌기: 반대쪽도 같은 직선 위(부드러운 점). Alt+손잡이 끌기: 반대쪽 유지(꺾인 점).
//   점 우클릭: 부드러운 점으로 / 꺾인 점으로(손잡이 없애기). 모두 되돌리기 1건.
import { screenToDoc, docToScreen } from './transform.js';
import { evalProp } from '../../core/anim/prop.js';
import { isCurvedPath } from '../../core/anim/position.js';
import { motionPathKeyFrames } from './gizmo.js';
import { getDocWorldTr, getParentWorldTr, worldToLocalInParent, localToWorldInParent } from './hit.js';

const HIT = 8;      // 점 히트 반경(px)
const HHIT = 7;     // 손잡이 히트 반경(px)

// 경로 직선화(중간 점을 직선 위로) — 중간 키들을 시작→끝 직선 위로. 기록 1건.
export function straightenPath(store, layerId) {
  const doc = store.get();
  const layer = doc.layers[layerId];
  if (!layer) return;
  const keyFs = motionPathKeyFrames(layer);
  if (keyFs.length < 3) return;
  const px = layer.transform.x, py = layer.transform.y;
  const f0 = keyFs[0], fN = keyFs[keyFs.length - 1];
  const x0 = evalProp(px, f0), y0 = evalProp(py, f0);
  const xN = evalProp(px, fN), yN = evalProp(py, fN);
  const cmds = [];
  for (const f of keyFs) {
    if (f === f0 || f === fN) continue;
    const t = (f - f0) / (fN - f0);
    if ((px.keys ?? []).some(k => k.f === f)) cmds.push({ type: 'setProp', id: layerId, path: 'transform.x', value: x0 + (xN - x0) * t, f });
    if ((py.keys ?? []).some(k => k.f === f)) cmds.push({ type: 'setProp', id: layerId, path: 'transform.y', value: y0 + (yN - y0) * t, f });
  }
  if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
}

export function initPathEdit(overlayCanvas, store, editorState) {
  let _drag = null; // { kind:'point'|'handle'|'make', id, f, ... }
  let _menu = null;

  function _cssSize() { const r = overlayCanvas.getBoundingClientRect(); return { W: r.width, H: r.height, rect: r }; }
  function _toScreen(docX, docY) {
    const es = editorState.get(); const doc = store.get(); const { W, H } = _cssSize();
    return docToScreen(docX, docY, es.zoom, es.panX, es.panY, W, H, doc.meta.width, doc.meta.height);
  }
  function _toDoc(cx, cy) {
    const es = editorState.get(); const doc = store.get(); const { W, H } = _cssSize();
    return screenToDoc(cx, cy, es.zoom, es.panX, es.panY, W, H, doc.meta.width, doc.meta.height);
  }

  function _selLayer() {
    const es = editorState.get(); const doc = store.get();
    if (es.selection.length !== 1) return null;
    return doc.layers[es.selection[0]] ?? null;
  }

  function _hitKey(cx, cy) {
    const doc = store.get(); const layer = _selLayer();
    if (!layer) return null;
    const px = layer.transform.x, py = layer.transform.y;
    for (const f of motionPathKeyFrames(layer)) {
      const w = getDocWorldTr(doc, layer.id, f);
      const s = _toScreen(w.x, w.y);
      if ((s.x - cx) ** 2 + (s.y - cy) ** 2 <= HIT * HIT) {
        return { id: layer.id, f, hasX: (px.keys ?? []).some(k => k.f === f), hasY: (py.keys ?? []).some(k => k.f === f) };
      }
    }
    return null;
  }

  // 손잡이 히트 — 곡선일 때만. 반환 { id, f, side:'i'|'o', keyLocal }
  function _hitHandle(cx, cy) {
    const doc = store.get(); const layer = _selLayer();
    if (!layer || !isCurvedPath(layer.transform)) return null;
    const xk = layer.transform.x.keys, yk = layer.transform.y.keys;
    for (let i = 0; i < xk.length; i++) {
      const sp = xk[i].sp; if (!sp) continue;
      const keyLocal = { x: xk[i].v, y: yk[i].v };
      const parent = getParentWorldTr(doc, layer.id, xk[i].f);
      for (const side of ['i', 'o']) {
        const hx = side === 'i' ? (sp.ix ?? 0) : (sp.ox ?? 0);
        const hy = side === 'i' ? (sp.iy ?? 0) : (sp.oy ?? 0);
        if (hx === 0 && hy === 0) continue;
        const w = localToWorldInParent(keyLocal.x + hx, keyLocal.y + hy, parent);
        const s = _toScreen(w.x, w.y);
        if ((s.x - cx) ** 2 + (s.y - cy) ** 2 <= HHIT * HHIT) return { id: layer.id, f: xk[i].f, side, keyLocal };
      }
    }
    return null;
  }

  function _spAt(id, f) {
    const k = (store.get().layers[id]?.transform?.x?.keys ?? []).find(kk => kk.f === f);
    return k?.sp ? { ...k.sp } : { ix: 0, iy: 0, ox: 0, oy: 0 };
  }
  function _mirror(offset, prevOpp) {
    const len = Math.hypot(offset.x, offset.y) || 1;
    const ux = offset.x / len, uy = offset.y / len;
    const oppLen = Math.hypot(prevOpp?.x ?? 0, prevOpp?.y ?? 0);
    const m = oppLen > 0 ? oppLen : len;
    return { x: -ux * m, y: -uy * m };
  }

  function _onDown(e) {
    if (editorState.get().tool !== 'edit') return;
    if (e.button === 2) return; // 우클릭은 contextmenu 에서
    const rect = overlayCanvas.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;

    const h = _hitHandle(cx, cy);
    if (h) {
      e.preventDefault(); e.stopPropagation();
      _drag = { kind: 'handle', ...h, alt: e.altKey };
      overlayCanvas.setPointerCapture?.(e.pointerId);
      store.begin('경로 손잡이');
      return;
    }
    const hit = _hitKey(cx, cy);
    if (!hit) return;
    e.preventDefault(); e.stopPropagation();
    if (e.altKey && hit.hasX && hit.hasY) {
      _drag = { kind: 'make', id: hit.id, f: hit.f, keyLocal: { x: _keyV(hit.id, 'x', hit.f), y: _keyV(hit.id, 'y', hit.f) } };
    } else {
      _drag = { kind: 'point', ...hit };
    }
    overlayCanvas.setPointerCapture?.(e.pointerId);
    store.begin(_drag.kind === 'make' ? '경로 손잡이' : '경로 점');
  }

  function _keyV(id, axis, f) {
    const k = (store.get().layers[id]?.transform?.[axis]?.keys ?? []).find(kk => kk.f === f);
    return k?.v ?? 0;
  }

  function _onMove(e) {
    if (!_drag) return;
    const rect = overlayCanvas.getBoundingClientRect();
    const d = _toDoc(e.clientX - rect.left, e.clientY - rect.top);
    const parent = getParentWorldTr(store.get(), _drag.id, _drag.f);

    if (_drag.kind === 'point') {
      const loc = worldToLocalInParent(d.x, d.y, parent);
      const cmds = [];
      if (_drag.hasX) cmds.push({ type: 'setProp', id: _drag.id, path: 'transform.x', value: loc.x, f: _drag.f });
      if (_drag.hasY) cmds.push({ type: 'setProp', id: _drag.id, path: 'transform.y', value: loc.y, f: _drag.f });
      if (cmds.length) store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
      return;
    }

    const loc = worldToLocalInParent(d.x, d.y, parent);
    const offset = { x: loc.x - _drag.keyLocal.x, y: loc.y - _drag.keyLocal.y };

    if (_drag.kind === 'make') {
      store.preview({ type: 'setKeyHandle', id: _drag.id, f: _drag.f, sp: { ox: offset.x, oy: offset.y, ix: -offset.x, iy: -offset.y } });
      return;
    }
    // handle
    const sp = _spAt(_drag.id, _drag.f);
    if (_drag.side === 'o') {
      sp.ox = offset.x; sp.oy = offset.y;
      if (!_drag.alt) { const m = _mirror(offset, { x: sp.ix, y: sp.iy }); sp.ix = m.x; sp.iy = m.y; }
    } else {
      sp.ix = offset.x; sp.iy = offset.y;
      if (!_drag.alt) { const m = _mirror(offset, { x: sp.ox, y: sp.oy }); sp.ox = m.x; sp.oy = m.y; }
    }
    store.preview({ type: 'setKeyHandle', id: _drag.id, f: _drag.f, sp });
  }

  function _onUp(e) {
    if (!_drag) return;
    _drag = null;
    overlayCanvas.releasePointerCapture?.(e.pointerId);
    store.commit();
  }

  // 점 우클릭 메뉴 — 부드러운 점으로 / 꺾인 점으로
  function _closeMenu() { if (_menu) { _menu.remove(); _menu = null; document.removeEventListener('pointerdown', _onMenuDown, true); } }
  function _onMenuDown(ev) { if (_menu && !_menu.contains(ev.target)) _closeMenu(); }
  function _onContext(e) {
    if (editorState.get().tool !== 'edit') return;
    const rect = overlayCanvas.getBoundingClientRect();
    const hit = _hitKey(e.clientX - rect.left, e.clientY - rect.top);
    if (!hit || !hit.hasX || !hit.hasY) return;
    e.preventDefault(); e.stopPropagation();
    _closeMenu();
    const menu = document.createElement('div'); menu.className = 'kf-ease-menu';
    const items = [
      ['부드러운 점으로', () => _smoothKey(hit.id, hit.f)],
      ['꺾인 점으로(손잡이 없애기)', () => store.apply({ type: 'setKeyHandle', id: hit.id, f: hit.f, sp: null })],
    ];
    for (const [label, fn] of items) {
      const b = document.createElement('button'); b.className = 'kf-ease-item'; b.textContent = label;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); _closeMenu(); fn(); });
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    menu.style.left = Math.min(e.clientX, window.innerWidth - menu.offsetWidth - 8) + 'px';
    menu.style.top = Math.min(e.clientY, window.innerHeight - menu.offsetHeight - 8) + 'px';
    _menu = menu;
    setTimeout(() => document.addEventListener('pointerdown', _onMenuDown, true), 0);
  }

  // 한 키에 이웃 방향 자동 손잡이(앞뒤 키 간격의 1/3).
  function _smoothKey(id, f) {
    const l = store.get().layers[id];
    const xk = l.transform.x.keys ?? [], yk = l.transform.y.keys ?? [];
    const i = xk.findIndex(k => k.f === f);
    if (i < 0) return;
    const P = (j) => ({ x: xk[j].v, y: yk[j]?.v ?? 0 });
    const cur = P(i);
    let ox = 0, oy = 0, ix = 0, iy = 0;
    if (i > 0 && i < xk.length - 1) {
      const a = P(i - 1), b = P(i + 1);
      const dx = b.x - a.x, dy = b.y - a.y; const len = Math.hypot(dx, dy) || 1; const ux = dx / len, uy = dy / len;
      const dN = Math.hypot(b.x - cur.x, b.y - cur.y) / 3, dP = Math.hypot(cur.x - a.x, cur.y - a.y) / 3;
      ox = ux * dN; oy = uy * dN; ix = -ux * dP; iy = -uy * dP;
    } else if (i === 0 && xk.length > 1) { const b = P(1); ox = (b.x - cur.x) / 3; oy = (b.y - cur.y) / 3; }
    else if (i === xk.length - 1 && xk.length > 1) { const a = P(i - 1); ix = (a.x - cur.x) / 3; iy = (a.y - cur.y) / 3; }
    store.apply({ type: 'setKeyHandle', id, f, sp: { ix, iy, ox, oy } });
  }

  overlayCanvas.addEventListener('pointerdown', _onDown, true);
  overlayCanvas.addEventListener('pointermove', _onMove, true);
  overlayCanvas.addEventListener('pointerup', _onUp, true);
  overlayCanvas.addEventListener('pointercancel', _onUp, true);
  overlayCanvas.addEventListener('contextmenu', _onContext, true);

  function destroy() {
    overlayCanvas.removeEventListener('pointerdown', _onDown, true);
    overlayCanvas.removeEventListener('pointermove', _onMove, true);
    overlayCanvas.removeEventListener('pointerup', _onUp, true);
    overlayCanvas.removeEventListener('pointercancel', _onUp, true);
    overlayCanvas.removeEventListener('contextmenu', _onContext, true);
    _closeMenu();
  }
  return { destroy, isDragging: () => !!_drag };
}
