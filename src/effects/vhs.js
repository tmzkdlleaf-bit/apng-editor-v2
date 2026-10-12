// VHS — 트래킹 줄과 색 번짐. 날짜 글자는 직접 입력(기본 고정폭, 이모지 금지). 결정론·루프.
import { TAU, hash2, frac, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'vhs',
  name: 'VHS',
  category: '오버레이',
  description: '트래킹 줄과 색 번짐의 VHS 느낌',
  thumbnail: { frame: 5, bg: '#0a0c10' },
  bleed: 0,
  params: [
    { key: 'trackPos', label: '트래킹 줄 위치', type: 'float', default: 0.8, min: 0, max: 1, step: 0.01 },
    { key: 'trackThickness', label: '트래킹 두께', type: 'float', default: 0.06, min: 0.01, max: 0.3, step: 0.01 },
    { key: 'jitter', label: '흔들림', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'colorBleed', label: '색 번짐', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'showDate', label: '날짜 글자', type: 'bool', default: true },
    { key: 'dateText', label: '날짜', type: 'text', default: 'PLAY  12:00  JAN 01' },
    { key: 'color', label: '글자 색', type: 'color', default: '#ffffff' },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const trackPos = clamp(p.trackPos ?? 0.8, 0, 1);
    const trackTh = clamp(p.trackThickness ?? 0.06, 0.01, 0.3) * h;
    const jitter = clamp(p.jitter ?? 0.5, 0, 1);
    const bleed = clamp(p.colorBleed ?? 0.5, 0, 1);
    const seed = Math.floor(rng() * 100000);
    const progress = f / Math.max(1, frameCount);
    const fseed = seed + (f % Math.max(1, frameCount));

    // 색 번짐: 옅은 빨강/파랑 가로 띠
    if (bleed > 0) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const y = (i / n) * h + Math.sin(progress * TAU + i) * 4;
        ctx.fillStyle = withAlpha(i % 2 ? '#ff0033' : '#0066ff', bleed * 0.08);
        ctx.fillRect(0, y, w, h / n * 0.5);
      }
    }

    // 트래킹 줄: 밝은 노이즈 띠(위치 흔들림 + 가로 줄 끌림)
    const wob = Math.sin(progress * TAU) * jitter * h * 0.03;
    const ty = trackPos * h + wob;
    const rows = Math.max(1, Math.round(trackTh));
    for (let yy = 0; yy < trackTh; yy += 2) {
      const dx = (hash2(Math.floor(yy), fseed, 3) - 0.5) * jitter * w * 0.15;
      ctx.fillStyle = withAlpha('#ffffff', 0.08 + 0.5 * hash2(Math.floor(yy), fseed, 7));
      ctx.fillRect(dx, ty + yy, w, 2);
    }
    // 트래킹 띠 가장자리 어둡게
    ctx.fillStyle = withAlpha('#000000', 0.25);
    ctx.fillRect(0, ty - 2, w, 2); ctx.fillRect(0, ty + trackTh, w, 3);

    // 날짜 글자(직접 입력, 고정폭)
    if (p.showDate) {
      const txt = String(p.dateText ?? '');
      const fs = Math.max(10, Math.round(h * 0.035));
      ctx.font = `${fs}px monospace`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = withAlpha('#000000', 0.5);
      ctx.fillText(txt, 18 + 1.5, h - 22 + 1.5);
      ctx.fillStyle = withAlpha(p.color ?? '#ffffff', 0.9);
      ctx.fillText(txt, 18, h - 22);
    }
  },
};
