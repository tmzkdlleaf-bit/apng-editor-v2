# 5단계로 넘긴 "내용" 정리

4단계까지는 효과·모션·템플릿의 **틀(계약·UI·갤러리·레지스트리)** 을 완성하고, 그 안에 들어갈 **내용**(효과 48종·모션 37종·시작 템플릿 실제 구성)은 5단계에서 제작하기로 했다(9/30 결정).
이 문서는 "내용을 어디에, 어떻게 추가하는지"를 한곳에 모은 안내다. 지금 들어 있는 것은 전부 틀을 시험하기 위한 **시험용**이다.

## 1. 효과(effect)

- 계약 문서: `docs/effects.md` (파라미터 타입 int/float/coord/color/select/bool·advanced·animatable, 결정론, 루프, 성능 기준, 시험법).
- 레지스트리: `src/effects/registry.js` — 정적 import Map.
- 렌더: `core/render/frame.js` → `core/render/layers/effect.js` 가 `effect.render(ctx, { params, seed, t, sources, box, rng })` 를 부른다.
- 갤러리 분류(칩): 날씨 · 빛 · 사이버 · 연출 · 오버레이 · 파티클 · 판타지 (`src/ui/effect-gallery.js` CATEGORIES). 효과의 `category` 가 이 중 하나면 그 칩에 묶인다.

**추가 방법 (파일 하나 + 등록 한 줄)**
1. `src/effects/<이름>.js` 를 만들고 `export default { id, name, category, params, scopes?, sources?, render }` 를 둔다.
2. `registry.js` 에 `import x from './<이름>.js';` 한 줄 + Map 에 `[x.id, x]` 한 줄.
3. 결정론·루프 규칙(`docs/effects.md`)을 지키면 갤러리·파라미터 UI·시드·범위·마스크·소스가 자동으로 붙는다.

**지금 들어 있는 시험 효과 3종**
| id | 이름 | 쓰임 |
|---|---|---|
| `test-dots` | 점/파티클 | 파티클·시드·범위 틀 검증, 템플릿에서 사용 |
| `test-light-rays` | 빛줄기 | 모든 파라미터 타입(int/float/coord/color/select/bool+advanced) 검증 |
| `test-source-mirror` | 소스 미러 | 소스 슬롯(다른 레이어를 재료로) 검증 |

→ 5단계에서 48종을 위 7개 분류로 채운다. 틀은 그대로.

## 2. 모션 프리셋(motion)

- 계약 문서: `src/motions/contract.js` (kind enter/exit/loop/emphasis, category, defaultLength, params type, `isLoopSeamOk` 루프 t0==t1 검사).
- 레지스트리: `src/motions/registry.js`.
- 렌더: `core/anim/clip.js` 가 `motion.evaluate(t, params)` 를 불러 변위(x·y·scale·rotation·alpha)를 얻는다. t 는 0..1 정규화.
- 갤러리 분류: kind 별칭(등장·퇴장·반복·강조) 또는 `category` 값 (`src/ui/motion-gallery.js`).

**추가 방법 (파일/객체 하나 + 등록 한 줄)**
1. `{ id, name, category, kind, defaultLength, params, evaluate(t, p) }` 객체를 만든다.
2. `registry.js` 의 Map 에 등록 한 줄.
3. loop kind 는 `evaluate(0)` 과 `evaluate(1)` 결과가 같아야 한다(이음새).

**지금 들어 있는 시험 모션 3종**
| id | 이름 | kind/분류 |
|---|---|---|
| `test-shake` | [시험] 흔들기 | emphasis / 강조 |
| `test-fade-in` | [시험] 페이드 인 | enter / 등장 |
| `test-float` | [시험] 위아래 둥실 | loop / 반복 |

→ 5단계에서 37종을 등장·퇴장·반복·강조로 채운다.

## 3. 시작 템플릿·캔버스 프리셋

- 파일: `src/ui/templates.js` 한 곳(`CANVAS_PRESETS`, `TEMPLATES`, `createProjectFromTemplate`).
- 캔버스 프리셋: 코코포리아 컷인 768² · 배경 1280×720 · 스탠딩 600×900 · 디스코드 스티커 320².
- 시작 템플릿(현재 틀): 빈 캔버스 · 반짝이는 원 · 빛나는 글자 · 루프 배경. 내용은 시험 효과(`test-dots`)에 기대고 있어, 5단계에서 실제 효과·모션으로 교체한다.

**추가 방법**: `TEMPLATES` 배열에 `{ key, label, build(doc) }` 를 더한다. `build` 안에서 `createLayer`·`createClip` 으로 구성하고 `_add(doc, layer)` 로 넣는다.

## 4. 남은 효과 레이어 조작(틀만, 미구현)

- 캔버스 클릭 배치(P모드): 효과를 캔버스의 누른 위치에 배치. 현재는 중앙 배치.
- 박스 범위 핸들: 캔버스에서 효과 박스를 끌어 크기 조절. 현재는 숫자(W/H) 입력.
- coord 파라미터의 캔버스 점 드래그. 현재는 숫자(X/Y).

세 가지 모두 계약·데이터는 있고 UI만 5단계에서 캔버스 상호작용으로 올린다.
