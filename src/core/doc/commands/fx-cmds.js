// 효과(쌓기) 명령 — 수치 키 토글·추가·삭제·이동·설정·복제.
//   (R23d item 12: commands.js 에서 종류별로 떼어냄, 동작 동일)
import { newId, createFx } from '../schema.js';
import { evalProp } from '../../anim/prop.js';
import { _pa, _clone } from '../patch.js';

export const fxCommands = {
  setParamAnim(doc, cmd, patches) {
    // 효과 수치 키 켜기/끄기(R16-3, R17: fxId 로 쌓은 효과도). 되돌리기 1건.
    //   on:true  → 현재 프레임 f 의 계산값으로 paramAnim[key] 키 1개(이징 linear) 생성.
    //   on:false → 현재 계산값을 params[key] 로 굳히고 paramAnim[key] 제거.
    //   fxId 있으면 layer.fx[fxId] 대상, 없으면 효과 레이어 자신. cmd.v 는 켤 때 쓸 표시값.
    const { id, key, on, f, v, fxId } = cmd;
    const layer = doc.layers[id];
    if (!layer || key == null) return;
    const holder = fxId ? layer.fx?.[fxId] : (layer.type === 'effect' ? layer : null);
    if (!holder) return;
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
  },

  addFx(doc, cmd, patches) {
    // 레이어에 효과를 쌓기 맨 아래(fxOrder 끝)에 추가. 되돌리기 1건.
    const { id, effectId, fxId: givenId, init } = cmd;
    const layer = doc.layers[id];
    if (!layer) return;
    const fxId = givenId ?? newId('fx_');
    const fx = createFx(effectId, init ?? {});
    _pa(doc, patches, ['layers', id, 'fx', fxId], fx);
    const order = Array.isArray(layer.fxOrder) ? layer.fxOrder : [];
    _pa(doc, patches, ['layers', id, 'fxOrder'], [...order, fxId]);
  },

  removeFx(doc, cmd, patches) {
    const { id, fxId } = cmd;
    const layer = doc.layers[id];
    if (!layer?.fx?.[fxId]) return;
    _pa(doc, patches, ['layers', id, 'fx', fxId], undefined);
    _pa(doc, patches, ['layers', id, 'fxOrder'], (layer.fxOrder ?? []).filter((x) => x !== fxId));
  },

  moveFx(doc, cmd, patches) {
    // fxId 를 fxOrder 의 index 위치로 옮긴다. 되돌리기 1건.
    const { id, fxId, index } = cmd;
    const layer = doc.layers[id];
    if (!layer?.fx?.[fxId]) return;
    const order = (layer.fxOrder ?? []).filter((x) => x !== fxId);
    const ins = (index !== undefined && index >= 0 && index <= order.length) ? index : order.length;
    order.splice(ins, 0, fxId);
    _pa(doc, patches, ['layers', id, 'fxOrder'], order);
  },

  setFx(doc, cmd, patches) {
    // fx[fxId] 에 patch 병합(effectId·enabled·params·seed·clip 등). mix·paramAnim 키는 setProp/setKey 로.
    const { id, fxId, patch } = cmd;
    const fx = doc.layers[id]?.fx?.[fxId];
    if (!fx) return;
    for (const [k, v] of Object.entries(patch ?? {})) {
      _pa(doc, patches, ['layers', id, 'fx', fxId, k], v);
    }
  },

  duplicateFx(doc, cmd, patches) {
    const { id, fxId, newId: nid } = cmd;
    const layer = doc.layers[id];
    const fx = layer?.fx?.[fxId];
    if (!fx) return;
    const dupId = nid ?? newId('fx_');
    _pa(doc, patches, ['layers', id, 'fx', dupId], structuredClone(fx));
    const order = [...(layer.fxOrder ?? [])];
    const i = order.indexOf(fxId);
    order.splice(i < 0 ? order.length : i + 1, 0, dupId);
    _pa(doc, patches, ['layers', id, 'fxOrder'], order);
  },
};
