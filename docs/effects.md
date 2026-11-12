# 이펙트 작성 가이드 (5단계용)

효과 48종의 "내용"은 5단계에서 만든다. 이 문서는 **효과 하나를 어떻게 쓰는지**를 정한다.
새 효과 추가 = **파일 하나(`src/effects/<id>.js`) + `registry.js`에 import 한 줄 + Map 등록 한 줄.**

## 계약

```js
export default {
  id:       'rain',                 // 고유 id(파일명과 맞춘다)
  name:     '비',                   // 표시 이름(한국어)
  category: '날씨',                 // 갤러리 분류 칩(날씨·빛·사이버·연출·오버레이·파티클·판타지)
  description: '유리창에 흐르는 빗방울', // 갤러리 한 줄 설명(선택)
  thumbnail: { frame: 12, bg: '#0a1020' }, // 갤러리 카드 대표 프레임·배경(선택)
  bleed:    24,                     // 보이는 영역 밖으로 그리는 여유(doc px, 선택). 기본 20 canvas px 상당.
  params:   [ /* 아래 파라미터 타입 */ ],
  presets:  [ { id:'soft', label:'보슬비', values:{ density: 0.3, speed: 1 } } ], // "모양" 묶음(선택)
  scopes:   ['full', 'box'],        // 지원 범위
  sources:  [{ key: 'bg', label: '배경' }],  // 소스 슬롯(없으면 [])
  render(ctx, env, params) { /* 그린다 */ },
};
```

### 공통 파라미터 이름·순서 (속성 패널·갤러리에서 같은 자리)

필요한 것만 쓰되, 쓸 때는 이 이름·순서를 지킨다:
`밀도`/`개수` → `크기` → `속도`(한 번 재생당 바퀴 수, 정수) → `방향`(각도) → `색`(+`색 2`) → `불투명도` → `시드`.

### presets (합친 효과의 "모양" 묶음)

`presets: [{ id, label, values:{ 파라미터: 값 } }]`. 속성 패널 맨 위 드롭다운으로 고르면 값이 채워지고,
값을 바꾸면 "(수정됨)"으로 표시된다. 예: 입자 효과 하나에 먼지·빛가루·포자·파티클 프리셋.

### bleed

효과가 테두리 밖으로 번지는 여유를 **doc px** 로 선언한다(빛 번짐·그림자 등). 엔진은 그만큼만 작업
캔버스를 넓혀 빌린다(기존 고정 20 canvas px 대체). 선언 안 하면 기본값(20 canvas px 상당).

`render(ctx, env, params)`:
- `ctx` : 2D 컨텍스트. 좌표는 **문서 단위(doc px)** — 엔진이 renderScale 을 이미 적용해 둔다.
- `env` : `{ f, frameCount, w, h, rng, sources, scale, pad, borrow, release }`
  - `f` 현재 프레임, `frameCount` 전체 프레임 수, `w`/`h` 그릴 영역(doc px, scope=box 면 박스 크기).
  - `rng` **시드 난수기**(createRng(seed)). 난수는 반드시 이것만 — `Math.random()`/`Date.now()`/`performance.now()` 금지.
  - `sources` : `[{ key, canvas }]` — 소스 슬롯에 연결된 레이어를 렌더한 캔버스(없으면 canvas=null).
    소스 캔버스는 **물리 픽셀**이고 소스 doc(0,0)이 effect 물리 `(pad, pad)`에 온다(scope=full).
  - `scale` : renderScale(doc→물리 배율). `pad` : 소스 정렬 오프셋(물리 px).
  - `borrow(w,h)` / `release(canvas)` : **풀에서 빌리는 임시 캔버스**(채널 분리·휨 등). 렌더 중 새 캔버스를
    만들지 말고 이것을 쓰고 반드시 release. 안 돌려줘도 엔진이 정리하지만 쌓이지 않게 돌려준다.
- `params` : 사용자가 정한 파라미터 값 객체.

