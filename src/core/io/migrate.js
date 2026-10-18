// 문서 버전 마이그레이션 — version을 보고 최신으로 올린다.
// 뒤 버전이 생기면 MIGRATIONS[n] = (doc) => doc(n+1) 을 추가한다.
import { evalProp } from '../anim/prop.js';

export const CURRENT_VERSION = 3;

function _easeAt(prop, f) {
  const k = (prop?.keys ?? []).find((kk) => kk.f === f);
  return k?.ease ?? 'linear';
}

// version n → n+1 변환 함수 목록
const MIGRATIONS = {
  // v1 → v2: 변환에 가로·세로 보정(scaleX·scaleY) 추가. 기본 1이라 렌더는 그대로(픽셀 동일).
  1: (doc) => {
    const layers = {};
    for (const [id, layer] of Object.entries(doc.layers ?? {})) {
      const tr = layer.transform ?? {};
      layers[id] = {
        ...layer,
        transform: {
          ...tr,
          scaleX: tr.scaleX ?? { value: 1 },
          scaleY: tr.scaleY ?? { value: 1 },
        },
      };
    }
    return { ...doc, version: 2, layers };
  },

  // v2 → v3 (R8-1): 카메라 의미 변경. 예전 "점 (X0,Y0) 기준 줌" → 새 "가운데 기준 줌 + 화면 이동".
  //   같은 프레임의 화면 결과가 같도록: X = (cx − X0)(1 − z)/z, Y = (cy − Y0)(1 − z)/z (z=0 이면 0).
  //   키프레임이 있으면 x·y·zoom 의 키 프레임을 모두 모아 그 프레임마다 새 X/Y 키를 넣는다(줌은 그대로).
  //   키 사이 구간은 근사(옛 식은 z 에 따라 비선형).
  2: (doc) => {
    const meta = doc.meta ?? {};
    const cx = (Number(meta.width)  || 768) / 2;
    const cy = (Number(meta.height) || 768) / 2;
    const cam = doc.camera ?? {};
    const xP = cam.x, yP = cam.y, zP = cam.zoom ?? { value: 1 };
    const conv = (c0, z, center) => (z === 0 ? 0 : (center - c0) * (1 - z) / z);
    const hasKeys = (p) => Array.isArray(p?.keys) && p.keys.length > 0;

    let newX, newY;
    if (hasKeys(xP) || hasKeys(yP) || hasKeys(zP)) {
      const frames = new Set();
      for (const p of [xP, yP, zP]) for (const k of (p?.keys ?? [])) frames.add(k.f);
      const sorted = [...frames].sort((a, b) => a - b);
      const xKeys = [], yKeys = [];
      for (const f of sorted) {
        const z  = evalProp(zP, f);
        const x0 = evalProp(xP, f);
        const y0 = evalProp(yP, f);
        xKeys.push({ f, v: conv(x0, z, cx), ease: _easeAt(xP, f) });
        yKeys.push({ f, v: conv(y0, z, cy), ease: _easeAt(yP, f) });
      }
      newX = { value: xKeys[0]?.v ?? 0, keys: xKeys };
      newY = { value: yKeys[0]?.v ?? 0, keys: yKeys };
    } else {
      const z  = zP?.value ?? 1;
      newX = { value: conv(xP?.value ?? 0, z, cx) };
      newY = { value: conv(yP?.value ?? 0, z, cy) };
    }
    return { ...doc, version: 3, camera: { x: newX, y: newY, zoom: zP } };
  },
};

export function migrate(doc) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('문서를 읽을 수 없습니다.');
  }
  const v = doc.version;
  if (typeof v !== 'number') {
    throw new Error('문서 버전을 알 수 없습니다.');
  }
  if (v > CURRENT_VERSION) {
    throw new Error(`지원하지 않는 문서 버전입니다: ${v} (최신 ${CURRENT_VERSION})`);
  }
  let d = doc;
  while (d.version < CURRENT_VERSION) {
    const step = MIGRATIONS[d.version];
    if (!step) throw new Error(`버전 ${d.version} 마이그레이션 함수가 없습니다.`);
    d = step(d);
  }
  return normalizeDoc(d);
}

// ── 문서 정리(normalize) ─────────────────────────────────────────────────
// 깨진(또는 다른 도구가 만든) 문서가 그릴 때 터지지 않게 빈 자리를 기본값으로 채운다(R7-6).
// 유효한 문서에는 영향이 없다(같은 값을 그대로 되돌려 준다).
const _VALID_TYPES = new Set(['image', 'anim', 'text', 'shape', 'effect', 'adjust', 'group', 'instance']);
const _TR_DEFAULTS = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, alpha: 1 };

function _num(v, def, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}
// 이미 { value } / { keys } 꼴이면 그대로, 아니면 숫자/기본값으로 감싼다.
function _prop(p, def) {
  if (p && typeof p === 'object' && ('value' in p || 'keys' in p)) return p;
  const n = Number(p);
  return { value: Number.isFinite(n) ? n : def };
}

export function normalizeDoc(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('문서를 읽을 수 없습니다.');

  const meta = (doc.meta && typeof doc.meta === 'object') ? doc.meta : {};
  const nmeta = {
    ...meta,
    width:      _num(meta.width, 768, 1, 8192),
    height:     _num(meta.height, 768, 1, 8192),
    fps:        _num(meta.fps, 12, 1, 240),
    frameCount: _num(meta.frameCount, 24, 1, 100000),
    background: meta.background ?? { type: 'transparent' },
    playback:   meta.playback ?? 'loop',
  };

  const cam = (doc.camera && typeof doc.camera === 'object') ? doc.camera : {};
  const ncam = { x: _prop(cam.x, 0), y: _prop(cam.y, 0), zoom: _prop(cam.zoom, 1) };

  const layersIn = (doc.layers && typeof doc.layers === 'object') ? doc.layers : {};
  const layers = {};
  for (const [id, layer] of Object.entries(layersIn)) {
    if (!layer || typeof layer !== 'object') continue;
    if (!_VALID_TYPES.has(layer.type)) continue; // 알 수 없는 종류는 건너뜀
    const tr = (layer.transform && typeof layer.transform === 'object') ? layer.transform : {};
    const transform = {};
    for (const k of Object.keys(_TR_DEFAULTS)) transform[k] = _prop(tr[k], _TR_DEFAULTS[k]);
    layers[id] = { ...layer, transform };
  }

  // 없는 레이어 id 는 order/childOrder 에서 뺀다. 사라진 부모를 가리키면 최상위로.
  const _clean = (arr) => (Array.isArray(arr) ? arr.filter((id) => layers[id]) : []);
  const order = _clean(doc.order);
  for (const id of Object.keys(layers)) {
    const l = layers[id];
    if (l.type === 'group') l.childOrder = _clean(l.childOrder);
    if (l.parentId && !layers[l.parentId]) l.parentId = null;
  }
  // 어디에도 안 담긴 최상위 레이어는 유실되지 않게 order 에 넣는다.
  const inOrder = new Set(order);
  for (const id of Object.keys(layers)) {
    const l = layers[id];
    const inChild = l.parentId && layers[l.parentId]?.childOrder?.includes(id);
    if (!inOrder.has(id) && !inChild && !l.parentId) order.push(id);
  }

  return { ...doc, version: CURRENT_VERSION, meta: nmeta, camera: ncam, order, layers, assets: doc.assets ?? {} };
}
