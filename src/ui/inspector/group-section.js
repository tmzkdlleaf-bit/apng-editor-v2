// 그룹 섹션(F2-7) — 자식 수 + 기준점(회전 중심) X·Y 편집.
// 그룹의 transform(x,y)이 자식들의 부모 원점(=회전/축척 중심)이다.
// composeTransforms 가 world.x = parent.x + (child.x - parent.x) 라서, 그룹 회전/축척이 없으면
// 기준점(parent.x,y)을 옮겨도 자식 화면 위치는 자동으로 그대로(보정이 수식에 내장). 회전 중심만 바뀐다.
import { makeSectionShell } from './section-shell.js';
import { createNumberField } from '../controls/number-field.js';

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

  function _refresh() {
    if (_batch) return;
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const g = list.length === 1 ? first() : null;
    const n = g ? (g.childOrder ?? []).length : null;
    iv.textContent = n != null ? `${n}개` : '여러 그룹';
    if (g) { xField.setValue(g.transform.x.value ?? 0); yField.setValue(g.transform.y.value ?? 0); }
  }

  const unsubStore = store.subscribe({ layers: true }, _refresh);
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });
  _refresh();

  function destroy() { unsubStore(); unsubES(); }
  return { el: section, destroy };
}
