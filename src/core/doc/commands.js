import { newId, createProp, createLayer, createFx } from './schema.js';
import { evalProp } from '../anim/prop.js';
import { localWithFollow } from '../anim/world.js';

// ── R20-B 따라가기 연결/해제: 화면 위치 유지(keepPlace) ─────────────────────
// P = 대상의 그룹-로컬 변형. connect 는 자기 로컬을 P 의 역변환(=P 로컬 공간)으로,
// disconnect 는 compose(P, 자기) 를 구워 standalone 값으로 만든다.
//   한계(보고): P 는 연결 프레임 하나로 굳힌 상수라, 대상이 애니메이션하면 다른 프레임에서는 어긋날 수 있다
//   (애프터 이펙트와 같은 방식). 위치 키가 x·y 서로 다른 프레임에 있으면 회전 매핑이 근사다.
function _followsCycle(doc, startId, id) {
  let cur = startId; const seen = new Set();
  while (cur && !seen.has(cur)) { if (cur === id) return true; seen.add(cur); cur = doc.layers[cur]?.followId ?? null; }
  return false;
}
// 따라가기(진짜 부모) 모델의 점 변환. invert=true: 절대 → 대상 로컬 상대, false: 상대 → 절대.
function _mapPoint(P, x, y, invert) {
  const rad = (P.rotation ?? 0) * Math.PI / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const s = P.scale ?? 1;
  if (invert) {
    const dx = x - (P.x ?? 0), dy = y - (P.y ?? 0);
    return { x: (dx * cos + dy * sin) / s, y: (-dx * sin + dy * cos) / s };
  }
  return { x: (P.x ?? 0) + s * (x * cos - y * sin), y: (P.y ?? 0) + s * (x * sin + y * cos) };
}
function _scalarMap(prop, fn, def) {
  const np = { ...prop };
  if (prop?.keys?.length) np.keys = prop.keys.map(k => ({ ...k, v: fn(k.v) }));
  np.value = fn(prop?.value ?? def);
  return np;
}
// doc 의 레이어 id 변형 props 를 P 기준으로 구워 바꾼다(_pa 로 적용).
function _followBake(doc, patches, id, P, invert) {
  const tr = doc.layers[id].transform;
  const xk = tr.x?.keys?.length, yk = tr.y?.keys?.length;
  if (xk || yk) {
    const nx = { ...tr.x }, ny = { ...tr.y };
    if (xk) nx.keys = tr.x.keys.map(k => ({ ...k, v: _mapPoint(P, k.v, evalProp(tr.y, k.f), invert).x }));
    if (yk) ny.keys = tr.y.keys.map(k => ({ ...k, v: _mapPoint(P, evalProp(tr.x, k.f), k.v, invert).y }));
    const pv = _mapPoint(P, tr.x?.value ?? 0, tr.y?.value ?? 0, invert);
    nx.value = pv.x; ny.value = pv.y;
    _pa(doc, patches, ['layers', id, 'transform', 'x'], nx);
    _pa(doc, patches, ['layers', id, 'transform', 'y'], ny);
  } else {
    const pv = _mapPoint(P, tr.x?.value ?? 0, tr.y?.value ?? 0, invert);
    _pa(doc, patches, ['layers', id, 'transform', 'x'], { ...tr.x, value: pv.x });
    _pa(doc, patches, ['layers', id, 'transform', 'y'], { ...tr.y, value: pv.y });
  }
  const rotOff = invert ? -(P.rotation ?? 0) : (P.rotation ?? 0);
  const sMul = invert ? 1 / (P.scale ?? 1) : (P.scale ?? 1);
  const sxMul = invert ? 1 / (P.scaleX ?? 1) : (P.scaleX ?? 1);
  const syMul = invert ? 1 / (P.scaleY ?? 1) : (P.scaleY ?? 1);
  _pa(doc, patches, ['layers', id, 'transform', 'rotation'], _scalarMap(tr.rotation, v => v + rotOff, 0));
  _pa(doc, patches, ['layers', id, 'transform', 'scale'], _scalarMap(tr.scale, v => v * sMul, 1));
  if (tr.scaleX) _pa(doc, patches, ['layers', id, 'transform', 'scaleX'], _scalarMap(tr.scaleX, v => v * sxMul, 1));
  if (tr.scaleY) _pa(doc, patches, ['layers', id, 'transform', 'scaleY'], _scalarMap(tr.scaleY, v => v * syMul, 1));
}
// 대상이 없어지거나 다른 그룹이 되면 따라가기를 해제(위치 유지). 해제한 레이어 id 목록을 돌려준다.
function _releaseStrandedFollows(doc, patches, f = 0) {
  const released = [];
  for (const [id, layer] of Object.entries(doc.layers)) {
    const fid = layer?.followId;
    if (!fid) continue;
    const t = doc.layers[fid];
    if (!t || (t.parentId ?? null) !== (layer.parentId ?? null)) {
      if (t) _followBake(doc, patches, id, localWithFollow(doc, fid, f), false); // 위치 유지
      _pa(doc, patches, ['layers', id, 'followId'], null);
      released.push(id);
    }
  }
  return released;
}

