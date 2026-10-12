// 후광 — 중심에서 부드럽게 뻗는 빛살. 결정론·루프(정수 회전·맥동). 시드 무관. (분류: 연출)
import { TAU, parseColor, clamp } from './_fx-util.js';

export default {
  id: 'focus-sun',
  name: '후광',
  category: '연출',
  description: '중심에서 부드럽게 뻗는 빛살',
  thumbnail: { frame: 6, bg: '#0a0a16' },
  bleed: 12,
  params: [
    { key: 'rays', label: '빛살 수', type: 'int', default: 16, min: 2, max: 64 },
    { key: 'position', label: '중심', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'length', label: '길이', type: 'float', default: 0.9, min: 0.2, max: 1.5, step: 0.01 },
    { key: 'speed', label: '회전', type: 'int', default: 1, min: 0, max: 6 },
    { key: 'pulse', label: '맥동', type: 'int', default: 1, min: 0, max: 8 },
    { key: 'color', label: '색', type: 'color', default: '#ffe9a8' },
    { key: 'glow', label: '중심 광량', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.7, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'sun', label: '햇살', values: { color: '#ffe9a8' } },
    { id: 'holy', label: '신성', values: { color: '#fff6e0' } },
    { id: 'moon', label: '달빛', values: { color: '#bcd4ff' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h }, p) {
    const rays = Math.max(2, Math.round(p.rays ?? 16));
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const len = clamp(p.length ?? 0.9, 0.2, 1.5) * Math.hypot(w, h) * 0.5;
    const speed = Math.max(0, Math.round(p.speed ?? 1));
    const pulse = Math.max(0, Math.round(p.pulse ?? 1));
    const color = parseColor(p.color ?? '#ffe9a8');
    const glow = clamp(p.glow ?? 0.5, 0, 1);
    const op = clamp(p.opacity ?? 0.7, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const rot = progress * TAU * speed;
    const pz = pulse === 0 ? 1 : 0.85 + 0.15 * Math.sin(progress * TAU * pulse);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';

    // 중심 글로우
    if (glow > 0) {
      const gr = len * 0.5 * glow + 1;
      const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, gr);
      gg.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${op * glow})`);
      gg.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(0, 0, gr, 0, TAU); ctx.fill();
    }

    // 빛살(가는 삼각형, 끝으로 갈수록 투명)
    const rl = len * pz;
    const half = (TAU / rays) * 0.28;
    for (let k = 0; k < rays; k++) {
      const a = rot + (k / rays) * TAU;
      const g = ctx.createLinearGradient(0, 0, Math.cos(a) * rl, Math.sin(a) * rl);
      g.addColorStop(0, `rgba(${color.r},${color.g},${color.b},${op * 0.9})`);
      g.addColorStop(1, `rgba(${color.r},${color.g},${color.b},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a - half) * rl, Math.sin(a - half) * rl);
      ctx.lineTo(Math.cos(a + half) * rl, Math.sin(a + half) * rl);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
};
