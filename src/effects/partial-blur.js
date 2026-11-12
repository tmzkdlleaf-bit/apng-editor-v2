// 부분 흐림(R28c) — 화면의 일부만 흐리게. 모양 5가지:
//   영역(원·사각, 안/밖) · 미니어처(가로 띠만 선명) · 가장자리(가운데 선명) · 움직이는 초점(점, 키로 옮김) ·
//   펜으로 지정(이 효과 레이어의 가리기 탭에서 펜으로 흐릴 곳을 그린다 — 기존 가리기 그대로 사용).
//   위치마다 다른 흐림은 core/render/blur.js variableBlur(단계 3장 섞기).
import { clamp, smoothstep } from './_fx-util.js';
import { variableBlur, blurCanvas } from '../core/render/blur.js';

export default {
  id: 'partial-blur',
  name: '부분 흐림',
  category: '변형',
  description: '일부만 흐리게(영역·미니어처·가장자리·움직이는 초점·펜으로 지정). 그림을 소스로 연결',
  thumbnail: { frame: 0, bg: '#202630' },
  bleed: 0,
  params: [
    { key: 'mode', label: '모양', type: 'select', default: 'focus',
      options: [
        { value: 'area', label: '영역' }, { value: 'miniature', label: '미니어처' }, { value: 'edge', label: '가장자리' },
        { value: 'focus', label: '움직이는 초점' }, { value: 'pen', label: '펜으로 지정(가리기 탭)' },
      ] },
    { key: 'maskNote', label: '펜으로 지정·가리기로 지정: 이 효과 레이어의 「가리기」 칸에서 사각형·타원·펜으로 영역을 그리세요.', type: 'note' },
    { key: 'amount', label: '흐림 세기', type: 'float', default: 16, min: 0, max: 60, step: 0.5 },
    // 영역
    { key: 'shape', label: '영역 모양', type: 'select', default: 'circle',
      options: [{ value: 'circle', label: '원' }, { value: 'rect', label: '사각형' }] },
    { key: 'invert', label: '영역 밖을 흐리기', type: 'bool', default: false },
    { key: 'center', label: '중심·초점', type: 'coord', default: { x: 0.5, y: 0.5 } },
    { key: 'size', label: '크기(영역·선명한 범위)', type: 'float', default: 0.3, min: 0.02, max: 1, step: 0.01 },
    { key: 'falloff', label: '흐려지는 거리', type: 'float', default: 0.25, min: 0.01, max: 1, step: 0.01 },
    // 미니어처
    { key: 'band', label: '띠 위치', type: 'float', default: 0.55, min: 0, max: 1, step: 0.01 },
    { key: 'tilt', label: '띠 기울기(도)', type: 'float', default: 0, min: -45, max: 45, step: 1 },
  ],
  scopes: ['full'],
  sources: [{ key: 'below', label: '대상(그림)' }],
  render(ctx, { sources, pad = 0, scale = 1, borrow, release }, p) {
    const src = (sources || []).find((s) => s.key === 'below')?.canvas;
    if (!src) return;
    const W = src.width, H = src.height;
    const r = Math.max(0, (p.amount ?? 16) * scale);
    const mode = p.mode ?? 'focus';
    if (mode === 'pen') {
      // 전체를 흐리고, 어디에 보일지는 이 레이어의 가리기(펜)가 정한다.
      const bl = blurCanvas(src, r, borrow, release);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bl, pad, pad); ctx.restore();
      release(bl);
      return;
    }
    const cx = clamp(p.center?.x ?? 0.5, 0, 1), cy = clamp(p.center?.y ?? 0.5, 0, 1);
    const size = clamp(p.size ?? 0.3, 0.02, 1), fall = clamp(p.falloff ?? 0.25, 0.01, 1);
    const asp = W / H;
    let amount;
    if (mode === 'area') {
      const inv = !!p.invert;
      const rect = (p.shape ?? 'circle') === 'rect';
      amount = (u, v) => {
        const dx = (u - cx) * asp, dy = v - cy;
        const d = rect ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
        const inside = 1 - smoothstep(size / 2, size / 2 + fall * 0.3, d);   // 1 안 ~ 0 밖
        return inv ? 1 - inside : inside;
      };
    } else if (mode === 'miniature') {
      const band = clamp(p.band ?? 0.55, 0, 1);
      const t = Math.tan((p.tilt ?? 0) * Math.PI / 180);
      amount = (u, v) => {
        const d = Math.abs((v - band) - (u - 0.5) * t / asp) ;
        return smoothstep(size / 2, size / 2 + fall, d);
      };
    } else if (mode === 'edge') {
      amount = (u, v) => smoothstep(size / 2, size / 2 + fall, Math.hypot((u - 0.5) * Math.min(1, asp), (v - 0.5) * Math.min(1, 1 / asp)));
    } else { // focus
      amount = (u, v) => smoothstep(size / 2, size / 2 + fall, Math.hypot((u - cx) * asp, v - cy));
    }
    variableBlur(ctx, src, pad, pad, r, amount, borrow, release);
  },
};
