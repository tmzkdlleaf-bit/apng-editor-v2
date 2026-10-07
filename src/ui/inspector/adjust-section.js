// 인스펙터 보정 섹션 — 기본(밝기·대비·채도·색조·흐림) + 고급(레벨·HSL·커브).
// adjust 는 정적 객체(layer.adjust). setLayer 패치로 바꾼다. 슬라이더 드래그는 begin/preview/commit = 되돌리기 1건.
// 렌더는 core/render/adjust.js 가 이미 담당(ctx.filter 미사용, LUT 캐시). 값이 안 바뀌면 재계산 없음.
import { createSliderField } from '../controls/slider-field.js';
import { createNumberField } from '../controls/number-field.js';
import { makeSectionShell } from './section-shell.js';
import { createCurveGraph } from '../controls/curve-graph.js';

// adjust 를 적용할 수 있는 레이어 타입(렌더가 adjust 를 처리하는 것만).
const ADJUST_TYPES = new Set(['image', 'anim']);

// 기본 보정 필드 정의 [key, label, min, max, step, default, unit]
const BASIC = [
  ['brightness', '밝기',   0, 200, 1,   100, '%'],
  ['contrast',   '대비',   0, 200, 1,   100, '%'],
  ['saturation', '채도',   0, 200, 1,   100, '%'],
  ['hue',        '색조',  -180, 180, 1,   0,  '°'],
  ['blur',       '흐림',   0, 20,  0.5, 0,  'px'],
];

