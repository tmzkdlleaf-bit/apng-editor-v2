// 밝은 곳 번짐(R28c, 블룸) — 소스에서 일정 밝기 이상인 부분만 골라 흐려 빛처럼 더한다.
//   계산은 절반 크기에서(빠름). 숨쉬기(0 이면 정적)는 정수 횟수로 루프.
import { TAU, clamp, parseColor } from './_fx-util.js';
import { blurCanvas } from '../core/render/blur.js';

export default {
  id: 'bloom',
  name: '밝은 곳 번짐',
  category: '변형',
  description: '그림의 밝은 부분만 빛처럼 번지게 한다(조명·마법·네온). 그림 레이어를 숨기고 소스로 연결',
  thumbnail: { frame: 0, bg: '#0d0f14' },
  bleed: 40,
  params: [
    { key: 'threshold', label: '문턱 밝기', type: 'float', default: 0.78, min: 0, max: 1, step: 0.01 },
    { key: 'radius', label: '번짐 반지름', type: 'float', default: 16, min: 1, max: 80, step: 0.5 },
    { key: 'strength', label: '세기', type: 'float', default: 0.8, min: 0, max: 3, step: 0.05 },
    { key: 'tint', label: '색 입히기', type: 'color', default: '#ffffff' },
    { key: 'tintAmount', label: '색 입히기 정도', type: 'float', default: 0, min: 0, max: 1, step: 0.05 },
    { key: 'breathe', label: '숨쉬기', type: 'float', default: 0, min: 0, max: 1, step: 0.05 },
    { key: 'cycles', label: '횟수', type: 'int', default: 1, min: 1, max: 8 },
  ],
  scopes: ['full'],
  sources: [{ key: 'below', label: '대상(그림)' }],
  render(ctx, { f, frameCount, sources, pad = 0, scale = 1, borrow, release }, p) {
    const src = (sources || []).find((s) => s.key === 'below')?.canvas;
    if (!src) return;
    const W = src.width, H = src.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(src, pad, pad);
    const hw = Math.max(1, Math.ceil(W / 2)), hh = Math.max(1, Math.ceil(H / 2));
    const half = borrow(hw, hh);
    const hc = half.getContext('2d');
    hc.imageSmoothingEnabled = true;
    hc.drawImage(src, 0, 0, W, H, 0, 0, W / 2, H / 2);
    // 밝은 부분만(부드러운 문턱) — 절반 크기라 픽셀 수 1/4
    const id = hc.getImageData(0, 0, hw, hh), d = id.data;
    const th = clamp(p.threshold ?? 0.78, 0, 1) * 255, knee = 30;
    const tint = parseColor(p.tint ?? '#ffffff'), ta = clamp(p.tintAmount ?? 0, 0, 1);
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (!a) continue;
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const m = clamp((l - th + knee) / (2 * knee), 0, 1);
      if (m <= 0) { d[i + 3] = 0; continue; }
      d[i + 3] = a * m;
      if (ta > 0) { d[i] += (tint.r - d[i]) * ta; d[i + 1] += (tint.g - d[i + 1]) * ta; d[i + 2] += (tint.b - d[i + 2]) * ta; }
    }
    hc.putImageData(id, 0, 0);
    const bl = blurCanvas(half, Math.max(1, (p.radius ?? 16) * scale / 2), borrow, release);
    const prog = f / Math.max(1, frameCount);
    const br = clamp(p.breathe ?? 0, 0, 1);
    const k = Math.max(0, p.strength ?? 0.8) * (1 + br * 0.6 * Math.sin(TAU * Math.max(1, Math.round(p.cycles ?? 1)) * prog));
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    let left = k;
    while (left > 0.001) { // 세기 1 넘으면 여러 번 더한다
      ctx.globalAlpha = Math.min(1, left);
      ctx.drawImage(bl, 0, 0, hw, hh, pad, pad, hw * 2, hh * 2);
      left -= 1;
    }
    ctx.restore();
    release(bl);
    release(half);
  },
};
