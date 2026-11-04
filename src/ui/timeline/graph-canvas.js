// R19 — 그래프 편집기. 트랙 캔버스 자리에 겹쳐 뜨며(editorState.graphMode) 같은 시간자·재생선·확대
//   배율을 쓴다. 값 그래프(세로=값)와 속도 그래프(세로=프레임당 변화량) 두 보기.
//   구간 [키 i → 키 i+1]의 모양 = 앞 키 i의 ease(+bezier[x1,y1,x2,y2]).
//     키 i의 나가는 손잡이 = (f_i + x1·Δf, v_i + y1·Δv)
//     키 i+1의 들어오는 손잡이 = (f_i + x2·Δf, v_i + y2·Δv)
//   R24 에서 트랙과 정식 통합한다(지금은 겹쳐 뜨는 임시 자리).
import { animatedProps } from './rows.js';
import { getProp } from '../../core/anim/props.js';
import { evalProp } from '../../core/anim/prop.js';
import { evalPosition, isCurvedPath } from '../../core/anim/position.js';
import { easeToBezier } from '../../core/anim/easing.js';

const HEAD_H = 24;
const PAD_T = 14, PAD_B = 14;      // 값 축 위아래 여백
const KF_HIT = 7, H_HIT = 7;       // 키·손잡이 히트 반경(px)
const DRAG_THRESH = 4;
const LINE_COLORS = ['#f0a35e', '#6ec6ff', '#9ad36b', '#e6739f', '#c6a3ff', '#ffd166', '#5ed6c0'];

// ── 순수 헬퍼(그래프 좌표 ↔ bezier). 테스트가 직접 쓴다. DOM 없음. ──────────
export function defaultBezierFor(k0) {
  if (k0?.ease === 'cubicBezier' && Array.isArray(k0.bezier)) return k0.bezier.slice();
  return easeToBezier(k0?.ease) ?? [0, 0, 1, 1];
}

// 구간 k0→k1 의 두 손잡이 위치를 (프레임, 값) 공간으로.
export function segHandles(k0, k1) {
  const df = k1.f - k0.f, dv = k1.v - k0.v;
  const bz = defaultBezierFor(k0);
  return {
    df, dv, bz,
    out: { f: k0.f + bz[0] * df, v: k0.v + bz[1] * dv },
    in:  { f: k0.f + bz[2] * df, v: k0.v + bz[3] * dv },
  };
}

// 손잡이 위치(hf,hv) → 앞 키 bezier. side 'out'=x1,y1 / 'in'=x2,y2. 반대쪽은 유지.
export function handleToBezier(k0, k1, side, hf, hv) {
  const df = k1.f - k0.f, dv = k1.v - k0.v;
  const bz = defaultBezierFor(k0);
  const x = df ? Math.max(0, Math.min(1, (hf - k0.f) / df)) : (side === 'out' ? bz[0] : bz[2]);
  const y = dv ? (hv - k0.v) / dv : (side === 'out' ? bz[1] : bz[3]);
  if (side === 'out') { bz[0] = x; bz[1] = y; } else { bz[2] = x; bz[3] = y; }
  return bz;
}

// 구간의 실제 단위 기울기(값/프레임).
export function segSlope(k0, k1, side, bz) {
  const df = k1.f - k0.f, dv = k1.v - k0.v;
  if (side === 'out') { const dx = bz[0] * df; return dx ? (bz[1] * dv) / dx : 0; }
  const dx = (1 - bz[2]) * df; return dx ? ((1 - bz[3]) * dv) / dx : 0;
}