### "아래 화면을 휘게" 하는 효과(물결·글리치·색수차)

지금 렌더는 레이어를 차례로 그린다. 효과가 "아래 합성 결과"를 바로 읽는 경로는 없다 →
**소스 슬롯**으로 처리한다(엔진 변경 없음·결정론·보기 영역 규칙 유지). 왜곡할 레이어(또는 아래
전체를 묶은 그룹)를 소스로 연결하면 그 캔버스를 받아 휘게/분리해 그린다. 소스가 없으면 자체
오버레이로 은은히 동작(또는 무동작)한다.

## 파라미터 타입 (속성 패널이 자동 생성)

| type | UI | 정의 필드 |
| --- | --- | --- |
| `int` / `float` | 슬라이더 + 숫자 (0~1 범위는 5단계 눈금) | `min, max, step` |
| `coord` | 캔버스에서 끌 수 있는 점 + 숫자 2개 | `default:{x,y}` (0~1 정규화) |
| `color` | 색 칸(견본·16진수·스포이트) | `default:'#rrggbb'` |
| `select` | 드롭다운 | `options:[{value,label}]` |
| `bool` | 켜기/끄기 체크박스 | — |
| `text` | 한 줄 글자 입력(직접 입력) | `default:'문자열'` (이모지·폰트 자유입력은 피하고 기본 고정폭으로 그린다) |

- `advanced: true` 면 "고급" 접힘 안에 넣는다.
- `animatable: true` 면 그 파라미터는 키프레임 가능(지금은 정의 표시만; 키 UI 는 뒤 단계).

## 결정론 규칙 (어기면 미리보기≠내보내기)

1. 렌더는 `f`(와 params·rng)의 결정론 함수. 같은 입력 → 같은 그림.
2. 난수는 `env.rng`만. 프레임마다 rng 호출 순서가 같아야 한다(분기에서 호출 수가 달라지지 않게 주의).
3. 렌더 경로에서 캔버스를 새로 만들지 않는다(엔진이 풀에서 빌려 준다). `ctx.filter` 금지(사파리).

## 루프 규칙

- 루프 효과는 **frame 0 과 frame N 의 그림이 같아야** 한다. 위상은 `progress = f / frameCount`
  (주의: `frameCount - 1` 아님 — 그래야 f=0 과 f=frameCount 가 같은 위상).
- 주기 함수(sin/cos)를 `progress * 2π` 로 쓴다.
- Ctrl+Shift+L 루프 검사 도구와 내보내기 경고가 이음새를 잡아 준다.

## 성능 기준

- 768×768, 효과 하나가 **프레임당 중앙값 6ms 이하**(이 저장소 CI 성능 표 기준 측정). 넘으면 보고에 이유를 적는다.
- 참고: 시험 효과 3개 + 이미지 10장 문서 스크럽 평균 16ms 이하도 CI 성능 표로 확인한다.
- 무거운 계산(노이즈 테이블 등)은 params·seed 가 안 바뀌면 효과 모듈 내부에서 캐시한다
  (모듈 스코프 Map, 키는 params+seed+w+h). 렌더 경로에서 재계산하지 않는다.

## 시험 방법

- `src/effects/<id>.js` 추가 → `registry.js` 등록 → 레이어 추가 메뉴 "이펙트" 갤러리에 나온다.
- 결정론: 같은 f 두 번 렌더 → 픽셀 동일. 시드 바꾸면 달라지고 같은 시드면 같다.
- 루프: f=0 과 f=frameCount 픽셀 비교(또는 checkLoopSeam).
- 틀 참고용 시험 효과: `test-dots`(기본), `test-light-rays`(모든 파라미터 타입), `test-source-mirror`(소스 슬롯).

## R27 추가

### "밝은 배경용" (`lightBg: true`)

