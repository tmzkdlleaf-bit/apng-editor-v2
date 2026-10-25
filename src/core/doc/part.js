// "내 부품"(라이브러리) — 그룹 하위 트리를 떼어내고(collectPart) 새 id 로 복제해 넣기(remapPart). R14-3.
// 순수(DOM 없음). id 바꾸기 규칙은 commands.js duplicateLayers(R2-5)와 동일:
//   자식 parentId·childOrder·인스턴스 masterId·마스크 sourceId·효과 sources[].sourceId 를 복제 범위 안이면 새 id 로.
import { newId } from './schema.js';

// 그룹 rootId 와 모든 자손 레이어를 떼어낸 복제본 + 참조 에셋 id 목록.
export function collectPart(doc, rootId) {
  const layers = {};
  const assetIds = new Set();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    const l = doc.layers?.[id];
    if (!l || layers[id]) continue;
    layers[id] = structuredClone(l);
    if (l.assetId) assetIds.add(l.assetId);
    if (l.mask?.assetId) assetIds.add(l.mask.assetId);
    if (Array.isArray(l.sources)) {
      for (const s of l.sources) { if (typeof s === 'string') assetIds.add(s); else if (s?.assetId) assetIds.add(s.assetId); }
    }
    if (Array.isArray(l.childOrder)) for (const c of l.childOrder) stack.push(c);
  }
  return { layers, rootId, assetIds: [...assetIds] };
}

function _val(p) { return (p && typeof p === 'object') ? (p.value ?? 0) : (p ?? 0); }
function _shift(p, d) {
  if (!p || !d || typeof p !== 'object') return;
  if ('value' in p) p.value = (p.value ?? 0) + d;
  if (Array.isArray(p.keys)) for (const k of p.keys) k.v = (k.v ?? 0) + d;
}

// 부품(part = { layers, rootId })을 새 id 로 복제. center 가 있으면 전체를 그만큼 옮긴다(가운데 배치).
// 반환: { layers:{newId:layer}, rootId:newRoot, idMap }.
export function remapPart(part, { center = null, idGen = () => newId('lyr_') } = {}) {
  const idMap = new Map();
  for (const id of Object.keys(part.layers)) idMap.set(id, idGen());

  const layers = {};
  for (const [origId, orig] of Object.entries(part.layers)) {
    const dup = structuredClone(orig);
    dup.id = idMap.get(origId);
    if (dup.clips?.length) dup.clips = dup.clips.map((c) => ({ ...c, id: newId('clp_') }));
    // 부모: 복제 범위 안이면 새 id, 루트는 최상위로.
    if (origId === part.rootId) dup.parentId = null;
    else if (dup.parentId && idMap.has(dup.parentId)) dup.parentId = idMap.get(dup.parentId);
    if (dup.childOrder?.length) dup.childOrder = dup.childOrder.map((c) => idMap.get(c) ?? c);
    if (dup.masterId && idMap.has(dup.masterId)) dup.masterId = idMap.get(dup.masterId);
    if (dup.mask?.sourceId && idMap.has(dup.mask.sourceId)) dup.mask = { ...dup.mask, sourceId: idMap.get(dup.mask.sourceId) };
    if (Array.isArray(dup.sources)) {
      dup.sources = dup.sources.map((s) => (s?.sourceId && idMap.has(s.sourceId)) ? { ...s, sourceId: idMap.get(s.sourceId) } : s);
    }
    layers[dup.id] = dup;
  }

  const rootId = idMap.get(part.rootId);
  if (center) {
    // 그룹은 x/y 가 "기준점(pivot)"이라 그룹 x 만 바꿔선 자식이 안 움직인다(composeTransforms).
    // → 루트 기준점이 가운데로 가도록, 모든 레이어의 x/y(값·키)를 같은 delta 로 옮긴다.
    const root = layers[rootId];
    const dx = center.x - _val(root?.transform?.x);
    const dy = center.y - _val(root?.transform?.y);
    if (dx || dy) for (const l of Object.values(layers)) { _shift(l.transform?.x, dx); _shift(l.transform?.y, dy); }
  }
  return { layers, rootId, idMap };
}
