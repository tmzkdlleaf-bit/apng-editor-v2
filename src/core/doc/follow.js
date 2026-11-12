// R20-B 따라가기(진짜 부모) 굽기 + R17 fx id 재발급.
//   (R23d item 12: commands.js 에서 떼어냄, 동작 동일)
import { newId } from './schema.js';
import { evalProp } from '../anim/prop.js';
import { localWithFollow } from '../anim/world.js';
import { _pa } from './patch.js';

// ── R20-B 따라가기 연결/해제: 화면 위치 유지(keepPlace) ─────────────────────
// P = 대상의 그룹-로컬 변형. connect 는 자기 로컬을 P 의 역변환(=P 로컬 공간)으로,
// disconnect 는 compose(P, 자기) 를 구워 standalone 값으로 만든다.
//   한계(보고): P 는 연결 프레임 하나로 굳힌 상수라, 대상이 애니메이션하면 다른 프레임에서는 어긋날 수 있다
//   (애프터 이펙트와 같은 방식). 위치 키가 x·y 서로 다른 프레임에 있으면 회전 매핑이 근사다.
export function _followsCycle(doc, startId, id) {
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
export function _followBake(doc, patches, id, P, invert) {
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
export function _releaseStrandedFollows(doc, patches, f = 0) {
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
