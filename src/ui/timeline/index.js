// 타임라인 패널 — 재생줄(머리줄) + 레이어 목록 + 트랙 캔버스 조립
// 재생줄(item 5): [처음][이전][재생/멈춤][다음][끝]  현재/전체·초  반복(아이콘 3)  자동키  스냅
//   [+ 레이어]는 레이어 목록 머리 칸으로 옮겼다(layer-list.js).
import { initLayerList }   from './layer-list.js';
import { initTrackCanvas } from './track-canvas.js';
import { iconButton } from '../icons.js';
import { createMotionRecorder } from '../motion-record.js';
import { showToast } from '../shell/status.js';

const _LOOP_MODES = [
  { mode: 'loop',     icon: 'loop',     label: '반복' },
  { mode: 'once',     icon: 'once',     label: '한 번' },
  { mode: 'pingpong', icon: 'pingpong', label: '핑퐁' },
];

export function initTimeline(timelineEl, store, editorState, playback, deps = {}) {
  const head     = timelineEl.querySelector('.timeline-head');
  const layersEl = timelineEl.querySelector('.timeline-layers');
  const tracksEl = timelineEl.querySelector('.timeline-tracks');

  // ── 재생 이동 묶음 ──────────────────────────────────────────────────
  const transport = document.createElement('div');
  transport.className = 'tl-transport';
  const firstBtn = iconButton('first', { label: '처음으로', title: '처음으로 (Home)' });
  const prevBtn  = iconButton('prev',  { label: '이전 프레임', title: '이전 프레임 (←)' });
  const playBtn  = iconButton('play',  { label: '재생', title: '재생/멈춤 (Space)' });
  playBtn.dataset.action = 'play';
  const nextBtn  = iconButton('next',  { label: '다음 프레임', title: '다음 프레임 (→)' });
  const lastBtn  = iconButton('last',  { label: '끝으로', title: '끝으로 (End)' });
  transport.append(firstBtn, prevBtn, playBtn, nextBtn, lastBtn);

  // ── 프레임 표시(클릭하면 입력) + 초 ─────────────────────────────────
  const frameWrap = document.createElement('div');
  frameWrap.className = 'tl-frame-info';
  const frameCur = document.createElement('button');
  frameCur.className = 'tl-frame-cur';
  frameCur.title = '클릭해서 프레임 입력';
  frameCur.setAttribute('aria-label', '현재 프레임');
  const frameTot = document.createElement('span');
  frameTot.className = 'tl-frame-tot';
  const timeEl = document.createElement('span');
  timeEl.className = 'tl-time';
  frameWrap.append(frameCur, frameTot, timeEl);

  // ── 반복 방식(아이콘 3개 중 하나 선택) ──────────────────────────────
  const loopGroup = document.createElement('div');
  loopGroup.className = 'tl-loop-group';
  const loopBtns = _LOOP_MODES.map(({ mode, icon, label }) => {
    const b = iconButton(icon, { label: `반복: ${label}`, title: `반복 방식: ${label}` });
    b.dataset.mode = mode;
    b.addEventListener('click', () => store.apply({ type: 'setMeta', patch: { playback: mode } }));
    loopGroup.appendChild(b);
    return b;
  });

  // ── 자동 키 · 스냅(캔버스/타임라인) ─────────────────────────────────
  const autoKeyBtn = iconButton('autokey', { label: '자동 키', title: '자동 키 (값 바꾸면 키 자동 생성)' });
  const snapCanvasBtn = iconButton('snap-canvas', { label: '캔버스 스냅', title: '캔버스 스냅 (격자·가장자리에 붙임)', className: 'tl-snap-btn' });
  const snapTlBtn     = iconButton('snap-timeline', { label: '타임라인 스냅', title: '타임라인 스냅 (키·클립을 프레임·재생선에 붙임)', className: 'tl-snap-btn' });
  // item 5: 트랙 폭 맞춤 — 전체 프레임을 트랙 폭에 맞게 되돌림.
  const fitBtn = iconButton('zoom-fit', { label: '트랙 폭 맞춤', title: '트랙 폭 맞춤 — 전체 프레임을 트랙 폭에 맞게' });

  // ── 모션 기록(F3-5) ─────────────────────────────────────────────────
  const recBtn = document.createElement('button');
  recBtn.className = 'tl-rec-btn';
  recBtn.title = '모션 기록 — 재생 중 드래그한 움직임을 키로 녹화 (Esc 취소)';
  recBtn.setAttribute('aria-label', '모션 기록');
  recBtn.innerHTML = '<span class="tl-rec-dot"></span>';
  const recorder = createMotionRecorder({
    store, editorState, playback,
    getStage: () => (typeof window !== 'undefined' ? window.__stage : null),
  });
  recBtn.addEventListener('click', () => {
    if (recorder.state() !== 'idle') { recorder.cancel(); return; }
    if (!editorState.get().selection.length) { showToast('레이어를 선택하세요.'); return; }
    recorder.start();
  });
  const _recLabel = document.createElement('span'); _recLabel.className = 'tl-rec-label';
  recBtn.appendChild(_recLabel);
  recorder.onStateChange((st) => {
    recBtn.classList.toggle('is-count', st === 'count');
    recBtn.classList.toggle('is-rec', st === 'recording');
    _recLabel.textContent = st === 'count' ? String(recorder.countLabel()) : (st === 'recording' ? '기록 중' : '');
  });

  const sep = () => { const s = document.createElement('span'); s.className = 'tl-sep'; return s; };
  head.append(transport, sep(), frameWrap, sep(), loopGroup, sep(), autoKeyBtn, snapCanvasBtn, snapTlBtn, fitBtn, sep(), recBtn);

  // 레이어 목록(머리 칸에 [+ 레이어] 포함) · 트랙 캔버스
  const layerList   = initLayerList(layersEl, store, editorState, deps);
  const trackCanvas = initTrackCanvas(tracksEl, layersEl, store, editorState, playback);
  fitBtn.addEventListener('click', () => trackCanvas.fitWidth());

  // ── 동작 ────────────────────────────────────────────────────────────
  const _fc = () => Math.max(1, store.get().meta.frameCount ?? 1);
  firstBtn.addEventListener('click', () => playback.goTo(0));
  prevBtn .addEventListener('click', () => playback.goTo(Math.max(0, editorState.get().f - 1)));
  nextBtn .addEventListener('click', () => playback.goTo(Math.min(_fc() - 1, editorState.get().f + 1)));
  lastBtn .addEventListener('click', () => playback.goTo(_fc() - 1));
  playBtn .addEventListener('click', () => playback.toggle());
  autoKeyBtn.addEventListener('click', () => editorState.set({ autoKey: !editorState.get().autoKey }));
  snapCanvasBtn.addEventListener('click', () => editorState.set({ snap: !editorState.get().snap }));
  snapTlBtn.addEventListener('click', () => editorState.set({ tlSnap: !editorState.get().tlSnap }));

  // 프레임 숫자 클릭 → 직접 입력
  frameCur.addEventListener('click', () => {
    const input = document.createElement('input');
    input.className = 'tl-frame-input';
    input.type = 'text';
    input.value = String(editorState.get().f + 1);
    frameCur.replaceWith(input);
    input.focus(); input.select();
    const commit = (apply) => {
      if (apply) {
        const v = parseInt(input.value, 10);
        if (Number.isFinite(v)) playback.goTo(Math.max(0, Math.min(_fc() - 1, v - 1)));
      }
      input.replaceWith(frameCur);
      _updateHead();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(true); }
      else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
    });
    input.addEventListener('blur', () => commit(true));
  });

  // Space = 재생/멈춤 (입력 칸 포커스가 아닐 때)
  function _onKeydown(e) {
    if (e.code !== 'Space' && e.key !== ' ') return;
    const t = e.target;
    const tag = t?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
    e.preventDefault();
    playback.toggle();
  }
  document.addEventListener('keydown', _onKeydown);

  function _updateHead() {
    const es  = editorState.get();
    const doc = store.get();
    const fc  = doc.meta.frameCount ?? 1;
    const fps = doc.meta.fps ?? 12;
    const playMode = doc.meta.playback ?? 'loop';
    playBtn.innerHTML = '';
    playBtn.appendChild(iconButton(es.playing ? 'pause' : 'play', {}).firstChild);
    playBtn.title = es.playing ? '멈춤 (Space)' : '재생 (Space)';
    playBtn.setAttribute('aria-label', es.playing ? '멈춤' : '재생');
    frameCur.textContent = String(es.f + 1);
    frameTot.textContent = ` / ${fc}`;
    timeEl.textContent   = `${(es.f / fps).toFixed(2)}초`;
    for (const b of loopBtns) b.classList.toggle('is-on', b.dataset.mode === playMode);
    autoKeyBtn.classList.toggle('is-on', !!es.autoKey);
    snapCanvasBtn.classList.toggle('is-on', !!es.snap);
    snapTlBtn.classList.toggle('is-on', !!es.tlSnap);
  }

  const unsubES = editorState.subscribe(_updateHead);
  const unsubSt = store.subscribe({ meta: true }, _updateHead);
  _updateHead();

  function destroy() {
    document.removeEventListener('keydown', _onKeydown);
    recorder.destroy();
    unsubES();
    unsubSt();
    layerList.destroy();
    trackCanvas.destroy();
  }

  return { destroy };
}
