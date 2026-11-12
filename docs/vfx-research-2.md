# VFX 레퍼런스 자료집 2 — 실제 사진 측정 · 현업 제작 분해 · 실사 소재 활용

R30e 이후 "더 사실적으로"를 위한 추가 조사. 세 갈래로 했다.

1. **실제 사진 측정** — 위키미디어 공용(자유 이용 사진 저장소) 사진을 브라우저에서 불러와 픽셀을 직접 셌다. 같은 계산을 우리 효과(실사 모양, 기본값, 검은 배경, 400px)에도 돌려 숫자로 비교했다.
2. **현업 제작 분해** — 게임·영상 VFX 아티스트가 공개한 제작 과정 글.
3. **실사 소재 활용** — 실제 촬영·시뮬레이션으로 만든 불·연기 소재를 가져다 쓰는 방법, 라이선스, 투명 처리, 반복(루프) 처리.

> 한계: 사진 측정은 불·불티·불꽃놀이·번개·촛불 5종까지 하고, 사용자 컴퓨터 연결이 끊겨 나머지 효과는 사진 수치 없이 글 자료와 눈 비교로 대신했다.

---

## 0. 핵심 발견 (먼저 읽을 것)

| # | 발견 | 근거 |
|---|---|---|
| 1 | **우리 불은 가장자리가 실제보다 약 5배 흐리다.** | 밝은 곳→어두운 곳 전환 폭: 사진 중앙값 약 3px, 우리 18px |
| 2 | **우리 불의 중간 밝기 색이 너무 노랗다(초록 성분 과다).** 실제는 더 붉다. | 중간 밝기 G/R 비율: 사진 0.35, 우리 0.50 |
| 3 | **우리 불은 파랑 성분이 0이라 형광처럼 납작하다.** 실제 밝은 부분은 크림색으로 하얘진다. | 가장 밝은 칸: 사진 (254,240,164), 우리 (240,214,84) |
| 4 | **실제 불은 "부드러운 기체 덩어리"가 아니라 "접힌 띠"다.** 날카로운 가장자리, 안쪽 접힘선, 떨어져 나가는 혀, 앞을 가리는 검은 장작이 있다. | 사진 눈 관찰 |
| 5 | **불티(sparks)가 거의 안 보인다.** | 가장 밝은 점(상위 0.5%) 밝기: 사진 246~255, 우리 18 |
| 6 | 불꽃놀이는 우리 쪽이 점처럼 짧고 색이 분홍빛으로 흐리다. 실제는 꼬리가 있고 색이 진하다. | 전환 폭 사진 약 1.9px, 우리 0.65px |
| 7 | 번개 심(가운데 줄기)은 거의 흰색이고, 둘레 빛은 연보라 기운이다. 우리는 회청색이다. | 번개 사진 둘레 밝기대 평균 (147,138,158)~(184,168,183) |
| 8 | 현업 사실 표현의 기본은 **"모양 틀 × 흐르는 노이즈 2겹 → 일그러뜨리기 → 밝기를 색으로 바꾸는 색 지도"**와 **"침식(가장자리를 갉아먹듯 사라지게)"**이다. 불은 단단한 침식, 연기는 부드러운 침식을 쓴다. | §2 |
| 9 | 진짜 사실감의 지름길은 **실제 시뮬레이션·촬영 소재(플립북)**다. 자유 이용(CC0) 소재가 있다. | §3 |
| 10 | 검은 배경 소재를 투명 APNG로 쓰려면 **"밝기에서 투명도 되살리기(언멀트)"** 처리가 꼭 필요하다. 단순 밝기 마스크는 가장자리가 검게 탄다. | §3-3 |

---

## 1. 실제 사진 측정

### 1-1. 측정 방법

