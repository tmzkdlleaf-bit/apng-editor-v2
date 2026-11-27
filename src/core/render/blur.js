// 흐림 공용(R28a, R34b 재정의) — 보정 흐림(adjust.applyBlur)을 효과에서도 쓰고, 큰 반지름을 빠르게.
//   DOM 없음. 캔버스는 호출자가 주는 borrow/release(풀)로만 다룬다.
//
// R34b: blurToSmall/blurCanvas 는 더 이상 drawImage 의 비공개 리샘플러(축소 'high'·확대 'low')에
//   기대지 않는다. 대신 직접 계산한다 — 그래야 GPU 셰이더(gpu/blur.js)와 같은 결과를 내서
//   렌더러를 바꿔도 CLAUDE 렌더 규칙 2번 허용 기준(채널 최대차 3) 안에 든다.
//   파이프라인(CPU·GPU 공통):
//     ① 정수 배율 d 칸평균 축소(프리멀티 색×알파로 평균 — 투명 가장자리 색 번짐을 막는다)
//     ② 작은 크기에서 프리멀티 상태로 분리형 박스 3회
//     ③ 직접 쌍선형 확대(프리멀티 보간)  ④ 언프리멀티
//   세로 방향은 GPU 업로드(UNPACK_FLIP_Y)와 같은 좌표계를 쓰려고 뒤집어 계산하고 끝에 되돌린다 →
//   d 로 나누어 떨어지지 않을 때 남는 칸(부분 블록)이 GPU 와 같은 쪽에 생겨 가장자리까지 일치한다.
//   중간 단계는 Uint8ClampedArray(8비트)로 양자화해 GPU RGBA8 텍스처와 정밀도를 맞춘다.
import { applyBlur } from './adjust.js';

export { applyBlur };

// 축소 배율 d·작은 크기 cw/chh·박스 반경 R·유효 크기 sw/sh. CPU/GPU 가 똑같이 쓴다(단일 출처).
export function blurDims(W, H, r) {
  const d = Math.max(2, Math.ceil(r / 1.5));
  const cw = Math.max(1, Math.ceil(W / d));
  const chh = Math.max(1, Math.ceil(H / d));
  const R = Math.max(1, Math.round(r / d));
  return { d, cw, chh, R, sw: W / d, sh: H / d };
}

// src(2D 캔버스)를 ① 칸평균 축소 + ② 박스 3회 한 "작은 프리멀티 버퍼"로.
//   방향은 GPU 업로드(FLIP_Y)와 같게 세로로 뒤집힌 상태다(되돌리기는 호출부에서).
//   반환 small: Uint8ClampedArray(cw*chh*4), 프리멀티(rgb=색×알파, a=알파), 8비트.
function _smallPremult(src, dims) {
  const W = src.width, H = src.height;
  const sd = src.getContext('2d').getImageData(0, 0, W, H).data; // straight RGBA, 위→아래
  const { d, cw, chh, R } = dims;
  const small = new Uint8ClampedArray(cw * chh * 4);
  let opaque = true; // 원본이 전부 불투명하면 프리멀티=straight → 확대 때 나눗셈을 건너뛴다.
  for (let cy = 0; cy < chh; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      let pr = 0, pg = 0, pb = 0, sa = 0, cnt = 0;
      const x0 = cx * d, y0 = cy * d;
      for (let j = 0; j < d; j++) {
        const ty = y0 + j; if (ty >= H) break; // 뒤집힌(텍스처) 행
        const oy = H - 1 - ty;                 // 원본 행
        const rowBase = oy * W;
        for (let i = 0; i < d; i++) {
          const tx = x0 + i; if (tx >= W) break;
          const idx = (rowBase + tx) * 4;
          const av = sd[idx + 3];
          if (av !== 255) opaque = false;
          const a = av / 255;
          pr += sd[idx] * a; pg += sd[idx + 1] * a; pb += sd[idx + 2] * a; sa += av;
          cnt++;
        }
      }
      const o = (cy * cw + cx) * 4;
      // Uint8ClampedArray 저장이 반올림(짝수)·클램프 → GPU RGBA8 쓰기와 같은 양자화.
      small[o]     = pr / cnt;
      small[o + 1] = pg / cnt;
      small[o + 2] = pb / cnt;
      small[o + 3] = sa / cnt;
    }
  }
  // 프리멀티 상태로 박스 3회. applyBlur 은 채널 4개를 똑같이 균등 평균하므로 프리멀티에 그대로 쓴다.
  //   내부 임시도 Uint8ClampedArray → 패스마다 8비트(가로→세로 ×3, GPU 와 같은 횟수) 양자화.
  applyBlur({ data: small, width: cw, height: chh }, R);
  return { small, opaque };
}

