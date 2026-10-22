// 모션 기록(F3-5) — 재생하면서 드래그한 움직임을 키프레임으로 녹화.
// 머리줄 기록 버튼(빨간 점) → 3·2·1 → 녹화 → 키 줄이기 후 기록 1건. Esc 취소.
import { getParentWorldTr, worldToLocalInParent } from './canvas/hit.js';
import { reduceKeys } from '../core/anim/reduce-keys.js';

// 키 줄이기는 core/anim/reduce-keys.js 로 옮겼다(core·worker 재사용). 기존 import 호환을 위해 다시 내보낸다.
export { reduceKeys };

// 녹화한 샘플 [{f,x,y}] → 레이어의 x/y 키프레임으로(줄인 뒤) 적용. 기록 1건.
export function applyRecordedPath(store, layerId, samples, tol = 2) {
  if (!store.get().layers[layerId] || samples.length < 2) return;
  const sorted = [...samples].sort((a, b) => a.f - b.f);
  const xs = reduceKeys(sorted.map(s => ({ f: s.f, v: s.x })), tol);
  const ys = reduceKeys(sorted.map(s => ({ f: s.f, v: s.y })), tol);
  const cmds = [];
  for (const k of xs) cmds.push({ type: 'setProp', id: layerId, path: 'transform.x', value: k.v, f: k.f });
  for (const k of ys) cmds.push({ type: 'setProp', id: layerId, path: 'transform.y', value: k.v, f: k.f });
  if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
}

// UI 레코더 — 버튼/카운트다운/Esc + 재생 중 포인터 샘플 수집.
// deps: { store, editorState, playback, getStage } (getStage()→{ overlayCanvas, screenToDoc })
export function createMotionRecorder(deps) {
  const { store, editorState, playback, getStage } = deps;
  let _state = 'idle'; // 'idle' | 'count' | 'recording'
  let _layerId = null;
  let _samples = [];
  let _pointerDoc = null;
  let _unsubF = null;
  let _countTimer = null;
  const _listeners = new Set(); // 상태 변화 알림(버튼 표시)

  function _emit() { for (const fn of _listeners) fn(_state); }
  function onStateChange(fn) { _listeners.add(fn); return () => _listeners.delete(fn); }

  function _pointerMove(e) {
    const st = getStage?.(); if (!st?.overlayCanvas) return;
    const rect = st.overlayCanvas.getBoundingClientRect();
    const d = st.screenToDoc(e.clientX - rect.left, e.clientY - rect.top);
    _pointerDoc = d;
  }

  function start(layerId) {
    if (_state !== 'idle') return;
    _layerId = layerId ?? editorState.get().selection[0];
    if (!_layerId) return;
    _samples = []; _pointerDoc = null;
    _state = 'count'; _emit();
    document.addEventListener('pointermove', _pointerMove, true);
    let n = 3;
    const tick = () => {
      _countLabel = n;
      _emit();
      if (n <= 0) { _beginRecording(); return; }
      n--;
      _countTimer = setTimeout(tick, 600);
    };
    tick();
  }

  let _countLabel = 3;
  function countLabel() { return _countLabel; }

  function _beginRecording() {
    _state = 'recording'; _emit();
    playback.goTo(0);
    playback.play && playback.play();
    // 프레임이 바뀔 때마다 현재 포인터 위치를 샘플
    _unsubF = editorState.subscribe((p) => {
      if (!('f' in p) || _state !== 'recording') return;
      if (_pointerDoc) {
        // 포인터는 카메라 월드(stage.screenToDoc) → 그 프레임의 부모(최상위는 카메라) 로컬로 변환해 저장.
        const fNow = editorState.get().f;
        const loc = worldToLocalInParent(_pointerDoc.x, _pointerDoc.y, getParentWorldTr(store.get(), _layerId, fNow));
        _samples.push({ f: fNow, x: loc.x, y: loc.y });
      }
      // 마지막 프레임 지나면 종료
      const fc = store.get().meta.frameCount ?? 1;
      if (editorState.get().f >= fc - 1) finish();
    });
    document.addEventListener('keydown', _onKey, true);
  }

  function _onKey(e) { if (e.key === 'Escape') { e.preventDefault(); cancel(); } }

  function _cleanup() {
    clearTimeout(_countTimer);
    document.removeEventListener('pointermove', _pointerMove, true);
    document.removeEventListener('keydown', _onKey, true);
    if (_unsubF) { _unsubF(); _unsubF = null; }
    playback.stop && playback.stop();
  }

  function finish() {
    if (_state !== 'recording') { _cancelInternal(); return; }
    _cleanup();
    // 녹화 중엔 store 를 건드리지 않았다. 줄인 키를 한 번에 apply → 되돌리기 1건.
    const id = _layerId, samples = _samples;
    _state = 'idle'; _emit();
    if (samples.length >= 2) applyRecordedPath(store, id, samples, 2);
  }

  function cancel() { _cleanup(); _state = 'idle'; _samples = []; _emit(); }
  function _cancelInternal() { _cleanup(); _state = 'idle'; _emit(); }

  function destroy() { _cleanup(); _listeners.clear(); }

  return { start, cancel, finish, destroy, onStateChange, state: () => _state, countLabel };
}
