// 데이터비 — 행렬처럼 흐르는 문자. 기본 고정폭 폰트, 이모지 금지. 결정론·루프(frac 흐름).
import { frac, hash2, withAlpha, clamp } from './_fx-util.js';

const SETS = {
  digits: '0123456789',
  kana: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン',
  latin: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
};

export default {
  id: 'datarain',
  name: '데이터비',
  category: '사이버',
  description: '행렬처럼 흘러내리는 문자',
  thumbnail: { frame: 8, bg: '#02100a' },
  bleed: 0,
  params: [
    { key: 'charType', label: '문자 종류', type: 'select', default: 'kana',
      options: [{ value: 'digits', label: '숫자' }, { value: 'kana', label: '가타카나' }, { value: 'latin', label: '영문' }, { value: 'custom', label: '직접 입력' }] },
    { key: 'customChars', label: '직접 입력', type: 'text', default: '01' },
    { key: 'density', label: '밀도', type: 'float', default: 0.6, min: 0.1, max: 1, step: 0.01 },
    { key: 'speed', label: '속도', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'color', label: '색', type: 'color', default: '#3cff6a' },
    { key: 'headBright', label: '머리 글자 밝게', type: 'bool', default: true },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.95, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'matrix', label: '매트릭스', values: { charType: 'kana', color: '#3cff6a' } },
    { id: 'blue', label: '청색 데이터', values: { charType: 'digits', color: '#4db8ff' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    let set = SETS[p.charType] ?? SETS.kana;
    if (p.charType === 'custom') { const c = String(p.customChars ?? ''); set = c.length ? c : '0'; }
    const chars = Array.from(set);
    const density = clamp(p.density ?? 0.6, 0.1, 1);
    const speed = Math.max(1, Math.round(p.speed ?? 2));
    const color = p.color ?? '#3cff6a';
    const headBright = p.headBright ?? true;
    const op = clamp(p.opacity ?? 0.95, 0, 1);
    const seed = Math.floor(rng() * 100000);
    const progress = f / Math.max(1, frameCount);

    const cell = Math.round(10 + (1 - density) * 22);
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell) + 2;
    ctx.font = `${cell}px monospace`;
    ctx.textBaseline = 'top';
    const tail = Math.max(4, Math.round(rows * 0.5));

    for (let c = 0; c < cols; c++) {
      const colBase = hash2(c, 0, seed);
      const cyc = speed + (hash2(c, 1, seed) < 0.5 ? 0 : 1); // 정수 바퀴
      const head = frac(colBase + progress * cyc) * (rows + tail) - tail;
      for (let k = 0; k < tail; k++) {
        const row = Math.floor(head) - k;
        if (row < 0 || row >= rows) continue;
        const gi = Math.floor(hash2(c, row, seed + 3) * chars.length) % chars.length;
        const ch = chars[gi];
        const a = op * (k === 0 ? 1 : Math.max(0, 1 - k / tail));
        ctx.fillStyle = withAlpha(k === 0 && headBright ? '#eafff0' : color, a);
        ctx.fillText(ch, c * cell, row * cell);
      }
    }
  },
};
