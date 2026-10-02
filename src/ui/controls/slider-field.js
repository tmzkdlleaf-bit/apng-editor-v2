import { createNumberField } from './number-field.js';

// 슬라이더 + 숫자 칸 조합
export function createSliderField({
  label = '',
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  defaultValue,
  onBegin = () => {},
  onChange = () => {},
  onCommit = () => {},
  onCancel = () => {},
} = {}) {
  const el = document.createElement('span');
  el.className = 'slider-field';

  const sliderEl = document.createElement('input');
  sliderEl.type  = 'range';
  sliderEl.className = 'slider-range';
  sliderEl.min   = String(min);
  sliderEl.max   = String(max);
  sliderEl.step  = String(step);
  sliderEl.value = String(value);

  const numField = createNumberField({
    label, value, step, min, max, unit,
    defaultValue: defaultValue ?? (min + max) / 2,
    onBegin, onCommit, onCancel,
    onChange: (v) => {
      sliderEl.value = String(v);
      onChange(v);
    },
  });

  let _current = value;

  sliderEl.addEventListener('pointerdown', () => { onBegin(); });

  sliderEl.addEventListener('input', () => {
    _current = parseFloat(sliderEl.value);
    numField.setValue(_current);
    onChange(_current);
  });

  sliderEl.addEventListener('pointerup', () => { onCommit(); });

  function setValue(v) {
    _current = Math.max(min, Math.min(max, v));
    sliderEl.value = String(_current);
    numField.setValue(_current);
  }

  function getValue() { return _current; }

  el.appendChild(sliderEl);
  el.appendChild(numField.el);

  return { el, setValue, getValue };
}