- **밝기 칸별 평균 색**: 픽셀을 밝기 8칸(0~31, 32~63 …)으로 나누고 칸마다 평균 RGB와 차지 비율을 구했다. 밝기가 오를 때 색이 어떻게 변하는지 보는 용도다.
- **전환 폭(tw)**: 상위 0.5% 밝기를 기준으로 25%~75% 사이 중간 밝기 픽셀 수를 50% 경계선 길이로 나눈 값. 가장자리가 몇 픽셀에 걸쳐 흐려지는지를 뜻한다. 작을수록 날카롭다.
- **밝은 면적(cov)**: 기준의 75% 이상인 픽셀 비율.
- 사진은 모두 폭 400px로 줄여서 쟀다. 우리 결과도 400×400에서 4개 프레임(0·3·6·9)을 평균했다.

### 1-2. 불 — 사진 10장(모닥불 5, 큰 불 5) vs 우리 `flame`

밝기 칸별 평균 색:

| 밝기 칸 | 모닥불 사진 예 | 큰 불 사진 평균 | 우리 flame |
|---|---|---|---|
| 32~63 | 119,32,3 | 99,31,16 | 87,37,6 |
| 64~95 | 162,59,12 | 167,56,19 | 139,69,4 |
| 96~127 | 200,92,26 | 216,87,25 | 178,103,3 |
| 128~159 | 229,127,45 | 240,123,41 | 208,139,2 |
| 160~191 | 251,166,70 | 249,163,65 | 228,176,8 |
| 192~223 | 253,207,105 | 252,206,92 | 240,214,84 |
| 224~255 | 254,240,164 | 250,240,174 | (거의 없음) |

읽는 법:
- 실제 불은 **R이 아주 빨리 꽉 차고(128 칸에서 이미 230~240), G가 천천히 따라오며, B는 작지만 0이 아니다(12→170).**
- 우리는 R이 늦게 차고 G가 일찍 올라 중간이 노랗다. B가 0이라 가장 밝은 곳도 크림색이 되지 못한다.
- 실제 사진에서 순수한 흰색(255,255,255)으로 날아간 픽셀은 거의 없다(0~0.02%). 가장 밝아도 **연노랑 크림색**이다.

가장자리:

| | 전환 폭(px) | 밝은 면적 |
|---|---|---|
| 모닥불 사진 6장 | 1.6 / 2.6 / 2.8 / 3.9 / 5.8 / 7.1 (중앙값 약 3.3) | 1.5~16.7% |
| 우리 flame | **18.2** | 15.2% |

눈 관찰(모닥불 클로즈업 6장):
- 불꽃은 **얇은 띠가 접히고 말린 모양**이다. 띠 안에 밝은 접힘선이 있다.
- 위쪽 끝은 몸통에서 **떨어져 나간 조각**이 많다.
- 가장자리는 몇 픽셀 만에 주황→검정으로 끊긴다.
- 앞에 있는 장작이 **검은 실루엣으로 불을 가린다**. 이 가림이 깊이감을 크게 만든다.
- 우리 결과는 아래가 평평한 노란 띠이고, 위로 솟은 혀가 부드럽게 번진다. 사진과 가장 다른 점이다.

### 1-3. 불티 — 그라인더 불티 사진 6장 vs 우리 `sparks`

- 사진: 1px 굵기의 **긴 직선·완만한 곡선 줄**이 발생점에서 부채꼴로 뻗는다. 발생점 근처는 흰노랑이고, 멀어질수록 호박색으로 식는다. 가끔 줄 끝이 여러 갈래로 터진다(탄소 폭발). 주변 물체가 불티 빛을 받아 따뜻하게 밝아진다.
- 측정: 사진의 상위 밝기는 246~255인데 **우리는 18**이다. 기본값에서 불티가 사실상 안 보인다.
- 우리 결과는 화면 전체에 흩어진 작은 점이다. 발생점(원천)이 없고 꼬리가 짧다.

### 1-4. 불꽃놀이 — 사진 6장 vs 우리 `fireworks`

