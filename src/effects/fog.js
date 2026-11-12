// 안개 — 안개(안개·지면안개 합침). 결정론·루프(순환 노이즈 좌표).
import { TAU, fbm, parseColor, clamp, drawField } from './_fx-util.js';
import { LOOK_PARAM, lookOf, loopFbm } from './_fx-style.js';

export default {
  id: 'fog',
  name: '안개',
  category: '날씨',
  description: '화면 전체 또는 바닥에 깔리는 안개',
  thumbnail: { frame: 8, bg: '#0c0f12' },
  bleed: 0,
  params: [
    { key: 'shape', label: '모양', type: 'select', default: 'full',
      options: [{ value: 'full', label: '화면 전체' }, { value: 'ground', label: '바닥' }] },
    { key: 'height', label: '높이', type: 'float', default: 0.5, min: 0.1, max: 1, step: 0.01 },
    { key: 'density', label: '짙기', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'flowSpeed', label: '흐름 속도', type: 'int', default: 1, min: 1, max: 5 },
    { key: 'color', label: '색', type: 'color', default: '#cdd3db' },
    { key: 'cells', label: '해상도', type: 'int', default: 36, min: 12, max: 80, advanced: true },
    LOOK_PARAM('real'),
    { key: 'lightX', label: '빛 위치 가로(실사)', type: 'float', default: 0.5, min: 0, max: 1, step: 0.01 },
    { key: 'lightY', label: '빛 위치 세로(실사)', type: 'float', default: 0.25, min: 0, max: 1, step: 0.01 },
    { key: 'glow', label: '빛 주변 번짐(실사)', type: 'float', default: 0.4, min: 0, max: 1, step: 0.05 },
  ],
  presets: [
    { id: 'mist', label: '옅은 안개', values: { density: 0.35, color: '#dfe4ea' } },
    { id: 'ground', label: '지면 안개', values: { shape: 'ground', height: 0.4 } },
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    if (lookOf(p) === 'real') { renderReal(ctx, env, p); return; }
    const { f, frameCount, w, h, rng, borrow, release } = env;
    const ground = p.shape === 'ground';
    const height = clamp(p.height ?? 0.5, 0.1, 1);
    const density = clamp(p.density ?? 0.5, 0, 1);
    const speed = Math.max(1, Math.round(p.flowSpeed ?? 1));
    const col = parseColor(p.color ?? '#cdd3db');
    const cells = Math.max(12, Math.round(p.cells ?? 36));
    const seed = Math.floor(rng() * 1000);
    const progress = f / Math.max(1, frameCount);
    const ax = Math.cos(progress * TAU * speed) * 0.8;
    const ay = Math.sin(progress * TAU * speed) * 0.4;
    const freq = 2.2;
    // 칸 값을 작은 캔버스에 쓰고 부드럽게 늘려 그린다(R27: 칸 겹침 격자 줄·계단 제거).
    drawField(ctx, w, h, cells, cells, borrow, release, (gx, gy) => {
      const yf = (gy + 0.5) / cells;
      let vFade = 1;
      if (ground) {
        const top = 1 - height;
        vFade = yf < top ? 0 : clamp((yf - top) / Math.max(0.01, height), 0, 1);
      }
      if (vFade <= 0) return null;
      const n = fbm((gx / cells) * freq * (w / Math.max(w, h)) * 2 + ax, yf * freq + ay, seed, 3);
      const a = density * vFade * clamp((n - 0.3) / 0.6, 0, 1) * 0.8;
      if (a <= 0.01) return null;
      return [col.r, col.g, col.b, a];
    });
  },
};

// R30 실사(지침 4-1 안개): 진짜 안개는 '뭉게뭉게'보다 화면 전체를 고르게 덮는 막이고, 크게만 천천히 짙고 옅다.
//   바닥 안개는 높이에 따라 지수로 옅어지고(위 경계가 흐릿), 위 경계에만 느린 물결이 있다.
//   빛 근처에서는 안개가 빛을 흩뜨려 둥글게 밝아진다(전조등·가로등 주변 빛무리).
function renderReal(ctx, env, p) {
  const { w, h, rng, borrow, release } = env;
  const ground = p.shape === 'ground';
  const height = clamp(p.height ?? 0.5, 0.1, 1);
  const density = clamp(p.density ?? 0.5, 0, 1);
  const speed = Math.max(1, Math.round(p.flowSpeed ?? 1));
  const col = parseColor(p.color ?? '#cdd3db');
  const lx = clamp(p.lightX ?? 0.5, 0, 1), ly = clamp(p.lightY ?? 0.25, 0, 1);
  const glow = clamp(p.glow ?? 0.4, 0, 1);
  const seed = Math.floor(rng() * 1000);
  const fc = Math.max(1, env.frameCount), prog = (((env.f % fc) + fc) % fc) / fc;
  const CX = 64, CY = 48;
  const flow = prog * speed * 4;                            // 가로 주기 4 → 루프 동안 정수 칸 흐름
  drawField(ctx, w, h, CX, CY, borrow, release, (gx, gy) => {
    const u = (gx + 0.5) / CX, v = (gy + 0.5) / CY;
    // 큰 물결(옅고 짙음 ±30%) + 작은 결(±8%)
    const big = loopFbm(u * 4 - flow, v * 1.5, 4, 0, seed, 2);
    const fine = loopFbm(u * 16 - flow * 2.5, v * 6, 16, 0, seed + 5, 2);
    let d = density * 0.62 * (0.7 + 0.6 * (big - 0.5) + 0.16 * (fine - 0.5));
    if (ground) {
      const top = 1 - height;
      const hAbove = (top - v) / Math.max(0.02, height);    // 바닥 안개 위쪽은 지수로 옅어짐
      const edge = top + 0.05 * (big - 0.5);
      d *= v >= edge ? Math.min(1, 0.55 + (v - edge) / Math.max(0.02, height) * 0.9) : Math.exp(-Math.max(0, (edge - v)) / (height * 0.12));
      if (hAbove > 1.5) return null;
    }
    // 빛무리: 빛 근처에서 안개가 밝아짐(산란). 안개가 짙을수록 넓게.
    const dist2 = (u - lx) ** 2 * (w / h) ** 2 + (v - ly) ** 2;
    const halo = glow * Math.exp(-dist2 / (0.02 + 0.06 * density));
    const a = clamp(d + halo * 0.5 * (0.4 + density), 0, 0.95);
    if (a < 0.008) return null;
    const lift = Math.min(1, halo * 1.2);
    return [col.r + (255 - col.r) * lift, col.g + (255 - col.g) * lift, col.b + (255 - col.b) * lift, a];
  });
}
