// 이펙트 레지스트리 — 정적 import Map (id → 모듈)
import testDots from './test-dots.js';

export const effects = new Map([
  [testDots.id, testDots],
]);

// 추가 이펙트는 이 파일에 import해서 등록
