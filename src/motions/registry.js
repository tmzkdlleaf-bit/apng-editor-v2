// 모션 계약: { id, name, group, params, evaluate(t, params, {width, height}) }
// loop 모션은 evaluate(0) === evaluate(1) 보장 필수

const _testFloat = {
  id:    'test-float',
  name:  '[시험] 부유',
  group: 'loop',
  params: [
    { key: 'amplitude', label: '진폭', min: 1, max: 100, step: 1, default: 20 },
  ],
  evaluate(t, params, _ctx) {
    const amp = params.amplitude ?? 20;
    return { y: amp * Math.sin(2 * Math.PI * t) };
  },
};

const _REGISTRY = new Map([
  [_testFloat.id, _testFloat],
]);

export function getMotion(id) { return _REGISTRY.get(id); }
export function getAllMotions() { return [..._REGISTRY.values()]; }
export default _REGISTRY;
