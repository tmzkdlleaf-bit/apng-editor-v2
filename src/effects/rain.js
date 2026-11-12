// 비 — 빗줄기(비·물보라 합침). 결정론·루프(frac 낙하, 정수 바퀴).
import { TAU, frac, withAlpha, clamp } from './_fx-util.js';

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
    // R28e — 기본값이면 예전과 픽셀 동일
    { key: 'depth', label: '앞뒤 겹 수', type: 'int', default: 1, min: 1, max: 3 },
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
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const n = Math.max(1, Math.round(p.amount ?? 120));
    const thick = p.thickness ?? 1.5;
    const ang = (p.windAngle ?? 12) * Math.PI / 180;
    const splash = p.splash ?? true;
    const groundY = clamp(p.groundY ?? 0.92, 0.1, 1) * h;
    const color = p.color ?? '#bcd4ff';
    const op = clamp(p.opacity ?? 0.55, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const dxu = Math.sin(ang), dyu = Math.cos(ang);
    const fall = h * 1.1;
    const depth = Math.max(1, Math.min(3, Math.round(p.depth ?? 1)));
    const ssz = Math.max(0.3, p.splashSize ?? 1);

    ctx.lineCap = 'round';
    ctx.strokeStyle = withAlpha(color, op);
    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), spd = 2 + Math.floor(rng() * 2); // 2~3바퀴(정수)
      const len = h * (0.05 + rng() * 0.06);
      const t = frac(by + progress * spd);
      const y = t * fall;
      const x = bx * w + dxu * y;
      ctx.lineWidth = thick * (0.7 + 0.6 * rng());
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - dxu * len, y - dyu * len);
      ctx.stroke();
    }

    if (splash) {
      // 바닥 물보라 — 짧은 호가 깜빡(결정론·루프). 위치 고정, 시점만 위상.
      ctx.strokeStyle = withAlpha(color, op * 0.8);
      ctx.lineWidth = Math.max(0.8, thick * 0.7);
      const m = Math.max(4, Math.round(n * 0.15 * (ssz > 1 ? ssz : 1)));
      for (let i = 0; i < m; i++) {
        const sx = rng() * w, ph = rng(), spd = 3 + Math.floor(rng() * 3);
        const t = frac(ph + progress * spd);
        const grow = Math.sin(t * Math.PI); // 0→1→0
        if (grow <= 0.05) continue;
        const rr = (2 + grow * 8) * ssz;
        ctx.globalAlpha = op * (1 - t);
        ctx.beginPath(); ctx.arc(sx, groundY, rr, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // R28e 추가분 — 기본값(겹 1·파문 0·진눈깨비 0)이면 아래는 아무것도 그리지 않는다(난수도 쓰지 않음 → 예전과 동일).
    if (depth > 1) {
      // 뒤 겹: 가늘고 짧고 옅게 / 앞 겹(3일 때): 굵고 길고 흐릿하게(초점 밖)
      for (let l = 1; l < depth; l++) {
        const front = l === 2;
        const k = front ? 1.8 : 0.55;
        ctx.strokeStyle = withAlpha(color, op * (front ? 0.28 : 0.45));
        const nn = Math.round(n * (front ? 0.12 : 0.8));
        for (let i = 0; i < nn; i++) {
          const bx = rng(), by = rng(), spd = (front ? 3 : 1) + Math.floor(rng() * 2);
          const len = h * (0.05 + rng() * 0.06) * k;
          const t = frac(by + progress * spd);
          const y = t * fall;
          const x = bx * w + dxu * y;
          ctx.lineWidth = thick * k * (front ? 2.2 : 0.7);
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - dxu * len, y - dyu * len); ctx.stroke();
        }
      }
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