- 전환 폭: 사진 0.8~2.5(중앙 약 1.9), 우리 0.65. 우리는 점이고 사진은 짧은 꼬리가 있는 선이다.
- 우리 색은 (144,101,100), (224,160,165)처럼 분홍빛으로 흐리다. 노출이 맞은 실제 사진은 색이 진하다. 금속 염 발색이 원인으로, 스트론튬은 빨강, 바륨은 초록, 구리는 파랑을 낸다(출처 S12).
- 사진 자료 대부분은 1초 이상 장노출이다. **영상 한 프레임(1/24초 정도)에서는 꼬리가 짧아야 맞다.** 그래서 "점 → 짧은 꼬리"가 목표이고, 장노출 같은 긴 꼬리는 선택 사항이다.

### 1-5. 번개 — 사진 6장 vs 우리 `lightning`

- 가장 밝은 칸은 (244,238,236)으로 거의 흰색이다. 둘레 밝기대는 (115,110,122)~(184,168,183)으로 **약간 보랏빛**이다.
- 번개는 흰색이 가장 흔하고, 대기 조건과 카메라 설정에 따라 보라·파랑·주황으로도 보인다(출처 S13, S14). 땅이나 나무에 닿는 마지막 부분은 붉은 주황으로 보이기 쉽다.
- 우리 결과에서 번쩍일 때 하늘은 회청색 (약 90,95,105)이다. 보랏빛 쪽으로 옮기는 선택지를 둘 수 있다.
- 전환 폭은 사진 7~57(하늘 번짐 때문에 편차 큼), 우리 25로 범위 안이다.

### 1-6. 촛불

사진 6장: 전환 폭 5~15, 둘레 빛 비율이 높다(심지 주변 번짐). 우리 `candle`은 불꽃이 아니라 주변 조명 효과라서 직접 비교하지 않았다.

### 1-7. 측정을 못 한 효과 — 글 자료와 눈 비교

| 효과 | 실제 특징(자료) | 우리 결과와 차이 |
|---|---|---|
| 눈 | 렌즈 바로 앞 송이는 크고 흐린 덩어리가 된다. 가까울수록 줄기가 굵다. 빠른 셔터면 점, 느린 셔터면 줄이 된다(S15, S16). | 흐린 송이가 **균일한 회색 원판**이라 평평하다. 크기·밝기 차이를 더 넓게 둘 필요가 있다. |
| 연기 | (사진 수치 없음) 가는 실 같은 결, 날카로운 접힘, 짙고 옅음의 차이 | 우리는 둥근 솜 덩어리. 전환 폭 6으로 부드럽기만 하다. |
| 오로라 | 대부분 느리고 장엄하게 움직이지만 가끔 아주 빠르다. 타임랩스는 실제보다 50~250배 빠르다. 밝은 줄기의 아래 가장자리가 보라색을 띤다. 맥박처럼 깜빡이는 종류도 있다(S17~S19). | 아래쪽 물결이 **산 능선처럼 단단한 실루엣**이 된다. 보라 아래 가장자리가 없다. |
| 비 | 물방울·튀김·물결(시작 시각을 엇갈린 2겹)·안개 층으로 나눈다. 튀김은 왕관형과 바로 튀는 형 두 가지다(S8, S9). | 층 구성은 이미 맞다. 어두운 배경에서 희미한 것도 실제와 맞다. |
| 충격파 | 실제로는 거의 보이지 않고 뒤 배경의 일그러짐과 응결로 드러난다. | 검은 배경 위의 회색 고리. 배경 없는 화면에서는 어쩔 수 없다. |

---

## 2. 현업 제작 분해 — 사실감을 만드는 기법

### 2-1. 기본 공식: 모양 틀 × 흐르는 노이즈 → 색 지도

