// 텍스처·프레임버퍼 풀(R34a). 렌더 경로에서 새로 만들지 않는다(렌더 규칙 4) — 크기별로 모아 재사용한다.
//   RGBA8(8비트) 텍스처 — CPU(Uint8ClampedArray)와 같은 정밀도라 오차가 커지지 않는다.
//   FBO 는 하나만 두고 쓸 때마다 대상 텍스처를 붙인다(렌더·읽기 공용).

export function createTexturePool(gl) {
  const _slots = new Map(); // "WxH" → tex[]
  const _live = new Set();  // 빌려 나간 텍스처(디버깅·정리용)
  let _created = 0;
  let _fbo = null;

  function _makeTex(w, h) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    _created++;
    return t;
  }

  function borrow(w, h) {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    const key = `${w}x${h}`;
    const slot = _slots.get(key);
    const tex = (slot && slot.length) ? slot.pop() : _makeTex(w, h);
    const obj = { tex, w, h, key };
    _live.add(obj);
    return obj;
  }

  function release(obj) {
    if (!obj) return;
    _live.delete(obj);
    if (!_slots.has(obj.key)) _slots.set(obj.key, []);
    _slots.get(obj.key).push(obj.tex);
  }

  // 대상 텍스처를 FBO 에 붙이고 뷰포트를 맞춘다. 그린 뒤·읽기 전에 쓴다.
  function bindTarget(obj) {
    if (!_fbo) _fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, _fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, obj.tex, 0);
    gl.viewport(0, 0, obj.w, obj.h);
    return _fbo;
  }

  function stats() { return { created: _created, slots: _slots.size, live: _live.size }; }

  function dispose() {
    for (const [, arr] of _slots) for (const t of arr) gl.deleteTexture(t);
    for (const o of _live) gl.deleteTexture(o.tex);
    _slots.clear(); _live.clear();
    if (_fbo) { gl.deleteFramebuffer(_fbo); _fbo = null; }
  }

  return { borrow, release, bindTarget, stats, dispose };
}
