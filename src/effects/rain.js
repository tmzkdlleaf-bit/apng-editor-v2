// 비 — 빗줄기(비·물보라 합침). 결정론·루프(frac 낙하, 정수 바퀴).
// R29 손그림 개편(docs/vfx-reference-guide.md 4장 "비·눈"): 앞·중간·뒤 3겹(뒤는 남색 쪽으로 색조 이동),
//   굵기가 변하는 빗줄기, 길이 편차, 옆으로 흘러가는 비 커튼, 루프당 한 번 돌풍, 왕관 물보라.
// R29b 그림체: 손그림(위 그대로) / 반실사(앞 겹 초점 흐림 + 물안개) / 실사(움직임 흐림 빗줄기 + 초점 흐림 + 물안개).
import { TAU, frac, withAlpha, clamp, drawField, mix } from './_fx-util.js';
import { taperPath, teardropPath, mixCss, LOOK_PARAM, lookOf, loopFbm } from './_fx-style.js';
import { blurCanvas } from '../core/render/blur.js';
import { world, emit, streak, camera, overLife, WORLD_PARAMS } from './_fx-real.js';
import { hash2 } from './_fx-util.js';

// 빗방울 지름(mm) → 떨어지는 속도(m/s). 측정값 근사(이슬비 0.5 mm ≈ 2, 2 mm ≈ 6.5, 5 mm ≈ 9). 자료집 2-5.
export const dropSpeed = (Dmm) => Math.max(0.5, 9.65 - 10.3 * Math.exp(-0.6 * Dmm));

