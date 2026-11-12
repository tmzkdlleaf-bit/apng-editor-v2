// 흐림 공용(R28a) — 보정 흐림(adjust.applyBlur)을 효과에서도 쓰고, 큰 반지름·위치마다 다른 흐림을 빠르게.
//   DOM 없음. 캔버스는 호출자가 주는 borrow/release(풀)로만 다룬다.
import { applyBlur } from './adjust.js';

export { applyBlur };

// src 캔버스를 반지름 r(물리 px)로 흐린 결과를 새로 빌린 캔버스(src 크기)에 담아 돌려준다(호출자가 release).
//   큰 반지름은 줄인 크기에서 박스 흐림 3번 후 부드럽게 늘린다 → 768² 반지름 40 도 몇 ms.
export function blurCanvas(src, r, borrow, release) {
  const W = src.width, H = src.height;
  const out = borrow(W, H);
  const oc = out.getContext('2d');
  if (!(r > 0.5)) { oc.drawImage(src, 0, 0); return out; }
  const d = Math.max(1, Math.floor(r / 3));              // 줄이는 배율(작은 쪽 반지름 약 3px 이상)
  const sw = Math.max(1, Math.ceil(W / d)), sh = Math.max(1, Math.ceil(H / d));
  const small = borrow(sw, sh);
  const sc = small.getContext('2d');
  sc.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in sc) sc.imageSmoothingQuality = 'high';
  sc.drawImage(src, 0, 0, W, H, 0, 0, W / d, H / d);
  const id = sc.getImageData(0, 0, sw, sh);
  applyBlur(id, Math.max(1, r / d));
  sc.putImageData(id, 0, 0);
  oc.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in oc) oc.imageSmoothingQuality = 'high';
  oc.drawImage(small, 0, 0, W / d, H / d, 0, 0, W, H);
  release(small);
  return out;
}

// 위치마다 다른 흐림. amount(u,v) → 0(선명)~1(최대 r). u,v 는 0~1(캔버스 비율).
//   흐림 단계 3장(r/4, r/2, r)을 만들고, 단계마다 무게 지도를 작은 해상도로 계산해 늘려 섞는다.
//   결과를 ctx 의 (dx,dy) 에 그린다(물리 px, 변형 없는 상태로 그린다).
export function variableBlur(ctx, src, dx, dy, r, amount, borrow, release, mapRes = 96) {
  const W = src.width, H = src.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!(r > 0.5)) { ctx.drawImage(src, dx, dy); ctx.restore(); return; }
  const levels = [0, r / 4, r / 2, r];
  const mw = Math.max(2, Math.min(mapRes, W)), mh = Math.max(2, Math.round(mw * H / W));
  // 각 픽셀(작은 지도) 의 amount → 단계 사이 위치
  const amt = new Float32Array(mw * mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const a = amount((x + 0.5) / mw, (y + 0.5) / mh);
    amt[y * mw + x] = a < 0 ? 0 : a > 1 ? 1 : a;
  }
  // 바닥: 선명한 원본
  ctx.drawImage(src, dx, dy);
  const work = borrow(W, H);
  const wc = work.getContext('2d');
  const wmap = borrow(mw, mh);
  const mc = wmap.getContext('2d');
  for (let li = 1; li < levels.length; li++) {
    // 이 단계 이상 흐린 정도: t = amount×3 에서 (li-1) 을 넘은 만큼(0~1) — 단계를 차례로 덮어 부드럽게 이어진다.
    const img = mc.createImageData(mw, mh);
    let any = false;
    for (let i = 0; i < amt.length; i++) {
      const t = amt[i] * 3 - (li - 1);
      const w = t <= 0 ? 0 : t >= 1 ? 1 : t;
      if (w > 0) any = true;
      img.data[i * 4 + 3] = Math.round(w * 255);
    }
    if (!any) break;
    mc.putImageData(img, 0, 0);
    const bl = blurCanvas(src, levels[li], borrow, release);
    wc.setTransform(1, 0, 0, 1, 0, 0);
    wc.globalCompositeOperation = 'copy';
    wc.drawImage(bl, 0, 0);
    release(bl);
    wc.globalCompositeOperation = 'destination-in';
    wc.imageSmoothingEnabled = true;
    wc.drawImage(wmap, 0, 0, mw, mh, 0, 0, W, H);
    wc.globalCompositeOperation = 'source-over';
    // 원본 위에 흐린 단계를 무게만큼: 먼저 그 자리의 아래 단계를 무게만큼 지우고(destination-out) 더한다.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(wmap, 0, 0, mw, mh, dx, dy, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(work, dx, dy);
  }
  release(wmap);
  release(work);
  ctx.restore();
}