export function createAdjustSection(store, editorState) {
  const { section, body } = makeSectionShell('보정', true);

  let _batch = false;

  function _targetIds() {
    const doc = store.get();
    return editorState.get().selection.filter((id) => ADJUST_TYPES.has(doc.layers[id]?.type));
  }
  // partial 을 각 대상 레이어의 adjust 에 병합해 적용. preview=드래그 중.
  function _apply(partial, { preview = false } = {}) {
    const doc = store.get();
    const ids = _targetIds();
    const cmds = ids.map((id) => {
      const cur = doc.layers[id].adjust ?? {};
      const next = _merge(cur, partial);
      return { type: 'setLayer', id, patch: { adjust: next } };
    });
    if (!cmds.length) return;
    const cmd = cmds.length === 1 ? cmds[0] : { type: 'batch', cmds };
    if (preview) store.preview(cmd); else store.apply(cmd);
  }
  function _begin() { if (_batch) return; _batch = true; store.begin('보정'); }
  function _commit() { if (!_batch) return; _batch = false; store.commit(); }
  function _cancel() { if (!_batch) return; _batch = false; store.cancel(); }

  // ── 기본 ────────────────────────────────────────────────────────────
  const basicFields = {};
  for (const [key, label, min, max, step, def, unit] of BASIC) {
    const f = createSliderField({
      label, min, max, step, unit, defaultValue: def,
      onBegin: _begin,
      onChange: (v) => { if (_batch) _apply({ [key]: v }, { preview: true }); },
      onCommit: _commit,
      onCancel: _cancel,
    });
    basicFields[key] = f;
    const row = document.createElement('div'); row.className = 'prop-row';
    row.appendChild(f.el);
    body.appendChild(row);
  }

  // 초기화(기본)
  const resetBasic = document.createElement('button');
  resetBasic.className = 'quiet sm';
  resetBasic.textContent = '기본 보정 초기화';
  resetBasic.addEventListener('click', () => {
    _begin();
    _apply({ brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0 }, { preview: true });
    _commit();
  });
  body.appendChild(resetBasic);

  // ── 고급(접힘) ──────────────────────────────────────────────────────
  const adv = document.createElement('div');
  adv.className = 'adj-advanced';
  const advHead = document.createElement('button');
  advHead.className = 'adj-adv-head';
  advHead.setAttribute('aria-expanded', 'false');
  advHead.textContent = '고급 보정 (레벨 · HSL · 커브)';
  const advBody = document.createElement('div');
  advBody.className = 'adj-adv-body';
  advBody.hidden = true;
  advHead.addEventListener('click', () => {
    advBody.hidden = !advBody.hidden;
    advHead.setAttribute('aria-expanded', advBody.hidden ? 'false' : 'true');
  });
  adv.append(advHead, advBody);
  body.appendChild(adv);

  // 레벨: inBlack/inWhite/gamma/outBlack/outWhite
  const levelFields = {};
  const LEVELS = [
    ['inBlack',  '입력 어두움', 0, 254, 1, 0],
    ['inWhite',  '입력 밝음',  1, 255, 1, 255],
    ['gamma',    '감마',       0.1, 9.9, 0.1, 1],
    ['outBlack', '출력 어두움', 0, 255, 1, 0],
    ['outWhite', '출력 밝음',  0, 255, 1, 255],
  ];
  _subtitle(advBody, '레벨');
  for (const [key, label, min, max, step, def] of LEVELS) {
    const f = createNumberField({
      label, min, max, step, defaultValue: def,
      onBegin: _begin,
      onChange: (v) => { if (_batch) _apply({ levels: { [key]: v } }, { preview: true }); },
      onCommit: _commit, onCancel: _cancel,
    });
    levelFields[key] = f;
    const row = document.createElement('div'); row.className = 'prop-row';
    row.appendChild(f.el); advBody.appendChild(row);
  }

  // HSL: hueShift/saturation/lightness
  const hslFields = {};
  const HSL = [
    ['hueShift',   '색조 이동', -180, 180, 1, 0],
    ['saturation', '채도',      -100, 100, 1, 0],
    ['lightness',  '명도',      -100, 100, 1, 0],
  ];
  _subtitle(advBody, 'HSL');
  for (const [key, label, min, max, step, def] of HSL) {
    const f = createSliderField({
      label, min, max, step, defaultValue: def,
      onBegin: _begin,
      onChange: (v) => { if (_batch) _apply({ hsl: { [key]: v } }, { preview: true }); },
      onCommit: _commit, onCancel: _cancel,
    });
    hslFields[key] = f;
    const row = document.createElement('div'); row.className = 'prop-row';
    row.appendChild(f.el); advBody.appendChild(row);
  }

  // 커브: 어두운/중간/밝은 영역 3점(입력 64/128/192 고정, 출력만 조절) + 그래프
  _subtitle(advBody, '커브');
  const curveInputsX = [64, 128, 192];
  const curve = createCurveGraph({
    inputs: curveInputsX,
    onBegin: _begin,
    onInput: (outs) => { if (_batch) _apply({ curves: { rgb: _curvePoints(curveInputsX, outs) } }, { preview: true }); },
    onCommit: _commit,
  });
  advBody.appendChild(curve.el);
  const curveFields = [];
  for (let i = 0; i < 3; i++) {
    const label = ['어두운', '중간', '밝은'][i];
    const f = createNumberField({
      label, min: 0, max: 255, step: 1, defaultValue: curveInputsX[i],
      onBegin: _begin,
      onChange: (v) => {
        if (!_batch) return;
        const outs = curveFields.map((cf) => cf.getValue());
        outs[i] = v;
        curve.setOutputs(outs);
        _apply({ curves: { rgb: _curvePoints(curveInputsX, outs) } }, { preview: true });
      },
      onCommit: _commit, onCancel: _cancel,
    });
    curveFields.push(f);
    const row = document.createElement('div'); row.className = 'prop-row';
    row.appendChild(f.el); advBody.appendChild(row);
  }

  const resetAdv = document.createElement('button');
  resetAdv.className = 'quiet sm';
  resetAdv.textContent = '고급 보정 초기화';
  resetAdv.addEventListener('click', () => {
    _begin();
    _apply({ levels: null, hsl: null, curves: null }, { preview: true });
    _commit();
  });
  advBody.appendChild(resetAdv);

  // ── 새로고침 ────────────────────────────────────────────────────────
  function _refresh() {
    if (_batch) return;
    const ids = _targetIds();
    section.style.display = ids.length ? '' : 'none';
    if (!ids.length) return;
    const doc = store.get();
    const first = doc.layers[ids[0]].adjust ?? {};

    for (const [key, , , , , def] of BASIC) basicFields[key].setValue(first[key] ?? def);
    const lv = first.levels ?? {};
    for (const [key, , , , , def] of LEVELS) levelFields[key].setValue(lv[key] ?? def);
    const hsl = first.hsl ?? {};
    for (const [key, , , , , def] of HSL) hslFields[key].setValue(hsl[key] ?? def);
    const outs = _curveOuts(first.curves?.rgb, curveInputsX);
    outs.forEach((o, i) => curveFields[i].setValue(o));
    curve.setOutputs(outs);
  }

  const unsubStore = store.subscribe({ layers: true }, _refresh);
  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _refresh(); });
  _refresh();

  function destroy() { unsubStore(); unsubES(); curve.destroy?.(); }
  return { el: section, destroy };
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────
function _subtitle(parent, text) {
  const d = document.createElement('div');
  d.className = 'adj-subtitle';
  d.textContent = text;
  parent.appendChild(d);
}

// partial 을 cur 에 병합. levels/hsl/curves 는 하위 병합. null 이면 키 삭제.
function _merge(cur, partial) {
  const out = { ...cur };
  for (const [k, v] of Object.entries(partial)) {
    if (v === null) { delete out[k]; continue; }
    if ((k === 'levels' || k === 'hsl' || k === 'curves') && typeof v === 'object') {
      out[k] = { ...(cur[k] ?? {}), ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}

// 출력값 배열 → [[in,out]] 커브 포인트(끝점 0,0 / 255,255 포함)
function _curvePoints(inputs, outs) {
  const pts = [[0, 0]];
  for (let i = 0; i < inputs.length; i++) pts.push([inputs[i], Math.round(outs[i])]);
  pts.push([255, 255]);
  return pts;
}
// 커브 points 에서 입력 64/128/192 의 출력값 추출(없으면 입력=출력)
function _curveOuts(rgb, inputs) {
  if (!Array.isArray(rgb)) return inputs.slice();
  return inputs.map((x) => {
    const p = rgb.find((q) => q[0] === x);
    return p ? p[1] : x;
  });
}