- 여러 아티스트가 쓰는 기본 틀이다. **불 모양 틀(마스크) 하나에 위로 흐르는 노이즈를 곱한다.** 노이즈는 대부분 2겹이면 충분하고, 3겹은 큰 연기에는 좋지만 작은 모양에는 너무 지저분해진다(S1).
- 주된 모양 그림을 노이즈 2장으로 일그러뜨린 뒤, **밝기→색 대응표(LUT)**로 색을 입힌다. 가로·세로 일그러짐을 따로 조절한다. 이 방식은 게임 RIME의 불(시몬 트륌플러 발표)에서 나왔고, **모양 그림이 불의 인상을 크게 좌우한다**(S2, S3).
- 빠르게 움직이는 불은 굴절(뒤 배경 일그러뜨리기)과 흐르는 노이즈 여러 장을 한 재질 안에 섞어서 만든다(S4).
- 주의: 입자마다 흐르는 위치가 같으면 무늬가 맞물려 부자연스럽다. **입자마다 시작 위치를 다르게** 줘야 한다(S5).

→ 우리 상황에 맞게 바꾸면: 지금 `flame`은 온도장을 노이즈로 만들고 색 대응표로 칠한다. 공식은 이미 비슷하다. 차이는 **모양 틀이 없고, 노이즈가 부드러운 구름 노이즈 한 종류뿐이며, 가장자리를 날카롭게 자르는 단계가 없다**는 점이다.

### 2-2. 침식 — 가장자리를 갉아먹듯 사라지게

- 회색 노이즈 그림을 기준으로 **문턱값을 올려 가며 잘라** 사라지게 한다. 이렇게 하면 전체를 고르게 흐리게 할 때보다 사라지는 모양이 흥미롭다(S6).
- 같은 침식이라도 **불은 단단한 경계(문턱 부근 폭 좁게), 연기는 부드러운 경계(폭 넓게)**로 쓴다(S7).

→ 측정 발견 1(우리 불 전환 폭 18px vs 사진 3px)을 바로 고치는 수단이다.

### 2-3. 시뮬레이션 플립북 — 현업의 실사 표준

- 엠버젠(EmberGen) 같은 실시간 유체 시뮬레이터로 불·연기·폭발을 만들고, 이를 **한 장에 여러 프레임을 모은 그림(플립북·스프라이트 시트)**으로 뽑아 게임에서 재생한다(S20, S21).
- 함께 뽑는 자료로 **움직임 벡터**(프레임 사이를 부드럽게 보간), **6방향 조명**, 노멀, 깊이 등이 있다(S20).
- 불은 "빛나는 불꽃", "온도", "연기"를 따로 뽑아 두고, **온도 그림으로 불 색을 나중에 바꾸는** 방식이 쓰인다(S22).
- 한 예: 2K 텍스처에 16프레임과 움직임 벡터 그림을 넣었고, 온도와 밀도를 다른 채널에 나눠 담았다(S23).
- 시뮬레이션은 같은 설정이면 결과가 항상 같다(결정적). 시드만 바꾸면 변형을 만들 수 있다(S20).

### 2-4. 비

현업 층 구성(S8): 물방울 줄 → 튀김 → 고인 물 → 물결(시작 시각을 엇갈린 2겹으로 격자 느낌 제거) → 흘러내리는 물 → 안개. 튀김은 왕관형과 바로 튀는 형 두 종류다(S9). 기준 논문은 Tatarchuk 2006(도시 비 렌더링)과 Garg·Nayar 2006(빗줄기 빛 물리)이다(S10).

→ 우리 `rain` 실사 모양은 이미 이 층 구성을 따른다. 남은 것은 물결 2겹 엇갈림 정도다.

---

## 3. 실사 소재 활용

### 3-1. 쓸 수 있는 소재

