// 인스펙터 도형 섹션(F1-8) — 종류·너비·높이·채움(단색/선형/방사/없음)·그라디언트·선·둥글기·꼭짓점.
// shape 는 레이어의 중첩 객체 → setLayer { shape } 패치. 드래그는 begin/preview/commit = 되돌리기 1건.
import { makeSectionShell } from './section-shell.js';
import { createNumberField } from '../controls/number-field.js';
import { createDropdown } from '../controls/dropdown.js';
import { createColorField } from '../controls/color-field.js';

const KINDS = [
  { value: 'rect',    label: '사각형' },
  { value: 'ellipse', label: '원/타원' },
  { value: 'line',    label: '선' },
  { value: 'polygon', label: '다각형' },
  { value: 'star',    label: '별' },
];
const FILL_TYPES = [
  { value: 'solid',  label: '단색' },
  { value: 'linear', label: '선형 그라디언트' },
  { value: 'radial', label: '방사형 그라디언트' },
  { value: 'none',   label: '없음' },
];

export function createShapeSection(store, editorState) {
  const { section, body } = makeSectionShell('도형', false);
  let _batch = false;

  const ids = () => {
    const doc = store.get();
    return editorState.get().selection.filter((id) => doc.layers[id]?.type === 'shape');
  };
  function _begin(l) { if (_batch) return; _batch = true; store.begin(l || '도형'); }
  function _commit() { if (!_batch) return; _batch = false; store.commit(); }
  function _cancel() { if (!_batch) return; _batch = false; store.cancel(); }
  function _setShape(partial, preview) {
    const doc = store.get();
    const cmds = ids().map((id) => ({ type: 'setLayer', id, patch: { shape: { ...(doc.layers[id].shape ?? {}), ...partial } } }));
    if (!cmds.length) return;
    const cmd = cmds.length === 1 ? cmds[0] : { type: 'batch', cmds };
    if (preview) store.preview(cmd); else store.apply(cmd);
  }
  const _cur = () => { const doc = store.get(); return doc.layers[ids()[0]]?.shape ?? {}; };

  // ── 종류 ────────────────────────────────────────────────────────────
  const kindDd = createDropdown({
    ariaLabel: '도형 종류', options: KINDS,
    onChange: (v) => { _begin('종류'); _setShape({ kind: v }, true); _commit(); _refresh(); },
  });
  body.appendChild(_row('종류', kindDd.el));

  // ── 너비 · 높이 ─────────────────────────────────────────────────────
  const wField = createNumberField({
    label: 'W', min: 1, max: 4096, step: 1, defaultValue: 100,
    onBegin: () => _begin('도형 크기'), onChange: (v) => { if (_batch) _setShape({ w: v }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const hField = createNumberField({
    label: 'H', min: 1, max: 4096, step: 1, defaultValue: 100,
    onBegin: () => _begin('도형 크기'), onChange: (v) => { if (_batch) _setShape({ h: v }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const whRow = document.createElement('div'); whRow.className = 'prop-row-2'; whRow.append(wField.el, hField.el);
  body.appendChild(whRow);

  // ── 채움 ────────────────────────────────────────────────────────────
  const fillTypeDd = createDropdown({
    ariaLabel: '채움 방식', options: FILL_TYPES,
    onChange: (v) => { _begin('채움'); _applyFillType(v); _commit(); _refresh(); },
  });
  body.appendChild(_row('채움', fillTypeDd.el));

  // 단색 색
  const fillColor = createColorField({
    value: '#5eb8f0',
    onInput: (hex) => { _begin('채움 색'); _setShape({ fill: hex }, true); },
    onChange: (hex) => { _begin('채움 색'); _setShape({ fill: hex }, true); _commit(); },
  });
  const fillColorRow = _row('색', fillColor.el);
  body.appendChild(fillColorRow);

  // 그라디언트: 각도(선형만) + 시작/끝 색 지점
  const gradAngle = createNumberField({
    label: '각도', min: 0, max: 360, step: 1, unit: '°', defaultValue: 0,
    onBegin: () => _begin('그라디언트'), onChange: (v) => { if (_batch) _setGradient({ angle: v }); },
    onCommit: _commit, onCancel: _cancel,
  });
  const gradAngleRow = document.createElement('div'); gradAngleRow.className = 'prop-row'; gradAngleRow.appendChild(gradAngle.el);
  const gradC1 = createColorField({
    value: '#5eb8f0',
    onInput: () => { _begin('그라디언트 색'); _setGradient({}); }, onChange: () => { _begin('그라디언트 색'); _setGradient({}); _commit(); },
  });
  const gradC2 = createColorField({
    value: '#f0a35e',
    onInput: () => { _begin('그라디언트 색'); _setGradient({}); }, onChange: () => { _begin('그라디언트 색'); _setGradient({}); _commit(); },
  });
  const gradC1Row = _row('시작 색', gradC1.el);
  const gradC2Row = _row('끝 색', gradC2.el);
  body.append(gradAngleRow, gradC1Row, gradC2Row);

  // ── 선 ──────────────────────────────────────────────────────────────
  const strokeW = createNumberField({
    label: '선 두께', min: 0, max: 50, step: 0.5, unit: 'px', defaultValue: 0,
    onBegin: () => _begin('선'), onChange: (v) => { if (_batch) _setStroke(v, null); },
    onCommit: _commit, onCancel: _cancel,
  });
  const strokeWRow = document.createElement('div'); strokeWRow.className = 'prop-row'; strokeWRow.appendChild(strokeW.el);
  const strokeColor = createColorField({
    value: '#000000',
    onInput: (hex) => { _begin('선 색'); _setStroke(null, hex); }, onChange: (hex) => { _begin('선 색'); _setStroke(null, hex); _commit(); },
  });
  const strokeCRow = _row('선 색', strokeColor.el);
  body.append(strokeWRow, strokeCRow);

  // ── 둥글기 · 꼭짓점 · 별 안쪽 비율 ──────────────────────────────────
  const radiusField = createNumberField({
    label: '모서리 둥글기', min: 0, max: 400, step: 1, unit: 'px', defaultValue: 0,
    onBegin: () => _begin('둥글기'), onChange: (v) => { if (_batch) _setShape({ radius: v }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const radiusRow = document.createElement('div'); radiusRow.className = 'prop-row'; radiusRow.appendChild(radiusField.el);
  const sidesField = createNumberField({
    label: '꼭짓점 수', min: 3, max: 20, step: 1, defaultValue: 6,
    onBegin: () => _begin('꼭짓점'), onChange: (v) => { if (_batch) _setShape({ sides: Math.round(v) }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const sidesRow = document.createElement('div'); sidesRow.className = 'prop-row'; sidesRow.appendChild(sidesField.el);
  const innerField = createNumberField({
    label: '별 뾰족함', min: 10, max: 90, step: 1, unit: '%', defaultValue: 50,
    onBegin: () => _begin('별'), onChange: (v) => { if (_batch) _setShape({ innerRatio: v / 100 }, true); },
    onCommit: _commit, onCancel: _cancel,
  });
  const innerRow = document.createElement('div'); innerRow.className = 'prop-row'; innerRow.appendChild(innerField.el);
  body.append(radiusRow, sidesRow, innerRow);

  // ── 채움 타입 전환 / 그라디언트 구성 ────────────────────────────────
  function _applyFillType(type) {
    if (type === 'none') { _setShape({ fill: null }, true); return; }
    if (type === 'solid') { _setShape({ fill: fillColor.getValue() || '#5eb8f0' }, true); return; }
    _setGradient({ type }); // linear/radial
  }
  function _setGradient(partial) {
    const cur = _cur().fill;
    const type = partial.type ?? (typeof cur === 'object' && cur ? cur.type : 'linear');
    const angle = partial.angle ?? (typeof cur === 'object' && cur ? (cur.angle ?? 0) : 0);
    _setShape({
      fill: {
        type: type === 'radial' ? 'radial' : 'linear',
        angle,
        stops: [
          { offset: 0, color: gradC1.getValue() || '#5eb8f0' },
          { offset: 1, color: gradC2.getValue() || '#f0a35e' },
        ],
      },
    }, true);
  }
  function _setStroke(width, color) {
    const cur = _cur().stroke ?? {};
    const w = width != null ? width : (cur.width ?? 0);
    const c = color != null ? color : (cur.color ?? '#000000');
    _setShape({ stroke: w > 0 ? { ...cur, width: w, color: c } : null }, true);
  }

  // ── 새로고침 ────────────────────────────────────────────────────────
  function _refresh() {
    if (_batch) return;
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const sh = _cur();
    const kind = sh.kind ?? 'rect';
    kindDd.setValue(kind);
    wField.setValue(sh.w ?? 100);
    hField.setValue(sh.h ?? 100);

    // 채움 타입
    const fill = sh.fill;
    let fillType = 'none';
    if (typeof fill === 'string') fillType = 'solid';
    else if (fill && typeof fill === 'object') fillType = fill.type === 'radial' ? 'radial' : 'linear';
    fillTypeDd.setValue(fillType);
    fillColorRow.style.display = fillType === 'solid' ? '' : 'none';
    const isGrad = fillType === 'linear' || fillType === 'radial';
    gradAngleRow.style.display = fillType === 'linear' ? '' : 'none'; // 각도는 선형만
    gradC1Row.style.display = isGrad ? '' : 'none';
    gradC2Row.style.display = isGrad ? '' : 'none';
    if (fillType === 'solid') fillColor.setValue(fill);
    if (isGrad) {
      gradAngle.setValue(fill.angle ?? 0);
      const stops = fill.stops ?? [];
      if (stops[0]) gradC1.setValue(stops[0].color);
      if (stops[1]) gradC2.setValue(stops[1].color);
    }

    // 선
    const st = sh.stroke ?? {};
    strokeW.setValue(st.width ?? 0);
    strokeColor.setValue(st.color ?? '#000000');
    strokeCRow.style.display = (st.width ?? 0) > 0 ? '' : 'none';

    // 종류별 칸
    radiusRow.style.display = kind === 'rect' ? '' : 'none';
    sidesRow.style.display = (kind === 'polygon' || kind === 'star') ? '' : 'none';
    innerRow.style.display = kind === 'star' ? '' : 'none';
    if (kind === 'rect') radiusField.setValue(sh.radius ?? 0);
    if (kind === 'polygon' || kind === 'star') sidesField.setValue(sh.sides ?? (kind === 'star' ? 5 : 6));
    if (kind === 'star') innerField.setValue(Math.round((sh.innerRatio ?? 0.5) * 100));
  }

  const unsubStore = store.subscribe({ layers: true }, _refresh);
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });
  _refresh();

  function destroy() {
    unsubStore(); unsubES();
    kindDd.destroy(); fillTypeDd.destroy();
    fillColor.destroy(); gradC1.destroy(); gradC2.destroy(); strokeColor.destroy();
  }
  return { el: section, destroy };
}

function _row(labelText, controlEl) {
  const row = document.createElement('div'); row.className = 'prop-row';
  const label = document.createElement('label'); label.className = 'num-label'; label.textContent = labelText;
  row.append(label, controlEl);
  return row;
}
