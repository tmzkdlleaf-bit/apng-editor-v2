// 오로라(R28e) — 하늘에 일렁이는 빛 띠. 띠마다 세로 빛줄기 결. 결정론·루프(정수 속도).
import { TAU, clamp, parseColor, lerp, drawField } from './_fx-util.js';
import { LOOK_PARAM, lookOf, loopNoise } from './_fx-style.js';

export default {
  id: 'aurora',
  name: '오로라',
  category: '날씨',
  description: '하늘에 일렁이는 빛 띠(밤하늘·북쪽 마을·신비)',
  thumbnail: { frame: 4, bg: '#060a14' },
  bleed: 0,
  params: [
    { key: 'bands', label: '띠 수', type: 'int', default: 3, min: 1, max: 6 },
    { key: 'color', label: '색 1', type: 'color', default: '#3dffb0' },
    { key: 'color2', label: '색 2', type: 'color', default: '#7a5cff' },
    { key: 'color3', label: '색 3', type: 'color', default: '#ff5ca8' },
    { key: 'height', label: '높이 위치', type: 'float', default: 0.3, min: 0, max: 0.8, step: 0.01 },
    { key: 'speed', label: '일렁임 속도', type: 'int', default: 1, min: 1, max: 6 },
    { key: 'streaks', label: '세로 빛줄기 결', type: 'float', default: 0.6, min: 0, max: 1, step: 0.05 },
    { key: 'intensity', label: '세기', type: 'float', default: 0.7, min: 0, max: 1, step: 0.01 },
    LOOK_PARAM('real'),
    { key: 'palette', label: '색(실사)', type: 'select', default: 'real', options: [{ value: 'real', label: '실제 색(아래 초록·위 빨강)' }, { value: 'custom', label: '지정한 색' }] },
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h, rng, borrow, release } = env;
    const nb = Math.max(1, Math.round(p.bands ?? 3));
    const cols = [parseColor(p.color ?? '#3dffb0'), parseColor(p.color2 ?? '#7a5cff'), parseColor(p.color3 ?? '#ff5ca8')];
    const hy = clamp(p.height ?? 0.3, 0, 0.8);
    const sp = Math.max(1, Math.round(p.speed ?? 1));
    const streak = clamp(p.streaks ?? 0.6, 0, 1);
    const K = clamp(p.intensity ?? 0.7, 0, 1);
    const prog = f / Math.max(1, frameCount);
    const bands = [];
    for (let b = 0; b < nb; b++) {
      bands.push({ ph1: rng() * TAU, ph2: rng() * TAU, fq: 1.5 + rng() * 2, yo: (rng() - 0.5) * 0.18, thick: 0.12 + 0.12 * rng(),
        c: cols[b % 3], c2: cols[(b + 1) % 3] });
    }
    // 작은 필드(가로 192칸)에 띠 세기·색을 더해 계산하고 부드럽게 늘린다(세로 빛줄기 결은 가로 칸 수로 표현).
    const CX = 192, CY = 96;
    const rowOf = new Float32Array(CY);
    for (let gy = 0; gy < CY; gy++) rowOf[gy] = (gy + 0.5) / CY;
    // 칸마다 계산하면 x 마다 같은 값(yc 등)을 여러 번 구하므로 열 단위로 미리 계산
    const colInfo = bands.map((B) => {
      const arr = [];
      for (let gx = 0; gx < CX; gx++) {
        const u = (gx + 0.5) / CX, x = u * w;
        const yc = hy + B.yo + Math.sin(u * TAU * B.fq * 0.5 + B.ph1 + TAU * sp * prog) * 0.06 + Math.sin(u * TAU * B.fq * 1.3 + B.ph2 - TAU * sp * prog * 2) * 0.025;
        const st = 1 - streak + streak * (0.5 + 0.5 * Math.sin(x * 0.21 + B.ph2 + TAU * sp * prog * 3) * Math.sin(x * 0.053 + B.ph1));
        const a = K * 0.55 * st * (0.6 + 0.4 * Math.sin(u * TAU + B.ph1 + TAU * sp * prog));
        const mix = 0.5 + 0.5 * Math.sin(u * TAU * 1.5 + B.ph2);
        arr.push({ yc, a, r: lerp(B.c.r, B.c2.r, mix), g: lerp(B.c.g, B.c2.g, mix), b: lerp(B.c.b, B.c2.b, mix) });
      }
      return arr;
    });
    drawField(ctx, w, h, CX, CY, borrow, release, (gx, gy) => {
      const v = rowOf[gy];
      let sa = 0, sr = 0, sg = 0, sb = 0;
      for (let b = 0; b < nb; b++) {
        const ci = colInfo[b][gx], th = bands[b].thick;
        // 커튼 모양: 아래쪽 끝(yc)에서 가장 진하고, 위로 길게 옅어진다. 아래로는 금방 사라짐.
        const d = ci.yc - v;
        let prof;
        if (d < -th * 0.25) prof = 0;
        else if (d < 0) prof = 1 + d / (th * 0.25);
        else prof = Math.max(0, 1 - d / (th * 1.6)) ** 1.5;
        const a = ci.a * prof;
        if (a <= 0.003) continue;
        sa += a; sr += ci.r * a; sg += ci.g * a; sb += ci.b * a;
      }
      if (sa <= 0.003) return null;
      return [sr / sa, sg / sa, sb / sa, Math.min(1, sa)];
    });
  },
};

