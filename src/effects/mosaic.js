// 모자이크(R28c) — 그림을 큰 칸(네모·둥근 점·육각)으로 뭉갠다. 범위: 전체 / 원·사각 영역 / 가리기로 지정.
//   칸 평균은 줄인 캔버스로(빠름). 정적.
import { clamp } from './_fx-util.js';

export default {
  id: 'mosaic',
  name: '모자이크',
  category: '변형',
  description: '그림을 큰 칸으로 뭉갠다(가리기·검열·픽셀 느낌). 범위를 원·사각형이나 가리기로 정할 수 있음',
  thumbnail: { frame: 0, bg: '#202630' },
  bleed: 0,
  params: [
    { key: 'cell', label: '칸 크기', type: 'float', default: 14, min: 2, max: 80, step: 1 },
    { key: 'shape', label: '모양', type: 'select', default: 'square',
      options: [{ value: 'square', label: '네모' }, { value: 'dot', label: '둥근 점' }, { value: 'hex', label: '육각' }] },
    { key: 'range', label: '범위', type: 'select', default: 'full',
      options: [{ value: 'full', label: '전체' }, { value: 'circle', label: '원' }, { value: 'rect', label: '사각형' }, { value: 'mask', label: '가리기로 지정' }] },
    { key: 'maskNote', label: '펜으로 지정·가리기로 지정: 이 효과 레이어의 「가리기」 칸에서 사각형·타원·펜으로 영역을 그리세요.', type: 'note' },
    { key: 'center', label: '영역 중심', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'size', label: '영역 크기', type: 'float', default: 0.4, min: 0.05, max: 1, step: 0.01 },
    { key: 'feather', label: '영역 가장자리 부드럽게', type: 'float', default: 0.2, min: 0, max: 1, step: 0.05 },
  ],
  scopes: ['full'],
  sources: [{ key: 'below', label: '대상(그림)' }],
  render(ctx, { sources, pad = 0, scale = 1, borrow, release }, p) {
    const src = (sources || []).find((s) => s.key === 'below')?.canvas;
    if (!src) return;
    const W = src.width, H = src.height;
    const cell = Math.max(2, (p.cell ?? 14) * scale);
    const cols = Math.max(1, Math.ceil(W / cell)), rows = Math.max(1, Math.ceil(H / cell));
    const small = borrow(cols, rows);
    const sc = small.getContext('2d');
    sc.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in sc) sc.imageSmoothingQuality = 'high';
    sc.drawImage(src, 0, 0, W, H, 0, 0, W / cell, H / cell);
    const mos = borrow(W, H);
    const mc = mos.getContext('2d');
    const shape = p.shape ?? 'square';
    if (shape === 'square') {
      mc.imageSmoothingEnabled = false;
      mc.drawImage(small, 0, 0, W / cell, H / cell, 0, 0, W, H);
    } else {
      const d = sc.getImageData(0, 0, cols, rows).data;
      for (let gy = 0; gy < rows; gy++) {
        for (let gx = 0; gx < cols; gx++) {
          const i = (gy * cols + gx) * 4;
          if (!d[i + 3]) continue;
          mc.fillStyle = `rgba(${d[i]},${d[i + 1]},${d[i + 2]},${(d[i + 3] / 255).toFixed(3)})`;
          const cx = (gx + 0.5 + (shape === 'hex' && gy % 2 ? 0.5 : 0)) * cell, cy = (gy + 0.5) * cell;
          mc.beginPath();
          if (shape === 'dot') mc.arc(cx, cy, cell * 0.46, 0, Math.PI * 2);
          else { const r = cell * 0.6; for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; mc.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } mc.closePath(); }
          mc.fill();
        }
      }
    }
    release(small);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const range = p.range ?? 'full';
    if (range === 'circle' || range === 'rect') {
      // 원본 위에 영역만 모자이크 — 영역 모양(부드러운 가장자리)으로 자른다
      ctx.drawImage(src, pad, pad);
      const cx = clamp(p.center?.x ?? 0.5, 0, 1) * W, cy = clamp(p.center?.y ?? 0.5, 0, 1) * H;
      const sz = clamp(p.size ?? 0.4, 0.05, 1) * Math.min(W, H) / 2;
      const fe = clamp(p.feather ?? 0.2, 0, 1);
      mc.globalCompositeOperation = 'destination-in';
      if (range === 'circle') {
        const g = mc.createRadialGradient(cx, cy, sz * (1 - fe), cx, cy, sz);
        g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)');
        mc.fillStyle = g; mc.fillRect(0, 0, W, H);
      } else {
        // 사각형: 가로·세로 두 번 곱해 모서리까지 부드럽게
        const fx = sz * fe;
        const gx = mc.createLinearGradient(cx - sz, 0, cx + sz, 0);
        gx.addColorStop(0, 'rgba(0,0,0,0)'); gx.addColorStop(fx / (2 * sz) || 0.0001, '#000'); gx.addColorStop(1 - (fx / (2 * sz) || 0.0001), '#000'); gx.addColorStop(1, 'rgba(0,0,0,0)');
        mc.fillStyle = gx; mc.fillRect(0, 0, W, H);
        const gy = mc.createLinearGradient(0, cy - sz, 0, cy + sz);
        gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(fx / (2 * sz) || 0.0001, '#000'); gy.addColorStop(1 - (fx / (2 * sz) || 0.0001), '#000'); gy.addColorStop(1, 'rgba(0,0,0,0)');
        mc.fillStyle = gy; mc.fillRect(0, 0, W, H);
        mc.globalCompositeOperation = 'destination-in';
        mc.fillStyle = '#000';
      }
      mc.globalCompositeOperation = 'source-over';
      // 원본 위에 영역 모양으로 자른 모자이크를 얹는다(불투명한 곳에서 원본×(1−a) + 모자이크×a).
      ctx.drawImage(mos, pad, pad);
    } else {
      ctx.drawImage(mos, pad, pad);
    }
    ctx.restore();
    release(mos);
  },
};
