// 인스턴스 섹션(F2-5) — 마스터 정보 + 자식별 표시/불투명도 override.
// override 는 layer.overrides[childId] = { visible?, opacity? }. 렌더는 instance.js 가 적용.
import { makeSectionShell } from './section-shell.js';
import { createSliderField } from '../controls/slider-field.js';

export function createInstanceSection(store, editorState) {
  const { section, body } = makeSectionShell('인스턴스', false);
  let _sliders = [];

  const ids = () => { const doc = store.get(); return editorState.get().selection.filter((id) => doc.layers[id]?.type === 'instance'); };

  function _setOverride(instId, childId, partial) {
    const doc = store.get();
    const inst = doc.layers[instId];
    const overrides = { ...(inst.overrides ?? {}) };
    const cur = { ...(overrides[childId] ?? {}) };
    Object.assign(cur, partial);
    // 둘 다 기본값이면 override 제거
    if (cur.visible === undefined && cur.opacity === undefined) delete overrides[childId];
    else overrides[childId] = cur;
    store.apply({ type: 'setLayer', id: instId, patch: { overrides } });
  }

  function _refresh() {
    for (const s of _sliders) s.destroy?.();
    _sliders = [];
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) return;
    const doc = store.get();
    const inst = doc.layers[list[0]];
    const master = doc.layers[inst.masterId];
    body.textContent = '';

    const info = document.createElement('div'); info.className = 'info-row';
    const il = document.createElement('span'); il.className = 'info-label'; il.textContent = '마스터';
    const iv = document.createElement('span'); iv.className = 'info-value'; iv.textContent = master ? (master.name || '컴포넌트') : '(없음)';
    info.append(il, iv); body.appendChild(info);

    if (!master || master.type !== 'group') return;

    const sub = document.createElement('div'); sub.className = 'adj-subtitle'; sub.textContent = '자식별 덮어쓰기';
    body.appendChild(sub);

    for (const childId of (master.childOrder ?? [])) {
      const child = doc.layers[childId];
      if (!child) continue;
      const ov = (inst.overrides ?? {})[childId] ?? {};

      const row = document.createElement('div'); row.className = 'prop-row inst-child-row';
      // 표시 체크박스
      const vis = document.createElement('label'); vis.className = 'fx-check';
      const cb = document.createElement('input'); cb.type = 'checkbox';
      cb.checked = ov.visible !== undefined ? ov.visible : (child.visible !== false);
      const nm = document.createElement('span'); nm.textContent = child.name || child.type;
      vis.append(cb, nm);
      cb.addEventListener('change', () => _setOverride(list[0], childId, { visible: cb.checked }));
      row.appendChild(vis);
      body.appendChild(row);

      // 불투명도 슬라이더(override)
      const opRow = document.createElement('div'); opRow.className = 'prop-row';
      const baseOp = Math.round(((ov.opacity !== undefined ? ov.opacity : (child.opacity ?? 1))) * 100);
      const sf = createSliderField({
        label: '투명도', min: 0, max: 100, step: 1, unit: '%', defaultValue: 100,
        onBegin() {}, onChange() {},
        onCommit() {}, onCancel() {},
      });
      sf.setValue(baseOp);
      // 즉시 적용(단순): 값 바뀌면 override 반영
      sf.el.querySelector('input[type="range"]')?.addEventListener('change', (e) => {
        _setOverride(list[0], childId, { opacity: parseFloat(e.target.value) / 100 });
      });
      opRow.appendChild(sf.el);
      body.appendChild(opRow);
      _sliders.push(sf);
    }
  }

  const unsubStore = store.subscribe({ layers: true }, _refresh);
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });
  _refresh();

  function destroy() { unsubStore(); unsubES(); for (const s of _sliders) s.destroy?.(); }
  return { el: section, destroy };
}
