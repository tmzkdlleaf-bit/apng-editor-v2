// 풀숲(R27) — 그림 없이 풀잎을 직접 그려 바람에 흔든다(낙엽·꽃잎 같은 방식).
//   풀잎 하나 = 뿌리에서 끝으로 가는 곡선 + 끝으로 갈수록 가늘어지는 잎. 바람 모델(core/anim/wind.js)로 끝이 휜다.
//   깊이 줄(1~3): 뒤 줄일수록 작고 어둡고 덜 흔들린다. 결정론(시드 난수만)·루프(정수 주기).
import { clamp, parseColor, lerp } from './_fx-util.js';
import { windBend, windPhaseAt } from '../core/anim/wind.js';

function _mixRgb(a, b, t) {
  return `rgb(${Math.round(lerp(a.r, b.r, t))},${Math.round(lerp(a.g, b.g, t))},${Math.round(lerp(a.b, b.b, t))})`;
}

export default {
  id: 'grass',
  name: '풀숲',
  category: '날씨',
  lightBg: true,
  description: '그림 없이 풀잎을 그려 바람에 흔든다. 바닥 위치·깊이 줄·돌풍',
  thumbnail: { frame: 6, bg: '#101a14' },
  bleed: 40,
  params: [
    { key: 'count', label: '개수', type: 'int', default: 120, min: 10, max: 400 },
    { key: 'height', label: '높이', type: 'float', default: 0.28, min: 0.05, max: 0.9, step: 0.01 },
    { key: 'heightVar', label: '높이 들쭉날쭉', type: 'float', default: 0.4, min: 0, max: 1, step: 0.05 },
    { key: 'width', label: '잎 폭', type: 'float', default: 6, min: 1, max: 30, step: 0.5 },
    { key: 'ground', label: '바닥 위치', type: 'float', default: 1, min: 0.2, max: 1, step: 0.01 },
    { key: 'depth', label: '깊이 줄 수', type: 'int', default: 2, min: 1, max: 3 },
    { key: 'colorRoot', label: '뿌리 색', type: 'color', default: '#2d5a2b' },
    { key: 'colorTip', label: '끝 색', type: 'color', default: '#9ccf6e' },
    { key: 'strength', label: '바람 세기', type: 'float', default: 0.35, min: 0, max: 1, step: 0.01 },
    { key: 'lag', label: '엇박자', type: 'float', default: 0.5, min: 0, max: 2, step: 0.05 },
    { key: 'gust', label: '돌풍', type: 'float', default: 0.2, min: 0, max: 1, step: 0.05 },
    { key: 'cycles', label: '횟수', type: 'int', default: 1, min: 1, max: 8 },
  ],
  presets: [
    { id: 'meadow', label: '들판', values: { count: 160, height: 0.22, depth: 3 } },
    { id: 'tall', label: '키 큰 풀', values: { count: 70, height: 0.55, width: 9, strength: 0.45 } },
    { id: 'dry', label: '마른 풀', values: { colorRoot: '#6b5a2e', colorTip: '#d9c27a', gust: 0.4 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const count = Math.max(1, Math.round(p.count ?? 120));
    const H0 = clamp(p.height ?? 0.28, 0.05, 0.9) * h;
    const hv = clamp(p.heightVar ?? 0.4, 0, 1);
    const bw = Math.max(0.5, p.width ?? 6);
    const gy = clamp(p.ground ?? 1, 0.2, 1) * h;
    const depth = Math.max(1, Math.min(3, Math.round(p.depth ?? 2)));
    const cRoot = parseColor(p.colorRoot ?? '#2d5a2b');
    const cTip = parseColor(p.colorTip ?? '#9ccf6e');
    const dark = { r: 12, g: 20, b: 14 };
    const strength = clamp(p.strength ?? 0.35, 0, 1);
    const prog = f / Math.max(1, frameCount);
    const seed = 1 + Math.floor(rng() * 9999);
    const o = { cycles: p.cycles ?? 1, curve: 1.4, lag: p.lag ?? 0.5, gust: p.gust ?? 0.2, seed };

    // 뒤 줄부터(멀리) 앞 줄로. 난수는 줄·잎 순서대로 같은 횟수만 쓴다(프레임마다 같은 배치).
    for (let row = depth - 1; row >= 0; row--) {
      const far = depth === 1 ? 0 : row / (depth - 1);        // 0 앞 ~ 1 뒤
      const sizeK = 1 - 0.4 * far;
      const darkK = 0.45 * far;
      const swayK = 1 - 0.45 * far;
      const baseY = gy - far * 0.06 * h;
      const n = Math.max(1, Math.round(count * (row === 0 ? 1 : 0.8)));
      const rootCol = _mixRgb(cRoot, dark, darkK);
      const tipCol = _mixRgb(cTip, dark, darkK * 0.8);
      // 줄마다 세로 그라데이션 하나(뿌리→끝). 잎마다 만들면 느려서(768 기준 약 4배) 줄 단위로 공유한다.
      const grad = ctx.createLinearGradient(0, baseY, 0, baseY - H0 * sizeK);
      grad.addColorStop(0, rootCol);
      grad.addColorStop(1, tipCol);
      ctx.fillStyle = grad;
      for (let i = 0; i < n; i++) {
        const u = rng();
        const x0 = u * (w + bw * 4) - bw * 2;
        const bh = H0 * sizeK * (1 - hv * 0.6 * rng());
        const lean = (rng() - 0.5) * 0.25 * bh;                  // 원래 기울어진 정도
        const bwi = bw * sizeK * (0.7 + 0.6 * rng());
        const ph = windPhaseAt(u, 0.8, seed + row * 31) + rng() * 0.6;
        const bend = strength * bh * swayK * windBend(1, prog, { ...o, phase: ph });
        const tx = x0 + lean + bend;
        const ty = baseY - bh * (1 - 0.18 * Math.min(1, Math.abs(lean + bend) / bh));
        const cx = x0 + (lean + bend) * 0.25;                    // 곡선 조절점: 아래는 곧게, 위로 갈수록 휜다
        const cy = baseY - bh * 0.55;
        ctx.beginPath();
        ctx.moveTo(x0 - bwi / 2, baseY);
        ctx.quadraticCurveTo(cx - bwi * 0.3, cy, tx, ty);
        ctx.quadraticCurveTo(cx + bwi * 0.3, cy, x0 + bwi / 2, baseY);
        ctx.closePath();
        ctx.fill();
      }
    }
  },
};
