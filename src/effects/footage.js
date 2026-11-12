// R31 실사 소재(docs/vfx-research-2.md §3) — 실제 촬영·시뮬레이션 소재(플립북·움직이는 이미지)를 재생한다.
//   ① 소재 고르기: '소재' 칸에 이미지(여러 칸으로 나뉜 시트) 또는 움직이는 이미지 레이어를 연결.
//   ② 검은 배경 지우기(언멀트): 가장 밝은 채널을 불투명도로 삼고, 반투명 부분에서 검정 몫을 빼 원래 색을 되살린다.
//      (단순 밝기 마스크는 가장자리가 검게 탄다.)
//   ③ 이어 붙이기(루프): 마지막 구간과 처음 구간을 서서히 겹친다 → 0프레임 = N프레임.
//   ④ 색: 원래 색 / 불 온도색(사진 기준)으로 다시 칠하기 / 색 입히기. 여러 개 복제 배치.
// 결정론: 소재 프레임과 파라미터만으로 결과가 정해진다(난수는 seed 로만).
import { clamp, parseColor, hash2 } from './_fx-util.js';
import { firePhoto } from './_fx-real.js';

// 처리한 프레임(RGBA 바이트) 재사용 — 소재 원본 객체 → (설정 → 데이터). 너무 커지면 비운다.
const CACHE = new WeakMap();
let _cacheBytes = 0;
const MAX_BYTES = 160 * 1024 * 1024;
const MAX_SIDE = 512;

function framesOf(asset, p, fallbackCanvas) {
  if (asset?.kind === 'anim') return asset.frames.map((bm) => ({ img: bm, sx: 0, sy: 0, sw: bm.width, sh: bm.height }));
  const img = asset?.bitmap ?? fallbackCanvas;
  if (!img) return [];
  const cols = Math.max(1, Math.round(p.cols ?? 8)), rows = Math.max(1, Math.round(p.rows ?? 8));
  const fw = Math.floor(img.width / cols), fh = Math.floor(img.height / rows);
  const total = cols * rows;
  const count = clamp(Math.round(p.count ?? 0) || total, 1, total);
  const out = [];
  for (let i = 0; i < count; i++) out.push({ img, sx: (i % cols) * fw, sy: Math.floor(i / cols) * fh, sw: fw, sh: fh });
  return out;
}

// 한 프레임을 처리해 RGBA 바이트로(검은 배경 지우기·다시 칠하기·밝기).
function processFrame(fr, env, p) {
  const key = [p.unmult, p.black, p.soft, p.recolor, p.tint, p.brightness, fr.sx, fr.sy, fr.sw, fr.sh].join('|');
  let m = CACHE.get(fr.img);
  if (!m) { m = new Map(); CACHE.set(fr.img, m); }
  const hit = m.get(key);
  if (hit) return hit;
  const k = Math.min(1, MAX_SIDE / Math.max(fr.sw, fr.sh));
  const w = Math.max(1, Math.round(fr.sw * k)), h = Math.max(1, Math.round(fr.sh * k));
  const cv = env.borrow(w, h);
  const cx = cv.getContext('2d');
  cx.clearRect(0, 0, w, h);
  cx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, 0, 0, w, h);
  const id = cx.getImageData(0, 0, w, h);
  env.release(cv);
  const d = id.data;
  const unm = (p.unmult ?? 'unmult') === 'unmult';
  const black = clamp(p.black ?? 0.08, 0, 0.6), soft = clamp(p.soft ?? 0.1, 0, 1);
  const rc = p.recolor ?? 'none';
  const tint = parseColor(p.tint ?? '#ffffff');
  const br = clamp(p.brightness ?? 1, 0, 4);
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * br, g = d[i + 1] * br, b = d[i + 2] * br, a = d[i + 3] / 255;
    if (unm) {
      // 검은 배경 영상은 '검정 위에 미리 곱해진' 색 — 가장 밝은 채널이 곧 빛의 양(불투명도).
      const mx = Math.min(255, Math.max(r, g, b));
      let al = mx / 255;
      if (al <= 0) { d[i + 3] = 0; continue; }
      const kk = 255 / Math.max(r, g, b, 1);
      r *= kk; g *= kk; b *= kk;                               // 검정 몫을 빼서 원래 색으로
      // 바닥 깎기: 아주 어두운 잡티(압축 얼룩)를 지운다. 부드러움 폭만큼 서서히.
      const t = clamp((al - black) / Math.max(1e-3, soft * (1 - black) + 1e-3), 0, 1);
      a *= al * t * t * (3 - 2 * t);
    }
    if (rc === 'temp') {
      // 밝기(빛의 양) → 불 사진 색표. 원래 색과 상관없이 실제 불 색으로.
      const c = firePhoto(a);
      r = c[0]; g = c[1]; b = c[2]; a = c[3];
    } else if (rc === 'tint') {
      r = r * tint.r / 255; g = g * tint.g / 255; b = b * tint.b / 255;
    }
    d[i] = Math.min(255, r); d[i + 1] = Math.min(255, g); d[i + 2] = Math.min(255, b); d[i + 3] = Math.round(clamp(a, 0, 1) * 255);
  }
  const out = { w, h, data: d };
  if (_cacheBytes > MAX_BYTES) { m.clear(); _cacheBytes = 0; } // 너무 커지면 이 소재 몫을 비운다
  m.set(key, out);
  _cacheBytes += d.length;
  return out;
}

