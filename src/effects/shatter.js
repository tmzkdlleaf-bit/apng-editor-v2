// 조각 흩어지기(R28d) — 나가는 화면이 조각으로 부서져 날아가며 들어오는 화면이 드러난다.
//   조각: 흔들린 격자를 삼각형/네모로 나눔. 순서(중심부터·한쪽부터·무작위)대로 늦게 출발. 한 번형.
import { TAU, clamp, hash2, PROGRESS_PARAMS, progressOf, TRANSITION_SOURCES, transitionCanvases, drawPlain } from './_fx-util.js';
import { ease } from '../core/anim/easing.js';

export default {
  id: 'shatter',
  name: '조각 흩어지기',
  category: '전환',
  once: true,
  description: '화면이 조각으로 부서져 날아간다. 조각 수·모양·날아가는 방향·순서',
  thumbnail: { frame: 7, bg: '#141414' },
  bleed: 0,
  params: [
    { key: 'pieces', label: '조각 수(한 줄)', type: 'int', default: 8, min: 2, max: 20 },
    { key: 'shape', label: '모양', type: 'select', default: 'tri',
      options: [{ value: 'tri', label: '불규칙 삼각' }, { value: 'quad', label: '불규칙 네모' }, { value: 'square', label: '네모' }] },
    { key: 'dir', label: '날아가는 방향', type: 'select', default: 'out',
      options: [{ value: 'out', label: '사방으로' }, { value: 'right', label: '오른쪽으로' }, { value: 'down', label: '아래로 떨어짐' }] },
    { key: 'order', label: '순서', type: 'select', default: 'center',
      options: [{ value: 'center', label: '가운데부터' }, { value: 'left', label: '왼쪽부터' }, { value: 'random', label: '무작위' }] },
    { key: 'spin', label: '회전', type: 'float', default: 0.6, min: 0, max: 1, step: 0.05 },
    { key: 'distance', label: '날아가는 거리', type: 'float', default: 0.6, min: 0.1, max: 1.5, step: 0.05 },
    { key: 'fade', label: '사라질 때 흐려짐', type: 'bool', default: true },
    ...PROGRESS_PARAMS.map((d) => d.key === 'progLength' ? { ...d, default: 18 } : d.key === 'progEase' ? { ...d, default: 'easeIn' } : d),
  ],
  scopes: ['full'],
  sources: TRANSITION_SOURCES,
  render(ctx, { f, rng, sources, pad = 0, borrow, release }, p) {
    const { out, inn } = transitionCanvases(sources);
    const t = progressOf(f, p, ease);
    if (t <= 0) { drawPlain(ctx, out, pad); return; }
    if (t >= 1 || !out) { drawPlain(ctx, inn, pad); return; }
    const W = out.width, H = out.height;
    const seed = 1 + Math.floor(rng() * 9999);
    const n = Math.max(2, Math.round(p.pieces ?? 8));
    const nx = n, ny = Math.max(2, Math.round(n * H / W));
    const shape = p.shape ?? 'tri';
    const jit = shape === 'square' ? 0 : 0.38;
    // 격자 점(가장자리 점은 가장자리에 붙인다)
    const P = (i, j) => {
      const ex = i === 0 || i === nx, ey = j === 0 || j === ny;
      const jx = ex ? 0 : (hash2(i, j, seed) - 0.5) * jit, jy = ey ? 0 : (hash2(i + 50, j, seed) - 0.5) * jit;
      return [(i + jx) / nx * W, (j + jy) / ny * H];
    };
    const polys = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      if (shape === 'tri') {
        if (hash2(i, j + 99, seed) < 0.5) { polys.push([a, b, c]); polys.push([a, c, d]); }
        else { polys.push([a, b, d]); polys.push([b, c, d]); }
      } else polys.push([a, b, c, d]);
    }
    const spin = clamp(p.spin ?? 0.6, 0, 1), dist = clamp(p.distance ?? 0.6, 0.1, 1.5) * Math.max(W, H);
    const dir = p.dir ?? 'out', order = p.order ?? 'center';
    // 조각마다 움직임 계산
    const moves = polys.map((poly, k) => {
      let cx = 0, cy = 0; for (const [x, y] of poly) { cx += x; cy += y; } cx /= poly.length; cy /= poly.length;
      const rnd = hash2(k, 7, seed);
      const delay = order === 'center' ? Math.hypot(cx / W - 0.5, cy / H - 0.5) / 0.71 * 0.6 + rnd * 0.1
        : order === 'left' ? (cx / W) * 0.6 + rnd * 0.1 : rnd * 0.65;
      const pp = clamp((t - delay * 0.75) / 0.45, 0, 1);
      return { poly, cx, cy, rnd, pp, k };
    });
    // 아직 출발 안 한 조각은 원래 화면을 통째로 그려 조각 경계에 실금이 보이지 않게 한다.
    const rest = borrow(W, H);
    const rc = rest.getContext('2d');
    rc.drawImage(out, 0, 0);
    rc.globalCompositeOperation = 'destination-out';
    rc.fillStyle = '#000';
    for (const m of moves) {
      if (m.pp <= 0) continue;
      rc.beginPath(); m.poly.forEach(([x, y], i) => (i ? rc.lineTo(x, y) : rc.moveTo(x, y))); rc.closePath(); rc.fill();
    }
    drawPlain(ctx, inn, pad);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(rest, pad, pad);
    release(rest);
    for (const { poly, cx, cy, rnd, pp, k } of moves) {
      if (pp <= 0) continue;
      const e = pp * pp;  // 가속
      let vx, vy;
      if (dir === 'right') { vx = 1; vy = (rnd - 0.5) * 0.4; }
      else if (dir === 'down') { vx = (rnd - 0.5) * 0.3; vy = 0.15; }
      else { const a = Math.atan2(cy - H / 2, cx - W / 2) + (rnd - 0.5) * 0.6; vx = Math.cos(a); vy = Math.sin(a); }
      const ox = vx * dist * e, oy = vy * dist * e + (dir === 'down' ? e * dist * 1.2 : 0);
      const rot = (hash2(k, 9, seed) - 0.5) * TAU * spin * e;
      const alpha = p.fade === false ? 1 : 1 - pp;
      if (alpha <= 0.01) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(pad + cx + ox, pad + cy + oy);
      ctx.rotate(rot);
      ctx.translate(-cx, -cy);
      ctx.beginPath();
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(out, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  },
};
