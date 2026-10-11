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
- `env` : `{ f, frameCount, w, h, rng, sources, scale }`
  - `f` 현재 프레임, `frameCount` 전체 프레임 수, `w`/`h` 그릴 영역(doc px, scope=box 면 박스 크기).
  - `rng` **시드 난수기**(createRng(seed)). 난수는 반드시 이것만 — `Math.random()`/`Date.now()`/`performance.now()` 금지.
  - `sources` : `[{ key, canvas }]` — 소스 슬롯에 연결된 레이어를 렌더한 캔버스(없으면 canvas=null).
- `params` : 사용자가 정한 파라미터 값 객체.

## 파라미터 타입 (속성 패널이 자동 생성)

| type | UI | 정의 필드 |
| --- | --- | --- |
| `int` / `float` | 슬라이더 + 숫자 (0~1 범위는 5단계 눈금) | `min, max, step` |
| `coord` | 캔버스에서 끌 수 있는 점 + 숫자 2개 | `default:{x,y}` (0~1 정규화) |
| `color` | 색 칸(견본·16진수·스포이트) | `default:'#rrggbb'` |
| `select` | 드롭다운 | `options:[{value,label}]` |
| `bool` | 켜기/끄기 체크박스 | — |

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
