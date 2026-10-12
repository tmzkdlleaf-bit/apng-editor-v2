// 감정 터짐 — 하트·별·땀·물음표·느낌표·화남 표시가 튀어나옴. 기호는 직접 그린 도형(이모지·폰트 금지).
import { TAU, frac, withAlpha, clamp } from './_fx-util.js';

function drawSymbol(ctx, kind) {
  // 단위 크기(약 [-1,1]) 중심. 현재 fillStyle/strokeStyle 사용.
  if (kind === 'heart') {
    ctx.beginPath();
    ctx.moveTo(0, 0.9);
    ctx.bezierCurveTo(-1.2, -0.1, -0.7, -0.95, 0, -0.35);
    ctx.bezierCurveTo(0.7, -0.95, 1.2, -0.1, 0, 0.9);
    ctx.fill();
  } else if (kind === 'star') {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 === 0 ? 1 : 0.42;
      const an = -Math.PI / 2 + (k / 10) * TAU;
      const x = Math.cos(an) * rr, y = Math.sin(an) * rr;
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fill();
  } else if (kind === 'sweat') {
    ctx.beginPath();
    ctx.moveTo(0, -1);
    ctx.bezierCurveTo(0.75, -0.1, 0.75, 0.95, 0, 0.95);
    ctx.bezierCurveTo(-0.75, 0.95, -0.75, -0.1, 0, -1);
    ctx.fill();
  } else if (kind === 'question') {
    ctx.lineWidth = 0.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.arc(0, -0.35, 0.42, Math.PI * 0.9, Math.PI * 0.2, false);
    ctx.lineTo(0.02, 0.15);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0.02, 0.62, 0.17, 0, TAU); ctx.fill();
  } else if (kind === 'exclaim') {
    ctx.beginPath();
    ctx.moveTo(-0.2, -0.9); ctx.lineTo(0.2, -0.9); ctx.lineTo(0.1, 0.25); ctx.lineTo(-0.1, 0.25);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0.62, 0.19, 0, TAU); ctx.fill();
  } else { // anger (💢 느낌의 성남 표시)
    ctx.lineWidth = 0.22; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let k = 0; k < 4; k++) {
      const an = (k / 4) * TAU + Math.PI / 4;
      const cx = Math.cos(an) * 0.5, cy = Math.sin(an) * 0.5;
      const t = an + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(t) * 0.45, cy + Math.sin(t) * 0.45);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + Math.cos(an) * 0.4, cy + Math.sin(an) * 0.4);
      ctx.stroke();
    }
  }
}

export default {
  id: 'emotes',
  name: '감정 터짐',
  category: '파티클',
  description: '하트·별·땀·물음표 같은 기호가 튀어나온다',
  thumbnail: { frame: 6, bg: '#0d0a12' },
  bleed: 20,
  params: [
    { key: 'symbol', label: '기호', type: 'select', default: 'heart',
      options: [
        { value: 'heart', label: '하트' }, { value: 'star', label: '별' }, { value: 'sweat', label: '땀방울' },
        { value: 'question', label: '물음표' }, { value: 'exclaim', label: '느낌표' }, { value: 'anger', label: '화남' },
      ] },
    { key: 'count', label: '개수', type: 'int', default: 10, min: 1, max: 80 },
    { key: 'size', label: '크기', type: 'float', default: 28, min: 6, max: 90, step: 1 },
    { key: 'direction', label: '튀는 방향', type: 'float', default: 270, min: 0, max: 360, step: 1 },
    { key: 'height', label: '튀는 높이', type: 'float', default: 0.4, min: 0.05, max: 1, step: 0.01 },
    { key: 'mode', label: '재생', type: 'select', default: 'loop',
      options: [{ value: 'once', label: '1회' }, { value: 'loop', label: '반복' }] },
    { key: 'position', label: '위치', type: 'coord', default: { x: 0.5, y: 0.7 }, animatable: true },
    { key: 'color', label: '색', type: 'color', default: '#ff6b8e' },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  presets: [
    { id: 'love', label: '하트 뿜뿜', values: { symbol: 'heart', color: '#ff6b8e' } },
    { id: 'shock', label: '놀람', values: { symbol: 'exclaim', color: '#ffd24a' } },
    { id: 'sweat', label: '땀', values: { symbol: 'sweat', color: '#8fd0ff' } },
  ],
  scopes: ['full', 'box'],
  render(ctx, { f, frameCount, w, h, rng }, p) {
    const kind = p.symbol ?? 'heart';
    const count = Math.max(1, Math.round(p.count ?? 10));
    const size = p.size ?? 28;
    const dir = (p.direction ?? 270) * Math.PI / 180;
    const height = clamp(p.height ?? 0.4, 0.05, 1);
    const once = p.mode === 'once';
    const pos = p.position ?? { x: 0.5, y: 0.7 };
    const px = (pos.x ?? 0.5) * w, py = (pos.y ?? 0.7) * h;
    const color = p.color ?? '#ff6b8e';
    const op = clamp(p.opacity ?? 1, 0, 1);
    const progress = f / Math.max(1, frameCount);
    const reach = height * Math.max(w, h);

    for (let i = 0; i < count; i++) {
      const ph = rng(), spread = rng(), spd = rng(), rot = rng();
      // 각 기호의 지역 시간 lt(0 생성 → 1 소멸)
      let lt;
      if (once) lt = clamp(progress * 1.25 - (i / count) * 0.25, 0, 1);
      else lt = frac(ph + progress);
      if (lt <= 0.001 || lt >= 0.999) continue;
      const a0 = dir + (spread - 0.5) * 1.0; // ±~57°
      const dist = reach * (0.4 + 0.6 * spd) * lt;
      const x = px + Math.cos(a0) * dist;
      const y = py + Math.sin(a0) * dist;
      const env = Math.sin(lt * Math.PI);            // 0→1→0 (크기·투명도)
      const sz = size * (0.5 + 0.5 * env) * (0.7 + 0.6 * spd);
      const a = op * env;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rot - 0.5) * 0.6);
      ctx.scale(sz, sz);
      ctx.fillStyle = withAlpha(color, a);
      ctx.strokeStyle = withAlpha(color, a);
      drawSymbol(ctx, kind);
      ctx.restore();
    }
  },
};
