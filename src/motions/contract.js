// 모션 프리셋 계약(F3-1) — 이펙트 계약과 같은 방식.
//
// 모션 = 레이어의 transform(x,y,scale,rotation,alpha)에 더해지는 "변화량"을 시간 t(0..1)로 주는 함수.
// 클립(createClip)이 모션을 구간[start, start+length]에 얹는다. 렌더는 core/anim/clip.js 가 평가.
//
//   {
//     id:        'test-float',          // 고유 id
//     name:      '[시험] 위아래 둥실',   // 표시 이름(한국어)
//     category:  '반복',                 // 갤러리 분류 칩
//     kind:      'loop',                 // 'enter' | 'exit' | 'loop' | 'emphasis'
//     defaultLength: 24,                 // 적용 시 기본 길이(프레임)
//     params: [                          // 노브(파라미터)
//       { key, label, type:'number', default, min, max, step }
//     ],
//     evaluate(t, params) -> { x?, y?, scale?, rotation?, alpha? }  // 변화량(없으면 0/1)
//   }
//
// 규칙:
//  - kind:'loop' 은 evaluate(0) === evaluate(1) 여야 한다(이음매 매끈). isLoopSeamOk 로 자동 검사.
//  - kind:'enter'/'exit' 는 내보내기 경고 대상(getExportWarnings 가 이미 처리).
//  - evaluate 는 결정론(Math.random/Date.now 금지). 난수가 필요하면 params 로 seed 를 받는다.

// 파라미터 기본값 객체
export function defaultParams(motion) {
  const out = {};
  for (const p of (motion.params ?? [])) out[p.key] = p.default;
  return out;
}

// 루프 이음매 검사 — kind:'loop' 이면 t=0 과 t=1 의 변화량이 (거의) 같아야 한다.
export function isLoopSeamOk(motion, tol = 1e-6) {
  if (motion.kind !== 'loop') return true;
  const p = defaultParams(motion);
  const a = motion.evaluate(0, p) ?? {};
  const b = motion.evaluate(1, p) ?? {};
  const keys = ['x', 'y', 'scale', 'rotation', 'alpha'];
  for (const k of keys) {
    const av = a[k] ?? (k === 'scale' || k === 'alpha' ? 1 : 0);
    const bv = b[k] ?? (k === 'scale' || k === 'alpha' ? 1 : 0);
    if (Math.abs(av - bv) > tol) return false;
  }
  return true;
}
