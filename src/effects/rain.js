// 비 — 빗줄기(비·물보라 합침). 결정론·루프(frac 낙하, 정수 바퀴).
// R29 손그림 개편(docs/vfx-reference-guide.md 4장 "비·눈"): 앞·중간·뒤 3겹(뒤는 남색 쪽으로 색조 이동),
//   굵기가 변하는 빗줄기, 길이 편차, 옆으로 흘러가는 비 커튼, 루프당 한 번 돌풍, 왕관 물보라.
// R29b 그림체: 손그림(위 그대로) / 반실사(앞 겹 초점 흐림 + 물안개) / 실사(움직임 흐림 빗줄기 + 초점 흐림 + 물안개).
import { TAU, frac, withAlpha, clamp, drawField, mix } from './_fx-util.js';
import { taperPath, teardropPath, mixCss, LOOK_PARAM, lookOf, loopFbm } from './_fx-style.js';
import { blurCanvas } from '../core/render/blur.js';

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
