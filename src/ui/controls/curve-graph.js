// 커브 그래프 — 작은 사각형에 점 3개(입력 고정, 출력 세로 드래그)를 올려 톤 커브를 조절.
// createCurveGraph({ inputs:[64,128,192], onBegin, onInput(outs), onCommit }) →
//   { el, setOutputs([o1,o2,o3]), getOutputs(), destroy }
// 좌표: 입력 0..255 → x, 출력 0..255 → y(위가 255). 숫자 입력과 함께 쓰라고 출력만 드래그.

const SIZE = 120; // px (정사각형)

export function createCurveGraph({
  inputs = [64, 128, 192],
  onBegin = () => {},
  onInput = () => {},
  onCommit = () => {},
} = {}) {
  let _outs = inputs.slice();
  let _dragIdx = -1;

  const el = document.createElement('div');
  el.className = 'curve-graph';
  const cv = document.createElement('canvas');
  cv.width = SIZE; cv.height = SIZE;
  cv.className = 'curve-canvas';
  el.appendChild(cv);
  const ctx = cv.getContext('2d');

  function _x(v) { return (v / 255) * SIZE; }
  function _y(v) { return SIZE - (v / 255) * SIZE; }

  function _draw() {
    const cs = getComputedStyle(document.documentElement);
    const line = cs.getPropertyValue('--line').trim() || '#333';
    const acc  = cs.getPropertyValue('--acc').trim() || '#f0a35e';
    const dim  = cs.getPropertyValue('--dim').trim() || '#888';
    ctx.clearRect(0, 0, SIZE, SIZE);
    // 격자(대각선 기준)
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, SIZE); ctx.lineTo(SIZE, 0); ctx.stroke();
    // 커브(0,0 → 점3개 → 255,255)
    const pts = [[0, 0], ...inputs.map((ix, i) => [ix, _outs[i]]), [255, 255]];
    ctx.strokeStyle = acc; ctx.lineWidth = 1.5;
    ctx.beginPath();
    pts.forEach((p, i) => { const X = _x(p[0]), Y = _y(p[1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.stroke();
    // 조절점
    ctx.fillStyle = acc;
    inputs.forEach((ix, i) => {
      ctx.beginPath(); ctx.arc(_x(ix), _y(_outs[i]), 4, 0, Math.PI * 2); ctx.fill();
    });
    ctx.fillStyle = dim;
  }

  function _hit(px, py) {
    for (let i = 0; i < inputs.length; i++) {
      const dx = px - _x(inputs[i]), dy = py - _y(_outs[i]);
      if (dx * dx + dy * dy <= 100) return i; // 10px 반경
    }
    return -1;
  }
  function _pos(e) {
    const r = cv.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }

  function _onDown(e) {
    const { px, py } = _pos(e);
    const i = _hit(px, py);
    if (i < 0) return;
    _dragIdx = i;
    cv.setPointerCapture(e.pointerId);
    onBegin();
    e.preventDefault();
  }
  function _onMove(e) {
    if (_dragIdx < 0) return;
    const { py } = _pos(e);
    const v = Math.max(0, Math.min(255, Math.round((1 - py / SIZE) * 255)));
    _outs[_dragIdx] = v;
    _draw();
    onInput(_outs.slice());
  }
  function _onUp(e) {
    if (_dragIdx < 0) return;
    _dragIdx = -1;
    cv.releasePointerCapture?.(e.pointerId);
    onCommit();
  }
  cv.addEventListener('pointerdown', _onDown);
  cv.addEventListener('pointermove', _onMove);
  cv.addEventListener('pointerup', _onUp);
  cv.addEventListener('pointercancel', _onUp);

  function setOutputs(outs) { _outs = outs.slice(0, inputs.length); _draw(); }
  function getOutputs() { return _outs.slice(); }
  function destroy() {
    cv.removeEventListener('pointerdown', _onDown);
    cv.removeEventListener('pointermove', _onMove);
    cv.removeEventListener('pointerup', _onUp);
    cv.removeEventListener('pointercancel', _onUp);
  }

  _draw();
  return { el, setOutputs, getOutputs, destroy };
}
