// 이징 곡선 작은 그림(F3-6) — 이징 메뉴 항목 옆 미리보기 SVG.
import { ease } from '../../core/anim/easing.js';

// name 의 이징 곡선을 size px 상자에 그린 SVG 문자열. currentColor.
export function easeCurveSvg(name, { size = 22, bezier = null } = {}) {
  const pad = 3, S = size, inner = S - pad * 2;
  const N = 16;
  let d = '';
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const y = ease(name, t, bezier);
    const px = pad + t * inner;
    const py = pad + (1 - y) * inner; // y 위로
    d += (i ? 'L' : 'M') + px.toFixed(1) + ',' + py.toFixed(1) + ' ';
  }
  return `<svg class="ease-curve" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" aria-hidden="true">`
    + `<line x1="${pad}" y1="${S - pad}" x2="${S - pad}" y2="${pad}" stroke="currentColor" stroke-opacity="0.2" stroke-width="1"/>`
    + `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`
    + `</svg>`;
}
