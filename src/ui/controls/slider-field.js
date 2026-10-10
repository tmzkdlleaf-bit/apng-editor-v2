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

  // 여러 레이어 값이 다를 때: 숫자 칸은 '혼합' 표시, 슬라이더는 base 위치.
  function setMixed(base = 0) {
    _current = Math.max(min, Math.min(max, base));
    sliderEl.value = String(_current);
    numField.setMixed(base);
  }

  function getValue() { return _current; }

  // 레이아웃: [라벨][슬라이더][숫자][단위] — 다른 섹션(숫자 칸)과 같은 "라벨 왼쪽" 정렬.
  //   number-field 의 라벨/입력/단위를 꺼내 격자에 다시 배치(드래그·키 리스너는 각 요소에 붙어 있어 그대로 동작).
  const labelEl = numField.el.querySelector('.num-label');
  const inputEl = numField.el.querySelector('.num-input');
  const unitEl  = numField.el.querySelector('.num-unit');
  el.append(labelEl, sliderEl, inputEl, unitEl);

  return { el, setValue, setMixed, getValue };
}