// 흐린 결과를 "줄인 크기"로 돌려준다: { canvas(작은 캔버스, 호출자가 release), sw, sh(그 안 유효 크기) }.
//   늘려 그리기는 호출자가 drawImage(canvas, 0,0,sw,sh, x,y,W,H) 로 — 큰 캔버스 작업을 한 번 줄인다.
export function blurToSmall(src, r, borrow) {
  const W = src.width, H = src.height;
  const dims = blurDims(W, H, r);
  const { cw, chh, sw, sh } = dims;
  const { small, opaque } = _smallPremult(src, dims);
  const out = borrow(cw, chh);
  const oc = out.getContext('2d');
  const img = oc.createImageData(cw, chh);
  const od = img.data;
  // 언프리멀티 + 세로 되돌리기(뒤집힌 small → 정상 방향 캔버스).
  for (let y = 0; y < chh; y++) {
    const sy = (chh - 1 - y) * cw;
    const dy = y * cw;
    for (let x = 0; x < cw; x++) {
      const si = (sy + x) * 4, di = (dy + x) * 4;
      const a = small[si + 3];
      if (opaque || a === 255) { od[di] = small[si]; od[di + 1] = small[si + 1]; od[di + 2] = small[si + 2]; }
      else if (a > 0) { const k = 255 / a; od[di] = small[si] * k; od[di + 1] = small[si + 1] * k; od[di + 2] = small[si + 2] * k; }
      else { od[di] = 0; od[di + 1] = 0; od[di + 2] = 0; }
      od[di + 3] = a;
    }
  }
  oc.putImageData(img, 0, 0);
  return { canvas: out, sw, sh };
}

// src 캔버스를 반지름 r(물리 px)로 흐린 결과를 새로 빌린 캔버스(src 크기)에 담아 돌려준다(호출자가 release).
//   작은 크기에서 박스 3회 후 직접 쌍선형으로 늘린다 → 768² 반지름 40 도 몇 ms.
export function blurCanvas(src, r, borrow, release) {
  const W = src.width, H = src.height;
  const out = borrow(W, H);
  const oc = out.getContext('2d');
  if (!(r > 0.5)) { oc.drawImage(src, 0, 0); return out; }

  const dims = blurDims(W, H, r);
  const { d, cw, chh, sw, sh } = dims;
  const { small, opaque } = _smallPremult(src, dims);

  // 분리형 쌍선형 표본 지표·무게를 축마다 한 번만 구한다(안쪽 2M 픽셀 반복을 가볍게).
  const hi = sw - 0.5, hj = sh - 0.5;
  const X0 = new Int32Array(W), X1 = new Int32Array(W), FX = new Float64Array(W);
  for (let ox = 0; ox < W; ox++) {
    let tx = (ox + 0.5) / d; if (tx < 0.5) tx = 0.5; else if (tx > hi) tx = hi;
    const fx = tx - 0.5; let ix = Math.floor(fx);
    FX[ox] = fx - ix;
    X0[ox] = ix < 0 ? 0 : ix > cw - 1 ? cw - 1 : ix;
    const ix1 = ix + 1; X1[ox] = ix1 < 0 ? 0 : ix1 > cw - 1 ? cw - 1 : ix1;
  }

  const img = oc.createImageData(W, H);
  const od = img.data;
  // ③ 직접 쌍선형 확대(프리멀티) + ④ 언프리멀티. 출력·표본 모두 뒤집힌 공간에서 계산하고
  //   캔버스에는 세로를 되돌려(H-1-oy) 담는다 — GPU(텍스처 공간 확대 후 readPixels 뒤집기)와 같은 순서.
  for (let oy = 0; oy < H; oy++) {
    let ty = (oy + 0.5) / d; if (ty < 0.5) ty = 0.5; else if (ty > hj) ty = hj;
    const fy = ty - 0.5; let iy = Math.floor(fy); const fry = fy - iy;
    const iy0 = (iy < 0 ? 0 : iy > chh - 1 ? chh - 1 : iy) * cw;
    const iy1n = iy + 1; const iy1 = (iy1n < 0 ? 0 : iy1n > chh - 1 ? chh - 1 : iy1n) * cw;
    const gy = 1 - fry;
    const destRow = (H - 1 - oy) * W;
    for (let ox = 0; ox < W; ox++) {
      const x0 = X0[ox], x1 = X1[ox], frx = FX[ox], gx = 1 - frx;
      const w00 = gx * gy, w10 = frx * gy, w01 = gx * fry, w11 = frx * fry;
      const i00 = (iy0 + x0) * 4, i10 = (iy0 + x1) * 4, i01 = (iy1 + x0) * 4, i11 = (iy1 + x1) * 4;
      const pr = small[i00] * w00 + small[i10] * w10 + small[i01] * w01 + small[i11] * w11;
      const pg = small[i00 + 1] * w00 + small[i10 + 1] * w10 + small[i01 + 1] * w01 + small[i11 + 1] * w11;
      const pb = small[i00 + 2] * w00 + small[i10 + 2] * w10 + small[i01 + 2] * w01 + small[i11 + 2] * w11;
      const di = (destRow + ox) * 4;
      if (opaque) { od[di] = pr; od[di + 1] = pg; od[di + 2] = pb; od[di + 3] = 255; continue; }
      const pa = small[i00 + 3] * w00 + small[i10 + 3] * w10 + small[i01 + 3] * w01 + small[i11 + 3] * w11;
      if (pa > 0) { const k = 255 / pa; od[di] = pr * k; od[di + 1] = pg * k; od[di + 2] = pb * k; }
      else { od[di] = 0; od[di + 1] = 0; od[di + 2] = 0; }
      od[di + 3] = pa;
    }
  }
  oc.putImageData(img, 0, 0);
  return out;
}