// 이어진 손잡이(key.smooth): 한쪽을 끌면 반대쪽 bezier 를 기울기 맞춰 돌려준다.
//   keys: 정렬된 키 배열, idx: 끈 키, side: 끈 손잡이('out'|'in'), newBz: 끈 쪽 세그먼트의 새 bezier.
//   반환 { f, bezier } (반대쪽 세그먼트 앞 키의 새 bezier) 또는 null.
export function smoothLinkBezier(keys, idx, side, newBz) {
  const k = keys[idx];
  if (!k?.smooth) return null;
  if (side === 'out') {
    // 끈 것: 키 idx 의 나가는 손잡이(seg idx→idx+1 = 키 idx bezier). 맞출 것: 들어오는 손잡이(seg idx-1→idx = 키 idx-1 bezier x2,y2).
    const k0 = keys[idx - 1], kN = keys[idx + 1]; if (!k0 || !kN) return null;
    const slope = segSlope(k, kN, 'out', newBz);
    const df0 = k.f - k0.f, dv0 = k.v - k0.v;
    const bz0 = defaultBezierFor(k0);
    bz0[3] = dv0 ? 1 - slope * ((1 - bz0[2]) * df0) / dv0 : bz0[3];
    return { f: k0.f, bezier: bz0 };
  } else {
    // 끈 것: 키 idx 의 들어오는 손잡이(seg idx-1→idx = 키 idx-1 bezier). 맞출 것: 나가는 손잡이(seg idx→idx+1 = 키 idx bezier x1,y1).
    const k0 = keys[idx - 1], kN = keys[idx + 1]; if (!k0 || !kN) return null;
    const slope = segSlope(k0, k, 'in', newBz);
    const dfk = kN.f - k.f, dvk = kN.v - k.v;
    const bzk = defaultBezierFor(k);
    bzk[1] = dvk ? slope * (bzk[0] * dfk) / dvk : bzk[1];
    return { f: k.f, bezier: bzk };
  }
}

// F9 "부드럽게": 고른 키의 앞 구간 (x2,y2)=(0.67,1), 뒤 구간 (x1,y1)=(0.33,0).
//   mode 'both'|'in'|'out'. 시작·끝 키는 이웃이 있는 쪽만. 같은 키 bezier 는 합쳐 한 명령으로.
export function easyEaseCommands(doc, refs, mode = 'both') {
  const IN = [0.67, 1], OUT = [0.33, 0];
  const edits = new Map();
  const touch = (id, path, kobj) => {
    const kk = id + '|' + path + '|' + kobj.f;
    let e = edits.get(kk);
    if (!e) { e = { id, path, f: kobj.f, bezier: defaultBezierFor(kobj) }; edits.set(kk, e); }
    return e;
  };
  for (const r of refs) {
    const keys = getProp(doc.layers[r.id], r.path)?.keys;
    if (!keys) continue;
    const idx = keys.findIndex(k => k.f === r.f);
    if (idx < 0) continue;
    if ((mode === 'both' || mode === 'out') && idx < keys.length - 1) {
      const e = touch(r.id, r.path, keys[idx]); e.bezier[0] = OUT[0]; e.bezier[1] = OUT[1];
    }
    if ((mode === 'both' || mode === 'in') && idx > 0) {
      const e = touch(r.id, r.path, keys[idx - 1]); e.bezier[2] = IN[0]; e.bezier[3] = IN[1];
    }
  }
  return [...edits.values()].map(e => ({
    type: 'setKeysEase', id: e.id, path: e.path, frames: [e.f], ease: 'cubicBezier', bezier: e.bezier,
  }));
}

// Ctrl+Alt+H: 정지 키 토글. 선택 중 hold 아닌 게 하나라도 있으면 전부 hold, 아니면 전부 linear.
export function holdToggleCommands(doc, refs) {
  let anyNotHold = false;
  for (const r of refs) {
    const k = (getProp(doc.layers[r.id], r.path)?.keys ?? []).find(k => k.f === r.f);
    if (k && k.ease !== 'hold') anyNotHold = true;
  }
  const target = anyNotHold ? 'hold' : 'linear';
  const byGP = new Map();
  for (const r of refs) {
    const kk = r.id + '|' + r.path;
    if (!byGP.has(kk)) byGP.set(kk, { id: r.id, path: r.path, frames: [] });
    byGP.get(kk).frames.push(r.f);
  }
  return [...byGP.values()].map(g => ({ type: 'setKeysEase', id: g.id, path: g.path, frames: g.frames, ease: target }));
}

// ── 그래프에 그릴 속성 줄 모델 ────────────────────────────────────────────
//   numeric: 바로 편집. coordX/coordY: 좌표형을 x·y 두 줄(값은 보여주되 손잡이 숨김). excluded: 색·선택형(그림 X).
function _lineKind(prop) {
  const v = prop?.keys?.[0]?.v ?? prop?.value;
  if (typeof v === 'number') return 'num';
  if (v && typeof v === 'object' && 'x' in v) return 'coord';
  return 'excluded';
}

function _cssVar(name, fb) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb;
}

