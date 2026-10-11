// 모션 프리셋 계약(F3-1, S5-0 보강) — 이펙트 계약과 같은 방식.
//
// 모션 = 레이어의 transform 에 더해지는 "변화량"을 시간 t(0..1)로 주는 함수.
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
//     description: '한 줄 설명',          // 갤러리 설명(선택)
//     evaluate(t, params, env) -> { ...채널 }
//   }
//
// evaluate 의 세 번째 인자 env = { w, h, frameCount, fps } = 레이어 기준 크기(S5-0).
//
// 반환 채널(없으면 기본값):
//   x, y        — 이동(px, 기본 0). **레이어 크기 대비 비율로 움직이려면 env.w/env.h 를 곱해 직접 계산**한다.
//                 (예: 화면 반 칸 오른쪽 → x: 0.5 * env.w)  ← 새 모션의 이동 단위 통일 규칙.
//   scale       — 전체 크기 배수(기본 1)
//   scaleX, scaleY — 가로·세로 보정 배수(기본 1). 젤리·쿵·고무줄 등 스쿼시&스트레치용.
//   rotation    — 회전(도, 기본 0)
//   alpha       — 투명도 배수(기본 1)
//   brightness  — 밝기(-1~1, 기본 0). +는 밝게, −는 어둡게(콘텐츠 알파 안에서).
//   slices      — 조각 그리기: [{ y0, y1, dx, alpha }] (y0/y1=높이비율, dx=너비비율 가로밀기). 글리치용.
//   wrapX, wrapY — 이어 그리기: 너비·높이 대비 밀림(0~1). 배경 무한 스크롤용.
//
// 규칙:
//  - kind:'loop' 은 evaluate(0) === evaluate(1) 여야 한다(이음매 매끈). isLoopSeamOk 로 자동 검사.
//  - 반복 모션의 "속도"는 "한 번 재생 동안 몇 바퀴"(정수)로만 받는다 — 이음매가 깨지지 않게.
//  - kind:'enter'/'exit' 는 내보내기 경고 대상(getExportWarnings 가 이미 처리).
//  - evaluate 는 결정론(Math.random/Date.now 금지). 난수가 필요하면 params.seed + 시간 격자 보간으로.

// 파라미터 기본값 객체
export function defaultParams(motion) {
  const out = {};
  for (const p of (motion.params ?? [])) out[p.key] = p.default;
  return out;
}

const _CHANNEL_DEFAULT = { scale: 1, scaleX: 1, scaleY: 1, alpha: 1 };
function _ch(v, k) { return v[k] ?? _CHANNEL_DEFAULT[k] ?? 0; }

// 루프 이음매 검사 — kind:'loop' 이면 t=0 과 t=1 의 변화량이 (거의) 같아야 한다. 새 채널까지 검사.
export function isLoopSeamOk(motion, tol = 1e-6) {
  if (motion.kind !== 'loop') return true;
  const p = defaultParams(motion);
  const env = { w: 100, h: 100, frameCount: motion.defaultLength ?? 24, fps: 12 };
  const a = motion.evaluate(0, p, env) ?? {};
  const b = motion.evaluate(1, p, env) ?? {};
  const keys = ['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation', 'alpha', 'brightness', 'wrapX', 'wrapY'];
  for (const k of keys) {
    // wrapX/wrapY 는 0 과 1 이 같은 위치(이어 그리기) → 모듈로 1 로 비교.
    if (k === 'wrapX' || k === 'wrapY') {
      const av = ((( _ch(a, k) % 1) + 1) % 1);
      const bv = ((( _ch(b, k) % 1) + 1) % 1);
      if (Math.abs(av - bv) > tol && Math.abs(av - bv) < 1 - tol) return false;
      continue;
    }
    if (Math.abs(_ch(a, k) - _ch(b, k)) > tol) return false;
  }
  // slices 는 같은 개수·위치면 OK(간단 비교)
  const as = a.slices ?? [], bs = b.slices ?? [];
  if (as.length !== bs.length) return false;
  return true;
}