흰색·옅은 색으로 그려 밝은 배경에서 잘 안 보이는 효과는 정의에 `lightBg: true` 를 둔다.
registry 가 고급 파라미터 `밝은 배경용`(끔·테두리·진하게)을 자동으로 붙이고, 엔진(`core/render/fx-run.js`)이 처리한다.
효과 코드는 바꿀 필요 없다. `끔`(기본)이면 예전과 픽셀 동일.
- `테두리`: 효과 모양 바깥에 어두운 반투명 1px 테두리(옅은 칠도 모양에 포함).
- `진하게`: 색을 곱하기로 눌러 어둡게 하고 두 번 겹쳐 또렷하게.
지금 붙은 효과: 반짝임·방울·불티·요정 가루·입자·룬 문자·비·눈·파문·마법진·코스틱·풀숲.

### 칸 값 필드는 `drawField`

칸(cells)마다 값을 정하는 효과(안개·코스틱)는 `_fx-util.js` 의 `drawField` 로 그린다. 칸마다 `fillRect` 로
겹쳐 칠하면 반투명 칸이 겹친 자리가 밝은 격자 줄이 된다.

### 바람 모델 (`core/anim/wind.js`)

풀·수풀처럼 "고정점은 그대로, 끝으로 갈수록 휘는" 움직임은 `windBend(h, prog, o)` 하나로 계산한다
(움직임 `바람 흔들림`·`기울기 흔들림`, 효과 `바람 휘기`·`풀숲`이 같이 쓴다). 주기가 모두 정수배라 루프 안전.

| 이름 | 종류 | 언제 쓰나 |
| --- | --- | --- |
| 바람 흔들림 (`wind-sway`) | 움직임(반복) | 그림 레이어 하나에 바로. 가로 띠로 나눠 밀어 휜다(이미지 레이어) |
| 기울기 흔들림 (`wind-skew`) | 움직임(반복) | 가장 가볍게. 아래/위 끝을 고정하고 비스듬히 기운다(모든 레이어, 새 채널 `skewX`) |
| 바람 휘기 (`wind-bend`) | 효과(소스) | 수풀 그림을 자연스럽게. 뿌리는 붙들고 포기마다 따로 흔들림 |
| 풀숲 (`grass`) | 효과(직접 그림) | 그림 없이 풀을 그려 흔들기. 깊이 줄·돌풍 |

### 시험용 효과

`test-dots`·`test-light-rays`·`test-source-mirror`(그리고 시험 모션 3개)는 앱 목록에서 빠졌다.
테스트만 `globalThis.__APNG_TEST_REGISTRY` 를 켜서 쓴다(`tests/helpers/fixtures.js` 가 모든 페이지에 켠다).

## R28a 추가 — 한 번(once)형·진행 방식·흐림/가지 선 공용

- `once: true`: 전환·깨짐·터짐처럼 한 번 재생되는 효과. 루프 이음매 검사에서 빠지고, 반복 내보내기 때
  "한 번 재생되는 효과" 경고가 뜬다(`getExportWarnings(doc, { effects })`).
- 진행 방식: params 에 `...PROGRESS_PARAMS`(`_fx-util.js`) — 진행 방식(자동: 시작 프레임+길이 / 직접: 진행 값 키),
  방향(나타나기/사라지기), 느리게 시작·끝. 렌더에서 `progressOf(f, p, ease)` 하나로 0~1 진행값을 얻는다.
- 소스 여러 개: `sources: [{key:'a'}, {key:'b'}]` 그대로 지원(속성 패널에 소스 칸이 개수만큼).
- 흐림: `core/render/blur.js` — `blurCanvas(src, r, borrow, release)`(줄여서 흐린 뒤 늘림, 큰 반지름도 빠름),
  `variableBlur(ctx, src, dx, dy, r, amount(u,v), borrow, release)`(위치마다 다른 흐림, 단계 3장 섞기).
- 번지는 경계: `thresholdField(...)`(값 지도가 문턱보다 작은 곳을 칠함 — 잉크·불타기·성에).
- 가지 선: `branchSegments(rng, o)` + `drawSegments(ctx, segs, progress, width, color, glow)` — 번개·혈관·금.