export function initGraphCanvas(tracksEl, store, editorState, playback, opts = {}) {
  const getPxPerF = opts.getPxPerF ?? (() => 20);

  const root = document.createElement('div');
  root.className = 'graph-canvas-root';
  root.hidden = true;

  const headWrap = document.createElement('div');
  headWrap.className = 'graph-header-wrap';
  const headCanvas = document.createElement('canvas');
  headCanvas.className = 'graph-header-canvas';
  headWrap.appendChild(headCanvas);

  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'graph-body-wrap';
  const bodyCanvas = document.createElement('canvas');
  bodyCanvas.className = 'graph-body-canvas';
  bodyWrap.appendChild(bodyCanvas);

  // 아래 숫자 칸 + 보기 전환 + 세로 맞춤
  const footer = document.createElement('div');
  footer.className = 'graph-footer';
  const viewBtn = document.createElement('button');
  viewBtn.className = 'quiet sm graph-view-btn';
  const fitBtn = document.createElement('button');
  fitBtn.className = 'quiet sm'; fitBtn.textContent = '세로 맞춤';
  const numWrap = document.createElement('span'); numWrap.className = 'graph-nums';
  const mkNum = (label, editable) => {
    const w = document.createElement('label'); w.className = 'graph-num';
    const t = document.createElement('span'); t.textContent = label;
    const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'graph-num-input';
    if (!editable) inp.readOnly = true;
    w.append(t, inp); return { w, inp };
  };
  const nF = mkNum('프레임', true), nV = mkNum('값', true), nIn = mkNum('들어오는 %', false), nOut = mkNum('나가는 %', false);
  numWrap.append(nF.w, nV.w, nIn.w, nOut.w);
  footer.append(viewBtn, fitBtn, numWrap);

  root.append(headWrap, bodyWrap, footer);
  tracksEl.appendChild(root);
  headWrap.style.overflowX = 'hidden';

  let _vRange = null;     // { min, max } 값 축. null 이면 다음 그리기에서 다시 맞춘다.
  let _drag = null, _pending = null, _boxSel = null;

  function _pxPerF() { return getPxPerF(); }
  function _frameToX(f) { return f * _pxPerF() + _pxPerF() / 2; }
  function _xToFrame(x) { return Math.round((x - _pxPerF() / 2) / _pxPerF()); }
  function _plotH() { return Math.max(1, bodyWrap.clientHeight - PAD_T - PAD_B); }
  function _vToY(v) {
    const r = _vRange ?? { min: 0, max: 1 };
    const span = (r.max - r.min) || 1;
    return PAD_T + (r.max - v) / span * _plotH();
  }
  function _yToV(y) {
    const r = _vRange ?? { min: 0, max: 1 };
    const span = (r.max - r.min) || 1;
    return r.max - (y - PAD_T) / _plotH() * span;
  }

  // 그릴 속성 줄: kfSelection 의 (id,path) 모음, 없으면 선택 레이어의 키 있는 속성 전부.
  function _lines() {
    const doc = store.get(), es = editorState.get();
    const picked = [];
    const seen = new Set();
    for (const r of es.kfSelection) {
      const k = r.id + '|' + r.path;
      if (!seen.has(k)) { seen.add(k); picked.push({ id: r.id, path: r.path }); }
    }
    if (!picked.length) {
      for (const id of es.selection) {
        const l = doc.layers[id]; if (!l) continue;
        for (const p of animatedProps(l)) { const k = id + '|' + p.path; if (!seen.has(k)) { seen.add(k); picked.push({ id, path: p.path, label: p.label }); } }
      }
    }
    const lines = [];
    let ci = 0;
    for (const p of picked) {
      const layer = doc.layers[p.id]; if (!layer) continue;
      const prop = getProp(layer, p.path); if (!prop) continue;
      const kind = _lineKind(prop);
      const color = LINE_COLORS[ci % LINE_COLORS.length]; ci++;
      const curved = (p.path === 'transform.x' || p.path === 'transform.y') && isCurvedPath(layer.transform);
      if (kind === 'num') {
        lines.push({ id: p.id, path: p.path, kind: 'num', color, curved,
          val: (f) => evalProp(prop, f), keyV: (k) => k.v });
      } else if (kind === 'coord') {
        lines.push({ id: p.id, path: p.path, kind: 'coordX', color, excluded: true,
          val: (f) => (evalProp(prop, f)?.x ?? 0), keyV: (k) => k.v?.x ?? 0 });
        lines.push({ id: p.id, path: p.path, kind: 'coordY', color: LINE_COLORS[ci % LINE_COLORS.length], excluded: true,
          val: (f) => (evalProp(prop, f)?.y ?? 0), keyV: (k) => k.v?.y ?? 0 });
        ci++;
      } else {
        lines.push({ id: p.id, path: p.path, kind: 'excluded', color, excluded: true, val: () => 0, keyV: () => 0 });
      }
    }
    return lines;
  }

  function _speed() { return editorState.get().graphView === 'speed'; }

  // 한 줄의 (프레임→세로값). 속도 그래프면 변화량. 곡선 위치면 경로 속도.
  function _sampleY(line, layer, prop, f) {
    if (!_speed()) return line.val(f);
    if (line.curved && line.kind === 'num') {
      const a = evalPosition(layer.transform, f - 0.5), b = evalPosition(layer.transform, f + 0.5);
      return Math.hypot(b.x - a.x, b.y - a.y);
    }
    return line.val(f + 0.5) - line.val(f - 0.5);
  }

  // ── 히트 테스트 ───────────────────────────────────────────────────────
  function _bodyXY(e) {
    const r = bodyCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left + bodyWrap.scrollLeft, y: e.clientY - r.top };
  }
  function _selSet(es) { const s = new Set(); for (const r of es.kfSelection) s.add(r.id + '|' + r.path + '|' + r.f); return s; }

  // 선택된 수치 키의 손잡이(값 그래프에서만, 곡선 위치 아님).
  function _handleHit(x, y) {
    if (_speed()) return null;
    const doc = store.get(), es = editorState.get();
    const selSet = _selSet(es);
    for (const line of _lines()) {
      if (line.kind !== 'num' || line.curved) continue;
      const layer = doc.layers[line.id]; const keys = getProp(layer, line.path)?.keys ?? [];
      for (let i = 0; i < keys.length; i++) {
        if (!selSet.has(line.id + '|' + line.path + '|' + keys[i].f)) continue;
        // 나가는(seg i→i+1) · 들어오는(seg i-1→i)
        if (i < keys.length - 1) {
          const h = segHandles(keys[i], keys[i + 1]).out;
          if (Math.hypot(x - _frameToX(h.f), y - _vToY(h.v)) <= H_HIT)
            return { line, i, side: 'out', k0i: i };
        }
        if (i > 0) {
          const h = segHandles(keys[i - 1], keys[i]).in;
          if (Math.hypot(x - _frameToX(h.f), y - _vToY(h.v)) <= H_HIT)
            return { line, i, side: 'in', k0i: i - 1 };
        }
      }
    }
    return null;
  }

  function _keyHit(x, y) {
    const doc = store.get();
    for (const line of _lines()) {
      const layer = doc.layers[line.id]; const prop = getProp(layer, line.path); const keys = prop?.keys ?? [];
      for (const k of keys) {
        const kx = _frameToX(k.f), ky = _vToY(_sampleY(line, layer, prop, k.f));
        if (Math.hypot(x - kx, y - ky) <= KF_HIT) return { line, f: k.f, ref: { id: line.id, path: line.path, f: k.f } };
      }
    }
    return null;
  }

  // ── 포인터 ────────────────────────────────────────────────────────────
  bodyCanvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    editorState.set({ focusRegion: 'timeline' });
    const { x, y } = _bodyXY(e);
    const es = editorState.get();

    const hh = _handleHit(x, y);
    if (hh) {
      const keys = getProp(store.get().layers[hh.line.id], hh.line.path).keys;
      store.begin('그래프 손잡이');
      _drag = { type: 'handle', line: hh.line, side: hh.side, keyIdx: hh.i, k0i: hh.k0i, keysLen: keys.length };
      bodyCanvas.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }

    const kh = _keyHit(x, y);
    if (kh) {
      const selSet = _selSet(es);
      const kk = kh.ref.id + '|' + kh.ref.path + '|' + kh.ref.f;
      let newSel;
      if (e.shiftKey) {
        newSel = selSet.has(kk) ? es.kfSelection.filter(r => (r.id + '|' + r.path + '|' + r.f) !== kk) : [...es.kfSelection, kh.ref];
      } else if (selSet.has(kk)) { newSel = es.kfSelection; }
      else { newSel = [kh.ref]; }
      editorState.set({ kfSelection: newSel });
      _pending = { type: 'kf', startX: x, startY: y, anchor: kh.ref };
      bodyCanvas.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }

    _pending = { type: 'empty', startX: x, startY: y };
    bodyCanvas.setPointerCapture(e.pointerId);
  });

  bodyCanvas.addEventListener('pointermove', (e) => {
    const { x, y } = _bodyXY(e);
    if (_pending && !_drag) {
      const far = Math.abs(x - _pending.startX) >= DRAG_THRESH || Math.abs(y - _pending.startY) >= DRAG_THRESH;
      if (!far) return;
      if (_pending.type === 'kf') {
        store.begin('그래프 키');
        _drag = { type: 'kf', startX: _pending.startX, startY: _pending.startY,
          origSel: editorState.get().kfSelection.map(r => ({ ...r })) };
      } else {
        _boxSel = { x0: _pending.startX, y0: _pending.startY, x1: x, y1: y };
      }
      _pending = null;
    }
    if (_boxSel) { _boxSel.x1 = x; _boxSel.y1 = y; _requestDraw(); return; }
    if (!_drag) return;

    if (_drag.type === 'handle') _previewHandle(x, y);
    else if (_drag.type === 'kf') _previewKf(x, y);
  });

  bodyCanvas.addEventListener('pointerup', (e) => {
    const { x } = _bodyXY(e);
    if (_boxSel) { _finishBox(); _boxSel = null; _pending = null; _requestDraw(); return; }
    if (_drag) { store.commit(); _drag = null; return; }
    if (_pending) {
      if (_pending.type === 'empty') {
        const fc = store.get().meta.frameCount ?? 1;
        playback.goTo(Math.max(0, Math.min(fc - 1, _xToFrame(x))));
        if (editorState.get().kfSelection.length) editorState.set({ kfSelection: [] });
      }
      _pending = null;
    }
  });

  function _cancel() { if (_drag) { store.cancel(); _drag = null; } if (_boxSel) { _boxSel = null; _requestDraw(); } _pending = null; }
  bodyCanvas.addEventListener('pointercancel', _cancel);
  bodyCanvas.addEventListener('lostpointercapture', () => { if (_drag || _boxSel) _cancel(); });

  bodyCanvas.addEventListener('dblclick', (e) => {
    const { x, y } = _bodyXY(e);
    const kh = _keyHit(x, y); if (!kh) return;
    e.preventDefault();
    store.apply({ type: 'removeKey', id: kh.ref.id, path: kh.ref.path, f: kh.ref.f });
    editorState.set({ kfSelection: editorState.get().kfSelection.filter(r => !(r.id === kh.ref.id && r.path === kh.ref.path && r.f === kh.ref.f)) });
  });

  // Ctrl+휠 확대 → 트랙과 공유되게 바깥(index)에서 처리하도록 wheel 을 올려보냄(기본 동작 유지).

  function _previewHandle(x, y) {
    store.cancel(); store.begin('그래프 손잡이');
    const doc = store.get();
    const keys = getProp(doc.layers[_drag.line.id], _drag.line.path).keys;
    const k0 = keys[_drag.k0i], k1 = keys[_drag.k0i + 1];
    const hf = _xToFrameF(x), hv = _yToV(y);
    const bz = handleToBezier(k0, k1, _drag.side, hf, hv);
    const cmds = [{ type: 'setKeysEase', id: _drag.line.id, path: _drag.line.path, frames: [k0.f], ease: 'cubicBezier', bezier: bz }];
    const link = smoothLinkBezier(keys, _drag.keyIdx, _drag.side, bz);
    if (link) cmds.push({ type: 'setKeysEase', id: _drag.line.id, path: _drag.line.path, frames: [link.f], ease: 'cubicBezier', bezier: link.bezier });
    store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }
  function _xToFrameF(x) { return (x - _pxPerF() / 2) / _pxPerF(); } // 손잡이는 분수 프레임 허용

  function _previewKf(x, y) {
    store.cancel(); store.begin('그래프 키');
    const doc = store.get();
    const fc = doc.meta.frameCount ?? 1;
    const orig = _drag.origSel;
    let frameDelta = Math.round((x - _drag.startX) / _pxPerF());
    // 프레임 범위 클램프
    for (const r of orig) { if (r.f + frameDelta < 0) frameDelta = Math.max(frameDelta, -r.f); if (r.f + frameDelta > fc - 1) frameDelta = Math.min(frameDelta, fc - 1 - r.f); }
    const valueDelta = _yToV(y) - _yToV(_drag.startY); // 값 그래프 단위

    // 원래 키 정보 읽기
    const removes = [], sets = [], newSel = [];
    for (const r of orig) {
      const prop = getProp(doc.layers[r.id], r.path); const k = (prop?.keys ?? []).find(kk => kk.f === r.f);
      if (!k) continue;
      const nf = r.f + frameDelta;
      let nv = k.v;
      // 값 변경은 수치 키 + 값 그래프에서만(속도·좌표·곡선 위치는 프레임만).
      if (!_speed() && typeof k.v === 'number' && !((r.path === 'transform.x' || r.path === 'transform.y') && isCurvedPath(doc.layers[r.id].transform))) {
        nv = k.v + valueDelta;
      }
      if (nf !== r.f) removes.push({ type: 'removeKey', id: r.id, path: r.path, f: r.f });
      sets.push({ type: 'setKey', id: r.id, path: r.path, f: nf, v: nv, ease: k.ease ?? 'linear', bezier: k.bezier, sp: k.sp });
      newSel.push({ id: r.id, path: r.path, f: nf });
    }
    const cmds = [...removes, ...sets];
    if (cmds.length) store.preview(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    editorState.set({ kfSelection: newSel });
  }

  function _finishBox() {
    const b = _boxSel;
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1);
    const y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    const doc = store.get();
    const refs = [];
    for (const line of _lines()) {
      const layer = doc.layers[line.id]; const prop = getProp(layer, line.path);
      for (const k of (prop?.keys ?? [])) {
        const kx = _frameToX(k.f), ky = _vToY(_sampleY(line, layer, prop, k.f));
        if (kx >= x0 && kx <= x1 && ky >= y0 && ky <= y1) refs.push({ id: line.id, path: line.path, f: k.f });
      }
    }
    editorState.set({ kfSelection: refs });
  }

  // ── 그리기 ────────────────────────────────────────────────────────────
  let _raf = false;
  function _requestDraw() { if (_raf) return; _raf = true; requestAnimationFrame(() => { _raf = false; _draw(); }); }

  function _computeVRange(lines, doc, fc) {
    let min = Infinity, max = -Infinity;
    for (const line of lines) {
      if (line.excluded && line.kind === 'excluded') continue;
      const layer = doc.layers[line.id]; const prop = getProp(layer, line.path);
      for (let f = 0; f <= fc; f++) { const v = _sampleY(line, layer, prop, f); if (Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; } }
    }
    if (!Number.isFinite(min)) { min = 0; max = 1; }
    if (max - min < 1e-6) { min -= 1; max += 1; }
    const pad = (max - min) * 0.1;
    return { min: min - pad, max: max + pad };
  }

  function _draw() {
    if (root.hidden) return;
    const doc = store.get(), es = editorState.get();
    const fc = doc.meta.frameCount ?? 1;
    const dpr = window.devicePixelRatio || 1;
    const lines = _lines();
    viewBtn.textContent = _speed() ? '속도 그래프' : '값 그래프';

    if (!_vRange) _vRange = _computeVRange(lines, doc, fc);

    const wrapW = tracksEl.clientWidth || 400;
    const totalW = Math.max(wrapW, fc * _pxPerF());
    const bodyH = Math.max(40, bodyWrap.clientHeight || 160);

    headCanvas.width = Math.round(totalW * dpr); headCanvas.height = Math.round(HEAD_H * dpr);
    headCanvas.style.width = totalW + 'px'; headCanvas.style.height = HEAD_H + 'px';
    headWrap.style.width = Math.max(wrapW, totalW) + 'px';
    bodyCanvas.width = Math.round(totalW * dpr); bodyCanvas.height = Math.round(bodyH * dpr);
    bodyCanvas.style.width = totalW + 'px'; bodyCanvas.style.height = bodyH + 'px';

    const hCtx = headCanvas.getContext('2d'); hCtx.scale(dpr, dpr);
    const bCtx = bodyCanvas.getContext('2d'); bCtx.scale(dpr, dpr);

    _drawHeader(hCtx, fc, es.f, totalW);
    _drawBody(bCtx, doc, es, lines, fc, totalW, bodyH);
    _updateFooter(doc, es, lines);
  }

  function _drawHeader(ctx, fc, curF, totalW) {
    ctx.fillStyle = _cssVar('--tl', '#1a1c1f'); ctx.fillRect(0, 0, totalW, HEAD_H);
    ctx.font = '10px monospace'; ctx.textAlign = 'center';
    const dim = _cssVar('--dim', '#9a9ea6'), line2 = _cssVar('--line2', '#2b2e33'), acc = _cssVar('--acc', '#f0a35e');
    let step = 1; for (const s of [1, 2, 5, 10, 20, 50, 100]) { if (s * _pxPerF() >= 32) { step = s; break; } step = s; }
    for (let f = 0; f < fc; f += step) {
      const x = _frameToX(f);
      ctx.fillStyle = line2; ctx.fillRect(x, HEAD_H - 6, 1, 6);
      ctx.fillStyle = dim; ctx.fillText(String(f), x, HEAD_H - 8);
    }
    const px = _frameToX(curF); ctx.fillStyle = acc; ctx.fillRect(px - 1, 0, 2, HEAD_H);
    ctx.beginPath(); ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 8); ctx.closePath(); ctx.fill();
  }

  function _drawBody(ctx, doc, es, lines, fc, totalW, bodyH) {
    ctx.fillStyle = _cssVar('--tl', '#1a1c1f'); ctx.fillRect(0, 0, totalW, bodyH);
    const line2 = _cssVar('--line2', '#2b2e33'), dim = _cssVar('--dim', '#9a9ea6');
    // 세로 격자(프레임)
    ctx.fillStyle = line2;
    for (let f = 0; f < fc; f++) if (f % 5 === 0) ctx.fillRect(f * _pxPerF(), 0, 1, bodyH);
    // 0 기준선
    if (_vRange && _vRange.min < 0 && _vRange.max > 0) {
      const zy = _vToY(0); ctx.strokeStyle = dim; ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.moveTo(0, zy); ctx.lineTo(totalW, zy); ctx.stroke(); ctx.globalAlpha = 1;
    }
    const selSet = _selSet(es);

    for (const line of lines) {
      if (line.kind === 'excluded') continue;
      const layer = doc.layers[line.id]; const prop = getProp(layer, line.path);
      // 곡선 선: 서브프레임 표본
      ctx.strokeStyle = line.color; ctx.lineWidth = 1.5; ctx.globalAlpha = line.excluded ? 0.5 : 1;
      ctx.beginPath();
      const stepF = Math.max(0.25, 1 / Math.max(1, _pxPerF() / 4));
      let first = true;
      for (let f = 0; f <= fc; f += stepF) {
        const v = _sampleY(line, layer, prop, f);
        const X = _frameToX(f), Y = _vToY(v);
        if (first) { ctx.moveTo(X, Y); first = false; } else ctx.lineTo(X, Y);
      }
      ctx.stroke(); ctx.globalAlpha = 1;

      // 키 점
      const keys = prop?.keys ?? [];
      const editable = line.kind === 'num' && !line.curved && !_speed();
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const kx = _frameToX(k.f), ky = _vToY(_sampleY(line, layer, prop, k.f));
        const isSel = selSet.has(line.id + '|' + line.path + '|' + k.f);
        // 손잡이(선택 + 편집 가능)
        if (isSel && editable) {
          ctx.strokeStyle = dim; ctx.fillStyle = line.color;
          if (i < keys.length - 1) _drawHandle(ctx, kx, ky, segHandles(k, keys[i + 1]).out, keys[i], keys[i + 1], line.color);
          if (i > 0) _drawHandle(ctx, kx, ky, segHandles(keys[i - 1], k).in, keys[i - 1], k, line.color);
        }
        ctx.beginPath(); ctx.arc(kx, ky, isSel ? 4.5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = isSel ? '#fff' : line.color; ctx.fill();
        if (isSel) { ctx.strokeStyle = line.color; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
    }

    // 재생선
    const px = _frameToX(es.f); ctx.fillStyle = _cssVar('--acc', '#f0a35e'); ctx.globalAlpha = 0.8;
    ctx.fillRect(px - 1, 0, 2, bodyH); ctx.globalAlpha = 1;

    if (_boxSel) {
      const bx = Math.min(_boxSel.x0, _boxSel.x1), by = Math.min(_boxSel.y0, _boxSel.y1);
      const bw = Math.abs(_boxSel.x1 - _boxSel.x0), bh = Math.abs(_boxSel.y1 - _boxSel.y0);
      ctx.strokeStyle = _cssVar('--acc', '#f0a35e'); ctx.globalAlpha = 0.8; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
      ctx.globalAlpha = 0.12; ctx.fillStyle = _cssVar('--acc', '#f0a35e'); ctx.fillRect(bx, by, bw, bh); ctx.globalAlpha = 1;
    }
  }

  function _drawHandle(ctx, kx, ky, h, k0, k1, color) {
    const hx = _frameToX(h.f), hy = _vToY(h.v);
    const faint = (k1.v - k0.v) === 0; // Δv=0 이면 세로로 뜻 없음 → 흐리게
    ctx.save();
    ctx.globalAlpha = faint ? 0.3 : 0.8;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.restore();
  }

  function _updateFooter(doc, es, lines) {
    const ref = es.kfSelection[0];
    if (!ref) { nF.inp.value = nV.inp.value = nIn.inp.value = nOut.inp.value = ''; return; }
    const prop = getProp(doc.layers[ref.id], ref.path); const keys = prop?.keys ?? [];
    const idx = keys.findIndex(k => k.f === ref.f); const k = keys[idx];
    if (!k) { nF.inp.value = nV.inp.value = nIn.inp.value = nOut.inp.value = ''; return; }
    nF.inp.value = String(k.f);
    nV.inp.value = typeof k.v === 'number' ? String(Math.round(k.v * 100) / 100) : '-';
    // 나가는 영향 = x1×100 (seg idx→idx+1 = 키 idx bezier)
    const outBz = idx < keys.length - 1 ? defaultBezierFor(k) : null;
    // 들어오는 영향 = (1−x2)×100 (seg idx-1→idx = 키 idx-1 bezier)
    const inBz = idx > 0 ? defaultBezierFor(keys[idx - 1]) : null;
    nOut.inp.value = outBz ? String(Math.round(outBz[0] * 100)) : '-';
    nIn.inp.value = inBz ? String(Math.round((1 - inBz[2]) * 100)) : '-';
  }

  // 숫자 칸 편집(프레임·값)
  nF.inp.addEventListener('change', () => {
    const ref = editorState.get().kfSelection[0]; if (!ref) return;
    const nf = parseInt(nF.inp.value, 10); if (!Number.isFinite(nf)) return;
    const fc = store.get().meta.frameCount ?? 1; const tf = Math.max(0, Math.min(fc - 1, nf));
    if (tf === ref.f) return;
    const prop = getProp(store.get().layers[ref.id], ref.path); const k = (prop?.keys ?? []).find(kk => kk.f === ref.f); if (!k) return;
    store.apply({ type: 'batch', cmds: [
      { type: 'removeKey', id: ref.id, path: ref.path, f: ref.f },
      { type: 'setKey', id: ref.id, path: ref.path, f: tf, v: k.v, ease: k.ease ?? 'linear', bezier: k.bezier, sp: k.sp },
    ] });
    editorState.set({ kfSelection: [{ id: ref.id, path: ref.path, f: tf }] });
  });
  nV.inp.addEventListener('change', () => {
    const ref = editorState.get().kfSelection[0]; if (!ref) return;
    const nv = parseFloat(nV.inp.value); if (!Number.isFinite(nv)) return;
    const prop = getProp(store.get().layers[ref.id], ref.path); const k = (prop?.keys ?? []).find(kk => kk.f === ref.f); if (!k || typeof k.v !== 'number') return;
    store.apply({ type: 'setKey', id: ref.id, path: ref.path, f: ref.f, v: nv, ease: k.ease ?? 'linear', bezier: k.bezier, sp: k.sp });
    _vRange = null;
  });

  viewBtn.addEventListener('click', () => { editorState.set({ graphView: _speed() ? 'value' : 'speed' }); _vRange = null; });
  fitBtn.addEventListener('click', () => { _vRange = null; _requestDraw(); });

  // ── 구독 ──────────────────────────────────────────────────────────────
  const unsubStore = store.subscribe({ any: true }, () => { _requestDraw(); });
  const unsubES = editorState.subscribe((patch) => {
    if (patch && ('graphMode' in patch)) { root.hidden = !editorState.get().graphMode; }
    if (patch && (('selection' in patch) || ('kfSelection' in patch) || ('graphView' in patch))) _vRange = null;
    _requestDraw();
  });
  const ro = new ResizeObserver(() => _requestDraw());
  ro.observe(tracksEl);
  root.hidden = !editorState.get().graphMode;
  _requestDraw();

  function setVisible(v) { root.hidden = !v; if (v) { _vRange = null; _requestDraw(); } }
  function destroy() { unsubStore(); unsubES(); ro.disconnect(); root.remove(); }

  return { destroy, setVisible, root, refit: () => { _vRange = null; _requestDraw(); } };
}
