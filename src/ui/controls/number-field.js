// 숫자 입력 칸 — 레이블 드래그, 방향키, Enter/Esc, 혼합 상태 지원
// onChange(value, info) — info.relative/ info.delta 로 드래그(상대) vs 입력(절대) 구분

export function createNumberField({
  label = '',
  value = 0,
  step = 1,
  min = -Infinity,
  max = Infinity,
  unit = '',
  defaultValue = 0,
  onBegin = () => {},
  onChange = () => {},
  onCommit = () => {},
  onCancel = () => {},
} = {}) {
  const el = document.createElement('span');
  el.className = 'num-field';

  const labelEl = document.createElement('span');
  labelEl.className = 'num-label';
  labelEl.textContent = label;
  labelEl.title = '드래그하여 값 변경';

  const inputEl = document.createElement('input');
  inputEl.type = 'text';
  inputEl.className = 'num-input';
  inputEl.value = _fmt(value);

  const unitEl = document.createElement('span');
  unitEl.className = 'num-unit';
  unitEl.textContent = unit;
  if (!unit) unitEl.style.display = 'none';

  el.appendChild(labelEl);
  el.appendChild(inputEl);
  el.appendChild(unitEl);

  let _current = value;
  let _mixed = false;
  let _dragging = false;
  let _dragStart = null;

  function _clamp(v) { return Math.max(min, Math.min(max, v)); }
  function _fmt(v) { return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '0'; }

  function setValue(v) {
    _mixed = false;
    _current = _clamp(v);
    inputEl.placeholder = '';
    inputEl.value = _fmt(_current);
  }

  // 혼합 상태 (여러 레이어 값이 다름) — base는 드래그 상대 기준값
  function setMixed(base = 0) {
    _mixed = true;
    _current = _clamp(base);
    inputEl.value = '';
    inputEl.placeholder = '혼합';
  }

  function getValue() { return _current; }

  // 레이블 드래그 (상대)
  labelEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    _dragging = false;
    _dragStart = { x: e.clientX, origVal: _current };
    labelEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  labelEl.addEventListener('pointermove', (e) => {
    if (!_dragStart) return;
    const dx = e.clientX - _dragStart.x;
    if (!_dragging && Math.abs(dx) >= 2) { _dragging = true; onBegin(); }
    if (_dragging) {
      const factor = e.shiftKey ? step * 10 : e.altKey ? step * 0.1 : step;
      const newVal = _clamp(_dragStart.origVal + dx * factor);
      const delta  = newVal - _dragStart.origVal;
      _current = newVal;
      _mixed = false;
      inputEl.placeholder = '';
      inputEl.value = _fmt(_current);
      onChange(_current, { relative: true, delta });
    }
  });

  labelEl.addEventListener('pointerup', (e) => {
    if (_dragging) { _dragging = false; _dragStart = null; onCommit(); }
    else { _dragStart = null; }
    labelEl.releasePointerCapture(e.pointerId);
  });

  // 레이블 더블클릭: 기본값 복원 (절대)
  labelEl.addEventListener('dblclick', () => {
    onBegin();
    _current = _clamp(defaultValue);
    _mixed = false;
    inputEl.placeholder = '';
    inputEl.value = _fmt(_current);
    onChange(_current, { relative: false, delta: 0 });
    onCommit();
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const delta = (e.shiftKey ? step * 10 : e.altKey ? step * 0.1 : step) * dir;
      onBegin();
      _current = _clamp(_current + delta);
      _mixed = false;
      inputEl.placeholder = '';
      inputEl.value = _fmt(_current);
      onChange(_current, { relative: true, delta });
      onCommit();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = parseFloat(inputEl.value);
      if (Number.isFinite(v)) {
        onBegin();
        _current = _clamp(v);
        _mixed = false;
        inputEl.placeholder = '';
        inputEl.value = _fmt(_current);
        onChange(_current, { relative: false, delta: 0 });
        onCommit();
      }
      inputEl.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      inputEl.value = _mixed ? '' : _fmt(_current);
      onCancel();
      inputEl.blur();
    }
  });

  inputEl.addEventListener('blur', () => {
    const v = parseFloat(inputEl.value);
    if (Number.isFinite(v)) {
      onBegin();
      _current = _clamp(v);
      _mixed = false;
      inputEl.placeholder = '';
      inputEl.value = _fmt(_current);
      onChange(_current, { relative: false, delta: 0 });
      onCommit();
    } else {
      inputEl.value = _mixed ? '' : _fmt(_current);
    }
  });

  return { el, setValue, setMixed, getValue };
}
