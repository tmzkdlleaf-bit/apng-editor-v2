// 재생 컨트롤러 — rAF 루프, 누적 방식, doc.meta.playback 기준
const MAX_CATCH_FRAMES = 4;   // 한 번에 최대 따라잡기 프레임 수
const STALE_THRESHOLD  = 500; // 탭 복귀 감지 임계값 (ms)

export function createPlayback(store, editorState) {
  let _rafId  = null;
  let _lastTs = 0;
  let _acc    = 0;    // 누적 경과 시간 (ms)

  function _advance(ts) {
    _rafId = requestAnimationFrame(_advance);

    const doc  = store.get();
    const fps  = Math.max(1, doc.meta.fps ?? 12);
    const ms   = 1000 / fps;

    if (_lastTs === 0) {
      _lastTs = ts;
      return;
    }

    const delta = ts - _lastTs;
    _lastTs = ts;

    // 탭을 떠났다 돌아온 경우(delta 크면) 누적 초기화 — 따라잡지 않음
    if (delta > STALE_THRESHOLD) {
      _acc = 0;
      return;
    }

    _acc += delta;

    let advanced = 0;
    while (_acc >= ms && advanced < MAX_CATCH_FRAMES) {
      _acc -= ms;
      advanced++;
      _advanceOne(doc);
    }
    // 실제로 진행한 경우에만 doc을 다시 읽었으므로 store 변경 없음
  }

  function _advanceOne(doc) {
    const fc  = Math.max(1, doc.meta.frameCount ?? 1);
    const es  = editorState.get();
    const f   = es.f;
    const dir = es.playDir ?? 1;
    // B2: doc.meta.playback 우선, 없으면 editorState.loopMode 후퇴
    const loopMode = doc.meta.playback ?? es.loopMode ?? 'loop';

    switch (loopMode) {
      case 'once':
        if (f + 1 >= fc) { _stop(false); return; }
        editorState.set({ f: f + 1 });
        break;
      case 'pingpong':
        if (fc <= 1) return;
        if (dir > 0 && f + 1 >= fc) {
          editorState.set({ f: Math.max(0, fc - 2), playDir: -1 });
        } else if (dir < 0 && f - 1 < 0) {
          editorState.set({ f: Math.min(fc - 1, 1), playDir: 1 });
        } else {
          editorState.set({ f: f + dir });
        }
        break;
      default: // loop
        editorState.set({ f: (f + 1) % fc });
    }
  }

  function _stop(resetDir = true) {
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
    const patch = { playing: false };
    if (resetDir) patch.playDir = 1;
    editorState.set(patch);
    _acc = 0;
    _lastTs = 0;
  }

  function play() {
    if (_rafId !== null) return;
    _lastTs = 0;
    _acc    = 0;
    _rafId  = requestAnimationFrame(_advance);
    editorState.set({ playing: true });
  }

  function stop()   { _stop(true); }
  function toggle() { editorState.get().playing ? stop() : play(); }

  function goTo(f) {
    const fc = Math.max(1, store.get().meta.frameCount ?? 1);
    editorState.set({ f: Math.max(0, Math.min(fc - 1, f)) });
  }

  function destroy() { _stop(); }

  return { play, stop, toggle, goTo, isPlaying: () => _rafId !== null, destroy };
}
