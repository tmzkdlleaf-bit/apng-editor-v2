// 눈 — 떨어지는 눈송이(겹/원근). 결정론·루프(frac 낙하, 정수 바퀴).
import { TAU, frac, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'snow',
  name: '눈',
  category: '날씨',
  lightBg: true, // R27 밝은 배경용(테두리·진하게) 지원
  description: '흔들리며 떨어지는 눈송이',
  thumbnail: { frame: 7, bg: '#0a0e18' },
  bleed: 10,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 120, min: 1, max: 600 },
    { key: 'size', label: '크기', type: 'float', default: 3, min: 1, max: 12, step: 0.5 },
    { key: 'sway', label: '흔들림', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'wind', label: '바람', type: 'float', default: 0.15, min: -1, max: 1, step: 0.01 },
    { key: 'layers', label: '겹 수', type: 'int', default: 3, min: 1, max: 5 },
    { key: 'color', label: '색', type: 'color', default: '#f2f7ff' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
    // R28e — 기본값이면 예전과 픽셀 동일
    { key: 'frontBlur', label: '앞 겹 흐릿하게', type: 'float', default: 0, min: 0, max: 1, step: 0.05 },
    { key: 'pile', label: '쌓인 눈 두께', type: 'float', default: 0, min: 0, max: 0.3, step: 0.01 },
    { key: 'pileBump', label: '쌓인 눈 울퉁불퉁', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
  ],
  // '종류'는 프리셋(값을 한꺼번에 채우는 버튼)으로(R28e)
  presets: [
    { id: 'graupel', label: '싸락눈', values: { amount: 220, size: 1.5, sway: 0.15, wind: 0.05, layers: 2 } },
    { id: 'heavy', label: '함박눈', values: { amount: 70, size: 7, sway: 0.7, wind: 0.05, layers: 3, frontBlur: 0.5 } },
    { id: 'blizzard', label: '눈보라', values: { amount: 400, size: 2.5, sway: 0.2, wind: 0.9, layers: 4, frontBlur: 0.3 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const n = Math.max(1, Math.round(p.amount ?? 120));
    const size = p.size ?? 3;
    const sway = clamp(p.sway ?? 0.5, 0, 1);
    const wind = clamp(p.wind ?? 0.15, -1, 1);
    const layers = Math.max(1, Math.round(p.layers ?? 3));
    const color = p.color ?? '#f2f7ff';
    const op = clamp(p.opacity ?? 0.9, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const per = Math.ceil(n / layers);
    const frontBlur = clamp(p.frontBlur ?? 0, 0, 1);
    const pile = clamp(p.pile ?? 0, 0, 0.3);
    const pileTop = h * (1 - pile);

    for (let l = 0; l < layers; l++) {
      const depth = (l + 1) / layers;          // 1 = 앞(큰·빠른·진한)
      const cyc = l + 1;                        // 정수 바퀴 → 루프
      ctx.fillStyle = withAlpha(color, op * (0.35 + 0.65 * depth));
      for (let i = 0; i < per; i++) {
        const bx = rng(), by = rng(), rs = rng(), ph = rng();
        const t = frac(by + progress * cyc);
        const y = t * (h + size * 2) - size;
        const x = bx * w + Math.sin(progress * TAU * cyc + ph * TAU) * sway * w * 0.06
          + wind * w * 0.25 * t;
        const r = size * (0.4 + 0.6 * rs) * depth;
        if (pile > 0 && y > pileTop) {        // 쌓인 눈에 닿은 송이는 녹아들듯 옅어진다
          const fade = 1 - clamp((y - pileTop) / Math.max(4, h * 0.04), 0, 1);
          if (fade <= 0) { ctx.globalAlpha = 1; continue; }
          ctx.globalAlpha = fade;
        }
        if (frontBlur > 0 && l === layers - 1 && layers > 1) {
          // 앞 겹: 크고 흐릿한(초점 밖) 송이
          const rr = r * (1 + frontBlur * 1.5);
          const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
          g.addColorStop(0, withAlpha(color, op * (0.9 - 0.5 * frontBlur)));
          g.addColorStop(1, withAlpha(color, 0));
          const prev = ctx.fillStyle; ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
          ctx.fillStyle = prev;
        } else {
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        }
        if (pile > 0) ctx.globalAlpha = 1;
      }
    }
    if (pile > 0) {
      // 쌓인 눈 띠(울퉁불퉁한 윗면). 시간에 따라 자라지 않는다 — 루프(frame 0 = frame N) 때문.
      const bump = clamp(p.pileBump ?? 0.5, 0, 1);
      const seedB = rng() * 100;
      ctx.globalAlpha = 1;
      ctx.fillStyle = withAlpha(color, Math.min(1, op + 0.05));
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w + 6; x += 6) {
        const yy = pileTop + bump * h * 0.02 * (Math.sin(x * 0.045 + seedB) + 0.6 * Math.sin(x * 0.11 + seedB * 1.7));
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    }
  },
};
