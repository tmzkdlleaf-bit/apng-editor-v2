// 이펙트 섹션(F4) — 효과 레이어(따로 된 층)의 파라미터·시드·소스 슬롯·범위.
// 파라미터 컨트롤 + 키(시계·마름모·화살표)는 공용 effect-params.js 를 쓴다(효과 쌓기와 공유, R17b).
import { makeSectionShell } from './section-shell.js';
import { createNumberField } from '../controls/number-field.js';
import { createDropdown } from '../controls/dropdown.js';
import { createEffectParams } from './effect-params.js';
import { getEffect } from '../../effects/registry.js';

export function createEffectSection(store, editorState) {
  const { section, body } = makeSectionShell('이펙트', false);
  let _controls = [];
  let _params = null;

  const ids = () => editorState.get().selection.filter((id) => store.get().layers[id]?.type === 'effect');

  function _destroyControls() { for (const c of _controls) c.destroy?.(); _controls = []; _params?.destroy?.(); _params = null; }

  function _setLayer(patch, preview) {
    const list = ids();
    const cmds = list.map((id) => ({ type: 'setLayer', id, patch }));
    if (!cmds.length) return;
    const cmd = cmds.length === 1 ? cmds[0] : { type: 'batch', cmds };
    if (preview) store.preview(cmd); else store.apply(cmd);
  }

  let _builtKey = null;
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
    if (!force && key === _builtKey) { _params?.refresh(); return; }
    _builtKey = key;
    _destroyControls();
    body.textContent = '';
    const effect = getEffect(layer.effectId);
    if (!effect) { body.textContent = '알 수 없는 효과'; return; }

    // 효과 이름
    const nameRow = document.createElement('div'); nameRow.className = 'info-row';
    nameRow.innerHTML = `<span class="info-label">효과</span><span class="info-value">${effect.name}</span>`;
    body.appendChild(nameRow);

    // 프리셋
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

    // 파라미터(공용 조각) — 효과 레이어 자신이 대상(fxId 없음)
    _params = createEffectParams(store, editorState, {
      effectDef: effect,
      targets: () => ids().map((id) => ({ id, fxId: null })),
    });
    body.appendChild(_params.el);

    // 시드
    _sub(body, '시드');
    const seedRow = document.createElement('div'); seedRow.className = 'prop-row';
    const seedField = createNumberField({
      label: '시드', min: 0, max: 999999, step: 1, defaultValue: 1,
      onBegin() {}, onChange() {}, onCommit() {}, onCancel() {},
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

    // 범위(full/box)
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

    // 소스 슬롯
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

    _params.refresh();
  }

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

  const unsubStore = store.subscribe({ layers: true }, () => _rebuild());
  const unsubES = editorState.subscribe((p) => {
    if ('selection' in p) _rebuild();
    else if ('f' in p || 'autoKey' in p) _params?.refresh();
  });
  _rebuild();

  function destroy() { unsubStore(); unsubES(); _destroyControls(); }
  return { el: section, destroy };
}

function _sub(parent, text) { const d = document.createElement('div'); d.className = 'adj-subtitle'; d.textContent = text; parent.appendChild(d); }
function _row(label, ctrl) { const r = document.createElement('div'); r.className = 'prop-row'; const l = document.createElement('label'); l.className = 'num-label'; l.textContent = label; r.append(l, ctrl); return r; }
