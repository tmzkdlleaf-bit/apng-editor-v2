// 타임라인 패널 — 레이어 목록 + 트랙 캔버스 + 컨트롤 버튼 조립
import { initLayerList }   from './layer-list.js';
import { initTrackCanvas } from './track-canvas.js';
import { createLayerAddMenu } from '../layer-add.js';

const _LOOP_LABELS = { loop: '반복', once: '한번', pingpong: '핑퐁' };
const _LOOP_CYCLE  = ['loop', 'once', 'pingpong'];

export function initTimeline(timelineEl, store, editorState, playback) {
  const head      = timelineEl.querySelector('.timeline-head');
  const body      = timelineEl.querySelector('.timeline-body');
  const layersEl  = timelineEl.querySelector('.timeline-layers');
  const tracksEl  = timelineEl.querySelector('.timeline-tracks');
  const playBtn   = head.querySelector('[data-action="play"]');
  const loopBtn   = head.querySelector('[data-action="loop-mode"]');
  const autoKeyBtn = head.querySelector('[data-action="auto-key"]');
  const snapBtn   = head.querySelector('[data-action="snap"]');
  const frameInfo = head.querySelector('.tl-frame-info');

  // 클래스 추가
  loopBtn.classList.add('tl-loop-btn');

  // 레이어 추가 메뉴 — 헤더 맨 앞에 삽입
  const addWrap = document.createElement('div');
  addWrap.style.cssText = 'position:relative; flex-shrink:0;';
  const layerAdd = createLayerAddMenu(store, editorState, addWrap);
  head.insertBefore(addWrap, head.firstChild);

  // 레이어 목록
  const layerList = initLayerList(layersEl, store, editorState);

  // 트랙 캔버스
  const trackCanvas = initTrackCanvas(tracksEl, layersEl, store, editorState, playback);

  // 재생/정지
  playBtn.addEventListener('click', () => playback.toggle());

  // 루프 모드 순환
  loopBtn.addEventListener('click', () => {
    const cur  = editorState.get().loopMode ?? 'loop';
    const next = _LOOP_CYCLE[(_LOOP_CYCLE.indexOf(cur) + 1) % _LOOP_CYCLE.length];
    editorState.set({ loopMode: next });
  });

  // 자동 키
  autoKeyBtn.addEventListener('click', () => {
    editorState.set({ autoKey: !editorState.get().autoKey });
  });

  // 스냅
  snapBtn.addEventListener('click', () => {
    editorState.set({ snap: !editorState.get().snap });
  });

  // 상태 반영
  function _updateHead() {
    const es = editorState.get();
    const doc = store.get();
    const fc  = doc.meta.frameCount ?? 1;
    playBtn.textContent  = es.playing ? '정지' : '재생';
    loopBtn.textContent  = (_LOOP_LABELS[es.loopMode ?? 'loop']) + ' ▾';
    autoKeyBtn.style.background = es.autoKey ? 'var(--toolon)' : '';
    autoKeyBtn.style.color      = es.autoKey ? 'var(--acc)' : '';
    snapBtn.style.background    = es.snap    ? 'var(--toolon)' : '';
    snapBtn.style.color         = es.snap    ? 'var(--acc)' : '';
    if (frameInfo) frameInfo.textContent = `${es.f + 1} / ${fc}`;
  }

  const unsubES = editorState.subscribe(_updateHead);
  const unsubSt = store.subscribe({ meta: true }, _updateHead);

  _updateHead();

  function destroy() {
    unsubES();
    unsubSt();
    layerList.destroy();
    trackCanvas.destroy();
    layerAdd.destroy();
  }

  return { destroy };
}
