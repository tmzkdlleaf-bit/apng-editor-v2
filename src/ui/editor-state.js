export function createEditorState(initial = {}) {
  let _s = {
    selection: [],
    f: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    grid: false,
    snap: true,
    autoKey: false,
    groupEdit: null,
    tool: 'select',
    playing: false,
    loopMode: 'loop',   // 'loop' | 'once' | 'pingpong'
    playDir: 1,
  };

  for (const k of Object.keys(initial)) {
    if (k in _s) _s[k] = initial[k];
  }
  if (!Array.isArray(_s.selection)) _s.selection = [];

  const _subs = [];

  function get() { return _s; }

  function set(patch) {
    const next = { ..._s };
    let dirty = false;
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      if (k === 'selection') {
        const arrNew = Array.isArray(v) ? v : [];
        const arrOld = _s.selection;
        if (arrOld.length !== arrNew.length || arrOld.some((x, i) => x !== arrNew[i])) {
          next.selection = arrNew.slice();
          dirty = true;
        }
      } else if (_s[k] !== v) {
        next[k] = v;
        dirty = true;
      }
    }
    if (dirty) {
      _s = next;
      for (const fn of _subs) fn(patch);
    }
  }

  function subscribe(fn) {
    _subs.push(fn);
    return () => {
      const i = _subs.indexOf(fn);
      if (i !== -1) _subs.splice(i, 1);
    };
  }

  return { get, set, subscribe };
}
