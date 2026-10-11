// 모션 렌더 채널 — 조각 그리기(slices)와 이어 그리기(wrap).
// 레이어 콘텐츠 캔버스(cw×ch)를 applyTransform 로 배치한 로컬 공간에서 그린다.
// 콘텐츠 좌상단은 (-cw*ax, -ch*ay).

export function hasChannels(tr) {
  return !!(tr && ((tr.slices && tr.slices.length) || tr.wrapX || tr.wrapY));
}

// slices: [{ y0, y1, dx, alpha }] — y0/y1 은 높이 대비 비율, dx 는 너비 대비 비율 가로 밀기.
//   레이어를 가로 띠로 잘라 띠마다 가로로 밀고 투명도를 곱한다(글리치).
// wrapX/wrapY: 너비·높이 대비 밀림 — 레이어 경계 안에서 잘린 부분을 반대편에 이어 그린다(타일).
export function drawWithChannels(ctx, content, cw, ch, ax, ay, tr) {
  const left = -cw * ax;
  const top  = -ch * ay;

  if (tr.slices && tr.slices.length) {
    for (const s of tr.slices) {
      const y0 = top + (s.y0 ?? 0) * ch;
      const y1 = top + (s.y1 ?? 1) * ch;
      const bh = y1 - y0;
      if (bh <= 0) continue;
      const dx = (s.dx ?? 0) * cw;
      ctx.save();
      ctx.beginPath(); ctx.rect(left, y0, cw, bh); ctx.clip(); // 띠의 세로 범위만
      ctx.globalAlpha *= (s.alpha ?? 1);
      ctx.drawImage(content, left + dx, top);                   // 콘텐츠 전체를 가로로 민다
      ctx.restore();
    }
    return;
  }

  // wrap — 레이어 경계 안에서 타일 복제(이어 그리기)
  const wx = (((tr.wrapX ?? 0) % 1) + 1) % 1;
  const wy = (((tr.wrapY ?? 0) % 1) + 1) % 1;
  const offX = wx * cw;
  const offY = wy * ch;
  ctx.save();
  ctx.beginPath(); ctx.rect(left, top, cw, ch); ctx.clip();
  for (let ty = -1; ty <= 1; ty++) {
    for (let tx = -1; tx <= 1; tx++) {
      ctx.drawImage(content, left + offX + tx * cw, top + offY + ty * ch);
    }
  }
  ctx.restore();
}
