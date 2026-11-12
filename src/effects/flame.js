// 불꽃 — 아래에서 타오르는 불길. 결정론·루프(정수 바퀴). 시드 의존. (분류: 연출)
// R29 손그림 개편(docs/vfx-reference-guide.md 4장 "불"):
//   S자로 휘는 혀 모양 불길을 3단 색(속·몸통·가장자리)으로 겹쳐 그리는 셀 방식,
//   크기 3단계, 위로 떨어져 나가는 물방울 불씨, 2프레임 홀드, 은은한 빛 번짐.
import { TAU, frac, clamp } from './_fx-util.js';
import { sizeTier, gauss, holdFrame, HOLD_PARAM, teardropPath, withDiffusion, DIFFUSION_PARAM } from './_fx-style.js';

// 불길 혀 하나: 바닥(x, base) 에서 위로 th 만큼. sway 는 끝의 옆 흔들림(S자·갈고리 모양을 만든다).
function tongue(ctx, x, base, wd, th, sway, lean) {
  const tipX = x + sway, tipY = base - th;
  ctx.moveTo(x - wd, base);
  // 왼쪽 옆선: 아래는 불룩, 위로 갈수록 끝 쪽으로 감긴다
  ctx.bezierCurveTo(x - wd * 1.05, base - th * 0.42, x - wd * 0.15 + lean * wd, base - th * 0.62, tipX, tipY);
  // 오른쪽 옆선: 왼쪽과 일부러 다르게(비대칭)
  ctx.bezierCurveTo(x + wd * 0.45 + sway * 0.55, base - th * 0.5, x + wd * 1.1, base - th * 0.3, x + wd, base);
  ctx.closePath();
}

