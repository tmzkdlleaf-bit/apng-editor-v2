// 그레인 — 화면 잡음(노이즈·필름 그레인 합침). 결정론·루프(프레임 seed 를 frameCount 로 순환).
import { hash2, withAlpha, clamp } from './_fx-util.js';

export default {
  id: 'grain',
  name: '그레인',
  category: '오버레이',
  description: '화면 잡음(노이즈/필름 그레인)',
  thumbnail: { frame: 3, bg: '#14161a' },
  bleed: 0,
  params: [
    { key: 'shape', label: '모양', type: 'select', default: 'noise',
      options: [{ value: 'noise', label: '노이즈' }, { value: 'film', label: '필름' }] },
    { key: 'intensity', label: '세기', type: 'float', default: 0.4, min: 0, max: 1, step: 0.01 },
    { key: 'grainSize', label: '알갱이 크기', type: 'float', default: 2, min: 1, max: 8, step: 0.5 },
    { key: 'color', label: '컬러', type: 'bool', default: false },
    { key: 'scratches', label: '스크래치·먼지', type: 'bool', default: false },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng, borrow, release }, p) {
    const film = p.shape === 'film';
    const intensity = clamp(p.intensity ?? 0.4, 0, 1);
    const grainSize = Math.max(1, p.grainSize ?? 2);
    const color = p.color ?? false;
    const scratches = p.scratches ?? false;
    const base = Math.floor(rng() * 100000);
    const fseed = base + (f % Math.max(1, frameCount));

    const nw = Math.max(1, Math.round(w / grainSize));
    const nh = Math.max(1, Math.round(h / grainSize));
    const tmp = borrow(nw, nh);
    const tc = tmp.getContext('2d');
    const img = tc.createImageData(nw, nh);
    const d = img.data;
    const veil = Math.round((film ? 90 : 160) * intensity);
    let idx = 0;
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        if (color) {
          d[idx] = (hash2(x, y, fseed) * 255) | 0;
          d[idx + 1] = (hash2(x, y, fseed + 7) * 255) | 0;
          d[idx + 2] = (hash2(x, y, fseed + 13) * 255) | 0;
        } else {
          const v = (hash2(x, y, fseed) * 255) | 0;
          d[idx] = d[idx + 1] = d[idx + 2] = v;
        }
        d[idx + 3] = veil;
        idx += 4;
      }
    }
    tc.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, nw, nh, 0, 0, w, h);
    ctx.restore();
    release(tmp);

    if (film && scratches) {
      // 세로 스크래치 몇 개(프레임마다 자리 바뀜, 순환). 먼지 점 몇 개.
      ctx.save();
      const nScr = 3;
      for (let i = 0; i < nScr; i++) {
        const on = hash2(i, fseed, 31) < 0.5;
        if (!on) continue;
        const x = hash2(i, fseed, 51) * w;
        ctx.strokeStyle = withAlpha(hash2(i, fseed, 61) < 0.5 ? '#ffffff' : '#000000', intensity * 0.6);
        ctx.lineWidth = 0.6 + hash2(i, fseed, 71);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (hash2(i, fseed, 81) - 0.5) * 10, h); ctx.stroke();
      }
      ctx.fillStyle = withAlpha('#ffffff', intensity * 0.5);
      for (let i = 0; i < 12; i++) {
        const dx = hash2(i, fseed, 91) * w, dy = hash2(i, fseed, 97) * h;
        ctx.beginPath(); ctx.arc(dx, dy, 0.6 + hash2(i, fseed, 101), 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  },
};
