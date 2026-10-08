// 모션 프리셋 레지스트리(F3) — 계약은 contract.js 참고.
// 지금은 "틀을 시험할" 프리셋 3개만(시험용). 37종 내용은 5단계에서.
// 렌더(core/anim/clip.js)는 이 Map 을 ctx.motions 로 받아 motion.evaluate(t, params) 를 부른다.

// [시험] 흔들기 — 좌우로 흔드는 강조. 루프 안전(t0=t1=0).
const _testShake = {
  id: 'test-shake',
  name: '[시험] 흔들기',
  category: '강조',
  kind: 'emphasis',
  defaultLength: 12,
  params: [
    { key: 'amplitude', label: '진폭', type: 'number', default: 12, min: 1, max: 100, step: 1 },
    { key: 'cycles',    label: '횟수', type: 'number', default: 3,  min: 1, max: 10,  step: 1 },
  ],
  evaluate(t, p) {
    const amp = p.amplitude ?? 12, cyc = p.cycles ?? 3;
    return { x: amp * Math.sin(2 * Math.PI * cyc * t) };
  },
};

// [시험] 페이드 인 — 투명 → 불투명. 등장형.
const _testFadeIn = {
  id: 'test-fade-in',
  name: '[시험] 페이드 인',
  category: '등장',
  kind: 'enter',
  defaultLength: 12,
  params: [],
  evaluate(t) {
    return { alpha: t }; // 0 → 1
  },
};

// [시험] 위아래 둥실 — 위아래로 둥실. 루프형(t0=t1=0).
const _testFloat = {
  id: 'test-float',
  name: '[시험] 위아래 둥실',
  category: '반복',
  kind: 'loop',
  defaultLength: 24,
  params: [
    { key: 'amplitude', label: '진폭', type: 'number', default: 20, min: 1, max: 100, step: 1 },
  ],
  evaluate(t, p) {
    const amp = p.amplitude ?? 20;
    return { y: amp * Math.sin(2 * Math.PI * t) };
  },
};

const _REGISTRY = new Map([
  [_testShake.id,  _testShake],
  [_testFadeIn.id, _testFadeIn],
  [_testFloat.id,  _testFloat],
]);

// 계약 하위호환: 일부 코드가 motion.group 을 읽을 수 있어 kind 를 group 으로도 노출.
for (const m of _REGISTRY.values()) { if (m.group === undefined) m.group = m.kind; }

export function getMotion(id) { return _REGISTRY.get(id); }
export function getAllMotions() { return [..._REGISTRY.values()]; }
export default _REGISTRY;
