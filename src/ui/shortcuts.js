// 단축키 단일 소스(F5-4) — 도움말(?)의 단축키 안내가 이 표에서 생성된다(버그 #6 방지: 안내와 실제가
// 다른 문제). keys.js 에 단축키를 추가/변경하면 반드시 이 표도 함께 고친다(한 곳에서 안내 생성).
export const SHORTCUTS = [
  { cat: '편집', keys: ['Ctrl', 'Z'], label: '되돌리기' },
  { cat: '편집', keys: ['Ctrl', 'Shift', 'Z'], label: '다시하기' },
  { cat: '편집', keys: ['Ctrl', 'C'], label: '복사 (레이어 / 타임라인 키)' },
  { cat: '편집', keys: ['Ctrl', 'V'], label: '붙여넣기' },
  { cat: '편집', keys: ['Delete'], label: '삭제 (레이어 / 선택한 키)' },

  { cat: '레이어', keys: ['Ctrl', 'G'], label: '그룹으로 묶기' },
  { cat: '레이어', keys: ['Ctrl', 'Shift', 'G'], label: '그룹 풀기' },
  { cat: '레이어', keys: ['방향키'], label: '선택 레이어 이동 (Shift = 크게)' },

  { cat: '도구', keys: ['V'], label: '옮기기' },
  { cat: '도구', keys: ['E'], label: '편집 (경로·기준점)' },
  { cat: '도구', keys: ['P'], label: '움직이기 (모션 기록·배치)' },
  { cat: '도구', keys: ['H'], label: '손 (화면 이동)' },

  { cat: '보기', keys: ['G'], label: '그리드 표시/숨김' },

  { cat: '재생', keys: ['Space'], label: '재생 / 멈춤' },
  { cat: '재생', keys: [','], label: '이전 프레임' },
  { cat: '재생', keys: ['.'], label: '다음 프레임' },

  { cat: '도구상자', keys: ['Ctrl', 'E'], label: '내보내기 창' },
  { cat: '도구상자', keys: ['Ctrl', 'Shift', 'L'], label: '루프 이음새 검사' },
];
