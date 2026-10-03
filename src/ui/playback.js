// 재생 컨트롤러 — rAF 루프, fps 조절, loop/once/pingpong
export function createPlayback(store, editorState) {
  let _rafId  = null;
  let _lastTs = 0;

  function _advance(ts) {
    _rafId = requestAnimationFrame(_advance);

    const doc  = store.get();
    const fps  = Math.max(1, doc.meta.fps ?? 12);
    const ms   = 1000 / fps;
    if (ts - _lastTs < ms - 1) return;
    _lastTs = ts;

    const fc  = Math.max(1, doc.meta.frameCount ?? 1);
    const es  = editorState.get();
    const f   = es.f;
    const dir = es.playDir ?? 1;

    switch (es.loopMode ?? 'loop') {
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
  }

  function play() {
    if (_rafId !== null) return;
    _lastTs = 0;
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
