// 문서 설정 명령 — 메타·캔버스 크기·에셋·문서 교체·부품 넣기·세트·카메라 키.
//   (R23d item 12: commands.js 에서 종류별로 떼어냄, 동작 동일)
import { _pa, _get } from '../patch.js';

export const docCommands = {
  setMeta(doc, cmd, patches) {
    for (const [k, v] of Object.entries(cmd.patch)) {
      _pa(doc, patches, ['meta', k], v);
    }
  },

  resizeCanvas(doc, cmd, patches) {
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
  },

  setCameraProp(doc, cmd, patches) {
    // 카메라(doc.camera.x/y/zoom) 값·키프레임. prop 은 { value, keys }.
    const { prop: which, value, f, ease } = cmd;
    if (!['x', 'y', 'zoom'].includes(which)) return;
    const propPath = ['camera', which];
    const prop = _get(doc, propPath);
    if (!prop) return;
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
  },

  removeCameraKey(doc, cmd, patches) {
    const { prop: which, f } = cmd;
    if (!['x', 'y', 'zoom'].includes(which)) return;
    const prop = _get(doc, ['camera', which]);
    if (!prop?.keys) return;
    _pa(doc, patches, ['camera', which, 'keys'], prop.keys.filter(k => k.f !== f));
  },

  addAsset(doc, cmd, patches) {
    const { id, asset } = cmd;
    if (!doc.assets) doc.assets = {};
    _pa(doc, patches, ['assets', id], structuredClone(asset));
  },

  removeAsset(doc, cmd, patches) {
    const { id } = cmd;
    _pa(doc, patches, ['assets', id], undefined);
  },

  replaceDoc(doc, cmd, patches) {
    // 문서 전체 교체(저장 시점 되돌리기, R12-3) — 되돌리기 기록 1건.
    // 최상위 키(meta·camera·order·layers·assets)를 통째로 바꾼다. version 등 나머지도 반영.
    const nd = cmd.doc;
    if (!nd || typeof nd !== 'object') return;
    const keys = new Set([...Object.keys(doc), ...Object.keys(nd)]);
    keys.delete('layers'); // layers 는 아래에서 키별로 처리(없어진 레이어 삭제 포함)
    for (const k of keys) _pa(doc, patches, [k], nd[k]);
    const oldLayers = doc.layers ?? {};
    const newLayers = nd.layers ?? {};
    for (const id of new Set([...Object.keys(oldLayers), ...Object.keys(newLayers)])) {
      _pa(doc, patches, ['layers', id], newLayers[id]); // 새로 없으면 undefined → 삭제
    }
  },

  insertPart(doc, cmd, patches) {
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
  },

  setVariants(doc, cmd, patches) {
    // 세트(바리에이션) 정의 전체 교체 — 되돌리기 기록 1건(R13-1).
    // value 가 null/undefined 면 세트를 지운다. 슬롯·행을 통째로 바꾼다.
    _pa(doc, patches, ['variants'], cmd.variants ?? undefined);
  },
};