// 위치마다 다른 흐림. amount(u,v) → 0(선명)~1(최대 r). u,v 는 0~1(캔버스 비율).
//   흐림 단계 2장(r/3, r)을 만들고, 단계마다 무게 지도를 작은 해상도로 계산해 늘려 섞는다.
//   결과를 ctx 의 (dx,dy) 에 그린다(물리 px, 변형 없는 상태로 그린다).
export function variableBlur(ctx, src, dx, dy, r, amount, borrow, release, mapRes = 96) {
  const W = src.width, H = src.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!(r > 0.5)) { ctx.drawImage(src, dx, dy); ctx.restore(); return; }
  const levels = [0, r / 3, r];
  const mw = Math.max(2, Math.min(mapRes, W)), mh = Math.max(2, Math.round(mw * H / W));
  // 각 픽셀(작은 지도) 의 amount → 단계 사이 위치
  const amt = new Float32Array(mw * mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const a = amount((x + 0.5) / mw, (y + 0.5) / mh);
    amt[y * mw + x] = a < 0 ? 0 : a > 1 ? 1 : a;
  }
  // 바닥: 선명한 원본
  ctx.drawImage(src, dx, dy);
  const wmap = borrow(mw, mh);
  const mc = wmap.getContext('2d');
  for (let li = 1; li < levels.length; li++) {
    // 이 단계 이상 흐린 정도: t = amount×2 에서 (li-1) 을 넘은 만큼(0~1) — 단계를 차례로 덮어 부드럽게 이어진다.
    const img = mc.createImageData(mw, mh);
    let any = false;
    for (let i = 0; i < amt.length; i++) {
      const t = amt[i] * 2 - (li - 1);
      const w = t <= 0 ? 0 : t >= 1 ? 1 : t;
      if (w > 0) any = true;
      img.data[i * 4 + 3] = Math.round(w * 255);
    }
    if (!any) break;
    mc.putImageData(img, 0, 0);
    // 흐린 단계(작은 크기)에 무게 지도를 작은 크기 그대로 곱한 뒤 한 번만 늘려 얹는다(큰 캔버스 작업 1번).
    const bl = blurToSmall(src, levels[li], borrow);
    const bc = bl.canvas.getContext('2d');
    bc.globalCompositeOperation = 'destination-in';
    bc.imageSmoothingEnabled = true;
    bc.drawImage(wmap, 0, 0, mw, mh, 0, 0, bl.sw, bl.sh);
    bc.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'low';
    ctx.drawImage(bl.canvas, 0, 0, bl.sw, bl.sh, dx, dy, W, H);
    release(bl.canvas);
  }
  release(wmap);
  ctx.restore();
}
