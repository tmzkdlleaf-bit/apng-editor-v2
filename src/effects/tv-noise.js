// TV 노이즈 — 채널 없는 화면 잡음 + 가로 줄 끌림 + 화면 꺼짐(루프 안전한 깜빡-off). 결정론.
import { TAU, hash2, frac, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'tv-noise',
  name: 'TV 노이즈',
  category: '오버레이',
  description: '채널 없는 TV 같은 화면 잡음',
  thumbnail: { frame: 3, bg: '#101010' },
  bleed: 0,
  params: [
    { key: 'intensity', label: '세기', type: 'float', default: 0.7, min: 0, max: 1, step: 0.01 },
    { key: 'hRoll', label: '가로 줄 끌림', type: 'int', default: 1, min: 0, max: 6 },
    { key: 'color', label: '컬러', type: 'bool', default: false },
    { key: 'powerOff', label: '화면 꺼짐 연출', type: 'bool', default: false },
    { key: 'grainSize', label: '알갱이 크기', type: 'float', default: 2, min: 1, max: 6, step: 0.5, advanced: true },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng, borrow, release }, p) {
    const intensity = clamp(p.intensity ?? 0.7, 0, 1);
    const hRoll = Math.max(0, Math.round(p.hRoll ?? 1));
    const color = p.color ?? false;
    const powerOff = p.powerOff ?? false;
    const grainSize = Math.max(1, p.grainSize ?? 2);
    const base = Math.floor(rng() * 100000);
    const progress = f / Math.max(1, frameCount);
    const fseed = base + (f % Math.max(1, frameCount));

    // 화면 꺼짐: 세로 덮개가 가운데로 좁아졌다 다시 열림(루프 안전).
    let coverTop = 0, coverBot = h;
    if (powerOff) {
      const shrink = Math.max(0, Math.sin(progress * TAU)); // 0→1→0, 가운데로 수축
      const band = (h / 2) * shrink * 0.9;
      coverTop = band; coverBot = h - band;
    }
    const vis = coverBot - coverTop;
    if (vis <= 1) { // 완전히 닫힘 → 가운데 밝은 선
      ctx.fillStyle = withAlpha('#ffffff', 0.8);
      ctx.fillRect(0, h / 2 - 1, w, 2);
      return;
    }

    // 잡음(저해상 → 확대)
    const roll = hRoll > 0 ? frac(progress * hRoll) * h : 0;
    const nw = Math.max(1, Math.round(w / grainSize));
    const nh = Math.max(1, Math.round(vis / grainSize));
    const tmp = borrow(nw, nh);
    const tc = tmp.getContext('2d');
    const img = tc.createImageData(nw, nh); const d = img.data;
    let idx = 0;
    for (let y = 0; y < nh; y++) {
      // 가로 줄 끌림: 행마다 가로 오프셋
      const rowSeed = fseed + Math.floor((y + roll / grainSize));
      for (let x = 0; x < nw; x++) {
        const v = (hash2(x, rowSeed, 5) * 255) | 0;
        if (color) { d[idx] = v; d[idx + 1] = (hash2(x, rowSeed, 9) * 255) | 0; d[idx + 2] = (hash2(x, rowSeed, 17) * 255) | 0; }
        else { d[idx] = d[idx + 1] = d[idx + 2] = v; }
        d[idx + 3] = Math.round(intensity * 220);
        idx += 4;
      }
    }
    tc.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, nw, nh, 0, coverTop, w, vis);
    ctx.restore();
    release(tmp);
  },
};
