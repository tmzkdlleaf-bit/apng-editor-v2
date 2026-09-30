import { newId, createProp, createLayer } from './schema.js';

function _clone(v) {
  return v === undefined ? undefined : structuredClone(v);
}

function _get(obj, path) {
  let cur = obj;
  for (const k of path) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function _set(obj, path, value) {
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
function _pa(doc, patches, path, after) {
  const before = _clone(_get(doc, path));
  _set(doc, path, _clone(after));
  patches.push({ path, before, after: _clone(after) });
}

function _orderPath(parentId) {
  return parentId ? ['layers', parentId, 'childOrder'] : ['order'];
}

function _getOrder(doc, parentId) {
  return parentId ? (doc.layers[parentId]?.childOrder ?? []) : doc.order;
}

// 재귀적으로 layerId의 모든 자손 id를 수집
function _getAllDescendants(doc, layerId) {
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
function _isDescendantOrSelf(doc, layerId, candidateId) {
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

export function applyCommand(doc, cmd) {
  const patches = [];

  switch (cmd.type) {

    case 'setMeta': {
      for (const [k, v] of Object.entries(cmd.patch)) {
        _pa(doc, patches, ['meta', k], v);
      }
      break;
    }

    case 'resizeCanvas': {
      const { width, height, recenter = false } = cmd;
      const oldW = doc.meta.width;
      const oldH = doc.meta.height;
      _pa(doc, patches, ['meta', 'width'], width);
      _pa(doc, patches, ['meta', 'height'], height);
      if (recenter) {
        const dx = (width - oldW) / 2;
        const dy = (height - oldH) / 2;
        if (dx !== 0 || dy !== 0) {
          for (const id of Object.keys(doc.layers)) {
            _pa(doc, patches, ['layers', id, 'transform', 'x', 'value'],
              (doc.layers[id].transform.x.value ?? 0) + dx);
            _pa(doc, patches, ['layers', id, 'transform', 'y', 'value'],
              (doc.layers[id].transform.y.value ?? 0) + dy);
          }
        }
      }
      break;
    }

    case 'addLayer': {
      const { layer, parentId = null, index } = cmd;
      const l = { ...structuredClone(layer), parentId: parentId ?? null };
      const order = _getOrder(doc, parentId);
      const newOrder = [...order];
      const ins = (index !== undefined && index >= 0 && index <= newOrder.length) ? index : newOrder.length;
      newOrder.splice(ins, 0, l.id);
      _pa(doc, patches, ['layers', l.id], l);
      _pa(doc, patches, _orderPath(parentId), newOrder);
      break;
    }

    case 'removeLayers': {
      const { ids } = cmd;
      for (const id of ids) {
        const layer = doc.layers[id];
        if (!layer) continue;
        const parentId = layer.parentId ?? null;
        const order = _getOrder(doc, parentId);

        if (layer.type === 'group' && layer.childOrder?.length) {
          const groupIdx = order.indexOf(id);
          const newOrder = [...order];
          newOrder.splice(groupIdx, 1, ...layer.childOrder);
          for (const childId of layer.childOrder) {
            if (doc.layers[childId]) {
              _pa(doc, patches, ['layers', childId, 'parentId'], parentId);
            }
          }
          _pa(doc, patches, _orderPath(parentId), newOrder);
        } else {
          _pa(doc, patches, _orderPath(parentId), order.filter(i => i !== id));
        }
        _pa(doc, patches, ['layers', id], undefined);
      }
      break;
    }

    case 'moveLayer': {
      const { id, parentId = null, index } = cmd;
      const layer = doc.layers[id];
      if (!layer) break;

      // 자기 자신 또는 자손으로 이동 금지
      if (_isDescendantOrSelf(doc, id, parentId ?? null)) break;

      const oldParentId = layer.parentId ?? null;

      const oldOrder = _getOrder(doc, oldParentId);
      _pa(doc, patches, _orderPath(oldParentId), oldOrder.filter(i => i !== id));

      const curNewOrder = [..._getOrder(doc, parentId)];
      const ins = (index !== undefined && index >= 0 && index <= curNewOrder.length) ? index : curNewOrder.length;
      curNewOrder.splice(ins, 0, id);
      _pa(doc, patches, _orderPath(parentId), curNewOrder);

      if (oldParentId !== (parentId ?? null)) {
        _pa(doc, patches, ['layers', id, 'parentId'], parentId ?? null);
      }
      break;
    }

    case 'setLayer': {
      const { id, patch } = cmd;
      if (!doc.layers[id]) break;
      for (const [k, v] of Object.entries(patch)) {
        _pa(doc, patches, ['layers', id, k], v);
      }
      break;
    }

    case 'setProp': {
      const { id, path: dotPath, value, f, ease = 'linear' } = cmd;
      if (!doc.layers[id]) break;
      const propPath = ['layers', id, ...dotPath.split('.')];
      const prop = _get(doc, propPath);
      if (!prop) break;

      if (f !== undefined) {
        // 키프레임 추가/수정 — value는 건드리지 않음
        const keys = [...(prop.keys ?? [])];
        const idx = keys.findIndex(k => k.f === f);
        if (idx !== -1) keys[idx] = { ...keys[idx], v: value, ease };
        else { keys.push({ f, v: value, ease }); keys.sort((a, b) => a.f - b.f); }
        _pa(doc, patches, [...propPath, 'keys'], keys);
      } else {
        // 정적 값 — 키프레임이 있으면 오류
        if (prop.keys?.length) {
          throw new Error('키프레임이 있는 값은 f를 지정하거나 offsetProp을 사용');
        }
        _pa(doc, patches, [...propPath, 'value'], value);
        if (prop.keys?.length === 0) {
          // 빈 배열이면 그대로 둠 (불필요한 patch 생략)
        }
      }
      break;
    }

    case 'offsetProp': {
      const { id, path: dotPath, delta } = cmd;
      if (!doc.layers[id]) break;
      const propPath = ['layers', id, ...dotPath.split('.')];
      const prop = _get(doc, propPath);
      if (!prop) break;
      if (prop.keys?.length) {
        const keys = prop.keys.map(k => ({ ...k, v: k.v + delta }));
        _pa(doc, patches, [...propPath, 'keys'], keys);
      } else {
        _pa(doc, patches, [...propPath, 'value'], (prop.value ?? 0) + delta);
      }
      break;
    }

    case 'setKey': {
      const { id, path: dotPath, f, v, ease = 'linear' } = cmd;
      if (!doc.layers[id]) break;
      const propPath = ['layers', id, ...dotPath.split('.')];
      const prop = _get(doc, propPath);
      if (!prop) break;
      const keys = [...(prop.keys ?? [])];
      const idx = keys.findIndex(k => k.f === f);
      if (idx !== -1) keys[idx] = { f, v, ease };
      else { keys.push({ f, v, ease }); keys.sort((a, b) => a.f - b.f); }
      _pa(doc, patches, [...propPath, 'keys'], keys);
      break;
    }

    case 'removeKey': {
      const { id, path: dotPath, f } = cmd;
      if (!doc.layers[id]) break;
      const propPath = ['layers', id, ...dotPath.split('.')];
      const prop = _get(doc, propPath);
      if (!prop?.keys) break;
      _pa(doc, patches, [...propPath, 'keys'], prop.keys.filter(k => k.f !== f));
      break;
    }

    case 'moveKeys': {
      const { id, refs, delta } = cmd;
      if (!doc.layers[id] || delta === 0) break;
      const byPath = {};
      for (const ref of refs) (byPath[ref.path] ??= new Set()).add(ref.f);
      for (const [dotPath, fSet] of Object.entries(byPath)) {
        const propPath = ['layers', id, ...dotPath.split('.')];
        const prop = _get(doc, propPath);
        if (!prop?.keys) continue;
        const keys = prop.keys.map(k => fSet.has(k.f) ? { ...k, f: k.f + delta } : k);
        keys.sort((a, b) => a.f - b.f);
        _pa(doc, patches, [...propPath, 'keys'], keys);
      }
      break;
    }

    case 'addClip': {
      const { id, clip } = cmd;
      const layer = doc.layers[id];
      if (!layer) break;
      _pa(doc, patches, ['layers', id, 'clips'], [...(layer.clips ?? []), structuredClone(clip)]);
      break;
    }

    case 'setClip': {
      const { id, clipId, patch } = cmd;
      const layer = doc.layers[id];
      if (!layer) break;
      const clips = (layer.clips ?? []).map(c => c.id === clipId ? { ...c, ...patch } : c);
      _pa(doc, patches, ['layers', id, 'clips'], clips);
      break;
    }

    case 'removeClip': {
      const { id, clipId } = cmd;
      const layer = doc.layers[id];
      if (!layer) break;
      _pa(doc, patches, ['layers', id, 'clips'], (layer.clips ?? []).filter(c => c.id !== clipId));
      break;
    }

    case 'group': {
      const { ids } = cmd;
      if (!ids.length) break;

      // ids 중 다른 id의 자손인 것 제외
      const allDescs = new Set();
      for (const id of ids) {
        for (const d of _getAllDescendants(doc, id)) allDescs.add(d);
      }
      const filteredIds = ids.filter(id => !allDescs.has(id) && doc.layers[id]);
      if (!filteredIds.length) break;

      // 첫 번째 id의 부모 위치에 그룹 삽입
      const firstLayer = doc.layers[filteredIds[0]];
      const insertParentId = firstLayer?.parentId ?? null;
      const insertOrderBefore = [..._getOrder(doc, insertParentId)];
      const insertIdx = insertOrderBefore.indexOf(filteredIds[0]);

      // insertParentId 내에서 insertIdx 앞에 있는 filteredIds 수 (삽입 위치 보정용)
      const removedBefore = filteredIds.filter(id => {
        const pid = doc.layers[id]?.parentId ?? null;
        return pid === insertParentId && insertOrderBefore.indexOf(id) < insertIdx;
      }).length;

      // 각 id를 현재 부모 order에서 제거
      for (const id of filteredIds) {
        const pid = doc.layers[id]?.parentId ?? null;
        const order = _getOrder(doc, pid);
        _pa(doc, patches, _orderPath(pid), order.filter(i => i !== id));
      }

      // 그룹 레이어 생성
      const groupLayer = createLayer('group', {
        name: '그룹',
        parentId: insertParentId ?? null,
        childOrder: [...filteredIds],
      });
      const groupId = groupLayer.id;

      // 보정된 위치에 그룹 삽입
      const adjustedIdx = Math.max(0, insertIdx - removedBefore);
      const curInsertOrder = [..._getOrder(doc, insertParentId)];
      curInsertOrder.splice(adjustedIdx, 0, groupId);
      _pa(doc, patches, _orderPath(insertParentId), curInsertOrder);

      _pa(doc, patches, ['layers', groupId], groupLayer);

      // 자식들의 parentId 갱신
      for (const id of filteredIds) {
        _pa(doc, patches, ['layers', id, 'parentId'], groupId);
      }
      break;
    }

    case 'ungroup': {
      const { groupId } = cmd;
      const group = doc.layers[groupId];
      if (!group || group.type !== 'group') break;
      const parentId = group.parentId ?? null;
      const parentOrder = _getOrder(doc, parentId);
      const groupIdx = parentOrder.indexOf(groupId);
      const childOrder = group.childOrder ?? [];
      const newParentOrder = [...parentOrder];
      newParentOrder.splice(groupIdx, 1, ...childOrder);

      for (const childId of childOrder) {
        if (doc.layers[childId]) _pa(doc, patches, ['layers', childId, 'parentId'], parentId);
      }
      _pa(doc, patches, _orderPath(parentId), newParentOrder);
      _pa(doc, patches, ['layers', groupId], undefined);
      break;
    }

    case 'duplicateLayers': {
      const { ids } = cmd;

      // 전체 복제 대상(원본 + 자손) id 매핑 구축
      const idMap = new Map();

      function collectIds(layerId) {
        if (!doc.layers[layerId] || idMap.has(layerId)) return;
        idMap.set(layerId, newId('lyr_'));
        const l = doc.layers[layerId];
        if (l?.childOrder) {
          for (const childId of l.childOrder) collectIds(childId);
        }
      }
      for (const id of ids) collectIds(id);

      // 각 레이어 복제
      for (const [origId, newLayerId] of idMap) {
        const orig = doc.layers[origId];
        const dup = structuredClone(orig);
        dup.id = newLayerId;

        // 최상위 복제본에만 ' 복사' 추가
        if (ids.includes(origId)) {
          dup.name = orig.name + ' 복사';
        }

        // clips id 재발급 (clp_ 접두사)
        if (dup.clips?.length) {
          dup.clips = dup.clips.map(c => ({ ...c, id: newId('clp_') }));
        }

        // 자손의 parentId를 새 id로 교체
        if (!ids.includes(origId) && dup.parentId && idMap.has(dup.parentId)) {
          dup.parentId = idMap.get(dup.parentId);
        }

        // childOrder를 새 id로 교체
        if (dup.childOrder?.length) {
          dup.childOrder = dup.childOrder.map(cid => idMap.get(cid) ?? cid);
        }

        // mask.sourceId가 복제 범위 안을 가리키면 새 id로 교체
        if (dup.mask?.sourceId && idMap.has(dup.mask.sourceId)) {
          dup.mask = { ...dup.mask, sourceId: idMap.get(dup.mask.sourceId) };
        }

        _pa(doc, patches, ['layers', newLayerId], dup);
      }

      // 최상위 복제본을 원본 바로 뒤에 삽입
      for (const id of ids) {
        if (!idMap.has(id)) continue;
        const layer = doc.layers[id];
        const parentId = layer.parentId ?? null;
        const order = _getOrder(doc, parentId);
        const origIdx = order.indexOf(id);
        const newOrder = [...order];
        newOrder.splice(origIdx + 1, 0, idMap.get(id));
        _pa(doc, patches, _orderPath(parentId), newOrder);
      }
      break;
    }

    case 'batch': {
      for (const subCmd of cmd.cmds) {
        patches.push(...applyCommand(doc, subCmd));
      }
      break;
    }

    default:
      throw new Error(`알 수 없는 명령 타입: ${cmd.type}`);
  }

  return patches;
}
