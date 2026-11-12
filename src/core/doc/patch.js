// 패치 기본기 — doc 를 직접 바꾸며 되돌리기용 패치({ path, before, after })를 쌓는다.
//   commands/*.js 의 모든 명령 핸들러가 공유. (R23d item 12: commands.js 에서 떼어냄, 동작 동일)

export function _clone(v) {
  return v === undefined ? undefined : structuredClone(v);
}

export function _get(obj, path) {
  let cur = obj;
  for (const k of path) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

export function _set(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  const last = path[path.length - 1];
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}

// Create patch with current before-value, mutate doc, push to patches
export function _pa(doc, patches, path, after) {
  const before = _clone(_get(doc, path));
  _set(doc, path, _clone(after));
  patches.push({ path, before, after: _clone(after) });
}

export function _orderPath(parentId) {
  return parentId ? ['layers', parentId, 'childOrder'] : ['order'];
}

export function _getOrder(doc, parentId) {
  return parentId ? (doc.layers[parentId]?.childOrder ?? []) : doc.order;
}

// 재귀적으로 layerId의 모든 자손 id를 수집
export function _getAllDescendants(doc, layerId) {
  const result = new Set();
  const stack = [layerId];
  while (stack.length) {
    const cur = stack.pop();
    const layer = doc.layers[cur];
    if (layer?.childOrder) {
      for (const childId of layer.childOrder) {
        if (!result.has(childId)) {
          result.add(childId);
          stack.push(childId);
        }
      }
    }
  }
  return result;
}

// candidateId가 layerId 자신이거나 자손이면 true
export function _isDescendantOrSelf(doc, layerId, candidateId) {
  if (candidateId === null) return false;
  if (candidateId === layerId) return true;
  return _getAllDescendants(doc, layerId).has(candidateId);
}

export function invertPatches(patches) {
  return [...patches].reverse().map(p => ({ path: p.path, before: p.after, after: p.before }));
}

export function applyPatches(doc, patches) {
  for (const p of patches) {
    _set(doc, p.path, _clone(p.after));
  }
}
