// 임팩트 플래시 — 화면 전체가 번쩍인다. 결정론·루프(정수 번쩍임). 시드 무관. (분류: 연출)
import { parseColor, clamp } from './_fx-util.js';
import { LOOK_PARAM, lookOf } from './_fx-style.js';
import { world } from './_fx-real.js';

export default {
  id: 'impact-flash',
  name: '임팩트 플래시',
  category: '연출',
  description: '화면 전체가 번쩍인다',
  thumbnail: { frame: 1, bg: '#101010' },
  bleed: 0,
  params: [
    { key: 'flashes', label: '번쩍임 수', type: 'int', default: 2, min: 1, max: 10 },
    { key: 'sharpness', label: '날카로움', type: 'float', default: 4, min: 1, max: 12, step: 0.5 },
    { key: 'color', label: '색', type: 'color', default: '#ffffff' },
    { key: 'edge', label: '가장자리만', type: 'bool', default: false },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
    LOOK_PARAM('real'),
    { key: 'shutter', label: '셔터 각도', type: 'int', default: 180, min: 0, max: 360, advanced: true },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, fps }, p) {
    const flashes = Math.max(1, Math.round(p.flashes ?? 2));
    const sharp = clamp(p.sharpness ?? 4, 1, 12);
    const color = parseColor(p.color ?? '#ffffff');
    const edge = p.edge ?? false;
    const op = clamp(p.opacity ?? 1, 0, 1);
    let amt;
    if (lookOf(p) === 'real') {
      // R30 실사: 섬광은 한순간 최고로 밝아졌다가 지수로 꺼진다(날카로움 → 꺼지는 시간 20~200 ms).
      //   프레임 밝기 = 셔터가 열린 동안 들어온 빛(번개와 같은 노출 적분) → 12fps 면 거의 1프레임 번쩍 + 옅은 잔광.
      const W = world({ f, frameCount, fps, h }, p);
      const tau = 0.2 / sharp;
      const S = Math.max(0.001, W.dt * W.blurK);
      let B = 0;
      for (let k = 0; k < flashes; k++) {
        const ts = k * W.L / flashes;
        for (const off of [0, -W.L, W.L]) {
          const a0 = Math.max(0, W.t - (ts + off)), b0 = W.t + S - (ts + off);
          if (b0 > 0) B += tau * (Math.exp(-a0 / tau) - Math.exp(-b0 / tau)) / Math.min(S, tau);
        }
      }
      amt = Math.min(1, B) * op;
    }
    const progress = f / Math.max(1, frameCount);
    // 날카로운 펄스: |sin| 의 거듭제곱. progress=0,1 모두 0 → 루프
    const s = Math.abs(Math.sin(progress * Math.PI * flashes));
    if (amt === undefined) amt = Math.pow(s, sharp) * op;
    if (amt <= 0.003) return;
    if (edge) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.5);
      g.addColorStop(0, `rgba(${color.r},${color.g},${color.b},0)`);
      g.addColorStop(1, `rgba(${color.r},${color.g},${color.b},${amt})`);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = `rgba(${color.r},${color.g},${color.b},${amt})`;
    }
    ctx.fillRect(0, 0, w, h);
  },
};
