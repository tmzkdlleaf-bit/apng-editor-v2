// autoKey 규칙에 따라 setProp / offsetProp 명령 생성
// doc은 반드시 store.get() (미리보기 반영된 현재 상태)

import { evalProp } from '../../core/anim/prop.js';

function _getProp(doc, layerId, path) {
  const parts = path.split('.');
  let cur = doc.layers[layerId];
  for (const k of parts) { if (cur == null) return null; cur = cur[k]; }
  return cur ?? null;
}

// newVal: 이 속성에 원하는 절대값
// doc: store.get() 현재 상태 (accumulate된 preview 포함)
export function buildPropCmd(doc, layerId, path, newVal, f, autoKey) {
  const prop = _getProp(doc, layerId, path);
  const hasKeys = !!(prop?.keys?.length);

  if (autoKey) {
    return { type: 'setProp', id: layerId, path, value: newVal, f };
  } else if (!hasKeys) {
    return { type: 'setProp', id: layerId, path, value: newVal };
  } else {
    // autoKey OFF + 키 있음 → offsetProp (delta = newVal - 현재 적용값)
    const base = evalProp(prop, f);
    return { type: 'offsetProp', id: layerId, path, delta: newVal - base };
  }
}

// 드래그 시작 시 evalProp로 보간된 값 읽기 (키프레임 사이에서도 정확)
export function getStartValue(doc, layerId, path, f) {
  const prop = _getProp(doc, layerId, path);
  if (!prop) return 0;
  return evalProp(prop, f);
}
