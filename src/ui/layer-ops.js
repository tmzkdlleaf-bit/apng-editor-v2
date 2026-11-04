// R23b — 패널(프로젝트·효과)과 끌어 놓기가 함께 쓰는 레이어 만들기·효과 더하기 공용 동작.
//   레이어 추가 메뉴·효과 쌓기·움직임 섹션에 흩어져 있던 "효과 레이어 만들기 / 모션 더하기"를 한곳으로.
//   되돌리기 기록은 각 동작당 1건.
import { createLayer, createClip } from '../core/doc/schema.js';
import { getEffect } from '../effects/registry.js';
import { getMotion } from '../motions/registry.js';
import { defaultParams } from '../motions/contract.js';

// 모션이 바꾸는 transform 속성(x/y/scale/rotation/alpha) — 키 덮어쓰기 확인용(motion-section 과 동일).
function _affectedProps(motion) {
  const p = defaultParams(motion);
  const set = new Set();
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const d = motion.evaluate(t, p) ?? {};
    if ((d.x ?? 0) !== 0) set.add('x');
    if ((d.y ?? 0) !== 0) set.add('y');
    if ((d.scale ?? 1) !== 1) set.add('scale');
    if ((d.rotation ?? 0) !== 0) set.add('rotation');
    if ((d.alpha ?? 1) !== 1) set.add('alpha');
  }
  return set;
}

// 효과 레이어 하나를 기본 파라미터로 만든다(화면 전체). layer-add 의 _addEffect 와 같은 결과.
export function addEffectLayer(store, editorState, effectId, { index } = {}) {
  const effect = getEffect(effectId);
  if (!effect) return null;
  const doc = store.get();
  const params = {};
  for (const p of (effect.params ?? [])) params[p.key] = p.default;
  const layer = createLayer('effect', { name: effect.name.replace(/^\[시험\]\s*/, ''), effectId });
  layer.params = params;
  layer.seed = Math.floor(Math.random() * 1e6);
  layer.transform.x.value = 0; layer.transform.y.value = 0;
  store.apply({ type: 'addLayer', layer, index: index ?? doc.order.length });
  editorState.set({ selection: [layer.id] });
  return layer.id;
}

// 레이어 효과 쌓기에 효과 하나를 더한다(addFx). 되돌리기 1건.
export function addFxToLayer(store, layerId, effectId) {
  if (!store.get().layers[layerId]) return;
  store.apply({ type: 'addFx', id: layerId, effectId });
}

// 선택(또는 지정) 레이어들에 모션 클립을 더한다. 현재 프레임에서 기본 길이로. 되돌리기 1건.
export function addMotionToLayers(store, editorState, ids, motionId) {
  const motion = getMotion(motionId);
  if (!motion) return;
  const list = (ids ?? []).filter((id) => store.get().layers[id]);
  if (!list.length) return;
  const f = editorState.get().f;
  // 키 있는 속성에 영향 주는 모션이면 확인(모션 갤러리와 같은 동작).
  const affected = _affectedProps(motion);
  const doc = store.get();
  const conflict = list.some((id) => {
    const tr = doc.layers[id].transform ?? {};
    return [...affected].some((k) => (tr[k]?.keys ?? []).length > 0);
  });
  if (conflict && typeof confirm === 'function' && !confirm('이 속성에 키프레임이 있습니다. 모션을 더할까요?')) return;
  const cmds = list.map((id) => ({ type: 'addClip', id, clip: createClip(motion, { start: f, length: motion.defaultLength }) }));
  store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
}

// 문서에 이미 있는 에셋(doc.assets[assetId])으로 이미지/움직이는 이미지 레이어를 만든다.
//   x, y 를 주면 그 자리에, 없으면 화면 가운데. index 로 쌓임 순서를 정한다. 되돌리기 1건.
export function addAssetLayer(store, editorState, assetId, { x, y, index } = {}) {
  const doc = store.get();
  const asset = doc.assets?.[assetId];
  if (!asset) return null;
  const type = asset.animated ? 'anim' : 'image';
  const layer = createLayer(type, { name: asset.name || '이미지', assetId });
  layer.transform.x.value = (x != null) ? Math.round(x) : Math.round(doc.meta.width / 2);
  layer.transform.y.value = (y != null) ? Math.round(y) : Math.round(doc.meta.height / 2);
  store.apply({ type: 'addLayer', layer, index: index ?? doc.order.length });
  editorState.set({ selection: [layer.id] });
  return layer.id;
}
