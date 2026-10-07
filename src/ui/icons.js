// 직접 그린 아이콘 세트 — 인라인 SVG, 16px 기준, 선 굵기 1.5, currentColor.
// 외부 아이콘 라이브러리 금지(라이선스·용량). 색은 상속(currentColor)이라 테마 토큰을 그대로 탄다.
//
// createIcon(name, { size=16, label=null }) → <svg> 엘리먼트
//   label 을 주면 role="img" + aria-label, 없으면 aria-hidden(장식용; 옆 글자가 의미를 가짐).
// iconMarkup(name, { size }) → 문자열(innerHTML 용).
// iconButton(name, { label, title, onClick, className }) → 아이콘만 있는 <button>(툴팁+aria-label 자동).

const V = 16; // viewBox 기준 크기

// 각 아이콘은 <svg> 안쪽 내용(path/line/…). stroke/fill 은 공통 래퍼에서 지정.
// f: 채움 사용(아이콘별). 기본은 선만.
const ICONS = {
  // 레이어 행: 표시/잠금
  eye:      'M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z|c8 8 2',
  'eye-off':'M2 2l12 12|M6.5 6.6a2 2 0 002.8 2.8|M1 8s2.5-4.5 7-4.5c1 0 1.9.2 2.7.5|M13.3 5.6C14.4 6.7 15 8 15 8s-2.5 4.5-7 4.5c-.9 0-1.7-.1-2.4-.4',
  lock:     'R4 7.5 8 5 3|M5.5 7.5V5a2.5 2.5 0 015 0v2.5',
  unlock:   'R4 7.5 8 5 3|M5.5 7.5V5a2.5 2.5 0 015-0',
  // 재생줄
  first:    'M4 3v10|M13 3L6 8l7 5z#',
  prev:     'M11 3L4 8l7 5z#|M4 3v10',
  play:     'M4 3l9 5-9 5z#',
  pause:    'M5 3v10|M11 3v10',
  next:     'M5 3l7 5-7 5z#|M12 3v10',
  last:     'M12 3v10|M3 3l7 5-7 5z#',
  loop:     'M3 8a5 5 0 019-3M13 3v2.5h-2.5|M13 8a5 5 0 01-9 3M3 13v-2.5h2.5',
  once:     'M3 8a5 5 0 119 3|M13 3v2.5h-2.5M3 13v-2.5h2.5',
  pingpong: 'M4 5l-2.5 3L4 11|M12 5l2.5 3L12 11|M1.5 8h13',
  // 도구
  'select-tool': 'M3 2l5 11 1.8-4.2L14 7z#',
  hand:     'M5 8V4.2a1 1 0 112 0V7m0-1V3.2a1 1 0 112 0V7m0-1V4.2a1 1 0 112 0V8m0-1.5a1 1 0 112 0V9a4 4 0 01-4 4H8.5a3 3 0 01-2.2-1L3.5 9a1 1 0 011.4-1.4L6 8.7',
  'zoom-in':  'c7 7 4|M7 5v4M5 7h4|M10.5 10.5L14 14',
  'zoom-out': 'c7 7 4|M5 7h4|M10.5 10.5L14 14',
  'zoom-fit': 'M2 5V3h2|M14 5V3h-2|M2 11v2h2|M14 11v2h-2|R5 6 6 4 1',
  // 편집
  undo: 'M6 4L2.5 7.5 6 11|M2.5 7.5H10a3.5 3.5 0 010 7H7',
  redo: 'M10 4l3.5 3.5L10 11|M13.5 7.5H6a3.5 3.5 0 000 7h3',
  plus: 'M8 3v10M3 8h10',
  delete: 'M3 4h10|M6 4V2.5h4V4|M4.5 4l.6 9h5.8l.6-9|M7 6.5v4M9 6.5v4',
  duplicate: 'R5.5 5.5 8 7 1.5|R2.5 2.5 8 7 1.5',
  group: 'R2.5 2.5 11 11 1|M2.5 6h11M6 2.5v11',
  chevron: 'M5.5 4l4 4-4 4',          // 펼침 화살표(오른쪽). 펼쳐지면 90도 회전 사용.
  // 키프레임 마름모
  'diamond-filled': 'M8 2.5L13.5 8 8 13.5 2.5 8z#',
  'diamond-empty':  'M8 2.5L13.5 8 8 13.5 2.5 8z',
  'diamond-outline':'M8 3.5L12.5 8 8 12.5 3.5 8z|M8 1.5L14.5 8 8 14.5 1.5 8z',
  // 토글류
  magnet: 'M4 3v4a4 4 0 008 0V3|M4 3h3v4M12 3H9v4|M4 12h3M9 12h3',
  autokey: 'c8 8 4.5#|c8 8 7',        // 녹화 점(채운 원 + 테두리)
  settings: 'c8 8 2.5|M8 1v2M8 13v2M1 8h2M13 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4',
  export: 'M8 10V2|M5 5l3-3 3 3|M3 10v3h10v-3',
  help: 'c8 8 6.5|M6 6.2a2 2 0 113 1.7c-.6.4-1 .7-1 1.6|M8 12h.01',
  sun: 'c8 8 3|M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.3 3.3l1 1M11.7 11.7l1 1M12.7 3.3l-1 1M4.3 11.7l-1 1',
  moon: 'M13 9.5A5.5 5.5 0 116.5 3 4.5 4.5 0 0013 9.5z',
  // 레이어 종류
  'type-image': 'R2 2 12 12 1.5|c6 6 1.5#|M3 12l3.5-3.5 2.5 2.5 2-2 3 3',
  'type-anim':  'R2 3 12 10 1.5|M6.5 6l4 2-4 2z#|M2 6h12',
  'type-text':  'M4 4h8|M8 4v8M6.5 12h3',
  'type-shape': 'R3 3 10 10 1.5',
  'type-effect':'M8 2l1.3 3.4L13 6l-2.7 2.3L11 12 8 10l-3 2 .7-3.7L3 6l3.7-.6z#',
  'type-group': 'R2.5 4 11 9 1|M4.5 4V2.5h4V4',
  'type-adjust':'M3 5h10M3 11h10|c6 5 2#|c11 11 2#',
  'type-instance':'R3 3 10 10 1|M6 6l4 4M10 6l-4 4',
};

