// 이펙트 섹션(F4) — 파라미터 자동 생성(2) · 시드(3) · 소스 슬롯(5) · 범위(6).
// 마스크(4)는 F1 트랙 매트 섹션이 'effect' 타입도 처리(소스 고르기 UI 공유).
import { makeSectionShell } from './section-shell.js';
import { createSliderField } from '../controls/slider-field.js';
import { createNumberField } from '../controls/number-field.js';
import { createColorField } from '../controls/color-field.js';
import { createDropdown } from '../controls/dropdown.js';
import { getEffect } from '../../effects/registry.js';

export function createEffectSection(store, editorState) {
  const { section, body } = makeSectionShell('이펙트', false);
  let _controls = [];

  const ids = () => editorState.get().selection.filter((id) => store.get().layers[id]?.type === 'effect');

  function _destroyControls() { for (const c of _controls) c.destroy?.(); _controls = []; }

  function _setLayer(patch, preview) {
    const list = ids();
    const cmds = list.map((id) => ({ type: 'setLayer', id, patch }));
    if (!cmds.length) return;
    const cmd = cmds.length === 1 ? cmds[0] : { type: 'batch', cmds };
    if (preview) store.preview(cmd); else store.apply(cmd);
  }
  function _setParam(key, value, preview) {
    const doc = store.get();
    const cmds = ids().map((id) => ({ type: 'setLayer', id, patch: { params: { ...(doc.layers[id].params ?? {}), [key]: value } } }));
    if (!cmds.length) return;
    const cmd = cmds.length === 1 ? cmds[0] : { type: 'batch', cmds };
    if (preview) store.preview(cmd); else store.apply(cmd);
  }

  let _builtKey = null;
  // 컨트롤 집합이 바뀌는 경우(선택·효과·범위·박스 유무)만 재빌드. 파라미터 '값' 변경(preview)으로는
  // 재빌드하지 않는다 — 드래그 중 컨트롤이 파괴되는 걸 막는다.
  function _buildKey(list, layer) {
    if (list.length !== 1) return list.length ? 'multi:' + list.join(',') : 'none';
    return `${list[0]}:${layer.effectId}:${layer.scope ?? 'full'}:${layer.box ? 1 : 0}`;
  }

  function _rebuild(force = false) {
    const list = ids();
    section.style.display = list.length ? '' : 'none';
    if (!list.length) { _builtKey = null; _destroyControls(); body.textContent = ''; return; }
    const doc = store.get();
    const layer = doc.layers[list[0]];
    const key = _buildKey(list, layer);
    if (!force && key === _builtKey) return; // 값만 바뀐 경우 — 컨트롤 유지
    _builtKey = key;
    _destroyControls();
    body.textContent = '';
    const effect = getEffect(layer.effectId);
    if (!effect) { body.textContent = '알 수 없는 효과'; return; }

    // 효과 이름
    const nameRow = document.createElement('div'); nameRow.className = 'info-row';
    nameRow.innerHTML = `<span class="info-label">효과</span><span class="info-value">${effect.name}</span>`;
    body.appendChild(nameRow);

    // 프리셋(모양 묶음) — 맨 위 드롭다운. 고르면 파라미터 값이 채워지고, 바꾸면 "(수정됨)".
    if ((effect.presets ?? []).length) {
      const _modified = (pr) => pr && Object.entries(pr.values ?? {}).some(([k, v]) => (layer.params ?? {})[k] !== v);
      const curPr = effect.presets.find((p) => p.id === layer.preset);
      const presetDd = createDropdown({
        ariaLabel: '프리셋', value: layer.preset ?? '',
        options: [{ value: '', label: '(기본)' }, ...effect.presets.map((p) => ({
          value: p.id, label: p.label + (p.id === layer.preset && _modified(curPr) ? ' (수정됨)' : ''),
        }))],
        onChange: (v) => {
          const pr = effect.presets.find((p) => p.id === v);
          if (pr) _setLayer({ preset: v, params: { ...(layer.params ?? {}), ...pr.values } });
          else _setLayer({ preset: '' });
          _rebuild(true);
        },
      });
      body.appendChild(_row('프리셋', presetDd.el));
      _controls.push(presetDd);
    }

    // ── 파라미터(자동 생성) — advanced 는 고급 접힘 안에 ──────────────
    const basicWrap = document.createElement('div');
    const advBody = document.createElement('div'); advBody.className = 'adj-adv-body'; advBody.hidden = true;
    body.appendChild(basicWrap);
    for (const pd of (effect.params ?? [])) {
      const target = pd.advanced ? advBody : basicWrap;
      target.appendChild(_makeParamControl(layer, pd));
    }
    if ((effect.params ?? []).some((p) => p.advanced)) {
      const advHead = document.createElement('button'); advHead.className = 'adj-adv-head';
      advHead.setAttribute('aria-expanded', 'false'); advHead.textContent = '고급';
      advHead.addEventListener('click', () => { advBody.hidden = !advBody.hidden; advHead.setAttribute('aria-expanded', advBody.hidden ? 'false' : 'true'); });
      body.append(advHead, advBody);
    }

    // ── 시드 ────────────────────────────────────────────────────────────
    _sub(body, '시드');
    const seedRow = document.createElement('div'); seedRow.className = 'prop-row';
    const seedField = createNumberField({
      label: '시드', min: 0, max: 999999, step: 1, defaultValue: 1,
      onBegin() {}, onChange() {},
      onCommit() {}, onCancel() {},
    });
    seedField.setValue(layer.seed ?? 0);
    seedField.el.querySelector('.num-input')?.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) _setLayer({ seed: v });
    });
    const regenBtn = document.createElement('button'); regenBtn.className = 'quiet sm'; regenBtn.textContent = '다시 생성';
    regenBtn.addEventListener('click', () => { _setLayer({ seed: (Math.floor(Math.random() * 1e6)) }); _rebuild(true); });
    seedRow.append(seedField.el, regenBtn);
    body.appendChild(seedRow);
    _controls.push(seedField);

    // ── 범위(full/box) ─────────────────────────────────────────────────
    if ((effect.scopes ?? ['full']).includes('box')) {
      _sub(body, '범위');
      const scopeDd = createDropdown({
        ariaLabel: '범위', value: layer.scope ?? 'full',
        options: [{ value: 'full', label: '화면 전체' }, { value: 'box', label: '박스' }],
        onChange: (v) => { _setLayer({ scope: v, ...(v === 'box' && !layer.box ? { box: { w: 200, h: 200 } } : {}) }); _rebuild(); },
      });
      body.appendChild(_row('범위', scopeDd.el));
      _controls.push(scopeDd);
      if ((layer.scope ?? 'full') === 'box') {
        const bw = createNumberField({ label: 'W', min: 1, max: 4096, step: 1, defaultValue: 200,
          onBegin() { store.begin('박스'); }, onChange(v) { _setLayer({ box: { ...(store.get().layers[list[0]].box ?? {}), w: Math.round(v) } }, true); },
          onCommit() { store.commit(); }, onCancel() { store.cancel(); } });
        const bh = createNumberField({ label: 'H', min: 1, max: 4096, step: 1, defaultValue: 200,
          onBegin() { store.begin('박스'); }, onChange(v) { _setLayer({ box: { ...(store.get().layers[list[0]].box ?? {}), h: Math.round(v) } }, true); },
          onCommit() { store.commit(); }, onCancel() { store.cancel(); } });
        bw.setValue(layer.box?.w ?? 200); bh.setValue(layer.box?.h ?? 200);
        const r = document.createElement('div'); r.className = 'prop-row-2'; r.append(bw.el, bh.el); body.appendChild(r);
        _controls.push(bw, bh);
      }
    }

    // ── 소스 슬롯 ───────────────────────────────────────────────────────
    if ((effect.sources ?? []).length) {
      _sub(body, '소스');
      for (const sdef of effect.sources) {
        const dd = createDropdown({
          ariaLabel: sdef.label, options: _sourceCandidates(layer.id),
          value: (layer.sources ?? []).find((s) => s.key === sdef.key)?.sourceId ?? '',
          onChange: (v) => _setSource(sdef.key, v || null),
        });
        body.appendChild(_row(sdef.label, dd.el));
        _controls.push(dd);
      }
    }
  }

  function _makeParamControl(layer, pd) {
    const val = (layer.params ?? {})[pd.key] ?? pd.default;
    if (pd.type === 'bool') {
      const row = document.createElement('div'); row.className = 'prop-row';
      const label = document.createElement('label'); label.className = 'fx-check';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!val;
      const span = document.createElement('span'); span.textContent = pd.label;
      label.append(input, span); row.appendChild(label);
      input.addEventListener('change', () => _setParam(pd.key, input.checked));
      return row;
    }
    if (pd.type === 'color') {
      const cf = createColorField({ value: val || '#ffffff',
        onInput: (hex) => { store.begin('파라미터'); _setParam(pd.key, hex, true); },
        onChange: (hex) => { store.begin('파라미터'); _setParam(pd.key, hex, true); store.commit(); } });
      _controls.push(cf);
      return _row(pd.label, cf.el);
    }
    if (pd.type === 'select') {
      const dd = createDropdown({ ariaLabel: pd.label, value: String(val),
        options: (pd.options ?? []).map((o) => ({ value: String(o.value), label: o.label })),
        onChange: (v) => _setParam(pd.key, v) });
      _controls.push(dd);
      return _row(pd.label, dd.el);
    }
    if (pd.type === 'coord') {
      const cv = (typeof val === 'object' && val) ? val : { x: 0.5, y: 0.5 };
      const fx = createNumberField({ label: 'X', min: 0, max: 1, step: 0.01, defaultValue: 0.5,
        onBegin() { store.begin('좌표'); }, onChange(v) { _setParam(pd.key, { ...(store.get().layers[ids()[0]].params?.[pd.key] ?? cv), x: v }, true); },
        onCommit() { store.commit(); }, onCancel() { store.cancel(); } });
      const fy = createNumberField({ label: 'Y', min: 0, max: 1, step: 0.01, defaultValue: 0.5,
        onBegin() { store.begin('좌표'); }, onChange(v) { _setParam(pd.key, { ...(store.get().layers[ids()[0]].params?.[pd.key] ?? cv), y: v }, true); },
        onCommit() { store.commit(); }, onCancel() { store.cancel(); } });
      fx.setValue(cv.x ?? 0.5); fy.setValue(cv.y ?? 0.5);
      _controls.push(fx, fy);
      const wrap = document.createElement('div'); wrap.className = 'prop-row';
      const label = document.createElement('label'); label.className = 'num-label'; label.textContent = pd.label;
      const grp = document.createElement('div'); grp.className = 'prop-row-2'; grp.style.flex = '1'; grp.append(fx.el, fy.el);
      wrap.append(label, grp);
      return wrap;
    }
    // int / float → 슬라이더
    const sf = createSliderField({
      label: pd.label, min: pd.min ?? 0, max: pd.max ?? (pd.type === 'int' ? 100 : 1),
      step: pd.step ?? (pd.type === 'int' ? 1 : 0.01), defaultValue: pd.default,
      onBegin() { store.begin('파라미터'); },
      onChange(v) { _setParam(pd.key, pd.type === 'int' ? Math.round(v) : v, true); },
      onCommit() { store.commit(); }, onCancel() { store.cancel(); },
    });
    sf.setValue(val);
    _controls.push(sf);
    const row = document.createElement('div'); row.className = 'prop-row'; row.appendChild(sf.el);
    return row;
  }

  // 소스 후보 — 자기 자신·자기 조상 제외
  function _sourceCandidates(selfId) {
    const doc = store.get();
    const anc = new Set(); let cur = doc.layers[selfId]?.parentId ?? null;
    while (cur) { anc.add(cur); cur = doc.layers[cur]?.parentId ?? null; }
    const out = [{ value: '', label: '(없음)' }];
    const walk = (id) => { const ly = doc.layers[id]; if (!ly) return; if (id !== selfId && !anc.has(id)) out.push({ value: id, label: ly.name || ly.type }); for (const c of (ly.childOrder ?? [])) walk(c); };
    for (const id of doc.order) walk(id);
    return out;
  }
  function _setSource(key, sourceId) {
    const doc = store.get();
    const cmds = ids().map((id) => {
      const srcs = (doc.layers[id].sources ?? []).filter((s) => s.key !== key);
      if (sourceId) srcs.push({ key, sourceId });
      return { type: 'setLayer', id, patch: { sources: srcs } };
    });
    store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  }

  const unsubStore = store.subscribe({ layers: true }, _rebuild);
  const unsubES = editorState.subscribe((p) => { if ('selection' in p) _rebuild(); });
  _rebuild();

  function destroy() { unsubStore(); unsubES(); _destroyControls(); }
  return { el: section, destroy };
}

function _sub(parent, text) { const d = document.createElement('div'); d.className = 'adj-subtitle'; d.textContent = text; parent.appendChild(d); }
function _row(label, ctrl) { const r = document.createElement('div'); r.className = 'prop-row'; const l = document.createElement('label'); l.className = 'num-label'; l.textContent = label; r.append(l, ctrl); return r; }
