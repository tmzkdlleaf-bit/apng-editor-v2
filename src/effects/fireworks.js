// 불꽃놀이 — 밤하늘에 터지는 불꽃. 결정론·루프(정수 횟수 수명). 시드 의존. (분류: 연출)
import { TAU, rgba, mix, clamp, hash2 } from './_fx-util.js';
import { LOOK_PARAM, lookOf } from './_fx-style.js';
import { world, integrate, overLife, streak, camera, WORLD_PARAMS } from './_fx-real.js';

export default {
  id: 'fireworks',
  name: '불꽃놀이',
  category: '연출',
  description: '밤하늘에 터지는 불꽃',
  thumbnail: { frame: 9, bg: '#050514' },
  bleed: 8,
  params: [
    { key: 'shells', label: '폭죽 수', type: 'int', default: 6, min: 1, max: 24 },
    { key: 'particles', label: '파편 수', type: 'int', default: 48, min: 8, max: 160 },
    { key: 'bursts', label: '터지는 횟수', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'size', label: '퍼짐', type: 'float', default: 0.25, min: 0.05, max: 0.6, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#ffd36a' },
    { key: 'palette', label: '색(실사)', type: 'select', default: 'metal', options: [{ value: 'metal', label: '실제 금속 발색' }, { value: 'custom', label: '지정한 색' }] },
    { key: 'color2', label: '색 2', type: 'color', default: '#ff5ab0' },
    { key: 'gravity', label: '중력', type: 'float', default: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.95, min: 0, max: 1, step: 0.01 },
    LOOK_PARAM('real'),
    { key: 'glitter', label: '반짝이며 꺼지기(실사)', type: 'float', default: 0.4, min: 0, max: 1, step: 0.05 },
    ...WORLD_PARAMS.map((q) => (q.key === 'bloom' ? { ...q, default: 0.6 } : q.key === 'shutter' ? { ...q, default: 270 } : q)),
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h, rng } = env;
    const shells = Math.max(1, Math.round(p.shells ?? 6));
    const particles = Math.max(8, Math.round(p.particles ?? 48));
    const bursts = Math.max(1, Math.round(p.bursts ?? 2));
    const spread = clamp(p.size ?? 0.25, 0.05, 0.6) * Math.min(w, h);
    const grav = clamp(p.gravity ?? 0.4, 0, 1);
    const op = clamp(p.opacity ?? 0.95, 0, 1);
    const progress = f / Math.max(1, frameCount);

    ctx.globalCompositeOperation = 'lighter';
    for (let s = 0; s < shells; s++) {
      const bx = 0.1 + rng() * 0.8, by = 0.15 + rng() * 0.5;
      const off = rng();
      const col = mix(p.color ?? '#ffd36a', p.color2 ?? '#ff5ab0', rng());
      const seedAng = rng() * TAU;
      const life = ((progress * bursts + off) % 1 + 1) % 1; // 수명 0..1 (bursts 번 반복 → 루프)
      const a = op * (1 - life);
      if (a <= 0.01) continue;
      const cx = bx * w, cy = by * h;
      const rad = spread * life;
      for (let i = 0; i < particles; i++) {
        const ang = seedAng + (i / particles) * TAU;
        const vr = 0.6 + ((i * 2654435761) >>> 0) % 1000 / 1000 * 0.4; // 결정론적 반경 변주
        const x = cx + Math.cos(ang) * rad * vr;
        const y = cy + Math.sin(ang) * rad * vr + grav * spread * life * life;
        const r = Math.max(0.6, 2.4 * (1 - life));
        ctx.fillStyle = rgba(col, a);
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  },
};

// R30 실사(지침 4-1 불꽃·불티 + 4-2 렌즈): 별(파편)은 한순간 사방으로 튀어나가 공기 저항으로 곧 멈추고
//   중력으로 처지며 1.5~2.5초 탄다. 꼬리는 셔터 흐림(불꽃놀이 촬영은 셔터를 길게 → 기본 270°).
//   터지는 순간 1프레임 번쩍, 끝은 반짝이며(글리터) 꺼진다. 단위는 화면 비율(퍼짐 = 화면 대비 반지름).
// R31 금속 발색(자료집 2 §1-4): 스트론튬 빨강, 바륨 초록, 구리 파랑, 나트륨 노랑, 숯·철 금색, 마그네슘 흰색
const METAL = ['#ff2e1f', '#42ff6a', '#3a74ff', '#ffc93a', '#ffab4a', '#fff4e6'];

function renderReal(ctx, env, p) {
  const { w, h, rng } = env;
  const W = world(env, p);
  const shells = Math.max(1, Math.round(p.shells ?? 6));
  const parts = Math.max(8, Math.round(p.particles ?? 48));
  const bursts = Math.max(1, Math.round(p.bursts ?? 2));
  const R0 = clamp(p.size ?? 0.25, 0.05, 0.6) * Math.min(w, h);   // 최종 퍼짐 반지름(px)
  const grav = clamp(p.gravity ?? 0.4, 0, 1);
  const op = clamp(p.opacity ?? 0.95, 0, 1);
  const glit = clamp(p.glitter ?? 0.4, 0, 1);
  const seed = Math.floor(rng() * 1e6);
  const k = 2.2;                                   // 공기 저항(1/s): 최대 거리 = v0/k
  const v0 = R0 * k;                               // px/s
  const g = grav * R0 * 1.2;                       // 처짐(px/s²)
  const period = W.L / bursts;
  const lifeMax = 2.6;
  camera(ctx, env, p, (c) => {
    c.save();
    c.globalCompositeOperation = 'lighter';
    let flash = 0;
    for (let sI = 0; sI < shells; sI++) {
      const H = (q) => hash2(sI, q, seed);
      const cx = (0.12 + 0.76 * H(1)) * w, cy = (0.12 + 0.45 * H(2)) * h;
      let col;
      if ((p.palette ?? 'metal') === 'metal') {
        col = METAL[Math.floor(H(3) * METAL.length) % METAL.length];
      } else {
        const cm = mix(p.color ?? '#ffd36a', p.color2 ?? '#ff5ab0', H(3));
        col = '#' + [cm.r, cm.g, cm.b].map((v) => (v | 0).toString(16).padStart(2, '0')).join('');
      }
      const life = 1.6 + 0.9 * H(4);
      const tt = W.t + H(5) * period;
      const g0 = Math.floor(tt / period);
      for (let back = 0; back < 6; back++) {
        const age = tt - g0 * period + back * period;
        if (age >= Math.min(life, lifeMax)) break;
        const gen = (((g0 - back) % bursts) + bursts) % bursts;
        const u = age / life;
        if (age < W.dt) flash = Math.max(flash, 1 - age / W.dt);
        for (let i = 0; i < parts; i++) {
          const ang = (i / parts) * TAU + hash2(i, gen * 31 + sI, seed) * 0.25;
          const sp = v0 * (0.75 + 0.25 * hash2(i, 7 + gen, seed + sI));
          const m = integrate(cx, cy, Math.cos(ang) * sp, Math.sin(ang) * sp * 0.92, 0, g, k, age);
          let a = op * overLife([[0, 1], [0.6, 0.9], [1, 0]], u);
          if (u > 0.55 && glit > 0) {                    // 글리터: 끝에서 반짝반짝 꺼짐(프레임마다 다른 점)
            const tw = hash2(i * 13 + sI, Math.floor(age / W.dt), seed);
            a *= tw < glit * 0.6 ? 0.1 : 1;
          }
          if (a < 0.01) continue;
          const hot = mix('#ffffff', col, Math.min(1, u * 3));  // 막 터졌을 땐 흰빛
          // R31 꼬리: 별이 지나온 길에 남는 옅은 잔광(영상 한 프레임에도 짧은 꼬리가 보인다)
          if (age > 0.05) {
            const tau = Math.min(age, 0.18);
            const mb = integrate(cx, cy, Math.cos(ang) * sp, Math.sin(ang) * sp * 0.92, 0, g, k, age - tau);
            c.globalAlpha = a * 0.28; c.strokeStyle = col; c.lineWidth = Math.max(0.6, 1.2 * (1 - u * 0.5)); c.lineCap = 'round';
            c.beginPath(); c.moveTo(mb.x, mb.y); c.lineTo(m.x, m.y); c.stroke();
          }
          streak(c, m.x, m.y, m.vx, m.vy, W, Math.max(0.8, 2 * (1 - u * 0.5)), rgba(hot, 1), a);
        }
      }
    }
    c.restore();
    if (flash > 0) { c.globalAlpha = 0.03 * flash * op; c.fillStyle = '#fff6e0'; c.fillRect(0, 0, w, h); c.globalAlpha = 1; }
  }, { bloomK: 1 });
}
