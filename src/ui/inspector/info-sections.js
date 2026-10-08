// 인스펙터 — 움직이는 이미지(anim) 소스 정보 + 재생 설정(F2-1).
import { makeSectionShell } from './section-shell.js';
import { createDropdown } from '../controls/dropdown.js';
import { createNumberField } from '../controls/number-field.js';

function _infoRow(label, value) {
  const row = document.createElement('div'); row.className = 'info-row';
  const l = document.createElement('span'); l.className = 'info-label'; l.textContent = label;
  const v = document.createElement('span'); v.className = 'info-value'; v.textContent = value;
  row.append(l, v); return row;
}
function _row(labelText, controlEl) {
  const row = document.createElement('div'); row.className = 'prop-row';
  const label = document.createElement('label'); label.className = 'num-label'; label.textContent = labelText;
  row.append(label, controlEl); return row;
}

// ── 움직이는 이미지(anim): 소스 정보 + 타이밍(반복/늘이기/1회/유지·속도·오프셋) ──────────
export function createAnimSection(store, editorState) {
  const { section, body } = makeSectionShell('움직이는 이미지', false);
  let _batch = false;
  const ids = () => { const doc = store.get(); return editorState.get().selection.filter((id) => doc.layers[id]?.type === 'anim'); };

  // 소스 정보
  const sizeRow = _infoRow('크기', '-');
  const fcRow = _infoRow('프레임 수', '-');
  const durRow = _infoRow('길이', '-');
  body.append(sizeRow, fcRow, durRow);

  const sub = document.createElement('div'); sub.className = 'adj-subtitle'; sub.textContent = '재생 설정';
  body.appendChild(sub);

  function _setTiming(partial, preview) {
    const doc = store.get();
    const cmds = ids().map((id) => ({ type: 'setLayer', id, patch: { timing: { ...(doc.layers[id].timing ?? {}), ...partial } } }));
    if (!cmds.length) return;
    const cmd = cmds.length === 1 ? cmds[0] : { type: 'batch', cmds };
    if (preview) store.preview(cmd); else store.apply(cmd);
  }

  const modeDd = createDropdown({
    ariaLabel: '재생 모드',
    options: [
      { value: 'loop', label: '반복' }, { value: 'stretch', label: '늘이기' },
      { value: 'once', label: '1회' }, { value: 'hold', label: '유지' },
    ],
    onChange: (v) => { _setTiming({ mode: v }); },
  });
  body.appendChild(_row('모드', modeDd.el));

  const speedField = createNumberField({
    label: '속도', min: 0.1, max: 10, step: 0.1, unit: '×', defaultValue: 1,
    onBegin() { if (_batch) return; _batch = true; store.begin('재생 속도'); },
    onChange(v) { if (_batch) _setTiming({ speed: v }, true); },
    onCommit() { _batch = false; store.commit(); },
    onCancel() { _batch = false; store.cancel(); },
  });
  const speedRow = document.createElement('div'); speedRow.className = 'prop-row'; speedRow.appendChild(speedField.el);
  const offField = createNumberField({
    label: '시작 오프셋', min: -999, max: 999, step: 1, defaultValue: 0,
    onBegin() { if (_batch) return; _batch = true; store.begin('시작 오프셋'); },
    onChange(v) { if (_batch) _setTiming({ offset: Math.round(v) }, true); },
    onCommit() { _batch = false; store.commit(); },
    onCancel() { _batch = false; store.cancel(); },
  });
  const offRow = document.createElement('div'); offRow.className = 'prop-row'; offRow.appendChild(offField.el);
  body.append(speedRow, offRow);

  function _refresh() {
    if (_batch) return;
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const doc = store.get();
    const layer = doc.layers[list[0]];
    const meta = doc.assets?.[layer.assetId];
    const fc = meta?.frameCount ?? null;
    const fps = doc.meta.fps;
    sizeRow.querySelector('.info-value').textContent = meta ? `${meta.width} × ${meta.height}` : '-';
    fcRow.querySelector('.info-value').textContent = fc != null ? `${fc}` : '-';
    durRow.querySelector('.info-value').textContent = meta?.durationMs != null
      ? `${(meta.durationMs / 1000).toFixed(2)}초`
      : (fc != null ? `${(fc / Math.max(1, fps)).toFixed(2)}초` : '-');

    const t = layer.timing ?? {};
    modeDd.setValue(t.mode ?? 'loop');
    speedField.setValue(t.speed ?? 1);
    offField.setValue(t.offset ?? 0);
  }

  const unsubStore = store.subscribe({ layers: true }, _refresh);
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });
  _refresh();
  return { el: section, destroy() { unsubStore(); unsubES(); modeDd.destroy(); } };
}
