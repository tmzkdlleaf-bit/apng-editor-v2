// 그룹 섹션(F2-7) — 자식 수 + 기준점(회전 중심) X·Y 편집. R22b: 그룹 시간(시작 어긋남·속도·범위 밖·안쪽 길이·다시 매기기).
// 그룹의 transform(x,y)이 자식들의 부모 원점(=회전/축척 중심)이다.
// composeTransforms 가 world.x = parent.x + (child.x - parent.x) 라서, 그룹 회전/축척이 없으면
// 기준점(parent.x,y)을 옮겨도 자식 화면 위치는 자동으로 그대로(보정이 수식에 내장). 회전 중심만 바뀐다.
import { makeSectionShell } from './section-shell.js';
import { createNumberField } from '../controls/number-field.js';
import { createDropdown } from '../controls/dropdown.js';
import { iconMarkup } from '../icons.js';

export function createGroupSection(store, editorState) {
  const { section, body } = makeSectionShell('그룹', false);
  let _batch = false;

  const ids = () => { const doc = store.get(); return editorState.get().selection.filter((id) => doc.layers[id]?.type === 'group'); };
  const first = () => { const doc = store.get(); return doc.layers[ids()[0]]; };

  // 자식 수
  const info = document.createElement('div'); info.className = 'info-row';
  const il = document.createElement('span'); il.className = 'info-label'; il.textContent = '자식 수';
  const iv = document.createElement('span'); iv.className = 'info-value';
  info.append(il, iv); body.appendChild(info);

  const sub = document.createElement('div'); sub.className = 'adj-subtitle'; sub.textContent = '기준점 (회전 중심)';
  body.appendChild(sub);

  // 기준점(회전 중심)만 옮긴다 — 자식은 composeTransforms 가 자동으로 제자리에 둔다(회전 없을 때).
  function _movePivot(axis, newVal) {
    const g = first(); if (!g) return;
    const path = axis === 'x' ? 'transform.x' : 'transform.y';
    const cur = g.transform[axis].value ?? 0;
    const delta = newVal - cur;
    if (!delta) return;
    store.preview({ type: 'offsetProp', id: g.id, path, delta });
  }

  const xField = createNumberField({
    label: 'X', min: -9999, max: 9999, step: 1, defaultValue: 0,
    onBegin() { if (_batch) return; _batch = true; store.begin('기준점'); },
    onChange(v) { if (_batch) _movePivot('x', v); },
    onCommit() { _batch = false; store.commit(); },
    onCancel() { _batch = false; store.cancel(); },
  });
  const yField = createNumberField({
    label: 'Y', min: -9999, max: 9999, step: 1, defaultValue: 0,
    onBegin() { if (_batch) return; _batch = true; store.begin('기준점'); },
    onChange(v) { if (_batch) _movePivot('y', v); },
    onCommit() { _batch = false; store.commit(); },
    onCancel() { _batch = false; store.cancel(); },
  });
  const xyRow = document.createElement('div'); xyRow.className = 'prop-row-2'; xyRow.append(xField.el, yField.el);
  body.appendChild(xyRow);

  const note = document.createElement('div'); note.className = 'info-note';
  note.textContent = '기준점을 옮겨도 자식 위치는 그대로입니다(회전/축척 없을 때 정확).';
  body.appendChild(note);

  // ── 시간(R22b) — 단일 그룹 선택일 때 ───────────────────────────────────
  const timeSub = document.createElement('div'); timeSub.className = 'adj-subtitle'; timeSub.textContent = '시간';
  body.appendChild(timeSub);

  // 현재 time(없으면 항등)을 읽어 patch 로 setGroupTime 적용(되돌리기 1건).
  function _applyTime(patch) {
    const g = first(); if (!g) return;
    store.apply({ type: 'setGroupTime', id: g.id, patch });
  }
  // 드래그되는 수치는 begin/preview/commit 로 묶어 되돌리기 1건.
  function _beginTime() { if (_batch) return; _batch = true; store.begin('그룹 시간'); }
  function _previewTime(patch) { const g = first(); if (!g || !_batch) return; store.preview({ type: 'setGroupTime', id: g.id, patch }); }
  function _commitTime() { _batch = false; store.commit(); }
  function _cancelTime() { _batch = false; store.cancel(); }

  const offsetField = createNumberField({
    label: '시작 어긋남', min: -9999, max: 9999, step: 1, unit: 'f', defaultValue: 0,
    onBegin: _beginTime, onChange(v) { _previewTime({ offset: Math.round(v) }); }, onCommit: _commitTime, onCancel: _cancelTime,
  });
  const speedField = createNumberField({
    label: '속도', min: 1, max: 1000, step: 5, unit: '%', defaultValue: 100,
    onBegin: _beginTime, onChange(v) { _previewTime({ speed: Math.max(0.01, v / 100) }); }, onCommit: _commitTime, onCancel: _cancelTime,
  });
  const offRow = document.createElement('div'); offRow.className = 'prop-row-2'; offRow.append(offsetField.el, speedField.el);
  body.appendChild(offRow);

  const outsideRow = document.createElement('div'); outsideRow.className = 'prop-row follow-row';
  const outsideLabel = document.createElement('span'); outsideLabel.className = 'num-label'; outsideLabel.textContent = '범위 밖';
  const outsideDd = createDropdown({
    ariaLabel: '범위 밖 처리',
    options: [{ value: 'hold', label: '끝값 유지' }, { value: 'loop', label: '반복' }, { value: 'hide', label: '숨김' }],
    value: 'hold',
    onChange(v) { _applyTime({ outside: v }); },
  });
  outsideRow.append(outsideLabel, outsideDd.el);
  body.appendChild(outsideRow);

  const lenField = createNumberField({
    label: '안쪽 길이', min: 1, max: 100000, step: 1, unit: 'f', defaultValue: 24,
    onBegin: _beginTime,
    onChange(v) {
      const fc = store.get().meta.frameCount ?? 24;
      // 문서 길이와 같으면 null(문서 길이 따라감)로 저장한다.
      _previewTime({ length: Math.round(v) === fc ? null : Math.max(1, Math.round(v)) });
    },
    onCommit: _commitTime, onCancel: _cancelTime,
  });
  body.appendChild(lenField.el);

  // 시간 다시 매기기(remap) 켜기/끄기 — 켜면 바깥 0→안쪽 0, 바깥 끝→안쪽 길이 키 2개로 시작.
  const remapRow = document.createElement('label'); remapRow.className = 'prop-row blur-row';
  const remapBtn = document.createElement('button'); remapBtn.className = 'quiet sm remap-btn';
  remapBtn.innerHTML = iconMarkup('clock', { size: 14 });
  remapBtn.title = '시간 다시 매기기';
  const remapText = document.createElement('span'); remapText.textContent = '시간 다시 매기기';
  remapRow.append(remapBtn, remapText);
  body.appendChild(remapRow);

  const remapNote = document.createElement('div'); remapNote.className = 'info-note'; remapNote.style.display = 'none';
  remapNote.textContent = '다시 매기기가 켜져 있습니다. 그래프 편집기에서 곡선을 조절하세요.';
  body.appendChild(remapNote);

  remapBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const g = first(); if (!g) return;
    const on = !!(g.time && g.time.remap && g.time.remap.keys && g.time.remap.keys.length);
    if (on) { _applyTime({ remap: null }); return; }
    const fc = store.get().meta.frameCount ?? 24;
    const innerLen = (g.time && g.time.length != null) ? g.time.length : fc;
    const lastOuter = Math.max(1, fc - 1);
    _applyTime({ remap: { value: 0, keys: [
      { f: 0, v: 0, ease: 'linear' },
      { f: lastOuter, v: innerLen, ease: 'linear' },
    ] } });
  });

  function _refresh() {
    if (_batch) return;
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const g = list.length === 1 ? first() : null;
    const n = g ? (g.childOrder ?? []).length : null;
    iv.textContent = n != null ? `${n}개` : '여러 그룹';
    const singleGroup = !!g;
    // 시간 UI 는 단일 그룹에서만
    for (const el of [timeSub, offRow, outsideRow, lenField.el, remapRow]) el.style.display = singleGroup ? '' : 'none';
    if (g) {
      xField.setValue(g.transform.x.value ?? 0); yField.setValue(g.transform.y.value ?? 0);
      const t = g.time ?? {};
      const fc = store.get().meta.frameCount ?? 24;
      offsetField.setValue(t.offset ?? 0);
      speedField.setValue(Math.round((t.speed ?? 1) * 100));
      outsideDd.setValue(t.outside ?? 'hold');
      lenField.setValue(t.length != null ? t.length : fc);
      const remapOn = !!(t.remap && t.remap.keys && t.remap.keys.length);
      remapBtn.classList.toggle('is-on', remapOn);
      remapNote.style.display = remapOn ? '' : 'none';
      // 다시 매기기 중에는 시작 어긋남·속도·범위 밖이 쓰이지 않으므로 흐리게.
      offsetField.el.style.opacity = remapOn ? 0.4 : '';
      speedField.el.style.opacity = remapOn ? 0.4 : '';
      outsideRow.style.opacity = remapOn ? 0.4 : '';
    }
  }

  const unsubStore = store.subscribe({ layers: true }, _refresh);
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });
  _refresh();

  function destroy() { unsubStore(); unsubES(); }
  return { el: section, destroy };
}
