// 충격파 — 터지며 퍼지는 밝은 고리. 결정론·루프(frac 반복). 시드 무관. (분류: 연출)
import { TAU, parseColor, clamp, rgba, hash2 } from './_fx-util.js';
import { LOOK_PARAM, lookOf, loopFbm, loopNoise } from './_fx-style.js';
import { world, emit, integrate, overLife, streak, camera, spikeCount, WORLD_PARAMS } from './_fx-real.js';


export default {
  id: 'shockwave',
  name: '충격파',
  category: '연출',
  description: '터지며 퍼지는 밝은 충격 고리',
  thumbnail: { frame: 6, bg: '#101010' },
  bleed: 8,
  params: [
    { key: 'bursts', label: '터지는 횟수', type: 'int', default: 1, min: 1, max: 6 },
    { key: 'position', label: '중심', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'size', label: '최대 크기', type: 'float', default: 1, min: 0.3, max: 1.6, step: 0.01 },
    { key: 'thickness', label: '두께', type: 'float', default: 0.12, min: 0.02, max: 0.4, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#ffffff' },
    { key: 'intensity', label: '세기', type: 'float', default: 0.9, min: 0, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
    LOOK_PARAM('real'),
    ...WORLD_PARAMS.map((q) => (q.key === 'bloom' ? { ...q, default: 0.5 } : q)),
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h } = env;
    const bursts = Math.max(1, Math.round(p.bursts ?? 1));
    const pos = p.position ?? { x: 0.5, y: 0.5 };
    const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
    const maxR = clamp(p.size ?? 1, 0.3, 1.6) * Math.min(w, h) * 0.5;
    const thick = clamp(p.thickness ?? 0.12, 0.02, 0.4) * maxR;
    const c = parseColor(p.color ?? '#ffffff');
    const intensity = clamp(p.intensity ?? 0.9, 0, 1);
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const t = ((progress * bursts) % 1 + 1) % 1;
    const rr = t * maxR;
    if (rr <= 0.5) return;
    const fade = 1 - t;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const inner = Math.max(0, rr - thick), outer = rr + thick;
    const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    g.addColorStop(0, `rgba(${c.r},${c.g},${c.b},0)`);
    g.addColorStop(0.5, `rgba(${c.r},${c.g},${c.b},${op * intensity * fade})`);
    g.addColorStop(1, `rgba(${c.r},${c.g},${c.b},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, outer, 0, TAU); ctx.fill();
    ctx.restore();
  },
};

// R30 실사(지침 4-1 폭발류): 충격파는 처음에 아주 빠르고 곧 느려진다(폭발 반지름 ∝ 시간^0.4, 세도프-테일러).
//   공기 중에서는 고리 자체가 거의 안 보이고, 밀려난 먼지·수증기가 얇고 울퉁불퉁한 띠로 보인다.
//   앞쪽 가장자리만 밝고 뒤로 옅게 끌리며, 빠르게 어두워진다. 터지는 순간 가운데 1프레임 번쩍.
function renderReal(ctx, env, p) {
  const { w, h } = env;
  const W = world(env, p);
  const bursts = Math.max(1, Math.round(p.bursts ?? 1));
  const pos = p.position ?? { x: 0.5, y: 0.5 };
  const cx = (pos.x ?? 0.5) * w, cy = (pos.y ?? 0.5) * h;
  const maxR = clamp(p.size ?? 1, 0.3, 1.6) * Math.min(w, h) * 0.5;
  const thick = clamp(p.thickness ?? 0.12, 0.02, 0.4);
  const c = parseColor(p.color ?? '#ffffff');
  const K = clamp(p.intensity ?? 0.9, 0, 1) * clamp(p.opacity ?? 1, 0, 1);
  const T = W.L / bursts;
  const age = ((W.t % T) + T) % T, u = age / T;
  const R = maxR * Math.pow(Math.max(u, 1e-4), 0.4);
  const fade = Math.pow(1 - u, 1.6);
  camera(ctx, env, p, (g) => {
    g.save();
    g.globalCompositeOperation = 'lighter';
    // 울퉁불퉁한 띠: 각도마다 반지름이 조금씩 다르다(먼지가 고르게 밀리지 않음)
    const N = 96, band = Math.max(2, thick * R * 0.6);
    for (let layer = 0; layer < 3; layer++) {
      const off = -band * layer * 0.7;                       // 뒤로 끌리는 옅은 겹
      g.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU;
        const j = loopNoise((i % N) / N * 12, layer * 3.1, 12, 0, 5) - 0.5;
        const rr = R + off + j * band * 1.6;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.strokeStyle = rgba(c, K * fade * (layer === 0 ? 0.55 : 0.18));
      g.lineWidth = Math.max(1, band * (layer === 0 ? 0.5 : 1.2));
      g.stroke();
    }
    // 안쪽에 남는 옅은 먼지 안개
    const hz = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, R));
    hz.addColorStop(0, rgba(c, 0)); hz.addColorStop(0.8, rgba(c, 0.06 * K * fade)); hz.addColorStop(1, rgba(c, 0));
    g.fillStyle = hz; g.beginPath(); g.arc(cx, cy, Math.max(1, R), 0, TAU); g.fill();
    // 터지는 순간(첫 프레임) 가운데 번쩍
    if (age < W.dt) {
      const fl = g.createRadialGradient(cx, cy, 0, cx, cy, maxR * 0.35);
      fl.addColorStop(0, rgba(c, K)); fl.addColorStop(1, rgba(c, 0));
      g.fillStyle = fl; g.beginPath(); g.arc(cx, cy, maxR * 0.35, 0, TAU); g.fill();
    }
    g.restore();
  }, { bloomK: 1 });
}
