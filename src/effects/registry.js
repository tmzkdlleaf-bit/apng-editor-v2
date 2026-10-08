// 이펙트 레지스트리 — 정적 import Map (id → 모듈)
// 새 효과 추가 = 파일 하나 + 아래에 import 한 줄 + Map 등록 한 줄.
import testDots from './test-dots.js';
import testLightRays from './test-light-rays.js';
import testSourceMirror from './test-source-mirror.js';

export const effects = new Map([
  [testDots.id, testDots],
  [testLightRays.id, testLightRays],
  [testSourceMirror.id, testSourceMirror],
]);

export function getEffect(id) { return effects.get(id); }
export function getAllEffects() { return [...effects.values()]; }