export default {
  id: 'footage',
  name: '실사 소재',
  category: '연출',
  description: '실제 촬영·시뮬레이션 소재(시트·움직이는 이미지)를 검은 배경을 지우고 반복 재생',
  thumbnail: { frame: 4, bg: '#0c0806' },
  bleed: 0,
  sources: [{ key: 'clip', label: '소재(시트 이미지·움직이는 이미지)' }],
  params: [
    { key: 'note', type: 'note', label: '+ 레이어 → 실사 소재 에서 내장 소재(불·연기·폭발)를 바로 넣을 수 있다. 가져온 소재는 위 "소재" 칸에 연결.' },
    { key: 'cols', label: '시트 가로 칸', type: 'int', default: 8, min: 1, max: 32 },
    { key: 'rows', label: '시트 세로 칸', type: 'int', default: 8, min: 1, max: 32 },
    { key: 'count', label: '프레임 수(0=전부)', type: 'int', default: 0, min: 0, max: 1024 },
    { key: 'speed', label: '재생 빠르기', type: 'float', default: 1, min: 0.1, max: 4, step: 0.05 },
    { key: 'start', label: '시작 프레임', type: 'int', default: 0, min: 0, max: 1024 },
    { key: 'loop', label: '이어 붙이기', type: 'select', default: 'crossfade', options: [
      { value: 'crossfade', label: '서서히 겹쳐 반복' }, { value: 'plain', label: '그냥 반복' }, { value: 'once', label: '한 번만(끝에서 멈춤)' }] },
    { key: 'overlap', label: '겹치는 길이', type: 'float', default: 0.3, min: 0.05, max: 0.6, step: 0.05 },
    { key: 'unmult', label: '검은 배경', type: 'select', default: 'unmult', options: [
      { value: 'unmult', label: '지우기(빛 소재)' }, { value: 'alpha', label: '그대로(투명 소재)' }] },
    { key: 'black', label: '어두운 잡티 깎기', type: 'float', default: 0.08, min: 0, max: 0.5, step: 0.01 },
    { key: 'soft', label: '깎는 부드러움', type: 'float', default: 0.1, min: 0, max: 1, step: 0.05 },
    { key: 'recolor', label: '색', type: 'select', default: 'none', options: [
      { value: 'none', label: '원래 색' }, { value: 'temp', label: '불 온도색(사진 기준)' }, { value: 'tint', label: '색 입히기' }] },
    { key: 'tint', label: '입힐 색', type: 'color', default: '#ffffff' },
    { key: 'brightness', label: '밝기', type: 'float', default: 1, min: 0, max: 3, step: 0.05 },
    { key: 'position', label: '위치(바닥 가운데)', type: 'coord', default: { x: 0.5, y: 1 } },
    { key: 'size', label: '크기(화면 높이 대비)', type: 'float', default: 0.7, min: 0.05, max: 3, step: 0.01 },
    { key: 'flip', label: '좌우 뒤집기', type: 'bool', default: false },
    { key: 'copies', label: '여러 개', type: 'int', default: 1, min: 1, max: 12 },
    { key: 'copySpread', label: '여러 개 간격', type: 'float', default: 0.25, min: 0, max: 1, step: 0.01 },
    { key: 'blend', label: '겹치기', type: 'select', default: 'normal', options: [{ value: 'normal', label: '보통' }, { value: 'lighter', label: '더하기(빛)' }] },
    { key: 'opacity', label: '불투명도', type: 'float', default: 1, min: 0, max: 1, step: 0.01 },
  ],
  scopes: ['full', 'box'],
  render(ctx, env, p) {
    const { f, frameCount, w, h, sources, borrow, release } = env;
    const src = (sources || []).find((s) => s.key === 'clip');
    const FR = framesOf(src?.asset, p, src?.asset ? null : src?.canvas);
    const M = FR.length;
    if (!M) return;
    const L = Math.max(1, frameCount);
    const op = clamp(p.opacity ?? 1, 0, 1);
    const sp = clamp(p.speed ?? 1, 0.05, 8);
    const start = Math.max(0, Math.round(p.start ?? 0));
    const mode = M === 1 ? 'plain' : (p.loop ?? 'crossfade');
    const copies = Math.max(1, Math.round(p.copies ?? 1));
    const pos = p.position ?? { x: 0.5, y: 1 };
    const size = clamp(p.size ?? 0.7, 0.01, 4) * h;
    const spread = clamp(p.copySpread ?? 0.25, 0, 1) * w;
    const flip = !!p.flip;

    // 소재 시간 → (프레임 a, 프레임 b, 섞는 비율 k). k 는 b 쪽 비중.
    const pick = (fo) => {
      if (mode === 'once') return [Math.min(M - 1, start + Math.floor(fo * sp)), 0, 0];
      if (mode === 'plain') return [((start + Math.floor(fo * sp)) % M + M) % M, 0, 0];
      // 서서히 겹쳐 반복: 한 바퀴에 T 프레임을 쓰고, 처음 X 프레임 동안은 T 뒤의 프레임과 섞는다.
      //   f=0 → 소재(start+T) 100% / f→L → 소재(start+T) 로 이어짐 → 이음매 없음.
      let T = L * sp;
      let X = Math.max(1, T * clamp(p.overlap ?? 0.3, 0.05, 0.6));
      let st = start;
      if (st + T + X > M) {                // 소재가 짧으면 빠르기를 줄여 맞춘다
        const s2 = (M - 1 - st) / (L * (1 + clamp(p.overlap ?? 0.3, 0.05, 0.6)));
        if (s2 <= 0) { st = 0; }
        T = L * Math.max(0.05, Math.min(sp, (M - 1 - st) / (L * (1 + clamp(p.overlap ?? 0.3, 0.05, 0.6)))));
        X = Math.max(1, T * clamp(p.overlap ?? 0.3, 0.05, 0.6));
      }
      const t = fo / L * T;
      const k = t < X ? 1 - t / X : 0;
      const ia = Math.min(M - 1, Math.floor(st + t)), ib = Math.min(M - 1, Math.floor(st + t + T));
      return [ia, ib, k];
    };

    ctx.save();
    ctx.globalCompositeOperation = (p.blend ?? 'normal') === 'lighter' ? 'lighter' : 'source-over';
    for (let c = 0; c < copies; c++) {
      // 복제마다 시간·크기·위치를 조금씩 다르게(결정론: 순서 해시). 시간은 정수 프레임 어긋남 → 루프 유지.
      const off = c === 0 ? 0 : Math.floor(hash2(c, 1, 77) * L);
      const sc = c === 0 ? 1 : 0.75 + 0.4 * hash2(c, 2, 77);
      const fo = ((f + off) % L + L) % L;
      const [ia, ib, k] = pick(fo);
      const A = processFrame(FR[ia], env, p);
      const B = k > 0 ? processFrame(FR[ib], env, p) : null;
      const cv = borrow(A.w, A.h);
      const cx = cv.getContext('2d');
      cx.putImageData(new ImageData(A.data, A.w, A.h), 0, 0);
      if (B) {
        // 정확한 섞기: 두 프레임을 각자 비율만큼 '더하기'로 합친다(곱해진 색 기준 선형 혼합).
        const cv2 = borrow(A.w, A.h);
        const c2 = cv2.getContext('2d');
        c2.clearRect(0, 0, A.w, A.h);
        c2.globalAlpha = 1 - k; c2.drawImage(cv, 0, 0);
        cx.clearRect(0, 0, A.w, A.h);
        cx.putImageData(new ImageData(B.data, B.w, B.h), 0, 0);
        c2.globalCompositeOperation = 'lighter'; c2.globalAlpha = k; c2.drawImage(cv, 0, 0);
        c2.globalCompositeOperation = 'source-over'; c2.globalAlpha = 1;
        cx.clearRect(0, 0, A.w, A.h); cx.drawImage(cv2, 0, 0);
        release(cv2);
      }
      const dh = size * sc, dw = dh * (A.w / A.h);
      const dx = pos.x * w + (copies > 1 ? (c - (copies - 1) / 2) * spread / Math.max(1, copies - 1) * 2 : 0);
      const dy = pos.y * h;
      ctx.globalAlpha = op;
      ctx.save();
      ctx.translate(dx, dy);
      if (flip !== (c % 2 === 1 && copies > 1)) ctx.scale(-1, 1);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(cv, -dw / 2, -dh, dw, dh);
      ctx.restore();
      release(cv);
    }
    ctx.restore();
  },
};
