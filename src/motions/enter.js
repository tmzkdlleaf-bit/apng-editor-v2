// 등장(enter) 모션 12종 — t=0 '들어오는 상태', t=1 '제자리(identity)'.
// 클립 기본 이징은 선형이라 각 모션이 특성 이징을 직접 넣는다. 이동 단위는 env.w/env.h 비율.
import { ease } from '../core/anim/easing.js';

const DIST = { key: 'distance', label: '거리', type: 'number', default: 1, min: 0.1, max: 4, step: 0.1 };
const FADE = { key: 'fade', label: '함께 페이드', type: 'bool', default: true };

function slide(id, name, desc, axis, sign) {
  return {
    id, name, category: '등장', kind: 'enter', defaultLength: 12,
    description: desc,
    params: [DIST, FADE],
    evaluate(t, p, env = {}) {
      const d = p.distance ?? 1;
      const e = ease('easeOutCubic', t);
      const base = axis === 'x' ? (env.w ?? 100) : (env.h ?? 100);
      const off = sign * d * base * (1 - e);
      const out = axis === 'x' ? { x: off } : { y: off };
      if (p.fade ?? true) out.alpha = Math.min(1, e * 1.4);
      return out;
    },
  };
}

const fadeIn = {
  id: 'fade-in', name: '페이드 인', category: '등장', kind: 'enter', defaultLength: 12,
  description: '투명에서 서서히 나타난다',
  params: [],
  evaluate(t) { return { alpha: t }; },
};

const popIn = {
  id: 'pop-in', name: '팝 등장', category: '등장', kind: 'enter', defaultLength: 12,
  description: '탱글하게 튀어나온다',
  params: [FADE],
  evaluate(t, p) {
    const s = ease('easeOutBack', t);
    const out = { scale: Math.max(0, s), scaleX: 1, scaleY: 1 };
    if (p.fade ?? true) out.alpha = Math.min(1, t * 3);
    return out;
  },
};

const bounceIn = {
  id: 'bounce-in', name: '바운스 등장', category: '등장', kind: 'enter', defaultLength: 16,
  description: '통통 튀며 나타난다',
  params: [FADE],
  evaluate(t, p) {
    const s = ease('easeOutBounce', t);
    const out = { scale: Math.max(0, s) };
    if (p.fade ?? true) out.alpha = Math.min(1, t * 3);
    return out;
  },
};

const zoomIn = {
  id: 'zoom-in', name: '줌 인', category: '등장', kind: 'enter', defaultLength: 12,
  description: '크게 다가오며 나타난다',
  params: [
    { key: 'startScale', label: '시작 배율', type: 'number', default: 2, min: 1.1, max: 5, step: 0.1 },
    FADE,
  ],
  evaluate(t, p) {
    const s0 = p.startScale ?? 2;
    const e = ease('easeOutCubic', t);
    const out = { scale: s0 + (1 - s0) * e };
    if (p.fade ?? true) out.alpha = t;
    return out;
  },
};

const spinIn = {
  id: 'spin-in', name: '회전 등장', category: '등장', kind: 'enter', defaultLength: 14,
  description: '빙글 돌며 커진다',
  params: [
    { key: 'turns', label: '회전 수', type: 'number', default: 1, min: 1, max: 4, step: 1 },
    FADE,
  ],
  evaluate(t, p) {
    const turns = Math.max(1, Math.round(p.turns ?? 1));
    const e = ease('easeOutCubic', t);
    const out = { rotation: -360 * turns * (1 - e), scale: e };
    if (p.fade ?? true) out.alpha = Math.min(1, t * 2);
    return out;
  },
};

const dropIn = {
  id: 'drop-in', name: '떨어지며 등장', category: '등장', kind: 'enter', defaultLength: 16,
  description: '위에서 떨어져 바닥에 튄다',
  params: [DIST, FADE],
  evaluate(t, p, env = {}) {
    const d = p.distance ?? 1;
    const e = ease('easeOutBounce', t);
    const out = { y: -d * (env.h ?? 100) * (1 - e) };
    if (p.fade ?? true) out.alpha = Math.min(1, t * 4);
    return out;
  },
};

const riseFade = {
  id: 'rise-fade', name: '떠오르며 등장', category: '등장', kind: 'enter', defaultLength: 12,
  description: '아래에서 살짝 떠오르며 나타난다',
  params: [
    { key: 'distance', label: '거리', type: 'number', default: 0.4, min: 0.05, max: 2, step: 0.05 },
  ],
  evaluate(t, p, env = {}) {
    const d = p.distance ?? 0.4;
    const e = ease('easeOutCubic', t);
    return { y: d * (env.h ?? 100) * (1 - e), alpha: t };
  },
};

const flipInX = {
  id: 'flip-in-x', name: '가로 펼침 등장', category: '등장', kind: 'enter', defaultLength: 12,
  description: '카드가 가로로 펼쳐지듯 나타난다',
  params: [FADE],
  evaluate(t, p) {
    const e = ease('easeOutCubic', t);
    const out = { scaleX: e };
    if (p.fade ?? true) out.alpha = Math.min(1, t * 4);
    return out;
  },
};

export default [
  fadeIn,
  slide('slide-in-left', '왼쪽에서 등장', '왼쪽에서 미끄러져 들어온다', 'x', -1),
  slide('slide-in-right', '오른쪽에서 등장', '오른쪽에서 미끄러져 들어온다', 'x', 1),
  slide('slide-in-up', '아래에서 등장', '아래에서 미끄러져 올라온다', 'y', 1),
  slide('slide-in-down', '위에서 등장', '위에서 미끄러져 내려온다', 'y', -1),
  popIn,
  bounceIn,
  zoomIn,
  spinIn,
  dropIn,
  riseFade,
  flipInX,
];
