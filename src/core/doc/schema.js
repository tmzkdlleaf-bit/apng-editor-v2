export const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light',
  'difference', 'exclusion',
];

let _idGen = (prefix) => prefix + Math.random().toString(36).slice(2, 12).padEnd(10, '0');

export function setIdGen(fn) { _idGen = fn; }
export function newId(prefix = 'lyr_') { return _idGen(prefix); }

export function createProp(value) {
  return { value };
}

const _LAYER_EXTRAS = {
  image:    () => ({ assetId: null }),
  anim:     () => ({ assetId: null, timing: { mode: 'loop', speed: 1, offset: 0 } }),
  text:     () => ({
    text: '', font: 'IBM Plex Sans KR', size: 48, weight: 400,
    color: '#ffffff', align: 'center', lineHeight: 1.3,
    letterSpacing: 0, stroke: null, shadow: null, reveal: null, charAnim: null,
  }),
  shape:    () => ({ shape: { kind: 'rect', w: 100, h: 100, radius: 0, sides: 6, fill: '#ffffff', stroke: null } }),
  effect:   () => ({ effectId: null, params: {}, paramAnim: {}, seed: 0, scope: 'full', box: null, sources: [] }),
  adjust:   () => ({}),
  // R22b: time=null 이면 기존과 동일(그룹 시간 없음). 사용자가 켜면 { offset, speed, outside, length, remap } 로 채워진다.
  group:    () => ({ childOrder: [], isComponent: false, time: null }),
  instance: () => ({ masterId: null, overrides: {}, time: null }),
};

function _commonFields(type) {
  return {
    type,
    name: type,
    parentId: null,
    visible: true,
    locked: false,
    blend: 'normal',
    opacity: 1,
    transform: {
      x:        createProp(0),
      y:        createProp(0),
      scale:    createProp(1),   // 전체(비율 고정) 크기
      scaleX:   createProp(1),   // 가로 보정(전체 scale에 곱)
      scaleY:   createProp(1),   // 세로 보정(전체 scale에 곱)
      rotation: createProp(0),
      alpha:    createProp(1),
    },
    anchor:  { x: 0.5, y: 0.5 },
    clips:   [],
    fx:       {},   // R17: 레이어에 쌓는 효과 { [fxId]: { effectId, enabled, params, paramAnim, seed, mix, clip } }
    fxOrder:  [],   // 위→아래 적용 순서(fxId 목록)
    autoOrient: false, // R18: 경로 방향 따라 회전
    followId: null,    // R20-B: 따라갈 대상 레이어 id(같은 그룹). 그룹 소속(parentId)과 별개.
    motionBlur: false, // R20-C: 레이어 번짐 스위치(문서 스위치와 둘 다 켜야 번진다)
    mask:    null,
    adjust:  null,
    tint:    null,
    outline: null,
    exit:    null,
  };
}

// R17: 쌓는 효과 한 개. mix 는 Prop({value,keys}) 라 키 가능. paramAnim 은 R16 과 같은 구조.
export function createFx(effectId, init = {}) {
  return {
    effectId,
    enabled:   init.enabled   ?? true,
    params:    init.params    ?? {},
    paramAnim: init.paramAnim ?? {},
    seed:      init.seed      ?? 1,
    mix:       init.mix       ?? createProp(1),
    clip:      init.clip      ?? true,
  };
}

// R21: 펜/도형 가리기 한 개. path·feather·expand·opacity 는 Prop(키 가능).
export function createMask(init = {}) {
  return {
    id:      init.id      ?? newId('msk_'),
    name:    init.name    ?? '가리기',
    mode:    init.mode    ?? 'add',       // add|subtract|intersect|difference|none
    invert:  init.invert  ?? false,
    path:    init.path    ?? createProp({ closed: true, pts: [] }),
    feather: init.feather ?? createProp(0),
    expand:  init.expand  ?? createProp(0),
    opacity: init.opacity ?? createProp(1),
  };
}

// 레이어 자체 좌표(px) 기준 사각형·타원 경로 점. 타원은 4점 + 손잡이(0.5523 비율).
export function rectMaskPts(x, y, w, h) {
  const p = (px, py) => ({ x: px, y: py, ix: 0, iy: 0, ox: 0, oy: 0 });
  return { closed: true, pts: [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)] };
}
export function ellipseMaskPts(cx, cy, rx, ry) {
  const kx = rx * 0.5523, ky = ry * 0.5523;
  return { closed: true, pts: [
    { x: cx,      y: cy - ry, ix: -kx, iy: 0,   ox: kx,  oy: 0 },
    { x: cx + rx, y: cy,      ix: 0,   iy: -ky, ox: 0,   oy: ky },
    { x: cx,      y: cy + ry, ix: kx,  iy: 0,   ox: -kx, oy: 0 },
    { x: cx - rx, y: cy,      ix: 0,   iy: ky,  ox: 0,   oy: -ky },
  ] };
}

export function createLayer(type, init = {}) {
  const id = newId('lyr_');
  const extras = (_LAYER_EXTRAS[type] ?? (() => ({})))();
  return { id, ..._commonFields(type), ...extras, ...init };
}

// motion: { id, kind, defaultLength, params: [{key, default}] }  (contract.js 참고)
// init.length 기본값: motion.defaultLength → 24
export function createClip(motion, init = {}) {
  const defaultParams = {};
  for (const p of (motion?.params ?? [])) {
    defaultParams[p.key] = p.default;
  }
  const length = init.length ?? motion?.defaultLength ?? 24;
  const cycle  = init.cycle  ?? length;
  const isLoop = (motion?.kind ?? motion?.group) === 'loop';
  return {
    id:       init.id       ?? newId('clp_'),
    motionId: init.motionId ?? motion?.id ?? null,
    start:    init.start    ?? 0,
    length,
    cycle,
    params:   { ...defaultParams, ...(init.params ?? {}) },
    gain:     init.gain     ?? 1,
    ease:     init.ease     ?? null,
    loop:     init.loop     !== undefined ? init.loop : isLoop,
    hold:     init.hold     ?? 'both',
  };
}

export function createDoc({
  width = 768, height = 768, fps = 12, frameCount = 24,
} = {}) {
  return {
    format:  'apng-editor',
    version: 9,
    meta: {
      width, height, fps, frameCount,
      background: { type: 'transparent' },
      playback:   'loop',
      // R20-C: 움직임 번짐 문서 설정. on + 레이어 스위치가 둘 다 켜져야 번진다.
      motionBlur: { on: false, shutter: 180, phase: -90, samples: 8 },
    },
    camera: {
      x:    createProp(0),
      y:    createProp(0),
      zoom: createProp(1),
    },
    order:  [],
    layers: {},
    assets: {},
  };
}
