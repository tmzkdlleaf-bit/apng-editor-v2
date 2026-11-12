// 흐림 공용(R28a) — 보정 흐림(adjust.applyBlur)을 효과에서도 쓰고, 큰 반지름·위치마다 다른 흐림을 빠르게.
//   DOM 없음. 캔버스는 호출자가 주는 borrow/release(풀)로만 다룬다.
import { applyBlur } from './adjust.js';

export { applyBlur };

// 흐린 결과를 "줄인 크기"로 돌려준다: { canvas(작은 캔버스, 호출자가 release), sw, sh(그 안 유효 크기) }.
//   늘려 그리기는 호출자가 drawImage(canvas, 0,0,sw,sh, x,y,W,H) 로 — 큰 캔버스 작업을 한 번 줄인다.
export function blurToSmall(src, r, borrow) {
  const W = src.width, H = src.height;
  const d = Math.max(2, Math.ceil(r / 1.5));             // 줄이는 배율(줄인 크기에서 반지름 약 1.5px — 박스 3번 + 부드럽게 늘리기)
  const cw = Math.max(1, Math.ceil(W / d)), chh = Math.max(1, Math.ceil(H / d));
  const small = borrow(cw, chh);
  const sc = small.getContext('2d');
  sc.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in sc) sc.imageSmoothingQuality = 'high';
  sc.drawImage(src, 0, 0, W, H, 0, 0, W / d, H / d);
  const id = sc.getImageData(0, 0, cw, chh);
  applyBlur(id, Math.max(1, r / d));
  sc.putImageData(id, 0, 0);
  return { canvas: small, sw: W / d, sh: H / d };
}

// src 캔버스를 반지름 r(물리 px)로 흐린 결과를 새로 빌린 캔버스(src 크기)에 담아 돌려준다(호출자가 release).
//   큰 반지름은 줄인 크기에서 박스 흐림 3번 후 부드럽게 늘린다 → 768² 반지름 40 도 몇 ms.
export function blurCanvas(src, r, borrow, release) {
  const W = src.width, H = src.height;
  const out = borrow(W, H);
  const oc = out.getContext('2d');
  if (!(r > 0.5)) { oc.drawImage(src, 0, 0); return out; }
  const b = blurToSmall(src, r, borrow);
  oc.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in oc) oc.imageSmoothingQuality = 'low'; // 늘리기는 쌍선형이면 충분(high 는 느림)
  oc.drawImage(b.canvas, 0, 0, b.sw, b.sh, 0, 0, W, H);
  release(b.canvas);
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
