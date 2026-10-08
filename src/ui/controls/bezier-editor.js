// 커스텀 베지어 편집기(F3-6) — 그래프에서 제어점 2개 끌기 + 숫자 4개 + 곡선 따라 움직이는 미리보기 점.
// createBezierEditor({ value:[x1,y1,x2,y2], onInput(v), onCommit(v) }) → { el, getValue, setValue, destroy }
import { cubicBezierEval } from '../../core/anim/easing.js';

const SIZE = 160;       // 그래프 변 길이(px)
const PAD = 20;         // 여백(제어점이 밖으로 나가도 보이게)
const PLOT = SIZE - PAD * 2;

export function createBezierEditor({ value = [0.25, 0.1, 0.25, 1.0], onInput = () => {}, onCommit = () => {} } = {}) {
  let _v = value.slice();
  let _drag = -1;
  let _anim = null;

  const el = document.createElement('div');
  el.className = 'bezier-editor';
  const cv = document.createElement('canvas');
  cv.width = SIZE; cv.height = SIZE; cv.className = 'bezier-canvas';
  el.appendChild(cv);
  const ctx = cv.getContext('2d');

  // 숫자 4개
  const inputsWrap = document.createElement('div'); inputsWrap.className = 'bezier-inputs';
  const inputs = [];
  const labels = ['x1', 'y1', 'x2', 'y2'];
  for (let i = 0; i < 4; i++) {
    const inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'bezier-num'; inp.value = String(_v[i]);
    inp.setAttribute('aria-label', labels[i]);
    inp.addEventListener('change', () => {
      const n = parseFloat(inp.value);
      if (Number.isFinite(n)) { _v[i] = i % 2 === 0 ? Math.max(0, Math.min(1, n)) : n; _sync(); onInput(_v.slice()); onCommit(_v.slice()); }
      else inp.value = String(_v[i]);
    });
    inputs.push(inp); inputsWrap.appendChild(inp);
  }
  el.appendChild(inputsWrap);

  // 좌표 변환: 입력 x(0..1)→px, y(보통 0..1이지만 오버슈트 허용)→px(위가 1)
  const toX = (x) => PAD + x * PLOT;
  const toY = (y) => PAD + (1 - y) * PLOT;
  const fromX = (px) => (px - PAD) / PLOT;
  const fromY = (py) => 1 - (py - PAD) / PLOT;

  function _draw() {
    const cs = getComputedStyle(document.documentElement);
    const line = cs.getPropertyValue('--line').trim() || '#333';
    const acc = cs.getPropertyValue('--acc').trim() || '#f0a35e';
    const dim = cs.getPropertyValue('--dim').trim() || '#888';
    ctx.clearRect(0, 0, SIZE, SIZE);
    // 격자(0,0)-(1,1) 박스 + 대각선
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    ctx.strokeRect(toX(0), toY(1), PLOT, PLOT);
    ctx.beginPath(); ctx.moveTo(toX(0), toY(0)); ctx.lineTo(toX(1), toY(1)); ctx.stroke();
    // 제어 손잡이 선
    ctx.strokeStyle = dim; ctx.beginPath();
    ctx.moveTo(toX(0), toY(0)); ctx.lineTo(toX(_v[0]), toY(_v[1]));
    ctx.moveTo(toX(1), toY(1)); ctx.lineTo(toX(_v[2]), toY(_v[3])); ctx.stroke();
    // 베지어 곡선
    ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, y = cubicBezierEval(_v[0], _v[1], _v[2], _v[3], t);
      const X = toX(t), Y = toY(y); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
    }
    ctx.stroke();
    // 제어점
    ctx.fillStyle = acc;
    for (const [cx, cy] of [[_v[0], _v[1]], [_v[2], _v[3]]]) {
      ctx.beginPath(); ctx.arc(toX(cx), toY(cy), 5, 0, Math.PI * 2); ctx.fill();
    }
    // 미리보기 점(곡선 따라 움직임)
    if (_anim != null) {
      const y = cubicBezierEval(_v[0], _v[1], _v[2], _v[3], _anim);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = acc; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(toX(_anim), toY(y), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  function _sync() { inputs.forEach((inp, i) => { inp.value = String(Math.round(_v[i] * 1000) / 1000); }); _draw(); }

  function _pos(e) { const r = cv.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; }
  function _hit(px, py) {
    for (const [i, [cx, cy]] of [[0, [_v[0], _v[1]]], [1, [_v[2], _v[3]]]]) {
      const dx = px - toX(cx), dy = py - toY(cy);
      if (dx * dx + dy * dy <= 100) return i; // 10px
    }
    return -1;
  }
  function _down(e) { const { px, py } = _pos(e); const i = _hit(px, py); if (i < 0) return; _drag = i; cv.setPointerCapture(e.pointerId); e.preventDefault(); }
  function _move(e) {
    if (_drag < 0) return;
    const { px, py } = _pos(e);
    const x = Math.max(0, Math.min(1, fromX(px)));
    const y = fromY(py); // 오버슈트 허용
    if (_drag === 0) { _v[0] = x; _v[1] = y; } else { _v[2] = x; _v[3] = y; }
    _sync(); onInput(_v.slice());
  }
  function _up(e) { if (_drag < 0) return; _drag = -1; cv.releasePointerCapture?.(e.pointerId); onCommit(_v.slice()); }
  cv.addEventListener('pointerdown', _down);
  cv.addEventListener('pointermove', _move);
  cv.addEventListener('pointerup', _up);
  cv.addEventListener('pointercancel', _up);

  // 미리보기 점 애니메이션(곡선 따라 0→1 반복)
  let _raf = null, _t0 = 0;
  function _tick(ts) {
    if (!_t0) _t0 = ts;
    _anim = ((ts - _t0) / 1200) % 1;
    _draw();
    _raf = requestAnimationFrame(_tick);
  }
  _raf = requestAnimationFrame(_tick);

  function getValue() { return _v.slice(); }
  function setValue(v) { _v = v.slice(); _sync(); }
  function destroy() {
    if (_raf) cancelAnimationFrame(_raf);
    cv.removeEventListener('pointerdown', _down);
    cv.removeEventListener('pointermove', _move);
    cv.removeEventListener('pointerup', _up);
    cv.removeEventListener('pointercancel', _up);
  }

  _sync();
  return { el, getValue, setValue, destroy };
}
