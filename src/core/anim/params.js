// 효과 수치 계산 한 곳(R16-2). DOM 없음 — 렌더(effect.js)·테스트에서 그대로 쓴다.
// 정적 params + paramAnim 키 값을 합쳐 효과 render 에 넘길 객체를 만든다.
//   paramAnim[key] 에 키가 있으면 키 값이 이긴다. 없으면 params[key], 그것도 없으면 정의 default.
//   float 는 min/max 로 막고, int 는 반올림 후 막는다. 그 밖(coord·color·select·bool·text)은 그대로.
import { evalProp } from './prop.js';

function _coerce(pd, v) {
  if (pd.type === 'float' || pd.type === 'int') {
    let n = Number(v);
    if (!Number.isFinite(n)) n = Number(pd.default) || 0;
    if (pd.type === 'int') n = Math.round(n);
    if (pd.min != null) n = Math.max(pd.min, n);
    if (pd.max != null) n = Math.min(pd.max, n);
    return n;
  }
  return v;
}

export function evalEffectParams(layer, effectDef, f) {
  const out = {};
  const defs = effectDef?.params ?? [];
  const params = layer?.params ?? {};
  const anim = layer?.paramAnim ?? {};

  for (const pd of defs) {
    const key = pd.key;
    const a = anim[key];
    let v;
    if (a && Array.isArray(a.keys) && a.keys.length) v = evalProp(a, f);
    else if (key in params) v = params[key];
    else v = pd.default;
    out[key] = _coerce(pd, v);
  }
  // 정의에 없는 사용자 파라미터는 그대로 통과(방어적).
  for (const key of Object.keys(params)) {
    if (!(key in out)) out[key] = params[key];
  }
  return out;
}