// R30 실사(지침 4-1 오로라, 자료집 2-11): 커튼은 수 초~수 분에 걸쳐 천천히 움직인다 → 몇 초 루프에서는 아주 조금(제자리로 돌아오는 작은 흔들림).
//   색: 아래 끝이 가장 밝은 초록(산소 557.7 nm), 위로 갈수록 옅어지고 높은 곳은 어두운 빨강(산소 630 nm).
//   매우 강할 때만 아래 끝에 분홍빛(질소). 세로 빛줄기(광선)는 가늘고 촘촘하며 커튼을 따라 천천히 흐른다.
function renderReal(ctx, env, p) {
  const { w, h, rng, borrow, release } = env;
  const nb = Math.max(1, Math.round(p.bands ?? 3));
  const hy = clamp(p.height ?? 0.3, 0, 0.8);
  const act = Math.max(1, Math.round(p.speed ?? 1));        // 활동 세기(1 고요 ~ 6 격렬)
  const streak = clamp(p.streaks ?? 0.6, 0, 1);
  const K = clamp(p.intensity ?? 0.7, 0, 1);
  const real = (p.palette ?? 'real') === 'real';
  const G = real ? { r: 70, g: 255, b: 140 } : parseColor(p.color ?? '#3dffb0');
  const Rd = real ? { r: 200, g: 40, b: 70 } : parseColor(p.color2 ?? '#7a5cff');
  const Pk = real ? { r: 255, g: 90, b: 170 } : parseColor(p.color3 ?? '#ff5ca8');
  const fc = Math.max(1, env.frameCount), prog = (((env.f % fc) + fc) % fc) / fc;
  const bands = [];
  for (let b = 0; b < nb; b++) bands.push({ ph1: rng() * TAU, ph2: rng() * TAU, fq: 1.2 + rng() * 1.6, yo: (rng() - 0.5) * 0.2, thick: 0.14 + 0.14 * rng(), sd: Math.floor(rng() * 999) });
  const CX = 256, CY = 112;
  const amp = 0.004 * act;                                   // 루프 동안 움직임 폭(화면 비율) — 아주 작게
  const colInfo = bands.map((B) => {
    const arr = [];
    for (let gx = 0; gx < CX; gx++) {
      const u = (gx + 0.5) / CX;
      const yc = hy + B.yo + Math.sin(u * TAU * B.fq * 0.5 + B.ph1) * 0.06 + Math.sin(u * TAU * B.fq * 1.3 + B.ph2) * 0.022
        + amp * Math.sin(TAU * prog + u * 5 + B.ph1);
      // 광선: 가로로 촘촘한 노이즈가 커튼을 따라 천천히 흐른다(루프 동안 한 칸 → 이음매 없음)
      const ray = loopNoise(u * 90 + prog * act, 0.5, 90, 0, B.sd) * 0.65 + loopNoise(u * 23 - prog * act, 1.5, 23, 0, B.sd + 1) * 0.35;
      const st = 1 - streak + streak * Math.pow(ray, 1.6) * 1.6;
      const env2 = 0.55 + 0.45 * Math.sin(u * TAU * 0.9 + B.ph1) ** 2;    // 커튼 길이 방향 밝기 차이
      arr.push({ yc, a: K * 0.6 * st * env2 });
    }
    return arr;
  });
  drawField(ctx, w, h, CX, CY, borrow, release, (gx, gy) => {
    const v = (gy + 0.5) / CY;
    let sa = 0, sr = 0, sg = 0, sb = 0;
    for (let b = 0; b < nb; b++) {
      const ci = colInfo[b][gx], th = bands[b].thick;
      const d = ci.yc - v;                                    // 아래 끝에서 위로 잰 거리
      if (d < -th * 0.12) continue;
      const lower = d < 0 ? 1 + d / (th * 0.12) : 1;           // 아래 끝은 짧고 날카롭게 사라짐
      const up = Math.max(0, d) / (th * 2.2);
      const green = Math.max(0, 1 - up * 1.6) ** 1.3;         // 초록: 아래 끝이 가장 진함
      const red = Math.max(0, Math.min(up * 1.4, 1.6 - up)) * 0.35;  // 빨강: 높은 곳에 옅게
      const pink = K > 0.8 && d < th * 0.08 ? (K - 0.8) * 3 * lower : 0;
      const ag = ci.a * green * lower, ar = ci.a * red, ap = ci.a * pink;
      sa += ag + ar + ap;
      sr += G.r * ag + Rd.r * ar + Pk.r * ap; sg += G.g * ag + Rd.g * ar + Pk.g * ap; sb += G.b * ag + Rd.b * ar + Pk.b * ap;
    }
    if (sa <= 0.003) return null;
    return [sr / sa, sg / sa, sb / sa, Math.min(1, sa)];
  });
}