// R30 실사(docs/vfx-guide-real.md 4-1 비): 빗방울 크기 분포 → 실제 낙하 속도 → 셔터 흐림 길이.
//   앞(가깝고 크고 흐림)·중간·뒤(멀고 작고 옅음) 3겹 원근, 뒤쪽 빛 근처에서만 밝게(역광),
//   가까운 줄 안의 반짝이는 점, 1프레임 물보라 + 오래 가는 파문, 바닥 물안개, 촬영 마무리.
function renderReal(ctx, env, p) {
  const { w, h, rng, borrow, release, scale = 1 } = env;
  const W = world(env, p);
  const n = Math.max(1, Math.round((p.amount ?? 120) * 5)); // 실사: 먼 빗방울까지 — 개수는 많고 하나하나는 옅다
  const thick = p.thickness ?? 1.5;
  const color = p.color ?? '#bcd4ff';
  const op = clamp((p.opacity ?? 0.55) * 1.3, 0, 1);
  const groundY = clamp(p.groundY ?? 0.92, 0.1, 1) * h;
  const back = clamp(p.backlight ?? 0.7, 0, 1);
  const lx = clamp(p.lightX ?? 0.7, 0, 1), ly = clamp(p.lightY ?? 0.2, 0, 1);
  const seed = Math.floor(rng() * 1e6);
  const prog = W.t / W.L;
  const gust = Math.pow(Math.max(0, Math.sin(prog * TAU)), 3);
  const ang = (p.windAngle ?? 12) * (1 + 0.35 * gust) * Math.PI / 180;
  const tanA = Math.tan(ang);
  // 역광: 빛 근처(화면 비율 거리)에서 밝고, 멀면 흐릿한 바탕 밝기만 남는다.
  const lit = (x, y) => 0.22 + 0.78 * back * Math.exp(-(((x / w - lx) ** 2) + ((y / h - ly) ** 2) * 0.6) / 0.12);
  const zRef = 3; // 이 거리(m)에서 화면 높이 = worldHeight
  // 겹: [개수 비율, 거리 범위(m), 초점 흐림]
  const layers = [[0.6, [8, 20], false], [0.32, [2.5, 6], false], [0.08, [0.7, 1.4], true]];
  camera(ctx, env, p, (c) => {
    layers.forEach(([cnt, [z0, z1], dof], li) => {
      const dc = c;
      const nn = Math.max(1, Math.round(n * cnt));
      for (let i = 0; i < nn; i++) {
        const H = (k) => hash2(i + li * 7919, k, seed);
        // 크기 분포: 작은 것 60%(1~1.8 mm) · 중간 30%(2~3) · 큰 것 10%(3.5~5)
        const q = H(1);
        const Dmm = q < 0.6 ? 1 + 0.8 * H(2) : q < 0.9 ? 2 + H(2) : 3.5 + 1.5 * H(2);
        const z = z0 + (z1 - z0) * H(3);
        const s = zRef / z;                                   // 원근 배율
        const v = dropSpeed(Dmm) * (1 - 0.25 * gust);          // 돌풍 속 낙하 감소(25~30%)
        // 화면 속도(px/s). 루프에 맞게 화면을 정수 번 가로지르도록 맞춘다.
        const span = h * 1.25;
        const m = Math.max(1, Math.round(W.L * v * W.pxPerM * s / span));
        const vy = span * m / W.L, vx = vy * tanA;
        const y = frac(H(4) + W.t * m / W.L) * span - h * 0.15;
        const x = H(5) * w * 1.2 - w * 0.1 + (y + h * 0.15) * tanA - (h * tanA) * 0.5;
        const trueW = (Dmm / 1000) * W.pxPerM * s * thick;     // 실제 굵기(px)
        const wd = Math.max(0.6, trueW);
        const cover = Math.min(1, 0.45 + trueW / 0.6);          // 1px 보다 가늘면 옅게(영화식: 큰 물방울·역광으로 보이게 한 정도까지는 살림)
        const a = op * cover * lit(x, y) * (dof ? 1.4 : li === 0 ? 0.55 : 1);
        if (a < 0.01) continue;
        if (dof) {
          // 초점 밖(가까움): 흐리게 번진 넓은 띠 + 옅은 심. 화면 전체를 흐리는 것보다 훨씬 빠르다.
          streak(dc, x, y, vx, vy, W, wd * 5, color, a * 0.22);
          streak(dc, x, y, vx, vy, W, wd * 2.2, color, a * 0.35);
        } else streak(dc, x, y, vx, vy, W, wd, color, a);
        if (!dof && s > 0.8 && H(6) < 0.5) {
          // 가까운 빗방울: 떨어지며 출렁여 줄 안에 반짝이는 점이 생긴다(자료집 2-5)
          const L = vy * W.dt * W.blurK;
          for (let k = 0; k < 2; k++) {
            const t = H(7 + k);
            dc.globalAlpha = Math.min(1, a * 1.6);
            dc.fillStyle = '#ffffff';
            dc.beginPath(); dc.arc(x - tanA * L * t, y - L * t, wd * 0.6, 0, TAU); dc.fill();
          }
        }
      }
    });
    c.globalAlpha = 1;

    // 물보라(자료집 2-6): 왕관은 약 6 ms → 1프레임만 보이는 작은 물방울 반짝임. 파문은 오래(0.5 s) 퍼진다.
    if (p.splash ?? true) {
      const ssz = Math.max(0.3, p.splashSize ?? 1);
      const puddle = clamp(p.puddle ?? 0, 0, 1);
      emit({ count: Math.max(6, Math.round(n * 0.04)), life: [0.45, 0.7], gap: 0.6, seed: seed + 1 }, W.t, W.L, (i, age, u, R) => {
        const sx = R(1) * w, gy = groundY + (R(2) - 0.5) * h * 0.04;
        const k = lit(sx, gy);
        if (age < W.dt) {
          // 셔터 안에 튄 물방울들: 짧은 흔적
          const drops = 3 + Math.floor(R(3) * 4);
          for (let d = 0; d < drops; d++) {
            const da = -Math.PI / 2 + (R(4 + d) - 0.5) * 2.2;
            const sp = (0.6 + 1.2 * R(10 + d)) * W.pxPerM * ssz;
            const tt = Math.min(age + W.dt * 0.5, 0.02);
            const px = sx + Math.cos(da) * sp * tt, py = gy + Math.sin(da) * sp * tt * 0.8;
            streak(c, px, py, Math.cos(da) * sp, Math.sin(da) * sp, W, Math.max(0.6, thick * 0.6), '#ffffff', op * k * 0.9);
          }
        }
        // 파문: 고인 물이 있을수록 진하게
        const pa = op * k * (0.25 + 0.75 * puddle) * Math.pow(1 - u, 2);
        if (pa > 0.01) {
          const rr = (0.03 + 0.25 * u) * W.pxPerM * ssz;
          c.globalAlpha = pa; c.strokeStyle = color; c.lineWidth = Math.max(0.6, thick * 0.5);
          c.beginPath(); c.ellipse(sx, gy, rr, rr * 0.22, 0, 0, TAU); c.stroke();
        }
      });
      c.globalAlpha = 1;
    }

    // 바닥 물안개
    const mist = clamp(p.mist ?? 0.4, 0, 1);
    if (mist > 0 && borrow) {
      const top = groundY - h * 0.22, mh = h - top;
      const mc = mix(color, '#ffffff', 0.5);
      const flow = prog * 4 * Math.sign(tanA || 1);
      const cols = 48, rows = 16;
      c.save(); c.translate(0, top);
      drawField(c, w, mh, cols, rows, borrow, release, (gx, gy) => {
        const u = (gx + 0.5) / cols, v = (gy + 0.5) / rows;
        const fadeV = Math.sin(Math.min(1, v * 1.3) * Math.PI);
        const nv = loopFbm(u * 4 - flow, v * 2, 4, 0, seed % 9973, 3);
        const a = mist * 0.4 * fadeV * clamp((nv - 0.35) / 0.5, 0, 1) * lit(u * w, top + v * mh);
        return a > 0.01 ? [mc.r, mc.g, mc.b, a] : null;
      });
      c.restore();
    }
  }, { bloomK: 0.5 });
}