export default {
  id: 'flame',
  name: '불꽃',
  category: '연출',
  description: '아래에서 타오르는 불길(손그림 셀 방식)',
  thumbnail: { frame: 10, bg: '#140600' },
  bleed: 8,
  params: [
    { key: 'height', label: '높이', type: 'float', default: 0.6, min: 0.1, max: 1, step: 0.01 },
    { key: 'tongues', label: '불꽃 수', type: 'int', default: 18, min: 3, max: 80 },
    { key: 'speed', label: '타오르는 속도', type: 'int', default: 2, min: 1, max: 8 },
    { key: 'color', label: '속 색', type: 'color', default: '#fff4b8' },
    { key: 'color2', label: '몸통 색', type: 'color', default: '#ff7a1a' },
    { key: 'color3', label: '가장자리 색', type: 'color', default: '#b3123e' },
    { key: 'embers', label: '불씨', type: 'float', default: 0.6, min: 0, max: 1, step: 0.05 },
    HOLD_PARAM(2),
    DIFFUSION_PARAM(0.35),
    { key: 'opacity', label: '불투명도', type: 'float', default: 0.95, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'fire', label: '주황 불', values: { color: '#fff4b8', color2: '#ff7a1a', color3: '#b3123e' } },
    { id: 'blue', label: '푸른 불', values: { color: '#e8fdff', color2: '#3a9bff', color3: '#3b2a9e' } },
    { id: 'poison', label: '독 불', values: { color: '#f0ffc8', color2: '#52d15e', color3: '#17675e' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    const { f, frameCount, w, h, rng } = env;
    const height = clamp(p.height ?? 0.6, 0.1, 1) * h;
    const n = Math.max(3, Math.round(p.tongues ?? 18));
    const speed = Math.max(1, Math.round(p.speed ?? 2));
    const cCore = p.color ?? '#fff4b8', cBody = p.color2 ?? '#ff7a1a', cEdge = p.color3 ?? '#b3123e';
    const op = clamp(p.opacity ?? 0.95, 0, 1);
    const hold = Math.max(1, Number(p.hold ?? 2) | 0);
    const progress = holdFrame(f, hold, frameCount) / Math.max(1, frameCount);
    const emb = clamp(p.embers ?? 0.6, 0, 1);

    // 혀마다 고정 성질(결정론). 크기 3단계 — 큰 것 몇 개가 덩어리를 이끌고 작은 것들이 사이를 채운다.
    const T = [];
    for (let i = 0; i < n; i++) {
      const st = sizeTier(rng, [0.2, 0.35]);
      const k = 0.35 + st.k * 0.65;
      // 가운데로 조금 몰리게(가우시안 섞기) — 화면 전체에 고르게 깔리지 않게
      const bx = rng() < 0.6 ? clamp(0.5 + gauss(rng) * 0.6, -0.05, 1.05) : -0.05 + rng() * 1.1;
      const ph = [rng() * TAU, rng() * TAU, rng() * TAU];
      const spd = speed + Math.floor(rng() * 2);
      T.push({ bx, k, ph, spd, wd: (0.05 + rng() * 0.04) * w * (0.6 + k * 0.8), lean: (rng() - 0.5) * 0.6 });
    }
    const S = T.map((t) => {
      const a = progress * TAU * t.spd;
      // 주기 3종을 섞어 "일정한 맥박"이 아니게(지침 3-2 리듬). 전부 정수배 → 루프 유지.
      const nrm = 0.55 * Math.sin(a + t.ph[0]) + 0.3 * Math.sin(a * 2 + t.ph[1]) + 0.15 * Math.sin(a * 3 + t.ph[2]);
      const th = height * t.k * (0.78 + 0.22 * nrm);
      const sway = (Math.sin(a + t.ph[1]) * 0.9 + Math.sin(a * 2 + t.ph[2]) * 0.35) * t.wd * 1.4;
      return { th, sway, x: t.bx * w };
    });
    // 불씨 성질도 미리 뽑아 둔다(그리기 콜백 밖에서 rng 순서 고정)
    const m = Math.round(T.length * 0.5 * emb);
    const big = Math.min(T.length, 6);
    const order = T.map((t, i) => i).sort((a, b) => T[b].k - T[a].k);
    const E = [];
    for (let i = 0; i < m; i++) {
      E.push({ src: T[order[Math.floor(rng() * big)]], ph: rng(), spd: speed + 1 + Math.floor(rng() * 2), drift: (rng() - 0.5) * 2, r0: (2 + rng() * 3.5) * Math.max(w, h) / 220 });
    }

    withDiffusion(ctx, env, clamp(p.diffusion ?? 0.35, 0, 1) * op, Math.max(w, h) * 0.06, (c) => {
      c.globalAlpha = op;
      // 1) 가장자리(가장 크고, 색조를 옮긴 어두운 색) → 2) 몸통 → 3) 속(흰빛). 단마다 딱딱한 경계.
      const bands = [[cEdge, 1, 1, 0], [cBody, 0.82, 0.8, 0.03], [cCore, 0.5, 0.42, 0.14]];
      for (const [col, kw, kh, drop] of bands) {
        c.fillStyle = col;
        c.beginPath();
        for (let i = 0; i < T.length; i++) {
          const t = T[i], s = S[i];
          tongue(c, s.x, h + h * 0.02 + drop * height * 0.25, t.wd * kw, s.th * kh, s.sway * kh, t.lean);
        }
        c.fill();
      }

      // 4) 떨어져 나가는 물방울 불씨 — 위로 오르며 작아지고 몸통색 → 가장자리색으로.
      for (const e of E) {
        const t = frac(e.ph + progress * e.spd);
        if (t > 0.92) continue;
        const y = h - height * e.src.k * (0.45 + t * 0.9);
        const x = e.src.bx * w + e.drift * w * 0.05 * t + Math.sin(t * TAU + e.ph * TAU) * w * 0.012;
        const r = e.r0 * (1 - t * 0.75);
        c.fillStyle = t < 0.6 ? cBody : cEdge;
        c.globalAlpha = op * (1 - t * t);
        c.beginPath();
        teardropPath(c, x, y, r, r * 2.4, Math.PI / 2 + e.drift * 0.3, e.drift * 0.5); // 꼬리는 아래(오르는 반대쪽)
        c.fill();
        if (t < 0.3 && r > 1.6) { // 갓 떨어진 것만 흰 속
          c.fillStyle = cCore;
          c.beginPath(); c.arc(x, y, r * 0.45, 0, TAU); c.fill();
        }
      }
      c.globalAlpha = 1;
    });
  },
};
