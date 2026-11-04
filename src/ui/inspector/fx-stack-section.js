// 효과(쌓기) 섹션(R17b) — 모든 레이어 종류에 효과를 여러 개 쌓는다(애프터 이펙트 "레이어 효과").
// 임시 자리(속성 패널). R23 에서 "효과 컨트롤" 패널로 옮긴다. 단일 선택일 때만 보인다.
import { makeSectionShell } from './section-shell.js';
import { createSliderField } from '../controls/slider-field.js';
import { createNumberField } from '../controls/number-field.js';
import { createEffectParams } from './effect-params.js';
import { openEffectsPanel } from '../shell/panel-actions.js';
import { getEffect } from '../../effects/registry.js';
import { iconMarkup } from '../icons.js';

const FX_TYPES = new Set(['image', 'anim', 'text', 'shape', 'group', 'instance', 'adjust']);

export function createFxStackSection(store, editorState) {
  const { section, body } = makeSectionShell('효과', false);
  const collapsed = new Set();   // 접힌 fxId (UI 상태)
  let _cards = [];               // [{ fxId, params, controls }]
  let _builtKey = null;
  let _dragging = false;         // 섞기 슬라이더 드래그 중 값 동기화 억제

  const curId = () => {
    const sel = editorState.get().selection;
    if (sel.length !== 1) return null;
    const l = store.get().layers[sel[0]];
    return (l && FX_TYPES.has(l.type)) ? sel[0] : null;
  };

  // [+ 효과] 머리
  const head = document.createElement('div'); head.className = 'fx-stack-head';
  const addBtn = document.createElement('button'); addBtn.className = 'accent sm'; addBtn.textContent = '+ 효과';
  addBtn.title = '효과 탭에서 골라 끌어 놓거나 더블클릭하세요';
  addBtn.addEventListener('click', () => {
    // R23b: 가운데 갤러리 창 대신 왼쪽 "효과" 탭을 펼치고 검색 칸에 초점.
    openEffectsPanel('fx');
  });
  head.appendChild(addBtn);
  const listEl = document.createElement('div'); listEl.className = 'fx-stack-list';
  body.append(head, listEl);

  function _destroyCards() { for (const c of _cards) { c.params?.destroy?.(); for (const x of c.controls) x.destroy?.(); } _cards = []; }

  function _structKey(layer) {
    const order = layer.fxOrder ?? [];
    return layer.id + '|' + order.map((fid) => `${fid}:${layer.fx[fid]?.effectId}`).join(',');
  }

  function _rebuild() {
    const id = curId();
    section.style.display = id ? '' : 'none';
    if (!id) { _builtKey = null; _destroyCards(); listEl.textContent = ''; return; }
    const layer = store.get().layers[id];
    const key = _structKey(layer);
    if (key === _builtKey) { _refresh(); return; }
    _builtKey = key;
    _destroyCards();
    listEl.textContent = '';

    const order = layer.fxOrder ?? [];
    if (!order.length) {
      const empty = document.createElement('div'); empty.className = 'fx-stack-empty';
      empty.textContent = '효과 없음. [+ 효과]로 추가하세요.';
      listEl.appendChild(empty);
      return;
    }
    order.forEach((fxId, i) => listEl.appendChild(_makeCard(id, fxId, i, order.length)));
    _refresh();
  }

  function _makeCard(layerId, fxId, index, total) {
    const layer = store.get().layers[layerId];
    const fx = layer.fx[fxId];
    const def = getEffect(fx.effectId);
    const controls = [];

    const card = document.createElement('div'); card.className = 'fx-card'; card.dataset.fxId = fxId;
    const chead = document.createElement('div'); chead.className = 'fx-card-head';

    const enable = document.createElement('input'); enable.type = 'checkbox'; enable.className = 'fx-enable';
    enable.checked = fx.enabled !== false; enable.title = '효과 켜기/끄기';
    enable.addEventListener('change', () => store.apply({ type: 'setFx', id: layerId, fxId, patch: { enabled: enable.checked } }));

    const caret = document.createElement('button'); caret.className = 'fx-caret';
    const isCollapsed = collapsed.has(fxId);
    caret.innerHTML = iconMarkup('chevron', { size: 12 });
    caret.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    caret.title = '펼치기/접기';

    const nameEl = document.createElement('span'); nameEl.className = 'fx-card-name';
    nameEl.textContent = def?.name ?? fx.effectId ?? '효과';

    const up = _iconBtn('prev', '위로', () => store.apply({ type: 'moveFx', id: layerId, fxId, index: Math.max(0, index - 1) }));
    const down = _iconBtn('next', '아래로', () => store.apply({ type: 'moveFx', id: layerId, fxId, index: Math.min(total - 1, index + 1) }));
    up.disabled = index === 0; down.disabled = index === total - 1;
    const dup = _iconBtn('duplicate', '복제', () => store.apply({ type: 'duplicateFx', id: layerId, fxId }));
    const del = _iconBtn('delete', '삭제', () => store.apply({ type: 'removeFx', id: layerId, fxId }));

    chead.append(enable, caret, nameEl, up, down, dup, del);
    card.appendChild(chead);

    const cbody = document.createElement('div'); cbody.className = 'fx-card-body'; cbody.hidden = isCollapsed;
    card.appendChild(cbody);

    const toggleCollapse = () => {
      if (collapsed.has(fxId)) collapsed.delete(fxId); else collapsed.add(fxId);
      const c = collapsed.has(fxId);
      cbody.hidden = c; caret.setAttribute('aria-expanded', c ? 'false' : 'true');
    };
    caret.addEventListener('click', toggleCollapse);
    nameEl.addEventListener('click', toggleCollapse);

    // 파라미터(공용) — 이 fx 가 대상
    let params = null;
    if (def) {
      params = createEffectParams(store, editorState, {
        effectDef: def,
        targets: () => { const l = store.get().layers[layerId]; return (l && l.fx?.[fxId]) ? [{ id: layerId, fxId }] : []; },
      });
      cbody.appendChild(params.el);
    } else {
      const unk = document.createElement('div'); unk.className = 'fx-stack-empty'; unk.textContent = '알 수 없는 효과';
      cbody.appendChild(unk);
    }

    // 섞기(mix) — 0~1
    const mixSf = createSliderField({
      label: '섞기', min: 0, max: 1, step: 0.01, defaultValue: 1,
      onBegin() { _dragging = true; store.begin('섞기'); },
      onChange(v) { store.preview({ type: 'setProp', id: layerId, path: `fx.${fxId}.mix`, value: v }); },
      onCommit() { _dragging = false; store.commit(); }, onCancel() { _dragging = false; store.cancel(); },
    });
    mixSf.setValue(_mixVal(fx));
    const mixRow = document.createElement('div'); mixRow.className = 'prop-row'; mixRow.appendChild(mixSf.el);
    cbody.appendChild(mixRow);
    controls.push(mixSf);

    // 레이어 모양 안에서만(clip)
    const clipRow = document.createElement('div'); clipRow.className = 'prop-row';
    const clipLabel = document.createElement('label'); clipLabel.className = 'fx-check';
    const clipIn = document.createElement('input'); clipIn.type = 'checkbox'; clipIn.checked = fx.clip !== false;
    const clipSpan = document.createElement('span'); clipSpan.textContent = '레이어 모양 안에서만';
    clipLabel.append(clipIn, clipSpan); clipRow.appendChild(clipLabel);
    clipIn.addEventListener('change', () => store.apply({ type: 'setFx', id: layerId, fxId, patch: { clip: clipIn.checked } }));
    cbody.appendChild(clipRow);

    // 무작위 씨앗(seed)
    const seedRow = document.createElement('div'); seedRow.className = 'prop-row';
    const seedField = createNumberField({ label: '씨앗', min: 0, max: 999999, step: 1, defaultValue: 1,
      onBegin() {}, onChange() {}, onCommit() {}, onCancel() {} });
    seedField.setValue(fx.seed ?? 1);
    seedField.el.querySelector('.num-input')?.addEventListener('change', (e) => {
      const v = parseInt(e.target.value, 10); if (Number.isFinite(v)) store.apply({ type: 'setFx', id: layerId, fxId, patch: { seed: v } });
    });
    const regen = document.createElement('button'); regen.className = 'quiet sm'; regen.textContent = '다시';
    regen.addEventListener('click', () => store.apply({ type: 'setFx', id: layerId, fxId, patch: { seed: Math.floor(Math.random() * 1e6) } }));
    seedRow.append(seedField.el, regen);
    cbody.appendChild(seedRow);
    controls.push(seedField);

    _cards.push({ fxId, params, controls, enable, clipIn, mixSf, seedField });
    return card;
  }

  // 컨트롤은 다시 만들지 않고 상태만 갱신(값 프리뷰로 카드가 파괴되지 않게).
  function _refresh() {
    const id = curId(); if (!id) return;
    const layer = store.get().layers[id];
    for (const c of _cards) {
      const fx = layer.fx?.[c.fxId]; if (!fx) continue;
      c.enable.checked = fx.enabled !== false;
      c.clipIn.checked = fx.clip !== false;
      if (!_dragging) c.mixSf.setValue(_mixVal(fx));
      c.seedField.setValue(fx.seed ?? 1);
      c.params?.refresh();
    }
  }

  const unsubStore = store.subscribe({ layers: true }, () => _rebuild());
  const unsubES = editorState.subscribe((p) => {
    if ('selection' in p) _rebuild();
    else if ('f' in p || 'autoKey' in p) _refresh();
  });
  _rebuild();

  function destroy() { unsubStore(); unsubES(); _destroyCards(); }
  return { el: section, destroy };
}

function _mixVal(fx) { const m = fx.mix; return (m && typeof m === 'object') ? (m.value ?? 1) : (m ?? 1); }
function _iconBtn(icon, title, onClick) {
  const b = document.createElement('button'); b.className = 'fx-card-btn'; b.title = title;
  b.setAttribute('aria-label', title); b.innerHTML = iconMarkup(icon, { size: 12 });
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return b;
}
