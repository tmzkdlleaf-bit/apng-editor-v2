// 오로라(R28e) — 하늘에 일렁이는 빛 띠. 띠마다 세로 빛줄기 결. 결정론·루프(정수 속도).
import { TAU, clamp, parseColor, lerp, drawField } from './_fx-util.js';

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
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng, borrow, release }, p) {
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
