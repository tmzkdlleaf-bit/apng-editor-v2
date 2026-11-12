// 홀로 코팅(R28d) — 트레이딩 카드 홀로처럼 소스 모양 위로 무지개빛이 비스듬히 지나간다. 반짝이 점·무늬.
//   반복형(지나가는 횟수 정수 → 루프). 기존 '홀로그램'(무지개 막 채우기)과 달리 '빛이 지나가는 코팅'.
import { TAU, clamp, hash2 } from './_fx-util.js';

export default {
  id: 'holo-foil',
  name: '홀로 코팅',
  category: '빛',
  description: '카드 홀로처럼 그림 위로 무지개빛이 비스듬히 지나간다(반짝이·별·다이아 무늬). 그림을 소스로 연결',
  thumbnail: { frame: 6, bg: '#15131c' },
  bleed: 0,
  params: [
    { key: 'angle', label: '각도', type: 'float', default: 30, min: -80, max: 80, step: 1 },
    { key: 'band', label: '띠 폭', type: 'float', default: 0.35, min: 0.05, max: 1, step: 0.01 },
    { key: 'hue', label: '무지개 범위', type: 'float', default: 1, min: 0.1, max: 1, step: 0.05 },
    { key: 'strength', label: '세기', type: 'float', default: 0.6, min: 0, max: 1, step: 0.01 },
    { key: 'passes', label: '지나가는 횟수', type: 'int', default: 1, min: 1, max: 6 },
    { key: 'sparkle', label: '반짝이 점', type: 'float', default: 0.5, min: 0, max: 1, step: 0.05 },
    { key: 'pattern', label: '무늬', type: 'select', default: 'smooth',
      options: [{ value: 'smooth', label: '매끈' }, { value: 'stars', label: '별' }, { value: 'diamond', label: '다이아 격자' }] },
  ],
  scopes: ['full'],
  sources: [{ key: 'below', label: '대상(카드·그림)' }],
  render(ctx, { f, frameCount, rng, sources, pad = 0, scale = 1, borrow, release }, p) {
    const src = (sources || []).find((s) => s.key === 'below')?.canvas;
    if (!src) return;
    const W = src.width, H = src.height;
    const seed = 1 + Math.floor(rng() * 9999);
    const prog = f / Math.max(1, frameCount);
    const passes = Math.max(1, Math.round(p.passes ?? 1));
    const ph = (prog * passes) % 1;
    const ang = (p.angle ?? 30) * Math.PI / 180;
    const dirX = Math.cos(ang), dirY = Math.sin(ang);
    // 띠가 지나가는 축(대각): 화면 투영 길이
    const span = Math.abs(W * dirX) + Math.abs(H * dirY);
    const bw = clamp(p.band ?? 0.35, 0.05, 1) * span;
    const pos = -bw + ph * (span + bw * 2) - span / 2;   // 가운데 기준, 양 끝에서 띠가 화면 밖 → 루프 이음매 매끈
    const st = clamp(p.strength ?? 0.6, 0, 1);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(src, pad, pad);
    const lay = borrow(W, H);
    const lc = lay.getContext('2d');
    const cx = W / 2, cy = H / 2;
    const g = lc.createLinearGradient(cx + dirX * (pos - bw), cy + dirY * (pos - bw), cx + dirX * (pos + bw), cy + dirY * (pos + bw));
    const hueR = clamp(p.hue ?? 1, 0.1, 1);
    const stops = 7;
    for (let i = 0; i <= stops; i++) {
      const u = i / stops;
      const env = Math.sin(u * Math.PI);                    // 띠 가운데가 가장 진함
      const hue = (200 + u * 360 * hueR + ph * 60) % 360;
      g.addColorStop(u, `hsla(${hue.toFixed(1)},95%,62%,${(env * st).toFixed(3)})`);
    }
    lc.fillStyle = g;
    lc.fillRect(0, 0, W, H);
    // 무늬: 띠 안에서만 보이게(띠를 이미 칠한 곳에 source-atop/destination-in)
    const pat = p.pattern ?? 'smooth';
    if (pat === 'diamond') {
      lc.globalCompositeOperation = 'destination-in';
      lc.strokeStyle = 'rgba(0,0,0,1)'; lc.lineWidth = Math.max(1.5, 3 * scale);
      const step = 18 * scale;
      lc.beginPath();
      for (let x = -H; x < W + H; x += step) { lc.moveTo(x, 0); lc.lineTo(x + H, H); lc.moveTo(x + H, 0); lc.lineTo(x, H); }
      lc.stroke();
      lc.globalCompositeOperation = 'source-over';
    } else if (pat === 'stars') {
      lc.globalCompositeOperation = 'destination-in';
      lc.fillStyle = '#000';
      const step = 22 * scale;
      for (let y = 0; y < H + step; y += step) for (let x = ((y / step) % 2) * step / 2; x < W + step; x += step) {
        const r = 6 * scale;
        lc.beginPath();
        for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5 - Math.PI / 2, rr = k % 2 ? r * 0.42 : r; lc.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
        lc.closePath(); lc.fill();
      }
      lc.globalCompositeOperation = 'source-over';
    }
    // 반짝이 점(그림 위 무작위 자리에서 반짝임 — 시간에 정수 주기)
    const sp = clamp(p.sparkle ?? 0.5, 0, 1);
    if (sp > 0) {
      const n = Math.round(80 * sp);
      for (let i = 0; i < n; i++) {
        const x = hash2(i, 1, seed) * W, y = hash2(i, 2, seed) * H;
        const tw = Math.max(0, Math.sin(TAU * (prog * passes * 2 + hash2(i, 3, seed))));
        if (tw <= 0.05) continue;
        const r = (0.8 + 2 * hash2(i, 4, seed)) * scale * tw;
        lc.fillStyle = `rgba(255,255,255,${(0.9 * tw * st).toFixed(3)})`;
        lc.fillRect(x - r * 2, y - r * 0.25, r * 4, r * 0.5);
        lc.fillRect(x - r * 0.25, y - r * 2, r * 0.5, r * 4);
      }
    }
    // 그림 모양 안에서만
    lc.globalCompositeOperation = 'destination-in';
    lc.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(lay, pad, pad);
    ctx.restore();
    release(lay);
  },
};
