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
  effect:   () => ({ effectId: null, params: {}, seed: 0, scope: 'full', box: null, sources: [] }),
  adjust:   () => ({}),
  group:    () => ({ childOrder: [], isComponent: false }),
  instance: () => ({ masterId: null, overrides: {} }),
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
      scale:    createProp(1),
      rotation: createProp(0),
      alpha:    createProp(1),
    },
    anchor:  { x: 0.5, y: 0.5 },
    clips:   [],
    mask:    null,
    adjust:  null,
    tint:    null,
    outline: null,
    exit:    null,
  };
}

export function createLayer(type, init = {}) {
  const id = newId('lyr_');
  const extras = (_LAYER_EXTRAS[type] ?? (() => ({})))();
  return { id, ..._commonFields(type), ...extras, ...init };
}

export function createDoc({
  width = 768, height = 768, fps = 12, frameCount = 24,
} = {}) {
  return {
    format:  'apng-editor',
    version: 1,
    meta: {
      width, height, fps, frameCount,
      background: { type: 'transparent' },
      playback:   'loop',
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