| 출처 | 내용 | 라이선스 | 비고 |
|---|---|---|---|
| Unity Labs 무료 플립북 (토마 이셰) | 후디니로 만든 작은 불꽃(온도 채널 포함), 연기, 구름, 폭발, 불덩이, 촛불 연기 | **CC0**(출처 표시 없이 상업 이용 가능) | 이미 조립된 플립북과 프레임별 EXR/TGA 묶음으로 제공(S24) |
| Brackeys VFX 묶음 | 입자 그림 + 위 플립북 + 손그림 스프라이트 시트 | **CC0** | itch.io 배포(S25) |
| ActionVFX 무료 소재 | 실제 촬영한 불·연기·먼지·눈·불티·번개 | 상업 이용 허가, 가입 필요 | 투명도 포함 ProRes, 2K. 유료는 4K(S26, S27) |
| Gaxil URP 스프라이트 시트 | 불꽃·연기·온도·6방향 조명 | 무료이나 **판매·수익 금지** | 커미션 판매에 쓰기 곤란(S22) |

→ 커미션(판매)에 쓰려면 **CC0 소재가 가장 안전**하다.

### 3-2. 검은 배경 소재 합성 방법

- 불·폭발·불꽃놀이 소재는 대부분 검은 배경에 찍는다. 영상 편집에서는 **"스크린"이나 "더하기" 합성**으로 검은 부분을 없앤다(S28, S29).
- 현업 조언으로 **"불을 키(색 빼기)로 오려 내지 말 것"**이 있다. 미리 오려 둔 소재 대신 검은 배경 원본을 합성 방식으로 쓰라는 뜻이다(S30).

### 3-3. 투명 APNG에서는 "언멀트"가 필요하다

코코포리아용 APNG는 배경이 투명하고, 그 위에 무엇이 깔릴지 모른다. 그래서 스크린 합성을 그대로 쓸 수 없다. 투명도를 직접 만들어야 한다.

- **언멀트(unmult)**: 밝기(불이라면 빨강 채널)를 투명도로 삼은 뒤, **반투명 부분에서 검정이 섞인 몫을 다시 빼서 원래 색을 되살린다.** 이렇게 해야 가장자리가 검게 타지 않고 선명한 빨강·노랑·주황이 남는다(S31~S33).
- 단순 밝기 마스크만 쓰면 반투명 가장자리에 검은 띠가 생긴다(S34).
- 계산식(직접 구현 가능): `a = max(r,g,b)`, `색 = rgb / a`. 검은 바닥을 깎는 문턱값과 부드러움 값 두 개를 두는 것이 일반적이다(S33).

### 3-4. 반복(루프) 처리

- 일반 소재는 처음과 끝이 이어지지 않는다. 흔한 방법은 **가운데를 잘라 앞뒤를 바꾸고, 이음매 부분을 서로 겹쳐 서서히 바꾸는 것(크로스페이드)**이다(S35).
- 불·물·비·눈·구름처럼 무작위로 움직이는 것은 이 방식으로 이음매가 잘 숨는다(S36).
- 처음부터 반복용으로 만든 소재도 판매된다(S37).
- 우리 규칙 "0프레임 = N프레임"과 바로 맞물린다. 크로스페이드는 결정적 계산이라 규칙을 어기지 않는다.

---

## 4. 효과별 진단 요약

| 효과 | 가장 큰 차이 | 고칠 방법(후보) |
|---|---|---|
| flame | 가장자리 5배 흐림, 중간 색 노람, 파랑 0, 모양이 접힌 띠가 아님 | 침식으로 가장자리 자르기, 색 곡선을 사진 수치에 맞추기, 휘는(curl) 노이즈로 접힘 만들기, 앞쪽 검은 장작 실루엣 선택지, 또는 CC0 플립북 |
| sparks | 거의 안 보임(밝기 18 vs 250), 발생점 없음 | 기본 밝기·길이 올리기, 발생점에서 부채꼴로 뿜기, 끝 갈래 터짐, 주변 빛 받음 |
| fireworks | 점처럼 짧음, 분홍빛으로 흐림 | 셔터 꼬리 길이 늘리기, 금속 발색 팔레트(빨강·초록·파랑·금색) |
| lightning | 번쩍임 하늘색이 회청 | 보랏빛 둘레 선택지, 땅에 닿는 부분 주황 |
| smoke | 둥근 솜 | 부드러운 침식 + 실 같은 결 노이즈, 또는 CC0 연기 플립북 |
| snow | 흐린 송이가 균일한 회색 원판 | 송이 크기·밝기 범위 넓히기, 가장자리가 약간 밝은 원판 |
| aurora | 아래 물결이 산 능선처럼 단단함, 보라 아래 가장자리 없음 | 아래 가장자리 보라, 위로 갈수록 줄기가 풀어지게 |
| rain · fog · clouds · 나머지 | 측정 없음. 큰 차이는 눈으로 확인되지 않음 | 물결 2겹 엇갈림 등 작은 손질 |

