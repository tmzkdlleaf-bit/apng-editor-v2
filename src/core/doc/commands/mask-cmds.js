// 가리기(마스크) 명령 — 추가·삭제·복제·이동·설정. (R21)
//   (R23d item 12: commands.js 에서 종류별로 떼어냄, 동작 동일)
import { newId } from '../schema.js';
import { _pa } from '../patch.js';

export const maskCommands = {
  addMask(doc, cmd, patches) {
    // R21: 가리기 추가. mask 는 createMask 로 만든 객체(새 id 포함).
    const { id, mask } = cmd;
    const layer = doc.layers[id];
    if (!layer || !mask) return;
    const masks = layer.masks ?? { order: [], items: {} };
    _pa(doc, patches, ['layers', id, 'masks'], {
      order: [...masks.order, mask.id],
      items: { ...masks.items, [mask.id]: structuredClone(mask) },
    });
  },

  removeMask(doc, cmd, patches) {
    const { id, maskId } = cmd;
    const layer = doc.layers[id];
    if (!layer?.masks?.items?.[maskId]) return;
    const items = { ...layer.masks.items }; delete items[maskId];
    _pa(doc, patches, ['layers', id, 'masks'], {
      order: layer.masks.order.filter((m) => m !== maskId), items,
    });
  },

  duplicateMask(doc, cmd, patches) {
    const { id, maskId } = cmd;
    const layer = doc.layers[id];
    const src = layer?.masks?.items?.[maskId];
    if (!src) return;
    const nid = newId('msk_');
    const dup = { ...structuredClone(src), id: nid, name: (src.name ?? '가리기') + ' 복사' };
    const idx = layer.masks.order.indexOf(maskId);
    const order = [...layer.masks.order]; order.splice(idx + 1, 0, nid);
    _pa(doc, patches, ['layers', id, 'masks'], { order, items: { ...layer.masks.items, [nid]: dup } });
  },

  moveMask(doc, cmd, patches) {
    const { id, maskId, toIndex } = cmd;
    const layer = doc.layers[id];
    if (!layer?.masks?.order?.includes(maskId)) return;
    const order = layer.masks.order.filter((m) => m !== maskId);
    const i = Math.max(0, Math.min(order.length, toIndex));
    order.splice(i, 0, maskId);
    _pa(doc, patches, ['layers', id, 'masks'], { order, items: layer.masks.items });
  },

  setMaskProp(doc, cmd, patches) {
    // 스칼라 필드(name·mode·invert)는 바로, Prop 필드(path·feather·expand·opacity)는 .value 로.
    const { id, maskId, key, value } = cmd;
    const layer = doc.layers[id];
    if (!layer?.masks?.items?.[maskId]) return;
    if (key === 'name' || key === 'mode' || key === 'invert') {
      _pa(doc, patches, ['layers', id, 'masks', 'items', maskId, key], value);
    } else {
      _pa(doc, patches, ['layers', id, 'masks', 'items', maskId, key, 'value'], value);
    }
  },
};
