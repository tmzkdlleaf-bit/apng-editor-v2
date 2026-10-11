// 네온 깜빡임 — 소스 레이어 모양을 따라 테두리가 네온처럼 켜졌다 꺼짐. 결정론·루프.
import { TAU, frac, hash2, clamp } from './_fx-util.js';

export default {
  id: 'neon',
  name: '네온 깜빡임',
  category: '빛',
  description: '소스 모양을 따라 빛나는 네온(깜빡임 패턴)',
  thumbnail: { frame: 4, bg: '#0a0a12' },
  bleed: 24,
  params: [
    { key: 'color', label: '색', type: 'color', default: '#ff4ddb' },
    { key: 'thickness', label: '두께', type: 'float', default: 8, min: 1, max: 40, step: 0.5 },
    { key: 'speed', label: '속도', type: 'int', default: 2, min: 1, max: 10 },
    { key: 'pattern', label: '깜빡임 패턴', type: 'select', default: 'flicker',
      options: [{ value: 'steady', label: '켜짐' }, { value: 'flicker', label: '맥동' }, { value: 'random', label: '불규칙' }] },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'pink', label: '핑크', values: { color: '#ff4ddb' } },
    { id: 'cyan', label: '시안', values: { color: '#4df5ff' } },
    { id: 'buzz', label: '지지직', values: { pattern: 'random', speed: 6 } },
  ],
  scopes: ['full'], // 소스 모양 기반
  sources: [{ key: 'shape', label: '모양' }],
  render(ctx, { f, frameCount, scale = 1, sources, pad = 0 }, p) {
    const src = (sources || []).find((s) => s.key === 'shape')?.canvas;
    if (!src) return;
    const color = p.color ?? '#ff4ddb';
    const thick = p.thickness ?? 8;
    const speed = Math.max(1, Math.round(p.speed ?? 2));
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);

    let a;
    if (p.pattern === 'steady') a = 1;
    else if (p.pattern === 'random') a = 0.2 + 0.8 * hash2(Math.floor(frac(progress * speed) * 8), 3, 9);
    else a = 0.4 + 0.6 * Math.max(0, Math.sin(progress * TAU * speed));

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = op * a;
    // 글로우: shadowBlur 한 번(여러 번은 느리다) + 선명한 윤곽 한 번.
    ctx.shadowColor = color;
    ctx.shadowBlur = Math.max(2, thick * scale * 2.2);
    ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.drawImage(src, pad, pad);
    ctx.shadowBlur = 0;
    ctx.drawImage(src, pad, pad); // 선명한 중심
    // 네온 색으로 통일(소프트 글로우 알파 유지)
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // 속을 파내 테두리 네온관처럼(가운데를 줄인 실루엣으로 destination-out). 두께가 클수록 관이 두껍다.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    const erode = clamp(1 - (thick * scale) / Math.max(src.width, src.height), 0.4, 0.94);
    const ew = src.width * erode, eh = src.height * erode;
    ctx.drawImage(src, pad + (src.width - ew) / 2, pad + (src.height - eh) / 2, ew, eh);
    ctx.restore();
  },
};