---

## 5. 다음 단계 선택지

정해 두지 않고 나열한다. 섞어서 고를 수 있다.

**A. 측정 수치에 맞춘 보정** (가장 빠름)
불 색 곡선을 사진 표에 맞추고, 불티·불꽃놀이 기본 밝기와 꼬리를 고치고, 번개·오로라 색을 손본다. 코드 구조는 그대로 두고 수치만 바꾼다.

**B. 현업 기법 도입**
공용 도구에 "모양 틀 + 흐르는 노이즈 2겹 + 일그러뜨리기 + 침식 + 색 지도"를 만들고, 불·연기·불씨 계열부터 옮긴다. 가장자리 문제(발견 1)를 근본적으로 고친다. 시간은 A보다 많이 든다.

**C. 실사 소재 가져오기 기능**
사용자가 플립북 그림이나 이미지 묶음을 넣으면 ① 언멀트로 투명도 만들기 ② 크로스페이드 루프 ③ 크기·위치·재생 속도·색(온도 지도) 조절을 해 주는 새 레이어. 가장 사실적이다. 소재는 사용자가 고른다.

**D. CC0 플립북 내장**
Unity Labs·Brackeys CC0 소재 몇 개(작은 불꽃, 연기, 폭발)를 에디터에 넣어 두고 C 기능으로 재생한다. 파일 크기가 늘어난다.

**E. 측정 도구 상시화**
이번에 쓴 측정(색 곡선·전환 폭)을 테스트로 만들어, 효과를 고칠 때마다 사진 기준에서 벗어나는지 자동으로 확인한다.

---

## 출처

