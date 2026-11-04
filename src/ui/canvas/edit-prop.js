// autoKey 규칙에 따라 setProp / offsetProp 명령 생성
// doc은 반드시 store.get() (미리보기 반영된 현재 상태)

import { evalProp } from '../../core/anim/prop.js';
import { evalPosition } from '../../core/anim/position.js';
import { localFrame } from '../../core/anim/time.js';

function _getProp(doc, layerId, path) {
  const parts = path.split('.');
  let cur = doc.layers[layerId];
  for (const k of parts) { if (cur == null) return null; cur = cur[k]; }
  return cur ?? null;
}

// R18: transform.x/y 는 곡선 경로를 아는 evalPosition 으로 현재값을 구한다(곡선 위에서도 정확).
function _evalAt(doc, layerId, path, f) {
  const layer = doc.layers[layerId];
  if (layer && (path === 'transform.x' || path === 'transform.y')) {
    const p = evalPosition(layer.transform, f);
    return path === 'transform.x' ? p.x : p.y;
  }
  const prop = _getProp(doc, layerId, path);
  return prop ? evalProp(prop, f) : 0;
}

// newVal: 이 속성에 원하는 절대값
// doc: store.get() 현재 상태 (accumulate된 preview 포함)
// f 는 바깥(최상위) 프레임. 그룹 시간이 걸린 레이어면 키는 안쪽 로컬 프레임에 넣는다(R22b).
export function buildPropCmd(doc, layerId, path, newVal, f, autoKey) {
  const prop = _getProp(doc, layerId, path);
  const hasKeys = !!(prop?.keys?.length);
  const lf = localFrame(doc, layerId, f);

  if (autoKey) {
    return { type: 'setProp', id: layerId, path, value: newVal, f: Math.round(lf) };
  } else if (!hasKeys) {
    return { type: 'setProp', id: layerId, path, value: newVal };
  } else {
    // autoKey OFF + 키 있음 → offsetProp (delta = newVal - 현재 적용값)
    const base = _evalAt(doc, layerId, path, lf);
    return { type: 'offsetProp', id: layerId, path, delta: newVal - base };
  }
}

// 드래그 시작 시 보간된 값 읽기 (키프레임 사이·곡선 위에서도 정확). f 는 바깥 프레임 → 안쪽으로 변환.
export function getStartValue(doc, layerId, path, f) {
  return _evalAt(doc, layerId, path, localFrame(doc, layerId, f));
}
