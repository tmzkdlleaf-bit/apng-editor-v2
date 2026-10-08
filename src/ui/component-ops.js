// 컴포넌트·인스턴스(F2-5) — 그룹 하나를 여러 번 재사용.
// 렌더(core/render/layers/instance.js)는 이미 마스터 그룹을 참조해 override 적용 후 그린다.
import { createLayer } from '../core/doc/schema.js';
import { showToast } from './shell/status.js';

// 그룹을 컴포넌트로 표시(마스터). 선택된 그룹 하나에.
export function makeComponent(store, editorState) {
  const doc = store.get();
  const id = editorState.get().selection.find((x) => doc.layers[x]?.type === 'group');
  if (!id) { showToast('그룹을 선택하세요.'); return null; }
  if (doc.layers[id].isComponent) { showToast('이미 컴포넌트입니다.'); return id; }
  store.apply({ type: 'setLayer', id, patch: { isComponent: true } });
  return id;
}

// masterId 의 전개가 참조하는 마스터 id 집합(인스턴스를 타고 재귀). 순환 검사용.
export function expansionMasters(doc, groupId, visited = new Set()) {
  const out = new Set();
  const g = doc.layers[groupId];
  if (!g) return out;
  for (const cid of (g.childOrder ?? [])) {
    const c = doc.layers[cid];
    if (!c) continue;
    if (c.type === 'instance' && c.masterId) {
      out.add(c.masterId);
      if (!visited.has(c.masterId)) { visited.add(c.masterId); for (const m of expansionMasters(doc, c.masterId, visited)) out.add(m); }
    } else if (c.type === 'group') {
      for (const m of expansionMasters(doc, cid, visited)) out.add(m);
    }
  }
  return out;
}

// masterId 의 인스턴스를 parentId(그룹) 안에 넣어도 순환이 생기지 않는가?
// 순환: 인스턴스가 자기 마스터의 전개 안에 들어가면(마스터가 자기 자신을 품음) 무한.
export function canPlaceInstance(doc, masterId, parentId) {
  if (!parentId) return true;              // 최상위면 안전
  if (parentId === masterId) return false; // 자기 마스터 안
  // parentId 가 masterId 의 전개 안이면(즉 masterId 안에 parentId 가 있으면) 순환
  const inside = _subtreeIds(doc, masterId);
  if (inside.has(parentId)) return false;
  // parentId 가 속한 어떤 마스터가 masterId 를 전개로 참조하면 순환
  return true;
}
function _subtreeIds(doc, groupId, out = new Set()) {
  const g = doc.layers[groupId]; if (!g) return out;
  for (const cid of (g.childOrder ?? [])) { out.add(cid); if (doc.layers[cid]?.type === 'group') _subtreeIds(doc, cid, out); }
  return out;
}

// 마스터의 인스턴스가 하나라도 있는가(마스터 삭제 확인용).
export function hasInstancesOf(doc, masterId) {
  return Object.values(doc.layers).some((l) => l?.type === 'instance' && l.masterId === masterId);
}

// 인스턴스 추가 — masterId(컴포넌트 그룹)를 참조하는 인스턴스를 최상위에 추가.
export function addInstance(store, editorState, masterId) {
  const doc = store.get();
  const master = doc.layers[masterId];
  if (!master || master.type !== 'group') { showToast('컴포넌트 그룹이 아닙니다.'); return null; }
  if (!master.isComponent) { store.apply({ type: 'setLayer', id: masterId, patch: { isComponent: true } }); }
  if (!canPlaceInstance(store.get(), masterId, null)) { showToast('순환 참조가 되어 추가할 수 없습니다.'); return null; }
  const inst = createLayer('instance', { name: (master.name || '컴포넌트') + ' 인스턴스', masterId, overrides: {} });
  inst.transform.x.value = Math.round(doc.meta.width / 2);
  inst.transform.y.value = Math.round(doc.meta.height / 2);
  store.apply({ type: 'addLayer', layer: inst, index: store.get().order.length });
  editorState.set({ selection: [inst.id] });
  return inst.id;
}