- S1 realtimevfx — VFX Basics: scrolling texture with mask: https://realtimevfx.com/t/vfx-basics-creating-the-scrolling-texture-with-mask-setup/1966
- S2 Raff Ribeiro — Burning Room (fire shader, LUT): https://raffribeiro.artstation.com/projects/eRWLmJ
- S3 Unreal Fest Europe 2018 — Stylized VFX in RiME (Simon Trümpler): https://www.unrealengine.com/events/unreal-fest-europe-2018/stylized-vfx-in-rime
- S4 80.lv — Creating a flame burst effect in UE5: https://80.lv/articles/creating-a-flame-burst-effect-using-unreal-engine-5
- S5 realtimevfx — Simple fire shader breakdown: https://realtimevfx.com/t/simple-fire-shader-breakdown/11213
- S6 VFX Apprentice — Textures, meshes, shaders (erosion maps): https://www.vfxapprentice.com/blog/textures-meshes-shaders-vfx-basics
- S7 realtimevfx — How are these fire & smoke effects made: https://realtimevfx.com/t/how-are-these-fire-smoke-effects-made/11922
- S8 Realtime Rain VFX Breakdown: https://sahmed19.github.io/realtime-rain-vfx-breakdown/
- S9 fxguide — Game environments Part B: rain: https://www.fxguide.com/?p=42356
- S10 Tatarchuk 2006 — Artist-directable real-time rain: https://advances.realtimerendering.com/s2006/Tatarchuk-Rain.pdf
- S11 Unity blog — Ignitement fire breakdown: https://unity.com/pt/blog/real-time-fluid-simulation-fire-vfx-ignitement-breakdown
- S12 Prints4Sure — Firework photography (금속 발색): https://www.prints4sure.com/blogs/news/capture-the-burst-a-pro-s-guide-to-firework-photography
- S13 Nikon — How to photograph lightning: https://www.nikonusa.com/learn-and-explore/c/tips-and-techniques/how-to-photograph-lightning
- S14 Storm Highway — What color is lightning: https://stormhighway.com/what_color_is_lightning.php
- S15 Photofocus — Photographing in falling snow: https://photofocus.com/photography/photographing-in-falling-snow/
- S16 Imaging Resource — Capturing falling snow: https://www.imaging-resource.com/news/2015/02/23/how-to-capture-falling-snow-in-your-photographs
- S17 Phil Hart — What the aurora really looks like: https://philhart.com/what-the-aurora-really-looks-like?page=1
- S18 Universe Today — Real-time aurora video: https://universetoday.com/116940/soar-with-the-aurora-in-this-breathtaking-real-time-video/amp
- S19 TWAN — Great display of northern lights: https://twanight.org/?p=38461
- S20 JangaFX — EmberGen: https://live.jangafx.com/?p=384
- S21 80.lv — EmberGen tool: https://80.lv/articles/embergen-upcoming-real-time-fluid-simulation-tool
- S22 Gaxil — Unity URP Spritesheets: https://github.com/Gaxil/Unity-URP-Spritesheets
- S23 realtimevfx — Explosion VFX feedback (flipbook + motion vectors): https://realtimevfx.com/t/looking-for-feedback-on-explosion-vfx/29528
- S24 Unity — Free VFX image sequences & flipbooks (CC0): https://unity.com/kr/blog/engine-platform/free-vfx-image-sequences-flipbooks
- S25 Brackeys VFX Bundle (CC0): https://brackeysgames.itch.io/brackeys-vfx-bundle
- S26 CG Channel — ActionVFX free collections: https://www.cgchannel.com/2020/12/download-actionvfxs-three-free-stock-effects-collections/
- S27 CG Channel — ActionVFX free flamethrower clips (2026): https://www.cgchannel.com/2026/01/download-30-free-flamethrower-effects-clips-from-actionvfx/
- S28 PremiumBeat — Screen blending mode: https://www.premiumbeat.com/blog/screen-blending-mode
- S29 Boris FX — Holdout composite: https://borisfx.com/documentation/silhouette-2026.0/Silhouette-2026/Nodes-Holdout%20Composite.html
- S30 Frame.io — Composite fire: https://blog.frame.io/2016/09/29/composite-fire/
- S31 ProVideo Coalition — Unmult with and without a plug-in: https://www.provideocoalition.com/unmult-with-and-without-a-plug-in/amp/
- S32 Adobe community — New in beta: Unmult effect: https://community.adobe.com/t5/after-effects-beta-discussions/new-in-beta-unmult-effect-about-time-right/m-p/15559608
- S33 Adobe community — Unmult parameters: https://community.adobe.com/t5/after-effects-beta-discussions/new-in-beta-unmult-effect-about-time-right/td-p/15559127
- S34 VEGAS forum — Remove color matting (unmultiply): https://www.vegascreativesoftware.info/us/forum/remove-color-matting-a-k-a-unmultiply--103408
- S35 Creative COW — Looping footage: https://creativecow.net/?p=135363
- S36 Wild & Free Tools — Seamless loop video: https://wildandfreetools.com/blog/seamless-loop-video-how-to-create-free
- S37 FootageCrate — Loopable fire: https://footagecrate.com/video-effects/FootageCrate-4K_Loopable_Wall_Fire_13
- 사진 측정: Wikimedia Commons 검색 결과(campfire night, bonfire flames, grinding sparks, fireworks, lightning bolt night, candle flame dark) — 파일 이름은 측정 기록에 남김
