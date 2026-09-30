import { newId, createProp } from './schema.js';

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
          // Promote children to group's position in parent order
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

      const oldParentId = layer.parentId ?? null;

      // Remove from old parent order
      const oldOrder = _getOrder(doc, oldParentId);
      _pa(doc, patches, _orderPath(oldParentId), oldOrder.filter(i => i !== id));

      // Add to new parent order (reads current state after removal above)
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
        const keys = [...(prop.keys ?? [])];
        const idx = keys.findIndex(k => k.f === f);
        if (idx !== -1) keys[idx] = { ...keys[idx], v: value, e: ease };
        else { keys.push({ f, v: value, e: ease }); keys.sort((a, b) => a.f - b.f); }
        _pa(doc, patches, [...propPath, 'keys'], keys);
        _pa(doc, patches, [...propPath, 'value'], value);
      } else {
        _pa(doc, patches, [...propPath, 'value'], value);
        if (prop.keys?.length) {
          _pa(doc, patches, [...propPath, 'keys'], []);
        }
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
      if (idx !== -1) keys[idx] = { f, v, e: ease };
      else { keys.push({ f, v, e: ease }); keys.sort((a, b) => a.f - b.f); }
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
      const parentId = doc.layers[ids[0]]?.parentId ?? null;
      const parentOrder = _getOrder(doc, parentId);
      const indices = ids.map(id => parentOrder.indexOf(id)).filter(i => i >= 0);
      if (!indices.length) break;
      const minIdx = Math.min(...indices);
      const groupId = newId('lyr_');
      const newParentOrder = parentOrder.filter(id => !ids.includes(id));
      newParentOrder.splice(minIdx, 0, groupId);

      const groupLayer = {
        id: groupId, type: 'group', name: '그룹',
        parentId: parentId ?? null,
        visible: true, locked: false, blend: 'normal', opacity: 1,
        transform: {
          x: createProp(0), y: createProp(0),
          scale: createProp(1), rotation: createProp(0), alpha: createProp(1),
        },
        anchor: { x: 0.5, y: 0.5 },
        clips: [], mask: null, adjust: null, tint: null, outline: null, exit: null,
        childOrder: [...ids], isComponent: false,
      };

      _pa(doc, patches, ['layers', groupId], groupLayer);
      _pa(doc, patches, _orderPath(parentId), newParentOrder);
      for (const id of ids) {
        if (doc.layers[id]) _pa(doc, patches, ['layers', id, 'parentId'], groupId);
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
      for (const id of ids) {
        const layer = doc.layers[id];
        if (!layer) continue;
        const dup = structuredClone(layer);
        dup.id = newId('lyr_');
        dup.name = layer.name + ' 복사';
        if (dup.clips?.length) {
          dup.clips = dup.clips.map(c => ({ ...c, id: newId('clip_') }));
        }
        const parentId = layer.parentId ?? null;
        const order = _getOrder(doc, parentId);
        const origIdx = order.indexOf(id);
        const newOrder = [...order];
        newOrder.splice(origIdx + 1, 0, dup.id);
        _pa(doc, patches, ['layers', dup.id], dup);
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
