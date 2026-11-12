// 레이어 명령 — 추가·삭제·이동·설정·그룹 시간·따라가기·그룹/풀기·복제.
//   (R23d item 12: commands.js 에서 종류별로 떼어냄, 동작 동일)
import { newId, createLayer } from '../schema.js';
import { localWithFollow } from '../../anim/world.js';
import {
  _pa, _clone, _orderPath, _getOrder, _getAllDescendants, _isDescendantOrSelf,
} from '../patch.js';
import {
  _followBake, _releaseStrandedFollows, _followsCycle, remapLayerFx,
} from '../follow.js';

export const layerCommands = {
  addLayer(doc, cmd, patches) {
    const { layer, parentId = null, index } = cmd;
    const l = { ...structuredClone(layer), parentId: parentId ?? null };
    const order = _getOrder(doc, parentId);
    const newOrder = [...order];
    const ins = (index !== undefined && index >= 0 && index <= newOrder.length) ? index : newOrder.length;
    newOrder.splice(ins, 0, l.id);
    _pa(doc, patches, ['layers', l.id], l);
    _pa(doc, patches, _orderPath(parentId), newOrder);
  },

  removeLayers(doc, cmd, patches) {
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
  },

  moveLayer(doc, cmd, patches) {
    const { id, parentId = null, index } = cmd;
    const layer = doc.layers[id];
    if (!layer) return;

    // 자기 자신 또는 자손으로 이동 금지
    if (_isDescendantOrSelf(doc, id, parentId ?? null)) return;

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
  },

  setLayer(doc, cmd, patches) {
    const { id, patch } = cmd;
    if (!doc.layers[id]) return;
    for (const [k, v] of Object.entries(patch)) {
      _pa(doc, patches, ['layers', id, k], v);
    }
  },

  setGroupTime(doc, cmd, patches) {
    // R22b: 그룹/인스턴스 시간. patch 의 키만 time 에 병합(offset·speed·outside·length·remap).
    //   time 이 null 이면 기본 틀을 먼저 만든다. 모든 값이 항등이면 다시 null 로 되돌려 저장을 줄인다.
    const { id, patch } = cmd;
    const layer = doc.layers[id];
    if (!layer || (layer.type !== 'group' && layer.type !== 'instance')) return;
    const base = (layer.time && typeof layer.time === 'object')
      ? { ...layer.time }
      : { offset: 0, speed: 1, outside: 'hold', length: null, remap: null };
    const next = { ...base, ..._clone(patch ?? {}) };
    const hasRemap = !!(next.remap && next.remap.keys && next.remap.keys.length);
    const isIdentity = (next.offset ?? 0) === 0 && (next.speed ?? 1) === 1
      && (next.outside ?? 'hold') === 'hold' && (next.length == null) && !hasRemap;
    _pa(doc, patches, ['layers', id, 'time'], isIdentity ? null : next);
  },

  setFollow(doc, cmd, patches) {
    // R20-B: 따라가기 연결/해제. targetId=null 이면 해제. keepPlace 면 화면 위치 유지.
    const { id, targetId = null, keepPlace = true, f = 0 } = cmd;
    const layer = doc.layers[id];
    if (!layer) return;
    const oldTarget = layer.followId ?? null;
    let newTarget = targetId;
    if (newTarget) {
      const t = doc.layers[newTarget];
      const sameGroup = t && (t.parentId ?? null) === (layer.parentId ?? null);
      // 거부: 없음·자기·다른 그룹·순환(새 대상이 나를 따라가는 중)
      if (!t || newTarget === id || !sameGroup || _followsCycle(doc, newTarget, id)) return;
    }
    if (newTarget === oldTarget) return;
    // 1) 기존 대상에서 떼며 위치 유지(절대값으로 구움)
    if (keepPlace && oldTarget && doc.layers[oldTarget]) {
      _followBake(doc, patches, id, localWithFollow(doc, oldTarget, f), false);
    }
    // 2) 새 대상에 붙이며 위치 유지(대상 로컬 공간 값으로 역변환)
    if (keepPlace && newTarget) {
      _followBake(doc, patches, id, localWithFollow(doc, newTarget, f), true);
    }
    _pa(doc, patches, ['layers', id, 'followId'], newTarget);
  },

  group(doc, cmd, patches) {
    const { ids } = cmd;
    if (!ids.length) return;

    // ids 중 다른 id의 자손인 것 제외
    const allDescs = new Set();
    for (const id of ids) {
      for (const d of _getAllDescendants(doc, id)) allDescs.add(d);
    }
    const filteredIds = ids.filter(id => !allDescs.has(id) && doc.layers[id]);
    if (!filteredIds.length) return;

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
  },

  ungroup(doc, cmd, patches) {
    const { groupId } = cmd;
    const group = doc.layers[groupId];
    if (!group || group.type !== 'group') return;
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
  },

  duplicateLayers(doc, cmd, patches) {
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
  },
};
