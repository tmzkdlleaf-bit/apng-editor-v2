// 광기 왜곡(R28b) — 아래 화면을 소용돌이·일렁임으로 비틀고 색을 번지게 한다(이성 판정 연출).
//   소스 필요(비틀 화면을 숨기고 연결). 비틂은 굵은 격자(8px)에서 계산해 픽셀마다 보간(가장 가까운 픽셀) → 빠르다.
//   결정론·루프(정수 횟수).
import { TAU, clamp, smoothstep } from './_fx-util.js';

const GRID = 8;

export default {
  id: 'madness',
  name: '광기 왜곡',
  category: '공포',
  description: '화면이 소용돌이치며 일렁이고 색이 번진다(이성 판정·광기 연출). 비틀 화면을 소스로 연결',
  thumbnail: { frame: 4, bg: '#120f16' },
  bleed: 0,
  params: [
    { key: 'strength', label: '세기', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'swirl', label: '소용돌이', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'wobble', label: '일렁임', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'chroma', label: '색 어긋남', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'breathe', label: '숨쉬기', type: 'float', default: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'area', label: '범위', type: 'select', default: 'full',
      options: [{ value: 'full', label: '전체' }, { value: 'edge', label: '가장자리만' }] },
    { key: 'center', label: '중심', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'cycles', label: '횟수', type: 'int', default: 1, min: 1, max: 8 },
  ],
  scopes: ['full'],
  sources: [{ key: 'below', label: '대상(비틀 화면)' }],
  render(ctx, { f, frameCount, sources, pad = 0, scale = 1, borrow, release }, p) {
    const src = (sources || []).find((s) => s.key === 'below')?.canvas;
    if (!src) return;
    const W = src.width, H = src.height;
    const st = clamp(p.strength ?? 0.6, 0, 1);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (st <= 0) { ctx.drawImage(src, pad, pad); ctx.restore(); return; }
    const prog = f / Math.max(1, frameCount);
    const cyc = Math.max(1, Math.round(p.cycles ?? 1));
    const ph = TAU * cyc * prog;
    const cx = clamp(p.center?.x ?? 0.5, 0, 1) * W, cy = clamp(p.center?.y ?? 0.5, 0, 1) * H;
    const R = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    const swirl = clamp(p.swirl ?? 0.5, 0, 1) * 1.4 * st * Math.sin(ph);
    const wob = clamp(p.wobble ?? 0.5, 0, 1) * 10 * scale * st;
    const br = 1 + 0.06 * clamp(p.breathe ?? 0.4, 0, 1) * st * Math.sin(ph * 2);
    const edge = p.area === 'edge';

    // 1) 격자 꼭짓점마다 "어디서 가져올지"(원래 좌표) 계산
    const gw = Math.ceil(W / GRID) + 1, gh = Math.ceil(H / GRID) + 1;
    const mx = new Float32Array(gw * gh), my = new Float32Array(gw * gh);
    for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
      const x = gx * GRID, y = gy * GRID;
      const dx = x - cx, dy = y - cy;
      const r = Math.hypot(dx, dy) / R;
      const wgt = edge ? smoothstep(0.3, 0.9, r) : 1;
      const a = swirl * (1 - r) * (1 - r) * wgt;
      const ca = Math.cos(a), sa = Math.sin(a);
      const s = 1 + (br - 1) * wgt;
      let sx = cx + (dx * ca - dy * sa) / s, sy = cy + (dx * sa + dy * ca) / s;
      sx += Math.sin(y * 0.035 / scale + ph) * wob * wgt;
      sy += Math.sin(x * 0.03 / scale + ph * 2 + 1.3) * wob * 0.6 * wgt;
      mx[gy * gw + gx] = sx; my[gy * gw + gx] = sy;
    }
    // 2) 픽셀마다 격자 보간 좌표의 가장 가까운 픽셀을 가져온다(32비트 한 번에 복사 — 빠름).
    //   격자 칸 안에서는 좌표가 직선으로 변하므로 가로로 한 칸씩 더해 가며 계산한다.
    const inD = src.getContext('2d').getImageData(0, 0, W, H);
    const in32 = new Uint32Array(inD.data.buffer);
    const in8 = inD.data;
    // 색 어긋남(색수차): 빨강은 오른쪽, 파랑은 왼쪽에서 가져온다(픽셀 루프 안에서 — 캔버스 합성보다 빠름).
    const chs = Math.round(clamp(p.chroma ?? 0.5, 0, 1) * 6 * scale * st * (0.6 + 0.4 * Math.sin(ph)));
    const outC = borrow(W, H);
    const oc = outC.getContext('2d');
    const img = oc.createImageData(W, H);
    const o32 = new Uint32Array(img.data.buffer);
    const o8 = img.data;
    const maxX = W - 1, maxY = H - 1;
    for (let y = 0; y < H; y++) {
      const gyf = y / GRID, gy0 = Math.min(gh - 2, gyf | 0), ty = gyf - gy0;
      const row = y * W;
      for (let gx0 = 0; gx0 < gw - 1; gx0++) {
        const i00 = gy0 * gw + gx0, i10 = i00 + 1, i01 = i00 + gw, i11 = i01 + 1;
        const ax = mx[i00] + (mx[i01] - mx[i00]) * ty, bx = mx[i10] + (mx[i11] - mx[i10]) * ty;
        const ay = my[i00] + (my[i01] - my[i00]) * ty, by = my[i10] + (my[i11] - my[i10]) * ty;
        const x0 = gx0 * GRID, x1 = Math.min(W, x0 + GRID);
        const stepX = (bx - ax) / GRID, stepY = (by - ay) / GRID;
        let sx = ax + 0.5, sy = ay + 0.5;
        for (let x = x0; x < x1; x++) {
          let ix = sx | 0, iy = sy | 0;
          if (ix < 0) ix = 0; else if (ix > maxX) ix = maxX;
          if (iy < 0) iy = 0; else if (iy > maxY) iy = maxY;
          const si = iy * W + ix;
          if (chs === 0) o32[row + x] = in32[si];
          else {
            const oi = (row + x) * 4, rIx = ix + chs > maxX ? maxX : ix + chs, bIx = ix - chs < 0 ? 0 : ix - chs;
            const ri = (iy * W + rIx) * 4, bi = (iy * W + bIx) * 4, gi = si * 4;
            o8[oi] = in8[ri]; o8[oi + 1] = in8[gi + 1]; o8[oi + 2] = in8[bi + 2];
            const a = in8[gi + 3], ar = in8[ri + 3], ab = in8[bi + 3];
            o8[oi + 3] = a > ar ? (a > ab ? a : ab) : (ar > ab ? ar : ab);
          }
          sx += stepX; sy += stepY;
        }
      }
    }
    oc.putImageData(img, 0, 0);
    ctx.drawImage(outC, pad, pad);
    ctx.restore();
    release(outC);
  },
};
