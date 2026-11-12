// 화면 금 가기(R28b) — 한 점에서 유리 금이 퍼진다. 큰 금(방사) + 거미줄 고리 금 + 잔금. 진행이 끝나면 금은 남는다.
//   아래 화면을 소스로 연결하면 금 사이 조각이 살짝 어긋나 보인다(조각 어긋남). 한 번(once)형.
import { TAU, clamp, PROGRESS_PARAMS, progressOf, branchSegments, drawSegments, hash2 } from './_fx-util.js';
import { ease } from '../core/anim/easing.js';

export default {
  id: 'crack',
  name: '화면 금 가기',
  category: '공포',
  once: true,
  description: '유리가 깨지듯 한 점에서 금이 퍼진다(펌블·충격 연출). 아래 화면을 연결하면 조각이 어긋남',
  thumbnail: { frame: 11, bg: '#101318' },
  bleed: 0,
  params: [
    { key: 'center', label: '중심', type: 'coord', default: { x: 0.5, y: 0.45 } },
    { key: 'rays', label: '갈래 수', type: 'int', default: 9, min: 3, max: 18 },
    { key: 'fine', label: '잔금 양', type: 'float', default: 0.35, min: 0, max: 1, step: 0.05 },
    { key: 'rings', label: '고리 금', type: 'int', default: 3, min: 0, max: 6 },
    { key: 'width', label: '굵기', type: 'float', default: 2, min: 0.5, max: 6, step: 0.1 },
    { key: 'color', label: '금 색', type: 'color', default: '#ffffff' },
    { key: 'shake', label: '깨지는 순간 흔들림', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'shift', label: '조각 어긋남', type: 'float', default: 0.4, min: 0, max: 1, step: 0.05 },
    ...PROGRESS_PARAMS.map((d) => d.key === 'progLength' ? { ...d, default: 8 } : d.key === 'progEase' ? { ...d, default: 'easeOutCubic' } : d),
  ],
  scopes: ['full'],
  sources: [{ key: 'below', label: '어긋나게 할 화면(선택)' }],
  render(ctx, { f, w, h, rng, sources, pad = 0, scale = 1 }, p) {
    const t = progressOf(f, p, ease);
    const cx = clamp(p.center?.x ?? 0.5, 0, 1) * w, cy = clamp(p.center?.y ?? 0.45, 0, 1) * h;
    const rays = Math.max(3, Math.round(p.rays ?? 9));
    const fine = clamp(p.fine ?? 0.5, 0, 1);
    const R = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) * 1.05;
    const seed = 1 + Math.floor(rng() * 9999);
    // 큰 금: 방사 방향으로 꺾이며 뻗는 가지 선
    const angles = [];
    const main = [];
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU + (rng() - 0.5) * (TAU / rays) * 0.6;
      angles.push(a);
      main.push(...branchSegments(rng, { x: cx, y: cy, angle: a, length: R * (0.55 + 0.45 * rng()), depth: 1 + (fine > 0.4 ? 1 : 0),
        branch: 0.1 + 0.35 * fine, spread: 0.7, jag: 0.35, segs: 7, shrink: 0.45 }));
    }
    // 고리 금: 이웃한 큰 금 사이를 잇는 꺾인 선(거미줄)
    const ringSegs = [];
    const rings = Math.max(0, Math.round(p.rings ?? 3));
    for (let k = 1; k <= rings; k++) {
      const rr = R * (0.08 + 0.55 * (k / (rings + 1)) ** 1.3);
      for (let i = 0; i < rays; i++) {
        if (hash2(i, k, seed) < 0.25) continue; // 듬성듬성
        const a0 = angles[i], a1 = angles[(i + 1) % rays] + (i + 1 === rays ? TAU : 0);
        const r0 = rr * (0.85 + 0.3 * hash2(i, k + 7, seed)), r1 = rr * (0.85 + 0.3 * hash2(i + 1, k + 7, seed));
        const am = (a0 + a1) / 2, rm = (r0 + r1) / 2 * 0.93;
        const pts = [[cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0], [cx + Math.cos(am) * rm, cy + Math.sin(am) * rm], [cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1]];
        const tt = 0.25 + 0.6 * (k / (rings + 1));
        ringSegs.push({ x0: pts[0][0], y0: pts[0][1], x1: pts[1][0], y1: pts[1][1], t0: tt, t1: tt + 0.15, w: 0.6 });
        ringSegs.push({ x0: pts[1][0], y0: pts[1][1], x1: pts[2][0], y1: pts[2][1], t0: tt + 0.05, t1: tt + 0.2, w: 0.6 });
      }
    }
    // 깨지는 순간 흔들림(자동 진행일 때 시작 뒤 4프레임)
    const fs = f - Math.round(p.progStart ?? 0);
    let sx = 0, sy = 0;
    if ((p.progMode ?? 'auto') === 'auto' && (p.progDir ?? 'in') === 'in' && fs >= 0 && fs < 4) {
      const k = clamp(p.shake ?? 0.5, 0, 1) * 10 * (1 - fs / 4);
      sx = (hash2(fs, 1, seed) - 0.5) * 2 * k; sy = (hash2(fs, 2, seed) - 0.5) * 2 * k;
    }
    const src = (sources || []).find((s) => s.key === 'below')?.canvas;
    const shift = clamp(p.shift ?? 0.4, 0, 1) * 6 * t;
    if (src) {
      // 조각 어긋남: 큰 금 사이 쐐기마다 아래 화면을 바깥쪽으로 조금 밀어 그린다.
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const k = scale;
      // 바닥에 원래 화면을 한 번 깔아 쐐기 경계(부드러운 가장자리)에 틈이 보이지 않게 한다.
      ctx.drawImage(src, pad + sx * k, pad + sy * k);
      for (let i = 0; i < rays && shift > 0.01; i++) {
        const a0 = angles[i], a1 = angles[(i + 1) % rays] + (i + 1 === rays ? TAU : 0);
        const am = (a0 + a1) / 2;
        const off = shift * (0.4 + hash2(i, 3, seed)) * k;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(pad + (cx + sx) * k, pad + (cy + sy) * k);
        for (let j = 0; j <= 8; j++) { const a = a0 + (a1 - a0) * (j / 8); ctx.lineTo(pad + (cx + sx + Math.cos(a) * R * 1.5) * k, pad + (cy + sy + Math.sin(a) * R * 1.5) * k); }
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(src, pad + sx * k + Math.cos(am) * off, pad + sy * k + Math.sin(am) * off);
        ctx.restore();
      }
      ctx.restore();
    }
    if (t <= 0) return;
    ctx.save();
    ctx.translate(sx, sy);
    const wd = Math.max(0.5, p.width ?? 2);
    // 어두운 그림자 선 → 밝은 선(유리 단면 느낌)
    drawSegments(ctx, main, t, wd * 2.2, 'rgba(0,0,0,0.45)');
    drawSegments(ctx, ringSegs, t, wd * 1.6, 'rgba(0,0,0,0.35)');
    drawSegments(ctx, main, t, wd, p.color ?? '#ffffff', 0.6);
    drawSegments(ctx, ringSegs, t, wd * 0.8, p.color ?? '#ffffff');
    // 중심 부서짐 점
    ctx.globalAlpha = clamp(t * 3, 0, 1) * 0.9;
    ctx.fillStyle = p.color ?? '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, wd * 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  },
};