// 미니 명령 언어:
//   'M...'/'L...'  → <path d="...">(선)
//   끝에 '#'       → 그 path 는 채움(fill=currentColor, stroke 없음)
//   'c cx cy r'    → <circle>(선), 끝에 '#' 면 채움
//   'R x y w h r'  → 둥근 사각형(rx=r). 끝에 '#' 면 채움
//   여러 조각은 '|' 로 구분.
function _buildChildren(spec) {
  const out = [];
  for (let piece of spec.split('|')) {
    piece = piece.trim();
    const filled = piece.endsWith('#');
    if (filled) piece = piece.slice(0, -1);
    const attrs = filled
      ? 'fill="currentColor" stroke="none"'
      : 'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
    if (piece[0] === 'c') {
      const [, cx, cy, r] = piece.split(/\s+/);
      out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" ${attrs}/>`);
    } else if (piece[0] === 'R') {
      const [, x, y, w, h, r] = piece.split(/\s+/);
      out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ${attrs}/>`);
    } else {
      out.push(`<path d="${piece}" ${attrs}/>`);
    }
  }
  return out.join('');
}

export function hasIcon(name) { return Object.prototype.hasOwnProperty.call(ICONS, name); }
export function iconNames() { return Object.keys(ICONS); }

export function iconMarkup(name, { size = V } = {}) {
  const spec = ICONS[name];
  if (!spec) { console.warn('[icons] 알 수 없는 아이콘:', name); return ''; }
  return `<svg class="icon icon-${name}" width="${size}" height="${size}" viewBox="0 0 ${V} ${V}" aria-hidden="true">${_buildChildren(spec)}</svg>`;
}

export function createIcon(name, { size = V, label = null } = {}) {
  const wrap = document.createElement('span');
  wrap.innerHTML = iconMarkup(name, { size });
  const svg = wrap.firstElementChild;
  if (svg && label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); svg.removeAttribute('aria-hidden'); }
  return svg;
}

// 아이콘만 있는 버튼 — 툴팁(title)+aria-label 자동(접근성·발견성).
export function iconButton(name, { label, title = null, onClick = null, className = '', size = V } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn' + (className ? ' ' + className : '');
  btn.innerHTML = iconMarkup(name, { size });
  btn.title = title ?? label ?? '';
  if (label) btn.setAttribute('aria-label', label);
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}
