// 숫자 입력 칸 — 레이블 드래그, 방향키, Enter/Esc 지원

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
  hasKeyframe = false,
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

  let _kfEl = null;
  if (hasKeyframe) {
    _kfEl = document.createElement('span');
    _kfEl.className = 'num-kf';
    _kfEl.title = '키프레임';
  }

  el.appendChild(labelEl);
  el.appendChild(inputEl);
  el.appendChild(unitEl);
  if (_kfEl) el.appendChild(_kfEl);

  let _current = value;
  let _dragging = false;
  let _dragStart = null;

  function _clamp(v) {
    return Math.max(min, Math.min(max, v));
  }

  function _fmt(v) {
    return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : '0';
  }

  function setValue(v) {
    _current = _clamp(v);
    inputEl.value = _fmt(_current);
  }

  function getValue() { return _current; }

  // 레이블 드래그
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
    if (!_dragging && Math.abs(dx) >= 2) {
      _dragging = true;
      onBegin();
    }
    if (_dragging) {
      const factor = e.shiftKey ? step * 10 : e.altKey ? step * 0.1 : step;
      const newVal = _clamp(_dragStart.origVal + dx * factor);
      _current = newVal;
      inputEl.value = _fmt(_current);
      onChange(_current);
    }
  });

  labelEl.addEventListener('pointerup', (e) => {
    if (_dragging) {
      _dragging = false;
      _dragStart = null;
      onCommit();
    } else {
      _dragStart = null;
    }
    labelEl.releasePointerCapture(e.pointerId);
  });

  // 레이블 더블클릭: 기본값 복원
  labelEl.addEventListener('dblclick', () => {
    onBegin();
    _current = _clamp(defaultValue);
    inputEl.value = _fmt(_current);
    onChange(_current);
    onCommit();
  });

  // 방향키
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? 1 : -1;
      const delta = e.shiftKey ? step * 10 : e.altKey ? step * 0.1 : step;
      onBegin();
      _current = _clamp(_current + dir * delta);
      inputEl.value = _fmt(_current);
      onChange(_current);
      onCommit();
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = parseFloat(inputEl.value);
      if (Number.isFinite(v)) {
        onBegin();
        _current = _clamp(v);
        inputEl.value = _fmt(_current);
        onChange(_current);
        onCommit();
      }
      inputEl.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      inputEl.value = _fmt(_current);
      onCancel();
      inputEl.blur();
    }
  });

  inputEl.addEventListener('blur', () => {
    const v = parseFloat(inputEl.value);
    if (Number.isFinite(v)) {
      onBegin();
      _current = _clamp(v);
      inputEl.value = _fmt(_current);
      onChange(_current);
      onCommit();
    } else {
      inputEl.value = _fmt(_current);
    }
  });

  return { el, setValue, getValue };
}
