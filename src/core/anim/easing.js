const _BACK_C1 = 1.70158;
const _BACK_C2 = _BACK_C1 * 1.525;
const _ELASTIC_C4 = (2 * Math.PI) / 3;
const _BOUNCE_N1 = 7.5625;
const _BOUNCE_D1 = 2.75;

function _easeOutBounce(t) {
  let u = t;
  if (u < 1 / _BOUNCE_D1) {
    return _BOUNCE_N1 * u * u;
  } else if (u < 2 / _BOUNCE_D1) {
    u -= 1.5 / _BOUNCE_D1;
    return _BOUNCE_N1 * u * u + 0.75;
  } else if (u < 2.5 / _BOUNCE_D1) {
    u -= 2.25 / _BOUNCE_D1;
    return _BOUNCE_N1 * u * u + 0.9375;
  }
  u -= 2.625 / _BOUNCE_D1;
  return _BOUNCE_N1 * u * u + 0.984375;
}

export function cubicBezierEval(x1, y1, x2, y2, progress) {
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  let lo = 0, hi = 1, t = progress;
  for (let i = 0; i < 24; i++) {
    const bx = 3*t*(1-t)*(1-t)*x1 + 3*t*t*(1-t)*x2 + t*t*t;
    const d  = bx - progress;
    if (Math.abs(d) < 1e-7) break;
    if (d < 0) lo = t; else hi = t;
    t = (lo + hi) * 0.5;
  }
  return 3*t*(1-t)*(1-t)*y1 + 3*t*t*(1-t)*y2 + t*t*t;
}

const _EASINGS = {
  linear:         t => t,
  hold:           t => (t >= 1 ? 1 : 0),   // 정지 키: 다음 키에 닿기 전까지 앞 값 유지(그래프는 계단)
  easeIn:         t => t * t,
  easeOut:        t => t * (2 - t),
  easeInOut:      t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t,
  easeInCubic:    t => t * t * t,
  easeOutCubic:   t => 1 - (1 - t) ** 3,
  easeInOutCubic: t => t < 0.5 ? 4*t*t*t : 1 - (-2*t+2)**3 / 2,
  easeOutQuint:   t => 1 - (1 - t) ** 5,
  easeInOutQuint: t => t < 0.5 ? 16*t**5 : 1 - (-2*t+2)**5 / 2,
  easeInOutSine:  t => -(Math.cos(Math.PI * t) - 1) / 2,
  easeOutBack:    t => 1 + 2.70158*(t-1)**3 + 1.70158*(t-1)**2,
  easeInOutBack:  t => t < 0.5
    ? (Math.pow(2*t, 2) * ((_BACK_C2+1)*2*t - _BACK_C2)) / 2
    : (Math.pow(2*t-2, 2) * ((_BACK_C2+1)*(t*2-2) + _BACK_C2) + 2) / 2,
  easeOutElastic: t => t === 0 ? 0 : t === 1 ? 1
    : Math.pow(2, -10*t) * Math.sin((t*10 - 0.75) * _ELASTIC_C4) + 1,
  easeOutBounce:  t => _easeOutBounce(t),
  cssEase:        t => cubicBezierEval(0.25, 0.1, 0.25, 1.0, t),
  cssEaseIn:      t => cubicBezierEval(0.42, 0,   1.0,  1.0, t),
  cssEaseOut:     t => cubicBezierEval(0,    0,   0.58, 1.0, t),
  cssEaseInOut:   t => cubicBezierEval(0.42, 0,   0.58, 1.0, t),
};

export function ease(name, t, bezier) {
  if (name === 'cubicBezier') {
    const bz = bezier ?? [0.25, 0.1, 0.25, 1.0];
    return cubicBezierEval(bz[0], bz[1], bz[2], bz[3], t);
  }
  return (_EASINGS[name] ?? _EASINGS.linear)(t);
}

// R19: 이름 붙은 이징 → 근사 3차 베지어 [x1,y1,x2,y2]. 그래프 편집기에서 손잡이를 처음 끌 때
//   이 값으로 바꾼다. css* 는 정의가 이미 베지어라 정확하다(오차 0). 거듭제곱·백 계열은 easings.net
//   의 표준 근사값을 쓴다(최대 오차는 tests/r19-graph 에서 측정·보고). linear 는 직선.
//   탄성(easeOutElastic)·바운스(easeOutBounce)·정지(hold)는 베지어로 못 바꾸므로 없음(null).
export const EASE_TO_BEZIER = {
  linear:         [0, 0, 1, 1],
  easeIn:         [0.3333, 0, 0.6667, 0.3333],   // t^2 를 3차 베지어로 정확 표현(오차 0)
  easeOut:        [0.3333, 0.6667, 0.6667, 1],   // 2t-t^2 정확(오차 0)
  easeInOut:      [0.42, 0, 0.58, 1],
  easeInCubic:    [0.55, 0.055, 0.675, 0.19],
  easeOutCubic:   [0.215, 0.61, 0.355, 1],
  easeInOutCubic: [0.645, 0.045, 0.355, 1],
  easeOutQuint:   [0.22, 1, 0.36, 1],
  easeInOutQuint: [0.83, 0, 0.17, 1],
  easeInOutSine:  [0.445, 0.05, 0.55, 0.95],
  easeOutBack:    [0.34, 1.56, 0.64, 1],
  easeInOutBack:  [0.68, -0.6, 0.32, 1.6],
  cssEase:        [0.25, 0.1, 0.25, 1.0],
  cssEaseIn:      [0.42, 0, 1.0, 1.0],
  cssEaseOut:     [0, 0, 0.58, 1.0],
  cssEaseInOut:   [0.42, 0, 0.58, 1.0],
};

// 이름 이징을 베지어 제어점으로. 바꿀 수 없으면(탄성·바운스·정지) null.
export function easeToBezier(name) {
  if (name === 'cubicBezier') return [0.25, 0.1, 0.25, 1.0];
  const bz = EASE_TO_BEZIER[name];
  return bz ? bz.slice() : null;
}

// sections.js:159의 감각적 이름 14종 + animator.js:69의 나머지 4종
export const EASE_LABELS = {
  linear:         '일정하게',
  hold:           '정지',
  easeIn:         '천천히 시작',
  easeOut:        '천천히 끝나며',
  easeInOut:      '부드럽게 시작·끝',
  easeInCubic:    '아주 천천히 시작',
  easeOutCubic:   '아주 천천히 끝나며',
  easeInOutCubic: '아주 부드럽게 시작·끝',
  easeOutQuint:   '확 멈추듯 끝나며',
  easeInOutQuint: '가감속 (5차)',
  easeInOutSine:  '둥글게 시작·끝',
  easeOutBack:    '튕기듯 끝나며',
  easeInOutBack:  '가감속 오버슈트',
  easeOutElastic: '탄성',
  easeOutBounce:  '바운스',
  cssEase:        'CSS ease',
  cssEaseIn:      'CSS ease-in',
  cssEaseOut:     'CSS ease-out',
  cssEaseInOut:   'CSS ease-in-out',
  cubicBezier:    '커스텀 베지어',
};
