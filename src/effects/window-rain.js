// 창문 빗물 — 유리에 맺혀 흘러내리는 물방울. 결정론·루프.
// 소스(배경) 연결 시 물방울 안에 배경이 비쳐 굴절 느낌. 없으면 유리알만.
import { TAU, frac, withAlpha, clamp, hash2 } from './_fx-util.js';
import { LOOK_PARAM, lookOf } from './_fx-style.js';

export default {
  id: 'window-rain',
  name: '창문 빗물',
  category: '날씨',
  description: '유리에 맺혀 흘러내리는 물방울(배경 굴절 가능)',
  thumbnail: { frame: 9, bg: '#0a0e14' },
  bleed: 0,
  params: [
    { key: 'amount', label: '양', type: 'int', default: 50, min: 1, max: 300 },
    { key: 'size', label: '크기', type: 'float', default: 10, min: 3, max: 30, step: 0.5 },
    { key: 'runFreq', label: '흘러내림 빈도', type: 'float', default: 0.3, min: 0, max: 1, step: 0.01 },
    { key: 'refraction', label: '굴절 세기', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'color', label: '색', type: 'color', default: '#cfe2ff' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.85, min: 0, max: 1, step: 0.01 },
    // R28e — 기본값이면 예전과 픽셀 동일
    { key: 'trail', label: '지나간 자리 물길', type: 'float', default: 0, min: 0, max: 1, step: 0.05 },
    { key: 'flip', label: '물방울 속 뒤집혀 비침', type: 'bool', default: false },
    LOOK_PARAM('real'),
  ],
  scopes: ['full', 'box'],
  sources: [{ key: 'bg', label: '배경' }],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h, rng, sources, pad = 0 } = env;
    const n = Math.max(1, Math.round(p.amount ?? 50));
    const size = p.size ?? 10;
    const runFreq = clamp(p.runFreq ?? 0.3, 0, 1);
    const refraction = clamp(p.refraction ?? 0.6, 0, 1);
    const color = p.color ?? '#cfe2ff';
    const op = clamp(p.opacity ?? 0.85, 0, 1);
    const progress = f / Math.max(1, frameCount);

    // 물방울 목록(한 번의 rng 순서) — 마스크·하이라이트가 같은 위치를 쓰도록 미리 계산.
    const beads = [];
    for (let i = 0; i < n; i++) {
      const bx = rng(), by = rng(), rs = rng(), ph = rng(), runs = rng();
      const r = size * (0.4 + 0.8 * rs);
      const sliding = runs < runFreq;
      const t = sliding ? frac(ph + progress * (1 + (i % 2))) : 0;
      beads.push({ x: bx * w, y: by * h + (sliding ? t * h * 0.6 : 0), r, t, sliding });
    }

    // 1) 물방울 모양(마스크)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (const b of beads) {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
      if (b.sliding && b.t > 0.02) {
        ctx.beginPath();
        ctx.moveTo(b.x - b.r * 0.4, b.y);
        ctx.lineTo(b.x + b.r * 0.4, b.y);
        ctx.lineTo(b.x, b.y - b.t * h * 0.55);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();

    // 2) 물방울 안 채우기 — 소스 배경(굴절) 또는 유리알 색
    const src = (sources || []).find((s) => s.key === 'bg')?.canvas;
    ctx.save();
    ctx.globalCompositeOperation = 'source-in';
    if (src && refraction > 0) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const mag = 1 + refraction * 0.15;
      const dw = src.width * mag, dh = src.height * mag;
      if (p.flip) {
        // 진짜 물방울처럼 위아래가 뒤집혀 비친다(R28e)
        ctx.translate(0, pad * 2 + src.height);
        ctx.scale(1, -1);
      }
      ctx.drawImage(src, pad - (dw - src.width) / 2, pad - (dh - src.height) / 2, dw, dh);
    } else {
      ctx.fillStyle = withAlpha(color, op);
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    ctx.restore();

    // 3) 하이라이트(유리 느낌)
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = withAlpha('#ffffff', op * 0.7);
    for (const b of beads) {
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.22, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // 4) 지나간 자리 물길(R28e): 흘러내린 방울 위로 젖은 길 + 남겨진 작은 방울. 0 이면 그리지 않음.
    const trail = clamp(p.trail ?? 0, 0, 1);
    if (trail > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      for (const b of beads) {
        if (!b.sliding || b.t < 0.03) continue;
        const top = b.y - b.t * h * 0.6;
        const g = ctx.createLinearGradient(0, top, 0, b.y);
        g.addColorStop(0, withAlpha(color, 0));
        g.addColorStop(1, withAlpha(color, op * 0.35 * trail));
        ctx.fillStyle = g;
        ctx.fillRect(b.x - b.r * 0.35, top, b.r * 0.7, b.y - top);
      }
      ctx.restore();
      ctx.fillStyle = withAlpha(color, op * 0.8 * trail);
      for (const b of beads) {
        if (!b.sliding || b.t < 0.1) continue;
        const top = b.y - b.t * h * 0.6;
        for (let k = 1; k <= 3; k++) {
          const yy = top + (b.y - top) * (k / 4);
          const rr = b.r * 0.18 * (1 + 0.5 * Math.sin(k * 2.3 + b.x));
          ctx.beginPath(); ctx.arc(b.x + Math.sin(k * 1.7 + b.y) * b.r * 0.2, yy, rr, 0, TAU); ctx.fill();
        }
      }
    }
  },
};

