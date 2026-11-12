// 그림자(R28c) — 소스 모양대로 그림자를 깔고 그 위에 소스를 그린다. 거리·방향·흐림·퍼짐·색·불투명도.
//   정적(값에 키를 넣어 움직일 수 있음). 흐림은 core/render/blur.js 공용.
import { clamp, parseColor, rgba } from './_fx-util.js';
import { blurToSmall } from '../core/render/blur.js';

export default {
  id: 'drop-shadow',
  name: '그림자',
  category: '변형',
  description: '그림 뒤에 그림자를 깐다(거리·방향·흐림·퍼짐). 그림 레이어를 숨기고 소스로 연결',
  thumbnail: { frame: 0, bg: '#e9ecf1' },
  bleed: 60,
  params: [
    { key: 'distance', label: '거리', type: 'float', default: 12, min: 0, max: 120, step: 0.5 },
    { key: 'angle', label: '방향(도)', type: 'float', default: 45, min: 0, max: 360, step: 1 },
    { key: 'blur', label: '흐림', type: 'float', default: 8, min: 0, max: 60, step: 0.5 },
    { key: 'spread', label: '퍼짐', type: 'float', default: 0, min: 0, max: 20, step: 0.5 },
    { key: 'color', label: '색', type: 'color', default: '#000000' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.55, min: 0, max: 1, step: 0.01 },
    { key: 'only', label: '그림자만 보기', type: 'bool', default: false },
  ],
  scopes: ['full'],
  sources: [{ key: 'below', label: '대상(그림)' }],
  render(ctx, { sources, pad = 0, scale = 1, borrow, release }, p) {
    const src = (sources || []).find((s) => s.key === 'below')?.canvas;
    if (!src) return;
    const W = src.width, H = src.height;
    const k = scale;
    // 그림자가 떨어지는 방향: 0도 = 오른쪽, 90도 = 아래, 45도 = 오른쪽 아래(기본).
    const ang = (p.angle ?? 45) * Math.PI / 180;
    const dist = (p.distance ?? 12) * k;
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist;
    const col = parseColor(p.color ?? '#000000');
    // 실루엣
    const sil = borrow(W, H);
    const sc = sil.getContext('2d');
    const spread = Math.max(0, (p.spread ?? 0) * k);
    if (spread > 0.5) {
      const n = 16;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; sc.drawImage(src, Math.cos(a) * spread, Math.sin(a) * spread); }
    }
    sc.drawImage(src, 0, 0);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = rgba(col, 1);
    sc.fillRect(0, 0, W, H);
    const r = Math.max(0, (p.blur ?? 8) * k);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = clamp(p.opacity ?? 0.55, 0, 1);
    if (r > 0.5) {
      const b = blurToSmall(sil, r, borrow);  // 줄인 크기에서 흐려 바로 늘려 그린다(큰 캔버스 작업 1번)
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(b.canvas, 0, 0, b.sw, b.sh, pad + dx, pad + dy, W, H);
      release(b.canvas);
    } else ctx.drawImage(sil, pad + dx, pad + dy);
    ctx.globalAlpha = 1;
    if (!p.only) ctx.drawImage(src, pad, pad);
    ctx.restore();
    release(sil);
  },
};
