# 공통 컨트롤 (src/ui/controls/)

UI를 만들 때는 **여기 있는 컨트롤만** 쓴다. 네이티브 `<select>`·제각각인 버튼을 직접 만들지 않는다.
색·간격·둥글기는 전부 `src/styles/tokens.css` 변수. 스타일은 `src/styles/controls.css`.

## dropdown.js — 선택 상자 (네이티브 `<select>` 대체)
```js
import { createDropdown } from './dropdown.js';
const dd = createDropdown({
  options: [{ value: 'a', label: '가나' }, ...],
  value: 'a',
  onChange: (v) => { ... },        // 값이 '바뀔 때만' 호출(기록 1건)
  renderItem: (el, opt) => { ... },// (선택) 항목/트리거에 미리보기 그리기
  ariaLabel: '블렌드 모드',
});
el.append(dd.el);                  // dd.getValue()/setValue(v)/setOptions(list)/open()/close()/destroy()
```
- 키보드: ↑↓ 이동, Enter/Space 선택, Esc 닫기, 글자 입력 타이핑 서치. **휠 변경 없음**(실수 방지).
- 목록은 `document.body` 에 `position:fixed` 로 떠서 패널에 안 잘린다. 트리거에 `data-value` 노출(테스트용).
- 쓰고 나면 `destroy()`(재렌더/닫기 때). 열린 상태로 버리면 바깥클릭 리스너가 남는다.

## number-field.js — 숫자 칸
```js
import { createNumberField } from './number-field.js';
const f = createNumberField({ label:'X', step:1, min, max, unit:'%', defaultValue:0,
  onBegin(){store.begin(...)}, onChange(v,{relative,delta}){store.preview(...)},
  onCommit(){store.commit()}, onCancel(){store.cancel()} });
f.setValue(n); f.setMixed(base); f.getValue();  // setMixed = 여러 값이 다를 때 '혼합' 표시
```
- 라벨 드래그(상대)·방향키·Enter(절대)·Esc(취소)·더블클릭(기본값). begin→preview→commit 로 되돌리기 1건.

## slider-field.js — 슬라이더(+숫자)
값 범위가 분명하고 즉각적인 보정류에. API 는 number-field 와 같은 begin/preview/commit 계약.

## color-field.js — 색 고르기 *(F1에서 추가 예정)*
견본 + 16진수 입력 + 최근 색 8개 + 스포이트(브라우저 `EyeDropper` 있으면). 추가되면 이 문서도 갱신.

## 버튼 (base.css) — 3종 × 2크기
HTML `<button>` 에 클래스만 붙인다(별도 컴포넌트 아님). 토큰 색·높이 고정.
- **기본**: 클래스 없음 `<button>` — 테두리 있는 보통 버튼(28px).
- **강조**: `<button class="accent">` — 주요 동작(내보내기 등).
- **조용한**: `<button class="quiet">` — 테두리/배경 없는 보조 동작.
- 크기: 기본(28px) · 작게 `<button class="sm">`(22px).
- 아이콘+글자: `<button class="accent"><span class="btn-icon">${iconMarkup('export')}</span>내보내기</button>`.
- 아이콘만: `.icon-btn`(위 icons.js) 또는 `iconButton()`.
- 비활성 `disabled` 는 대비를 유지(흐리되 읽힘). 키보드 포커스 테두리는 모든 컨트롤에 자동(`:focus-visible`).

## ../icons.js — 아이콘 세트 (SVG, 16px, 선 1.5, currentColor)
```js
import { createIcon, iconMarkup, iconButton } from '../icons.js';
el.append(createIcon('play', { label:'재생' }));       // <svg> 엘리먼트
btn.innerHTML = iconMarkup('chevron');                  // innerHTML 문자열
const b = iconButton('eye', { label:'표시', title:'표시/숨김' , onClick });
```
- 색은 상속(currentColor) → 테마 토큰을 그대로 탄다. 외부 아이콘 라이브러리 금지.
- **아이콘만 있는 버튼은 반드시 `label`(aria-label)+`title`(툴팁, 이름+단축키).** `iconButton` 이 자동 처리.
- 이름 목록은 `iconNames()`. 없는 이름은 경고 후 빈 문자열.