export default {
  id: 'rain',
  name: '비',
  category: '날씨',
  lightBg: true, // R27 밝은 배경용(테두리·진하게) 지원
  description: '빗줄기(바닥 물보라 포함 가능)',
  thumbnail: { frame: 6, bg: '#0a0e14' },
  bleed: 10,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 120, min: 1, max: 600 },
    { key: 'thickness', label: '굵기', type: 'float', default: 1.5, min: 0.5, max: 6, step: 0.1 },
    { key: 'windAngle', label: '바람 각도', type: 'float', default: 12, min: -45, max: 45, step: 1 },
    { key: 'splash', label: '바닥 물보라', type: 'bool', default: true },
    { key: 'groundY', label: '바닥 높이', type: 'float', default: 0.92, min: 0.1, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#bcd4ff' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.55, min: 0, max: 1, step: 0.01 },
    { key: 'depth', label: '앞뒤 겹 수', type: 'int', default: 3, min: 1, max: 3 },
    LOOK_PARAM('real'),
    { key: 'mist', label: '물안개', type: 'float', default: 0.4, min: 0, max: 1, step: 0.05 },
    { key: 'veil', label: '빗발 짙고 옅음', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'splashSize', label: '물보라 크기', type: 'float', default: 1, min: 0.3, max: 3, step: 0.1 },
    { key: 'puddle', label: '물웅덩이 파문', type: 'float', default: 0, min: 0, max: 1, step: 0.05 },
    { key: 'sleet', label: '진눈깨비(눈 섞임)', type: 'float', default: 0, min: 0, max: 1, step: 0.05 },
    { key: 'backlight', label: '뒤쪽 빛(실사)', type: 'float', default: 0.7, min: 0, max: 1, step: 0.05 },
    { key: 'lightX', label: '빛 위치 가로(실사)', type: 'float', default: 0.7, min: 0, max: 1, step: 0.01 },
    { key: 'lightY', label: '빛 위치 세로(실사)', type: 'float', default: 0.2, min: 0, max: 1, step: 0.01 },
    ...WORLD_PARAMS,
  ],
  // '종류'는 프리셋(값을 한꺼번에 채우는 버튼)으로 — 고른 뒤 고친 값은 그대로, "(수정됨)" 표시(R28e)
  presets: [
    { id: 'drizzle', label: '이슬비', values: { amount: 60, thickness: 1, opacity: 0.4 } },
    { id: 'shower', label: '소나기', values: { amount: 200, thickness: 1.8, windAngle: 8, splash: true, splashSize: 1.3, puddle: 0.4 } },
    { id: 'storm', label: '장대비(폭우)', values: { amount: 300, thickness: 2, windAngle: 25 } },
    { id: 'sleet', label: '진눈깨비', values: { amount: 120, thickness: 1.2, sleet: 0.5, opacity: 0.6 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    const { f, frameCount, w, h, rng, borrow, release, scale = 1 } = env;
    const look = lookOf(p);
    if (look === 'real') { renderReal(ctx, env, p); return; }
    const n = Math.max(1, Math.round(p.amount ?? 120));
    const thick = p.thickness ?? 1.5;
    const splash = p.splash ?? true;
    const groundY = clamp(p.groundY ?? 0.92, 0.1, 1) * h;
    const color = p.color ?? '#bcd4ff';
    const op = clamp(p.opacity ?? 0.55, 0, 1);
    const progress = f / Math.max(1, frameCount);
    // 돌풍(지침 4장 비·눈): 루프당 한 번 바람이 세졌다 잦아든다. 정수 주기 → 루프 유지.
    const gust = Math.pow(Math.max(0, Math.sin(progress * TAU)), 3);
    const ang = (p.windAngle ?? 12) * (1 + 0.35 * gust) * Math.PI / 180;
    const dxu = Math.sin(ang), dyu = Math.cos(ang);
    const fall = h * 1.1;
    const depth = Math.max(1, Math.min(3, Math.round(p.depth ?? 3)));
    const ssz = Math.max(0.3, p.splashSize ?? 1);
    const veil = clamp(p.veil ?? 0.5, 0, 1);
    // 비 커튼: 옆으로 흘러가는 짙고 옅은 띠(빗줄기 밀도가 고르지 않게). 정수 바퀴.
    const vph = rng() * TAU;
    const curtain = (x) => 1 - veil * 0.45 * (0.5 + 0.5 * Math.sin((x / w) * TAU * 1.5 - progress * TAU + vph)) * (0.6 + 0.4 * Math.sin((x / w) * TAU * 3.5 + vph * 2));
    // 겹마다: [개수 비율, 길이·굵기 배율, 불투명도, 속도(바퀴), 색 섞기(뒤는 짙은 남색 쪽으로 색조 이동)]
    const back = mixCss(color, '#2c3c78', 0.45), front = mixCss(color, '#ffffff', 0.35);
    const layers = depth === 1 ? [[1, 1, 1, 2, color]]
      : depth === 2 ? [[0.75, 0.55, 0.45, 1, back], [0.6, 1, 1, 2, color]]
      : [[0.8, 0.55, 0.55, 1, back], [0.6, 1, 1, 2, color], [0.08, 2.1, 0.5, 3, front]];

    const streak = (c, x, y, len, wd, alpha, col) => {
      if (look === 'real') {
        // 움직임 흐림: 셔터 동안 지나간 자리 — 길고 아주 가늘고 옅다. 앞쪽 1/3 만 조금 진하게.
        const L = len * 1.8;
        c.strokeStyle = col; c.lineCap = 'butt'; c.lineWidth = Math.max(0.5, wd * 0.5);
        c.globalAlpha = alpha * 0.35;
        c.beginPath(); c.moveTo(x - dxu * L, y - dyu * L); c.lineTo(x, y); c.stroke();
        c.globalAlpha = alpha * 0.75;
        c.beginPath(); c.moveTo(x - dxu * L * 0.35, y - dyu * L * 0.35); c.lineTo(x, y); c.stroke();
        return;
      }
      const L = look === 'semi' ? len * 1.3 : len;
      c.fillStyle = col;
      c.globalAlpha = alpha * (look === 'semi' ? 0.85 : 1);
      // 굵기가 변하는 빗줄기: 위(꼬리)는 가늘게 사라지고 아래(앞쪽)가 굵다
      c.beginPath();
      taperPath(c, [[x - dxu * L, y - dyu * L], [x - dxu * L * 0.5, y - dyu * L * 0.5], [x - dxu * L * 0.15, y - dyu * L * 0.15], [x, y]], 0, wd, wd * 0.6, 0.8);
      c.fill();
    };
    layers.forEach(([cnt, k, a, sp, col], li) => {
      // 반실사·실사: 가장 앞 겹은 초점 밖 — 따로 그려 흐린 뒤 합친다
      const dof = look !== 'cel' && depth === 3 && li === 2 && ctx.canvas && borrow;
      let c = ctx, tmp = null;
      if (dof) { tmp = borrow(ctx.canvas.width, ctx.canvas.height); c = tmp.getContext('2d'); c.setTransform(ctx.getTransform()); }
      const nn = Math.max(1, Math.round(n * cnt));
      for (let i = 0; i < nn; i++) {
        const bx = rng(), by = rng(), spd = sp + Math.floor(rng() * 2);
        const len = h * (0.05 + rng() * 0.06) * k * (0.6 + rng() * 0.8); // 길이 편차 ±40%
        const wd = thick * k * (1 + 0.6 * rng());
        const t = frac(by + progress * spd);
        const y = t * fall;
        const x = bx * w + dxu * y;
        streak(c, x, y, len, wd * (dof ? 1.6 : 1), op * a * curtain(x) * (dof ? 1.6 : 1), col);
      }
      if (dof) {
        const bl = blurCanvas(tmp, Math.max(1.5, thick * 2.5 * scale), borrow, release);
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.drawImage(bl, 0, 0); ctx.restore();
        release(bl); release(tmp);
      }
    });
    ctx.globalAlpha = 1;

    // 반실사·실사: 바닥에 낮게 깔려 바람 따라 흐르는 물안개(가로 주기 노이즈 → 루프·가로 이음매 없음)
    const mist = look === 'cel' ? 0 : clamp(p.mist ?? 0.4, 0, 1);
    if (mist > 0 && borrow) {
      const top = groundY - h * 0.22, mh = h - top;
      const mc = mix(color, '#ffffff', 0.5); // {r,g,b}
      const flow = progress * 4 * Math.sign(dxu || 1);
      const cols = 48, rows = 16, seed = Math.floor(vph * 1000);
      ctx.save();
      ctx.translate(0, top);
      drawField(ctx, w, mh, cols, rows, borrow, release, (gx, gy) => {
        const u = (gx + 0.5) / cols, v = (gy + 0.5) / rows;
        const fadeV = Math.sin(Math.min(1, v * 1.3) * Math.PI) ; // 위·아래로 옅어짐
        const nv = loopFbm(u * 4 - flow, v * 2, 4, 0, seed, 3);
        const a = mist * 0.45 * fadeV * clamp((nv - 0.35) / 0.5, 0, 1);
        return a > 0.01 ? [mc.r, mc.g, mc.b, a] : null;
      });
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (splash) {
      // 바닥 물보라: 왕관처럼 튀는 작은 물방울 2~3개 + 납작한 고리. 짧고 빠르게(위치 고정, 시점만 위상).
      const m = Math.max(4, Math.round(n * 0.15 * (ssz > 1 ? ssz : 1)));
      ctx.fillStyle = front;
      ctx.strokeStyle = color;
      for (let i = 0; i < m; i++) {
        const sx = rng() * w, ph = rng(), spd = 3 + Math.floor(rng() * 3);
        const drops = 2 + Math.floor(rng() * 2), tilt = (rng() - 0.5) * 0.6;
        const gy = groundY + (rng() - 0.5) * h * 0.03;
        const t = frac(ph + progress * spd);
        if (t > 0.6) continue; // 쉬는 구간 — 늘 튀고 있지 않게
        const u = t / 0.6;
        const e = 1 - (1 - u) * (1 - u); // 빠르게 튀고 느려짐
        ctx.globalAlpha = op * (1 - u * u);
        for (let d = 0; d < drops; d++) {
          const da = -Math.PI / 2 + tilt + (d - (drops - 1) / 2) * 0.9;
          const dist = (3 + 7 * e) * ssz;
          const lift = Math.sin(u * Math.PI) * 6 * ssz; // 포물선
          const px = sx + Math.cos(da) * dist, py = gy + Math.sin(da) * dist * 0.4 - lift;
          const rr = Math.max(0.6, thick * 0.55 * (1 - u * 0.6) * Math.min(ssz, 1.6));
          ctx.beginPath();
          if (look === 'real') ctx.arc(px, py, rr * 0.7, 0, TAU); // 실사: 아주 작은 물방울 점
          else teardropPath(ctx, px, py, rr, rr * 2.2, Math.atan2(gy - py, sx - px), 0); // 꼬리는 튄 자리 쪽
          ctx.fill();
        }
        ctx.lineWidth = Math.max(0.6, thick * 0.5);
        ctx.beginPath(); ctx.ellipse(sx, gy, (2 + e * 7) * ssz, (2 + e * 7) * ssz * 0.25, 0, Math.PI, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    const puddle = clamp(p.puddle ?? 0, 0, 1);
    if (puddle > 0) {
      // 바닥 물웅덩이: 납작한 동심원이 퍼졌다 사라짐
      ctx.strokeStyle = withAlpha(color, op * 0.7);
      ctx.lineWidth = Math.max(0.7, thick * 0.6);
      const m = Math.max(2, Math.round(24 * puddle));
      for (let i = 0; i < m; i++) {
        const sx = rng() * w, ph = rng(), spd = 2 + Math.floor(rng() * 3), gy = groundY + (rng() - 0.3) * h * 0.06;
        const t = frac(ph + progress * spd);
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.beginPath(); ctx.ellipse(sx, gy, 2 + t * 18 * ssz, (2 + t * 18 * ssz) * 0.28, 0, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const sleet = clamp(p.sleet ?? 0, 0, 1);
    if (sleet > 0) {
      // 진눈깨비: 젖은 눈송이(작고 조금 느림)
      ctx.fillStyle = withAlpha('#f4f8ff', Math.min(1, op + 0.25));
      const m = Math.round(n * sleet * 0.6);
      for (let i = 0; i < m; i++) {
        const bx = rng(), by = rng(), rs = rng();
        const t = frac(by + progress);
        const y = t * fall;
        const x = bx * w + dxu * y * 0.6;
        ctx.beginPath(); ctx.arc(x, y, 1.2 + 1.8 * rs, 0, TAU); ctx.fill();
      }
    }
  },
};