// R30 실사(창문 빗물): 유리에 붙은 물방울은 작은 볼록렌즈다.
//   ① 방울 속에는 뒤쪽 풍경이 위아래·좌우 모두 뒤집혀, 더 넓은 범위가 작게(광각) 비친다.
//   ② 렌즈가 빛을 모아 방울이 주변 유리보다 밝고, 가장자리는 어둡다(없으면 거품처럼 보임).
//   ③ 흐르는 방울은 멈칫(붙어 있음) → 툭 미끄러짐을 되풀이한다(stick-slip). 지나간 자리는 젖은 길과 남겨진 작은 방울.
//   ④ 크기: 아주 작은 방울이 대부분, 큰 방울은 드물다.
function renderReal(ctx, env, p) {
  const { w, h, rng, sources, pad = 0, borrow, release } = env;
  const n = Math.max(1, Math.round(p.amount ?? 50));
  const size = p.size ?? 10;
  const runFreq = clamp(p.runFreq ?? 0.3, 0, 1);
  const refr = clamp(p.refraction ?? 0.6, 0, 1);
  const color = p.color ?? '#cfe2ff';
  const op = clamp(p.opacity ?? 0.85, 0, 1);
  const trailK = Math.max(0.35, clamp(p.trail ?? 0, 0, 1));
  const seed = Math.floor(rng() * 1e6);
  const fc = Math.max(1, env.frameCount), prog = (((env.f % fc) + fc) % fc) / fc;
  const src = (sources || []).find((q) => q.key === 'bg')?.canvas;
  const drops = [];
  // 붙어 있는 방울(크기 3단계: 작은 것 70% · 중간 22% · 큰 것 8%)
  const nb = n * 3;
  for (let i = 0; i < nb; i++) {
    const H = (k) => hash2(i, k, seed);
    const q = H(1);
    const r = size * (q < 0.7 ? 0.12 + 0.15 * H(2) : q < 0.92 ? 0.3 + 0.3 * H(2) : 0.65 + 0.4 * H(2));
    drops.push({ x: H(3) * w, y: H(4) * h, r, sx: 1, sy: 1 + 0.12 * H(5) });
  }
  // 흐르는 방울: 칸마다 멈칫 → 미끄러짐. 루프 동안 화면을 정수 번 내려간다.
  const runners = runFreq > 0 ? Math.max(1, Math.round(n * runFreq * 0.25)) : 0;
  const trails = [];
  for (let i = 0; i < runners; i++) {
    const H = (k) => hash2(i + 7777, k, seed);
    const steps = 4 + Math.floor(H(1) * 4);
    const ss = frac(prog + H(2));                          // 이번 내려감에서의 위치(0~1)
    const kf = ss * steps, k = Math.floor(kf), u = kf - k;
    const stick = 0.55 + 0.25 * H(3);                      // 한 칸에서 붙어 있는 비율
    const slip = u < stick ? 0 : (u - stick) / (1 - stick);
    const e = slip * slip * (3 - 2 * slip);
    const span = h * 1.35;
    const y = -h * 0.2 + (k + e) / steps * span;
    const x0 = H(4) * w;
    const wig = (yy) => x0 + Math.sin(yy / h * 9 + H(5) * 6) * size * 0.6;   // 길이 조금 구불구불
    const r = size * (0.75 + 0.35 * H(6)) * (1 + 0.1 * (1 - slip));
    const moving = slip > 0 && slip < 1;
    drops.push({ x: wig(y), y, r, sx: moving ? 0.85 : 1, sy: moving ? 1.35 : 1.08, runner: true });
    trails.push({ x: wig, top: -h * 0.2, y, r });
  }
  // 1) 젖은 길(흐른 자리): 가늘고 옅게, 위로 갈수록 마르며 군데군데 작은 방울
  ctx.save();
  for (const t of trails) {
    if (t.y <= t.top) continue;
    for (let yy = Math.max(0, t.top); yy < t.y - t.r; yy += 3) {
      const age = (t.y - yy) / (h * 1.2);
      ctx.fillStyle = withAlpha(color, op * 0.18 * trailK * Math.max(0, 1 - age));
      ctx.fillRect(t.x(yy) - t.r * 0.28, yy, t.r * 0.56, 3);
    }
    for (let j = 0; j < 8; j++) {
      const yy = t.top + (t.y - t.top) * hash2(j, Math.floor(t.top), seed + 3);
      if (yy > t.y - t.r * 2 || yy < 0) continue;
      drops.push({ x: t.x(yy), y: yy, r: size * 0.15 * (0.6 + hash2(j, 5, seed)), sx: 1, sy: 1 });
    }
  }
  ctx.restore();
  // 2) 방울: 뒤쪽 풍경이 뒤집혀 비침(큰 방울만 실제로 그림, 작은 방울은 밝은 점) + 어두운 가장자리 + 반짝임
  for (const d of drops) {
    const rx = d.r * d.sx, ry = d.r * d.sy;
    if (rx < 0.5) continue;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(d.x, d.y, rx, ry, 0, 0, TAU);
    if (src && refr > 0 && d.r > size * 0.25) {
      ctx.save();
      ctx.clip();
      // 방울 둘레의 3~5배 넓이를 뒤집어 작게 담는다(볼록렌즈 = 뒤집힌 광각 상)
      const mag = 3 + 2 * refr;
      const m = ctx.getTransform();
      const scale = m.a || 1;
      ctx.translate(d.x, d.y);
      ctx.scale(-1 / mag, -1 / mag);
      ctx.drawImage(src, -(d.x * scale + pad) / scale, -(d.y * scale + pad) / scale, src.width / scale, src.height / scale);
      ctx.restore();
      ctx.fillStyle = withAlpha('#ffffff', 0.12 * op);       // 렌즈가 모은 빛 → 주변보다 밝게
      ctx.fill();
    } else {
      const g = ctx.createRadialGradient(d.x, d.y + ry * 0.25, 0, d.x, d.y, Math.max(rx, ry));
      g.addColorStop(0, withAlpha('#ffffff', op * 0.55)); g.addColorStop(0.6, withAlpha(color, op * 0.35)); g.addColorStop(1, withAlpha(color, op * 0.12));
      ctx.fillStyle = g; ctx.fill();
    }
    // 가장자리: 어두운 테(빛이 꺾여 나가 어두움)
    ctx.lineWidth = Math.max(0.6, d.r * 0.16);
    ctx.strokeStyle = withAlpha('#0a1018', op * 0.35);
    ctx.stroke();
    // 반짝임: 위쪽 작은 하이라이트 + 아래쪽 모인 빛
    if (d.r > 1.2) {
      ctx.fillStyle = withAlpha('#ffffff', op * 0.85);
      ctx.beginPath(); ctx.ellipse(d.x - rx * 0.32, d.y - ry * 0.38, rx * 0.16, ry * 0.11, -0.5, 0, TAU); ctx.fill();
      ctx.fillStyle = withAlpha('#ffffff', op * 0.25);
      ctx.beginPath(); ctx.ellipse(d.x + rx * 0.1, d.y + ry * 0.55, rx * 0.4, ry * 0.18, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