// R17: 복제된 레이어의 fx id 를 새로 바꾼다(fx 객체 키 + fxOrder). fx id 는 레이어 안에서만 쓰여
//   다른 레이어를 가리키지 않으므로 단순 재발급. duplicateLayers·part.remapPart 가 공유하는 규칙.
export function remapLayerFx(layer, idGen = () => newId('fx_')) {
  if (!layer || !layer.fx || typeof layer.fx !== 'object') return;
  const map = {};
  const nf = {};
  for (const oldId of Object.keys(layer.fx)) { const nid = idGen(); map[oldId] = nid; nf[nid] = layer.fx[oldId]; }
  layer.fx = nf;
  layer.fxOrder = (Array.isArray(layer.fxOrder) ? layer.fxOrder : []).map((id) => map[id] ?? id);
}

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
          // 값만이 아니라 키프레임 v 도 같이 옮긴다(키가 있으면 value 는 무시되므로).
          // prop 객체를 통째로 새로 만들어 교체한다(되돌리기 1건에 원래 객체로 복원).
          const offsetAxis = (propPath, prop, delta) => {
            if (!prop) return;
            const np = { ...prop, value: (prop.value ?? 0) + delta };
            if (prop.keys?.length) np.keys = prop.keys.map(k => ({ ...k, v: k.v + delta }));
            _pa(doc, patches, propPath, np);
          };
          for (const id of Object.keys(doc.layers)) {
            const t = doc.layers[id].transform;
            offsetAxis(['layers', id, 'transform', 'x'], t.x, dx);
            offsetAxis(['layers', id, 'transform', 'y'], t.y, dy);
          }
          // 카메라 X/Y 는 줌 중심점 — 같이 옮겨야 화면 framing 이 유지된다(줌 1 이면 무해).
          offsetAxis(['camera', 'x'], doc.camera?.x, dx);
          offsetAxis(['camera', 'y'], doc.camera?.y, dy);
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
      // R20-B: 지워질 레이어를 따라가던 다른 레이어는 해제(위치 유지). 지우기 전에 먼저.
      const removing = new Set(ids);
      for (const [lid, l] of Object.entries(doc.layers)) {
        if (l?.followId && removing.has(l.followId) && !removing.has(lid)) {
          _followBake(doc, patches, lid, localWithFollow(doc, l.followId, 0), false);
          _pa(doc, patches, ['layers', lid, 'followId'], null);
        }
      }
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

    case 'setGroupTime': {
      // R22b: 그룹/인스턴스 시간. patch 의 키만 time 에 병합(offset·speed·outside·length·remap).
      //   time 이 null 이면 기본 틀을 먼저 만든다. 모든 값이 항등이면 다시 null 로 되돌려 저장을 줄인다.
      const { id, patch } = cmd;
      const layer = doc.layers[id];
      if (!layer || (layer.type !== 'group' && layer.type !== 'instance')) break;
      const base = (layer.time && typeof layer.time === 'object')
        ? { ...layer.time }
        : { offset: 0, speed: 1, outside: 'hold', length: null, remap: null };
      const next = { ...base, ..._clone(patch ?? {}) };
      const hasRemap = !!(next.remap && next.remap.keys && next.remap.keys.length);
      const isIdentity = (next.offset ?? 0) === 0 && (next.speed ?? 1) === 1
        && (next.outside ?? 'hold') === 'hold' && (next.length == null) && !hasRemap;
      _pa(doc, patches, ['layers', id, 'time'], isIdentity ? null : next);
      break;
    }

    case 'addMask': {
      // R21: 가리기 추가. mask 는 createMask 로 만든 객체(새 id 포함).
      const { id, mask } = cmd;
      const layer = doc.layers[id];
      if (!layer || !mask) break;
      const masks = layer.masks ?? { order: [], items: {} };
      _pa(doc, patches, ['layers', id, 'masks'], {
        order: [...masks.order, mask.id],
        items: { ...masks.items, [mask.id]: structuredClone(mask) },
      });
      break;
    }

    case 'removeMask': {
      const { id, maskId } = cmd;
      const layer = doc.layers[id];
      if (!layer?.masks?.items?.[maskId]) break;
      const items = { ...layer.masks.items }; delete items[maskId];
      _pa(doc, patches, ['layers', id, 'masks'], {
        order: layer.masks.order.filter((m) => m !== maskId), items,
      });
      break;
    }

    case 'duplicateMask': {
      const { id, maskId } = cmd;
      const layer = doc.layers[id];
      const src = layer?.masks?.items?.[maskId];
      if (!src) break;
      const nid = newId('msk_');
      const dup = { ...structuredClone(src), id: nid, name: (src.name ?? '가리기') + ' 복사' };
      const idx = layer.masks.order.indexOf(maskId);
      const order = [...layer.masks.order]; order.splice(idx + 1, 0, nid);
      _pa(doc, patches, ['layers', id, 'masks'], { order, items: { ...layer.masks.items, [nid]: dup } });
      break;
    }

    case 'moveMask': {
      const { id, maskId, toIndex } = cmd;
      const layer = doc.layers[id];
      if (!layer?.masks?.order?.includes(maskId)) break;
      const order = layer.masks.order.filter((m) => m !== maskId);
      const i = Math.max(0, Math.min(order.length, toIndex));
      order.splice(i, 0, maskId);
      _pa(doc, patches, ['layers', id, 'masks'], { order, items: layer.masks.items });
      break;
    }

    case 'setMaskProp': {
      // 스칼라 필드(name·mode·invert)는 바로, Prop 필드(path·feather·expand·opacity)는 .value 로.
      const { id, maskId, key, value } = cmd;
      const layer = doc.layers[id];
      if (!layer?.masks?.items?.[maskId]) break;
      if (key === 'name' || key === 'mode' || key === 'invert') {
        _pa(doc, patches, ['layers', id, 'masks', 'items', maskId, key], value);
      } else {
        _pa(doc, patches, ['layers', id, 'masks', 'items', maskId, key, 'value'], value);
      }
      break;
    }

    case 'setFollow': {
      // R20-B: 따라가기 연결/해제. targetId=null 이면 해제. keepPlace 면 화면 위치 유지.
      const { id, targetId = null, keepPlace = true, f = 0 } = cmd;
      const layer = doc.layers[id];
      if (!layer) break;
      const oldTarget = layer.followId ?? null;
      let newTarget = targetId;
      if (newTarget) {
        const t = doc.layers[newTarget];
        const sameGroup = t && (t.parentId ?? null) === (layer.parentId ?? null);
        // 거부: 없음·자기·다른 그룹·순환(새 대상이 나를 따라가는 중)
        if (!t || newTarget === id || !sameGroup || _followsCycle(doc, newTarget, id)) break;
      }
      if (newTarget === oldTarget) break;
      // 1) 기존 대상에서 떼며 위치 유지(절대값으로 구움)
      if (keepPlace && oldTarget && doc.layers[oldTarget]) {
        _followBake(doc, patches, id, localWithFollow(doc, oldTarget, f), false);
      }
      // 2) 새 대상에 붙이며 위치 유지(대상 로컬 공간 값으로 역변환)
      if (keepPlace && newTarget) {
        _followBake(doc, patches, id, localWithFollow(doc, newTarget, f), true);
      }
      _pa(doc, patches, ['layers', id, 'followId'], newTarget);
      break;
    }

    case 'setProp': {
      // ease 는 명시됐을 때만 바꾼다(기본값 강제 금지). 기존 키 값만 바꾸면 이징·베지어 유지.
      const { id, path: dotPath, value, f, ease } = cmd;
      if (!doc.layers[id]) break;
      const propPath = ['layers', id, ...dotPath.split('.')];
      const prop = _get(doc, propPath);
      if (!prop) break;

      if (f !== undefined) {
        // 키프레임 추가/수정 — value는 건드리지 않음
        const keys = [...(prop.keys ?? [])];
        const idx = keys.findIndex(k => k.f === f);
        if (idx !== -1) {
          // 기존 키: ease 가 명시됐을 때만 바꾸고, 아니면 기존 ease·bezier 유지
          const nk = { ...keys[idx], v: value };
          if (ease !== undefined) nk.ease = ease;
          keys[idx] = nk;
        } else {
          keys.push({ f, v: value, ease: ease ?? 'linear' });
          keys.sort((a, b) => a.f - b.f);
        }
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

    case 'setParamAnim': {
      // 효과 수치 키 켜기/끄기(R16-3, R17: fxId 로 쌓은 효과도). 되돌리기 1건.
      //   on:true  → 현재 프레임 f 의 계산값으로 paramAnim[key] 키 1개(이징 linear) 생성.
      //   on:false → 현재 계산값을 params[key] 로 굳히고 paramAnim[key] 제거.
      //   fxId 있으면 layer.fx[fxId] 대상, 없으면 효과 레이어 자신. cmd.v 는 켤 때 쓸 표시값.
      const { id, key, on, f, v, fxId } = cmd;
      const layer = doc.layers[id];
      if (!layer || key == null) break;
      const holder = fxId ? layer.fx?.[fxId] : (layer.type === 'effect' ? layer : null);
      if (!holder) break;
      const base = fxId ? ['layers', id, 'fx', fxId] : ['layers', id];
      const existing = holder.paramAnim?.[key];
      const cur = (existing?.keys?.length)
        ? evalProp(existing, f ?? 0)
        : (v !== undefined ? v : (holder.params ?? {})[key]);
      if (on) {
        _pa(doc, patches, [...base, 'paramAnim', key],
          { keys: [{ f: f ?? 0, v: _clone(cur), ease: 'linear' }] });
      } else {
        _pa(doc, patches, [...base, 'params', key], _clone(cur));
        _pa(doc, patches, [...base, 'paramAnim', key], undefined);
      }
      break;
    }

    case 'addFx': {
      // 레이어에 효과를 쌓기 맨 아래(fxOrder 끝)에 추가. 되돌리기 1건.
      const { id, effectId, fxId: givenId, init } = cmd;
      const layer = doc.layers[id];
      if (!layer) break;
      const fxId = givenId ?? newId('fx_');
      const fx = createFx(effectId, init ?? {});
      _pa(doc, patches, ['layers', id, 'fx', fxId], fx);
      const order = Array.isArray(layer.fxOrder) ? layer.fxOrder : [];
      _pa(doc, patches, ['layers', id, 'fxOrder'], [...order, fxId]);
      break;
    }

    case 'removeFx': {
      const { id, fxId } = cmd;
      const layer = doc.layers[id];
      if (!layer?.fx?.[fxId]) break;
      _pa(doc, patches, ['layers', id, 'fx', fxId], undefined);
      _pa(doc, patches, ['layers', id, 'fxOrder'], (layer.fxOrder ?? []).filter((x) => x !== fxId));
      break;
    }

    case 'moveFx': {
      // fxId 를 fxOrder 의 index 위치로 옮긴다. 되돌리기 1건.
      const { id, fxId, index } = cmd;
      const layer = doc.layers[id];
      if (!layer?.fx?.[fxId]) break;
      const order = (layer.fxOrder ?? []).filter((x) => x !== fxId);
      const ins = (index !== undefined && index >= 0 && index <= order.length) ? index : order.length;
      order.splice(ins, 0, fxId);
      _pa(doc, patches, ['layers', id, 'fxOrder'], order);
      break;
    }

    case 'setFx': {
      // fx[fxId] 에 patch 병합(effectId·enabled·params·seed·clip 등). mix·paramAnim 키는 setProp/setKey 로.
      const { id, fxId, patch } = cmd;
      const fx = doc.layers[id]?.fx?.[fxId];
      if (!fx) break;
      for (const [k, v] of Object.entries(patch ?? {})) {
        _pa(doc, patches, ['layers', id, 'fx', fxId, k], v);
      }
      break;
    }

    case 'duplicateFx': {
      const { id, fxId, newId: nid } = cmd;
      const layer = doc.layers[id];
      const fx = layer?.fx?.[fxId];
      if (!fx) break;
      const dupId = nid ?? newId('fx_');
      _pa(doc, patches, ['layers', id, 'fx', dupId], structuredClone(fx));
      const order = [...(layer.fxOrder ?? [])];
      const i = order.indexOf(fxId);
      order.splice(i < 0 ? order.length : i + 1, 0, dupId);
      _pa(doc, patches, ['layers', id, 'fxOrder'], order);
      break;
    }

    case 'setCameraProp': {
      // 카메라(doc.camera.x/y/zoom) 값·키프레임. prop 은 { value, keys }.
      const { prop: which, value, f, ease } = cmd;
      if (!['x', 'y', 'zoom'].includes(which)) break;
      const propPath = ['camera', which];
      const prop = _get(doc, propPath);
      if (!prop) break;
      if (f !== undefined) {
        const keys = [...(prop.keys ?? [])];
        const idx = keys.findIndex(k => k.f === f);
        if (idx !== -1) {
          const nk = { ...keys[idx], v: value };
          if (ease !== undefined) nk.ease = ease;
          keys[idx] = nk;
        } else {
          keys.push({ f, v: value, ease: ease ?? 'linear' });
          keys.sort((a, b) => a.f - b.f);
        }
        _pa(doc, patches, [...propPath, 'keys'], keys);
      } else {
        if (prop.keys?.length) throw new Error('키프레임이 있는 카메라 값은 f를 지정');
        _pa(doc, patches, [...propPath, 'value'], value);
      }
      break;
    }

    case 'removeCameraKey': {
      const { prop: which, f } = cmd;
      if (!['x', 'y', 'zoom'].includes(which)) break;
      const prop = _get(doc, ['camera', which]);
      if (!prop?.keys) break;
      _pa(doc, patches, ['camera', which, 'keys'], prop.keys.filter(k => k.f !== f));
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
      const { id, path: dotPath, f, v, ease = 'linear', bezier, sp } = cmd;
      if (!doc.layers[id]) break;
      const propPath = ['layers', id, ...dotPath.split('.')];
      const prop = _get(doc, propPath);
      if (!prop) break;
      const keys = [...(prop.keys ?? [])];
      const idx = keys.findIndex(k => k.f === f);
      const nk = { f, v, ease };
      // cubicBezier 면 제어점도 함께 보존(복사·붙여넣기에서 베지어가 버려지지 않게).
      if (ease === 'cubicBezier' && Array.isArray(bezier)) nk.bezier = bezier.slice();
      // R18: 곡선 손잡이(sp) 보존(복사·붙여넣기).
      if (sp && typeof sp === 'object') nk.sp = { ...sp };
      if (idx !== -1) keys[idx] = nk;
      else { keys.push(nk); keys.sort((a, b) => a.f - b.f); }
      _pa(doc, patches, [...propPath, 'keys'], keys);
      break;
    }

    case 'setKeyHandle': {
      // R18: 곡선 손잡이(sp)를 transform.x 의 f 키에 설정/제거. 되돌리기 1건. sp=null 이면 지운다.
      const { id, f, sp } = cmd;
      const layer = doc.layers[id];
      if (!layer) break;
      const propPath = ['layers', id, 'transform', 'x'];
      const prop = _get(doc, propPath);
      if (!prop?.keys) break;
      const keys = prop.keys.map((k) => {
        if (k.f !== f) return k;
        const nk = { ...k };
        if (sp && typeof sp === 'object') nk.sp = { ...sp }; else delete nk.sp;
        return nk;
      });
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
        // 옮긴 키가 선택 안 된 다른 키와 같은 프레임에 겹치면 옮긴 키가 이긴다(retimeKeys 와 동일).
        const moved = prop.keys.map(k => fSet.has(k.f) ? { k: { ...k, f: k.f + delta }, m: true } : { k, m: false });
        const byF = new Map();
        for (const { k, m } of moved) if (!m) byF.set(k.f, k);   // 비선택 먼저 깔고
        for (const { k, m } of moved) if (m)  byF.set(k.f, k);   // 옮긴 것으로 덮어쓴다
        const keys = [...byF.values()].sort((a, b) => a.f - b.f);
        _pa(doc, patches, [...propPath, 'keys'], keys);
      }
      break;
    }

    case 'retimeKeys': {
      // 선택한 키들을 임의 프레임으로 재배치 (스트레치/이동)
      // moves: [{ from, to }]  같은 프레임으로 겹치면 뒤의 것이 이김
      const { id, path: dotPath, moves } = cmd;
      if (!doc.layers[id] || !moves?.length) break;
      const propPath = ['layers', id, ...dotPath.split('.')];
      const prop = _get(doc, propPath);
      if (!prop?.keys) break;
      const moveMap = new Map(moves.map(m => [m.from, m.to]));
      const mapped = prop.keys.map(k => moveMap.has(k.f) ? { ...k, f: moveMap.get(k.f) } : k);
      mapped.sort((a, b) => a.f - b.f);
      const byF = new Map();
      for (const k of mapped) byF.set(k.f, k);
      _pa(doc, patches, [...propPath, 'keys'], [...byF.values()].sort((a, b) => a.f - b.f));
      break;
    }

    case 'setKeysEase': {
      // 지정 프레임의 키들에 이징 적용. cubicBezier 면 bezier[x1,y1,x2,y2]도 저장.
      // R19: smooth(이어진 손잡이 표시)를 함께 넘기면 키에 저장/제거한다(편집 전용 메타, 렌더 불변).
      const { id, path: dotPath, frames, ease, bezier, smooth } = cmd;
      if (!doc.layers[id] || !frames?.length) break;
      const propPath = ['layers', id, ...dotPath.split('.')];
      const prop = _get(doc, propPath);
      if (!prop?.keys) break;
      const fSet = new Set(frames);
      const keys = prop.keys.map(k => {
        if (!fSet.has(k.f)) return k;
        const nk = { ...k };
        if (ease !== undefined) nk.ease = ease;
        if ((ease ?? nk.ease) === 'cubicBezier' && Array.isArray(bezier)) nk.bezier = bezier.slice();
        else if (ease !== undefined && ease !== 'cubicBezier' && nk.bezier) delete nk.bezier;
        if (smooth !== undefined) { if (smooth) nk.smooth = true; else delete nk.smooth; }
        return nk;
      });
      _pa(doc, patches, [...propPath, 'keys'], keys);
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

    case 'splitClip': {
      // 재생선 f 위치에서 클립을 둘로. 위상(start/length)은 공유, 활성 창만 [.,f)와 [f,.)로 나눈다.
      const { id, clipId, f, newId: nid } = cmd;
      const layer = doc.layers[id];
      if (!layer) break;
      const clips = layer.clips ?? [];
      const clip = clips.find(c => c.id === clipId);
      if (!clip) break;
      const ws = clip.winStart ?? clip.start;
      const we = clip.winEnd   ?? (clip.start + clip.length);
      if (f <= ws || f >= we) break; // 창 밖/경계면 자르지 않음
      const left  = { ...structuredClone(clip), winStart: ws, winEnd: f };
      const right = { ...structuredClone(clip), id: nid ?? newId('clp_'), winStart: f, winEnd: we };
      const next = clips.flatMap(c => c.id === clipId ? [left, right] : [c]);
      _pa(doc, patches, ['layers', id, 'clips'], next);
      break;
    }

    case 'duplicateClip': {
      const { id, clipId, newId: nid } = cmd;
      const layer = doc.layers[id];
      if (!layer) break;
      const clip = (layer.clips ?? []).find(c => c.id === clipId);
      if (!clip) break;
      const dup = structuredClone(clip);
      dup.id = nid ?? newId('clp_');
      dup.start = clip.start + clip.length; // 바로 뒤에
      delete dup.winStart; delete dup.winEnd; // 복제본은 온전한 클립
      _pa(doc, patches, ['layers', id, 'clips'], [...(layer.clips ?? []), dup]);
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
      // R20-B: 그룹이 바뀌어 대상과 다른 그룹이 된 따라가기는 해제(위치 유지).
      _releaseStrandedFollows(doc, patches);
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
      // R20-B: 풀어서 대상과 다른 그룹이 된 따라가기는 해제(위치 유지).
      _releaseStrandedFollows(doc, patches);
      break;
    }

    case 'duplicateLayers': {
      const { ids } = cmd;

      // 선택 중 다른 선택의 자손인 id 는 최상위 복제 대상에서 뺀다(group 명령과 동일).
      // 안 그러면 그룹+자식을 함께 고르면 자식이 새 그룹과 원래 그룹 양쪽에 들어가 구조가 깨진다.
      const allDescs = new Set();
      for (const id of ids) for (const d of _getAllDescendants(doc, id)) allDescs.add(d);
      const topIds = ids.filter(id => !allDescs.has(id) && doc.layers[id]);
      const topSet = new Set(topIds);

      // 전체 복제 대상(최상위 + 자손) id 매핑 구축
      const idMap = new Map();

      function collectIds(layerId) {
        if (!doc.layers[layerId] || idMap.has(layerId)) return;
        idMap.set(layerId, newId('lyr_'));
        const l = doc.layers[layerId];
        if (l?.childOrder) {
          for (const childId of l.childOrder) collectIds(childId);
        }
      }
      for (const id of topIds) collectIds(id);

      // 각 레이어 복제
      for (const [origId, newLayerId] of idMap) {
        const orig = doc.layers[origId];
        const dup = structuredClone(orig);
        dup.id = newLayerId;

        // 최상위 복제본에만 ' 복사' 추가
        if (topSet.has(origId)) {
          dup.name = orig.name + ' 복사';
        }

        // clips id 재발급 (clp_ 접두사)
        if (dup.clips?.length) {
          dup.clips = dup.clips.map(c => ({ ...c, id: newId('clp_') }));
        }

        // 쌓은 효과(fx) id 재발급 — 레이어 안에서만 쓰여 참조 재배선은 필요 없다(R17).
        remapLayerFx(dup);

        // 자손의 parentId를 새 id로 교체
        if (!topSet.has(origId) && dup.parentId && idMap.has(dup.parentId)) {
          dup.parentId = idMap.get(dup.parentId);
        }

        // childOrder를 새 id로 교체
        if (dup.childOrder?.length) {
          dup.childOrder = dup.childOrder.map(cid => idMap.get(cid) ?? cid);
        }

        // 복제 범위 안을 가리키는 참조는 새 id로 교체(인스턴스 마스터·마스크 소스·효과 소스).
        if (dup.masterId && idMap.has(dup.masterId)) {
          dup.masterId = idMap.get(dup.masterId);
        }
        if (dup.mask?.sourceId && idMap.has(dup.mask.sourceId)) {
          dup.mask = { ...dup.mask, sourceId: idMap.get(dup.mask.sourceId) };
        }
        if (Array.isArray(dup.sources)) {
          dup.sources = dup.sources.map(s =>
            (s?.sourceId && idMap.has(s.sourceId)) ? { ...s, sourceId: idMap.get(s.sourceId) } : s);
        }
        // R20-B: 따라가기 대상이 복제 범위 안이면 새 id 로(밖이면 원본을 그대로 따라감).
        if (dup.followId && idMap.has(dup.followId)) dup.followId = idMap.get(dup.followId);

        _pa(doc, patches, ['layers', newLayerId], dup);
      }

      // 최상위 복제본을 원본 바로 뒤에 삽입
      for (const id of topIds) {
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

    case 'addAsset': {
      const { id, asset } = cmd;
      if (!doc.assets) doc.assets = {};
      _pa(doc, patches, ['assets', id], structuredClone(asset));
      break;
    }

    case 'removeAsset': {
      const { id } = cmd;
      _pa(doc, patches, ['assets', id], undefined);
      break;
    }

    case 'replaceDoc': {
      // 문서 전체 교체(저장 시점 되돌리기, R12-3) — 되돌리기 기록 1건.
      // 최상위 키(meta·camera·order·layers·assets)를 통째로 바꾼다. version 등 나머지도 반영.
      const nd = cmd.doc;
      if (!nd || typeof nd !== 'object') break;
      const keys = new Set([...Object.keys(doc), ...Object.keys(nd)]);
      keys.delete('layers'); // layers 는 아래에서 키별로 처리(없어진 레이어 삭제 포함)
      for (const k of keys) _pa(doc, patches, [k], nd[k]);
      const oldLayers = doc.layers ?? {};
      const newLayers = nd.layers ?? {};
      for (const id of new Set([...Object.keys(oldLayers), ...Object.keys(newLayers)])) {
        _pa(doc, patches, ['layers', id], newLayers[id]); // 새로 없으면 undefined → 삭제
      }
      break;
    }

    case 'insertPart': {
      // 내 부품(library) 넣기(R14-3) — 이미 새 id 로 remap 된 레이어 묶음을 넣는다. 되돌리기 기록 1건.
      //   cmd.layers: { id → layer }(remap 완료), cmd.rootId: 최상위로 넣을 레이어, cmd.assets: { id → meta }.
      for (const [id, layer] of Object.entries(cmd.layers ?? {})) {
        _pa(doc, patches, ['layers', id], layer);
      }
      if (cmd.assets) {
        if (!doc.assets) doc.assets = {};
        for (const [aid, meta] of Object.entries(cmd.assets)) {
          if (!doc.assets[aid]) _pa(doc, patches, ['assets', aid], meta);
        }
      }
      if (cmd.rootId) _pa(doc, patches, ['order'], [...doc.order, cmd.rootId]);
      break;
    }

    case 'setVariants': {
      // 세트(바리에이션) 정의 전체 교체 — 되돌리기 기록 1건(R13-1).
      // value 가 null/undefined 면 세트를 지운다. 슬롯·행을 통째로 바꾼다.
      _pa(doc, patches, ['variants'], cmd.variants ?? undefined);
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
