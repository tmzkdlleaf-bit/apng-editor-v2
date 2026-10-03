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

  loopBtn.classList.add('tl-loop-btn');

  // C12: 처음/끝 버튼을 play 앞뒤에 삽입
  const firstBtn = document.createElement('button');
  firstBtn.dataset.action = 'go-first';
  firstBtn.title = '처음으로';
  firstBtn.textContent = '|<';
  firstBtn.style.cssText = 'font-size:10px; padding:0 4px;';

  const lastBtn = document.createElement('button');
  lastBtn.dataset.action = 'go-last';
  lastBtn.title = '끝으로';
  lastBtn.textContent = '>|';
  lastBtn.style.cssText = 'font-size:10px; padding:0 4px;';

  head.insertBefore(firstBtn, playBtn);
  playBtn.after(lastBtn);

  // 레이어 추가 메뉴
  const addWrap = document.createElement('div');
  addWrap.style.cssText = 'position:relative; flex-shrink:0;';
  const layerAdd = createLayerAddMenu(store, editorState, addWrap);
  head.insertBefore(addWrap, head.firstChild);

  // 레이어 목록
  const layerList = initLayerList(layersEl, store, editorState);

  // 트랙 캔버스
  const trackCanvas = initTrackCanvas(tracksEl, layersEl, store, editorState, playback);

  // 처음/끝
  firstBtn.addEventListener('click', () => playback.goTo(0));
  lastBtn.addEventListener('click', () => {
    const fc = Math.max(1, store.get().meta.frameCount ?? 1);
    playback.goTo(fc - 1);
  });

  // 재생/정지
  playBtn.addEventListener('click', () => playback.toggle());

  // B2: 루프 모드 → doc.meta.playback (setMeta 명령, 되돌리기 가능)
  loopBtn.addEventListener('click', () => {
    const cur  = store.get().meta.playback ?? 'loop';
    const next = _LOOP_CYCLE[(_LOOP_CYCLE.indexOf(cur) + 1) % _LOOP_CYCLE.length];
    store.apply({ type: 'setMeta', patch: { playback: next } });
  });

  // 자동 키
  autoKeyBtn.addEventListener('click', () => {
    editorState.set({ autoKey: !editorState.get().autoKey });
  });

  // 스냅
  snapBtn.addEventListener('click', () => {
    editorState.set({ snap: !editorState.get().snap });
  });

  function _updateHead() {
    const es  = editorState.get();
    const doc = store.get();
    const fc  = doc.meta.frameCount ?? 1;
    const playMode = doc.meta.playback ?? 'loop';
    playBtn.textContent  = es.playing ? '정지' : '재생';
    loopBtn.textContent  = (_LOOP_LABELS[playMode]) + ' ▾';
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
