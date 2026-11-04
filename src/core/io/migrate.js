// 문서 버전 마이그레이션 — version을 보고 최신으로 올린다.
// 뒤 버전이 생기면 MIGRATIONS[n] = (doc) => doc(n+1) 을 추가한다.
import { evalProp } from '../anim/prop.js';
import { reduceKeys } from '../anim/reduce-keys.js';
import { normalizeVariants } from '../doc/variants.js';

export const CURRENT_VERSION = 9;

// 변환한 새 X/Y 키를 줄일 때 허용 오차(px). 렌더는 정수 프레임에서만 하므로
// 직선 보간 오차가 이 값 이하인 중간 키는 뺀다(R11-2).
const CAMERA_REDUCE_TOL = 0.5;

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
  //   옛 식은 줌(z)에 따라 비선형이라, 키프레임에만 새 키를 넣으면 키 사이가 크게 어긋났다(R11-2).
  //   렌더는 정수 프레임에서만 하므로 0..frameCount 모든 정수에 새 X/Y 키를 넣으면 모든 프레임에서 정확하다.
  //   그 뒤 직선 보간 오차 0.5px 이하인 중간 키는 뺀다(줌 키는 그대로 둔다).
  2: (doc) => {
    const meta = doc.meta ?? {};
    const cx = (Number(meta.width)  || 768) / 2;
    const cy = (Number(meta.height) || 768) / 2;
    const frameCount = Math.max(1, Math.round(Number(meta.frameCount) || 24));
    const cam = doc.camera ?? {};
    const xP = cam.x, yP = cam.y, zP = cam.zoom ?? { value: 1 };
    const conv = (c0, z, center) => (z === 0 ? 0 : (center - c0) * (1 - z) / z);
    const hasKeys = (p) => Array.isArray(p?.keys) && p.keys.length > 0;

    let newX, newY;
    const zeroZoomFrames = [];
    if (hasKeys(xP) || hasKeys(yP) || hasKeys(zP)) {
      const xPts = [], yPts = [];
      let zMax = 1;
      for (let f = 0; f <= frameCount; f++) {
        const z  = evalProp(zP, f);
        if (z === 0) zeroZoomFrames.push(f);
        if (z > zMax) zMax = z;
        xPts.push({ f, v: conv(evalProp(xP, f), z, cx) });
        yPts.push({ f, v: conv(evalProp(yP, f), z, cy) });
      }
      // 키 X 를 δ 만큼 근사하면 화면 이동 오차는 z·δ 가 된다(렌더가 z 를 곱함). 모든 프레임에서
      // 화면 오차를 0.5px 이하로 두려면 키 허용치를 최대 줌으로 나눈다(R11-2).
      const tol = CAMERA_REDUCE_TOL / Math.max(1, zMax);
      // 새 키의 이징은 linear(정수 프레임마다 정확하므로 보간은 직선으로 충분).
      const xKeys = reduceKeys(xPts, tol).map((k) => ({ f: k.f, v: k.v, ease: 'linear' }));
      const yKeys = reduceKeys(yPts, tol).map((k) => ({ f: k.f, v: k.v, ease: 'linear' }));
      newX = { value: xKeys[0]?.v ?? 0, keys: xKeys };
      newY = { value: yKeys[0]?.v ?? 0, keys: yKeys };
    } else {
      const z  = zP?.value ?? 1;
      if (z === 0) zeroZoomFrames.push(0);
      newX = { value: conv(xP?.value ?? 0, z, cx) };
      newY = { value: conv(yP?.value ?? 0, z, cy) };
    }
    // 예전 카메라 값을 남겨 둔다(렌더는 쓰지 않음 — 나중에 복원·디버깅용).
    const camera = { x: newX, y: newY, zoom: zP, _v2: { x: xP ?? null, y: yP ?? null, zoom: zP ?? null } };
    if (zeroZoomFrames.length) camera._v2.zeroZoomFrames = zeroZoomFrames;
    return { ...doc, version: 3, camera };
  },

  // v3 → v4 (R16): 효과 수치 키프레임(paramAnim) 추가. 예전 문서는 paramAnim 이 없을 뿐이며
  //   렌더 결과는 그대로다(effect.js 는 paramAnim 없으면 정적 params 를 그대로 쓴다). 올림만 한다.
  3: (doc) => ({ ...doc, version: 4 }),

  // v4 → v5 (R17): 레이어에 효과 쌓기(fx·fxOrder) 추가. 예전 문서는 fx 가 없을 뿐이며
  //   fx 가 없거나 비어 있으면 렌더 경로는 기존과 같다. 올림만 한다.
  4: (doc) => ({ ...doc, version: 5 }),

  // v5 → v6 (R18): 곡선 경로(키의 sp)·autoOrient 추가. sp 가 없으면 직선 보간 그대로라 결과 동일. 올림만.
  5: (doc) => ({ ...doc, version: 6 }),

  // v6 → v7 (R20): 따라가기(followId)·움직임 번짐(doc.meta.motionBlur·layer.motionBlur) 추가.
  //   followId 없음·번짐 스위치 꺼짐이 기본이라 렌더 경로·결과는 기존과 같다(픽셀 동일). 올림만.
  6: (doc) => ({ ...doc, version: 7 }),

  // v7 → v8 (R21): 펜 가리기(layer.masks) 추가. masks 없으면 기존 렌더 경로 그대로(픽셀 동일). 올림만.
  7: (doc) => ({ ...doc, version: 8 }),

  // v8 → v9 (R22b): 그룹/인스턴스 시간(layer.time) 추가. time=null 이면 기존 렌더 경로 그대로(픽셀 동일).
  //   예전 문서의 그룹·인스턴스에 time:null 을 채워 모양을 맞춘다.
  8: (doc) => {
    const layers = {};
    for (const [id, l] of Object.entries(doc.layers ?? {})) {
      if (l && (l.type === 'group' || l.type === 'instance') && l.time === undefined) {
        layers[id] = { ...l, time: null };
      } else {
        layers[id] = l;
      }
    }
    return { ...doc, version: 9, layers };
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
  if (cam._v2 && typeof cam._v2 === 'object') ncam._v2 = cam._v2; // 변환 때 남긴 예전 카메라 값 보존(렌더 미사용)

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

  // 세트(바리에이션, R13-1)는 선택 필드 — 있으면 보존하되 없는 레이어·잘못된 슬롯은 정리.
  const out = { ...doc, version: CURRENT_VERSION, meta: nmeta, camera: ncam, order, layers, assets: doc.assets ?? {} };
  const variants = normalizeVariants(doc.variants, layers);
  if (variants) out.variants = variants; else delete out.variants;
  return out;
}
