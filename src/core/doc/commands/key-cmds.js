// 키프레임·클립 명령 — 값/키 설정·오프셋·이동·재배치·이징, 그리고 타임라인 클립.
//   (R23d item 12: commands.js 에서 종류별로 떼어냄, 동작 동일)
import { newId } from '../schema.js';
import { _pa, _get } from '../patch.js';

export const keyCommands = {
  setProp(doc, cmd, patches) {
    // ease 는 명시됐을 때만 바꾼다(기본값 강제 금지). 기존 키 값만 바꾸면 이징·베지어 유지.
    const { id, path: dotPath, value, f, ease } = cmd;
    if (!doc.layers[id]) return;
    const propPath = ['layers', id, ...dotPath.split('.')];
    const prop = _get(doc, propPath);
    if (!prop) return;

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
  },

  offsetProp(doc, cmd, patches) {
    const { id, path: dotPath, delta } = cmd;
    if (!doc.layers[id]) return;
    const propPath = ['layers', id, ...dotPath.split('.')];
    const prop = _get(doc, propPath);
    if (!prop) return;
    if (prop.keys?.length) {
      const keys = prop.keys.map(k => ({ ...k, v: k.v + delta }));
      _pa(doc, patches, [...propPath, 'keys'], keys);
    } else {
      _pa(doc, patches, [...propPath, 'value'], (prop.value ?? 0) + delta);
    }
  },

  setKey(doc, cmd, patches) {
    const { id, path: dotPath, f, v, ease = 'linear', bezier, sp } = cmd;
    if (!doc.layers[id]) return;
    const propPath = ['layers', id, ...dotPath.split('.')];
    const prop = _get(doc, propPath);
    if (!prop) return;
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
  },

  setKeyHandle(doc, cmd, patches) {
    // R18: 곡선 손잡이(sp)를 transform.x 의 f 키에 설정/제거. 되돌리기 1건. sp=null 이면 지운다.
    const { id, f, sp } = cmd;
    const layer = doc.layers[id];
    if (!layer) return;
    const propPath = ['layers', id, 'transform', 'x'];
    const prop = _get(doc, propPath);
    if (!prop?.keys) return;
    const keys = prop.keys.map((k) => {
      if (k.f !== f) return k;
      const nk = { ...k };
      if (sp && typeof sp === 'object') nk.sp = { ...sp }; else delete nk.sp;
      return nk;
    });
    _pa(doc, patches, [...propPath, 'keys'], keys);
  },

  removeKey(doc, cmd, patches) {
    const { id, path: dotPath, f } = cmd;
    if (!doc.layers[id]) return;
    const propPath = ['layers', id, ...dotPath.split('.')];
    const prop = _get(doc, propPath);
    if (!prop?.keys) return;
    _pa(doc, patches, [...propPath, 'keys'], prop.keys.filter(k => k.f !== f));
  },

  moveKeys(doc, cmd, patches) {
    const { id, refs, delta } = cmd;
    if (!doc.layers[id] || delta === 0) return;
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
  },

  retimeKeys(doc, cmd, patches) {
    // 선택한 키들을 임의 프레임으로 재배치 (스트레치/이동)
    // moves: [{ from, to }]  같은 프레임으로 겹치면 뒤의 것이 이김
    const { id, path: dotPath, moves } = cmd;
    if (!doc.layers[id] || !moves?.length) return;
    const propPath = ['layers', id, ...dotPath.split('.')];
    const prop = _get(doc, propPath);
    if (!prop?.keys) return;
    const moveMap = new Map(moves.map(m => [m.from, m.to]));
    const mapped = prop.keys.map(k => moveMap.has(k.f) ? { ...k, f: moveMap.get(k.f) } : k);
    mapped.sort((a, b) => a.f - b.f);
    const byF = new Map();
    for (const k of mapped) byF.set(k.f, k);
    _pa(doc, patches, [...propPath, 'keys'], [...byF.values()].sort((a, b) => a.f - b.f));
  },

  setKeysEase(doc, cmd, patches) {
    // 지정 프레임의 키들에 이징 적용. cubicBezier 면 bezier[x1,y1,x2,y2]도 저장.
    // R19: smooth(이어진 손잡이 표시)를 함께 넘기면 키에 저장/제거한다(편집 전용 메타, 렌더 불변).
    const { id, path: dotPath, frames, ease, bezier, smooth } = cmd;
    if (!doc.layers[id] || !frames?.length) return;
    const propPath = ['layers', id, ...dotPath.split('.')];
    const prop = _get(doc, propPath);
    if (!prop?.keys) return;
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
  },

  addClip(doc, cmd, patches) {
    const { id, clip } = cmd;
    const layer = doc.layers[id];
    if (!layer) return;
    _pa(doc, patches, ['layers', id, 'clips'], [...(layer.clips ?? []), structuredClone(clip)]);
  },

  setClip(doc, cmd, patches) {
    const { id, clipId, patch } = cmd;
    const layer = doc.layers[id];
    if (!layer) return;
    const clips = (layer.clips ?? []).map(c => c.id === clipId ? { ...c, ...patch } : c);
    _pa(doc, patches, ['layers', id, 'clips'], clips);
  },

  removeClip(doc, cmd, patches) {
    const { id, clipId } = cmd;
    const layer = doc.layers[id];
    if (!layer) return;
    _pa(doc, patches, ['layers', id, 'clips'], (layer.clips ?? []).filter(c => c.id !== clipId));
  },

  splitClip(doc, cmd, patches) {
    // 재생선 f 위치에서 클립을 둘로. 위상(start/length)은 공유, 활성 창만 [.,f)와 [f,.)로 나눈다.
    const { id, clipId, f, newId: nid } = cmd;
    const layer = doc.layers[id];
    if (!layer) return;
    const clips = layer.clips ?? [];
    const clip = clips.find(c => c.id === clipId);
    if (!clip) return;
    const ws = clip.winStart ?? clip.start;
    const we = clip.winEnd   ?? (clip.start + clip.length);
    if (f <= ws || f >= we) return; // 창 밖/경계면 자르지 않음
    const left  = { ...structuredClone(clip), winStart: ws, winEnd: f };
    const right = { ...structuredClone(clip), id: nid ?? newId('clp_'), winStart: f, winEnd: we };
    const next = clips.flatMap(c => c.id === clipId ? [left, right] : [c]);
    _pa(doc, patches, ['layers', id, 'clips'], next);
  },

  duplicateClip(doc, cmd, patches) {
    const { id, clipId, newId: nid } = cmd;
    const layer = doc.layers[id];
    if (!layer) return;
    const clip = (layer.clips ?? []).find(c => c.id === clipId);
    if (!clip) return;
    const dup = structuredClone(clip);
    dup.id = nid ?? newId('clp_');
    dup.start = clip.start + clip.length; // 바로 뒤에
    delete dup.winStart; delete dup.winEnd; // 복제본은 온전한 클립
    _pa(doc, patches, ['layers', id, 'clips'], [...(layer.clips ?? []), dup]);
  },
};
