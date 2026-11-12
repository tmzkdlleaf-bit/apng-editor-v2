// 눈 — 떨어지는 눈송이(겹/원근). 결정론·루프(frac 낙하, 정수 바퀴).
import { TAU, frac, withAlpha, clamp, hash2 } from './_fx-util.js';
import { LOOK_PARAM, lookOf } from './_fx-style.js';
import { world, cyclesInLoop, streak, camera, WORLD_PARAMS } from './_fx-real.js';

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
    LOOK_PARAM('real'),
    ...WORLD_PARAMS.map((q) => (q.key === 'bloom' ? { ...q, default: 0.2 } : q)),
  ],
  // '종류'는 프리셋(값을 한꺼번에 채우는 버튼)으로(R28e)
  presets: [
    { id: 'graupel', label: '싸락눈', values: { amount: 220, size: 1.5, sway: 0.15, wind: 0.05, layers: 2 } },
    { id: 'heavy', label: '함박눈', values: { amount: 70, size: 7, sway: 0.7, wind: 0.05, layers: 3, frontBlur: 0.5 } },
    { id: 'blizzard', label: '눈보라', values: { amount: 400, size: 2.5, sway: 0.2, wind: 0.9, layers: 4, frontBlur: 0.3 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h, rng } = env;
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
    drawPile(ctx, w, h, p, rng, color, op);
  },
};

function drawPile(ctx, w, h, p, rng, color, op) {
    const pile = clamp(p.pile ?? 0, 0, 0.3);
    const pileTop = h * (1 - pile);
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
}

// R30 실사(docs/vfx-guide-real.md 4-1 눈, 자료집 2-7): 낙하 0.5~1.5 m/s(나뭇가지 모양·가루눈 약 0.5),
//   큰 송이는 좌우로 출렁·팔랑(0.5~1.5 Hz), 굴러가며 반짝임. 셔터 흐림은 아주 짧아 거의 점.
//   멀리·중간·가까이 3겹(가까운 송이는 초점 밖 동그란 빛). 정면광이라 고르게 밝다.
function renderReal(ctx, env, p) {
  const { w, h, rng } = env;
  const W = world(env, p);
  const n = Math.max(1, Math.round((p.amount ?? 120) * 2.5));
  const sizeK = Math.max(0.2, (p.size ?? 3) / 3);
  const sway = clamp(p.sway ?? 0.5, 0, 1);
  const wind = clamp(p.wind ?? 0.15, -1, 1) * 2;           // 바람 m/s (최대 2)
  const color = p.color ?? '#f2f7ff';
  const op = clamp(p.opacity ?? 0.9, 0, 1);
  const seed = Math.floor(rng() * 1e6);
  const zRef = 3;
  const layers = [[0.55, [7, 18], false], [0.37, [2.5, 6], false], [0.08, [0.6, 1.3], true]];
  camera(ctx, env, p, (c) => {
    layers.forEach(([cnt, [z0, z1], dof], li) => {
      const nn = Math.max(1, Math.round(n * cnt));
      for (let i = 0; i < nn; i++) {
        const H = (k) => hash2(i + li * 6007, k, seed);
        const q = H(1);
        const Dmm = (q < 0.6 ? 1 + 2 * H(2) : q < 0.9 ? 3 + 3 * H(2) : 8 + 7 * H(2)) * sizeK; // 큰 것은 송이(뭉친 눈)
        const v = clamp(0.5 + 0.06 * Dmm, 0.5, 1.5);                              // 낙하 m/s
        const z = z0 + (z1 - z0) * H(3), s = zRef / z;
        const span = h * 1.15;
        const vTrue = v * W.pxPerM * s;                                           // 실제 화면 속도(px/s)
        const tanA = wind / v;
        let y, vy, env = 1;
        if (vTrue * W.L >= span * 0.8) {
          // 루프 동안 화면을 한 번 이상 지나갈 만큼 빠르면: 정수 번 지나가게 맞춘다
          const m = Math.max(1, Math.round(W.L * vTrue / span));
          vy = span * m / W.L;
          y = frac(H(4) + W.t * m / W.L) * span - h * 0.08;
        } else {
          // 느린 눈(대부분): 실제 속도 그대로 내려오고, 루프 이음매는 생겼다 사라지는 것으로 감춘다(입자마다 시점이 달라 티 나지 않음)
          vy = vTrue;
          const age = frac(W.t / W.L + H(8)) * W.L;
          y = H(4) * (h * 1.1) - h * 0.05 - vTrue * W.L * 0.5 + vTrue * age;
          env = Math.min(1, age / (0.18 * W.L), (W.L - age) / (0.18 * W.L));
        }
        // 출렁임: 0.5~1.5 Hz, 폭은 큰 송이일수록(2~8 cm). 루프 안 정수 번.
        const fq = 0.5 + H(5);
        const cyc = cyclesInLoop(1 / fq, W.L);
        const ampM = (0.02 + 0.06 * Math.min(1, Dmm / 10)) * (0.3 + 1.4 * sway);
        const ph = H(6) * TAU, wav = TAU * cyc * W.t / W.L + ph;
        const x = H(7) * w * 1.2 - w * 0.1 + (y + h * 0.08) * tanA - h * tanA * 0.5 + Math.sin(wav) * ampM * W.pxPerM * s;
        const vx = vy * tanA + Math.cos(wav) * ampM * W.pxPerM * s * TAU * cyc / W.L;
        const r = Math.max(0.5, (Dmm / 1000) * W.pxPerM * s * 0.5 * 2.2);         // 눈송이는 실제보다 밝게 퍼져 보인다
        const glint = 0.8 + 0.2 * Math.sin(wav * 2 + ph);                          // 굴러가며 반짝임
        const a = op * glint * env * (li === 0 ? 0.55 : 1);
        if (dof) {
          // 초점 밖: 크고 옅은 동그란 빛(가장자리가 살짝 진한 원판)
          const R = r * 4;
          const g = c.createRadialGradient(x, y, 0, x, y, R);
          g.addColorStop(0, withAlpha(color, a * 0.22)); g.addColorStop(0.8, withAlpha(color, a * 0.28)); g.addColorStop(1, withAlpha(color, 0));
          c.globalAlpha = 1; c.fillStyle = g; c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
        } else {
          streak(c, x, y, vx, vy, W, r * 2, color, a);
        }
      }
    });
    c.globalAlpha = 1;
    drawPile(c, w, h, p, rng, color, op);
  }, { bloomK: 1 });
}
