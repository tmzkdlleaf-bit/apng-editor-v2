// 퇴장(exit) 모션 11종 — t=0 '제자리(identity)', t=1 '빠져나간 상태'.
// 클립 hold='after' 등이면 끝난 뒤 t=1(사라진 상태)을 유지. 이동 단위는 env.w/env.h 비율.
import { ease } from '../core/anim/easing.js';

const DIST = { key: 'distance', label: '거리', type: 'number', default: 1, min: 0.1, max: 4, step: 0.1 };
const FADE = { key: 'fade', label: '함께 페이드', type: 'bool', default: true };

function slide(id, name, desc, axis, sign) {
  return {
    id, name, category: '퇴장', kind: 'exit', defaultLength: 12,
    description: desc,
    params: [DIST, FADE],
    evaluate(t, p, env = {}) {
      const d = p.distance ?? 1;
      const e = ease('easeInCubic', t);
      const base = axis === 'x' ? (env.w ?? 100) : (env.h ?? 100);
      const off = sign * d * base * e;
      const out = axis === 'x' ? { x: off } : { y: off };
      if (p.fade ?? true) out.alpha = Math.max(0, 1 - e * 1.4);
      return out;
    },
  };
}

const fadeOut = {
  id: 'fade-out', name: '페이드 아웃', category: '퇴장', kind: 'exit', defaultLength: 12,
  description: '서서히 투명해지며 사라진다',
  params: [],
  evaluate(t) { return { alpha: 1 - t }; },
};

const popOut = {
  id: 'pop-out', name: '팝 퇴장', category: '퇴장', kind: 'exit', defaultLength: 12,
  description: '쏙 줄어들며 사라진다',
  params: [FADE],
  evaluate(t, p) {
    const e = ease('easeInCubic', t);
    const out = { scale: Math.max(0, 1 - e) };
    if (p.fade ?? true) out.alpha = Math.max(0, 1 - t * 1.5);
    return out;
  },
};

const zoomOut = {
  id: 'zoom-out', name: '줌 아웃', category: '퇴장', kind: 'exit', defaultLength: 12,
  description: '크게 부풀며 사라진다',
  params: [
    { key: 'endScale', label: '끝 배율', type: 'number', default: 2, min: 1.1, max: 5, step: 0.1 },
    FADE,
  ],
  evaluate(t, p) {
    const s1 = p.endScale ?? 2;
    const e = ease('easeInCubic', t);
    const out = { scale: 1 + (s1 - 1) * e };
    if (p.fade ?? true) out.alpha = 1 - t;
    return out;
  },
};

const spinOut = {
  id: 'spin-out', name: '회전 퇴장', category: '퇴장', kind: 'exit', defaultLength: 14,
  description: '빙글 돌며 작아져 사라진다',
  params: [
    { key: 'turns', label: '회전 수', type: 'number', default: 1, min: 1, max: 4, step: 1 },
    FADE,
  ],
  evaluate(t, p) {
    const turns = Math.max(1, Math.round(p.turns ?? 1));
    const e = ease('easeInCubic', t);
    const out = { rotation: 360 * turns * e, scale: Math.max(0, 1 - e) };
    if (p.fade ?? true) out.alpha = Math.max(0, 1 - t * 1.5);
    return out;
  },
};

const dropOut = {
  id: 'drop-out', name: '떨어지며 퇴장', category: '퇴장', kind: 'exit', defaultLength: 14,
  description: '아래로 떨어지며 사라진다',
  params: [DIST, FADE],
  evaluate(t, p, env = {}) {
    const d = p.distance ?? 1;
    const e = ease('easeInCubic', t);
    const out = { y: d * (env.h ?? 100) * e };
    if (p.fade ?? true) out.alpha = Math.max(0, 1 - t * 1.2);
    return out;
  },
};

const flipOutX = {
  id: 'flip-out-x', name: '가로 접힘 퇴장', category: '퇴장', kind: 'exit', defaultLength: 12,
  description: '카드가 가로로 접히며 사라진다',
  params: [FADE],
  evaluate(t, p) {
    const e = ease('easeInCubic', t);
    const out = { scaleX: Math.max(0, 1 - e) };
    if (p.fade ?? true) out.alpha = Math.max(0, 1 - t * 1.5);
    return out;
  },
};

const shrinkFade = {
  id: 'shrink-fade', name: '쪼그라들며 퇴장', category: '퇴장', kind: 'exit', defaultLength: 12,
  description: '작아지며 가라앉아 사라진다',
  params: [],
  evaluate(t, p, env = {}) {
    const e = ease('easeInCubic', t);
    return { scale: 1 - 0.7 * e, y: 0.3 * (env.h ?? 100) * e, alpha: 1 - t };
  },
};

export default [
  fadeOut,
  slide('slide-out-left', '왼쪽으로 퇴장', '왼쪽으로 미끄러져 나간다', 'x', -1),
  slide('slide-out-right', '오른쪽으로 퇴장', '오른쪽으로 미끄러져 나간다', 'x', 1),
  slide('slide-out-up', '위로 퇴장', '위로 미끄러져 올라가 사라진다', 'y', -1),
  slide('slide-out-down', '아래로 퇴장', '아래로 미끄러져 내려가 사라진다', 'y', 1),
  popOut,
  zoomOut,
  spinOut,
  dropOut,
  flipOutX,
  shrinkFade,
];
