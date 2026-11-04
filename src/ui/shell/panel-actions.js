// R23b — 패널 사이 가벼운 연결고리.
//   "효과 추가" 같은 버튼(효과 쌓기·레이어 추가·움직임 섹션)이 왼쪽 "효과" 탭을 펼치고
//   검색 칸에 초점을 주도록, 화면 틀(shell.js)이 실제 동작을 등록한다.
//   등록 전이거나 데모 화면이면 조용히 아무 것도 하지 않는다.

let _openEffects = null;

// shell.js 가 효과 탭 열기 동작을 등록한다. fn(mode): mode 'fx'(기본)·'motion'.
export function registerOpenEffects(fn) { _openEffects = fn; }

// 효과 탭을 펼치고 검색 칸에 초점. mode 로 효과/모션 중 어디를 보일지 고른다.
export function openEffectsPanel(mode = 'fx') { try { _openEffects?.(mode); } catch {} }
