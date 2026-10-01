// 텍스트 레이어 렌더러 — ctx.filter 미사용

function _blendOp(blend) {
  const MAP = {
    normal:'source-over', multiply:'multiply', screen:'screen', overlay:'overlay',
    darken:'darken', lighten:'lighten', 'color-dodge':'color-dodge', 'color-burn':'color-burn',
    'hard-light':'hard-light', 'soft-light':'soft-light', difference:'difference', exclusion:'exclusion',
  };
  return MAP[blend] ?? 'source-over';
}

function _applyTransform(ctx, worldTr, w, h) {
  ctx.translate(w / 2 + (worldTr.x ?? 0), h / 2 + (worldTr.y ?? 0));
  ctx.rotate((worldTr.rotation ?? 0) * Math.PI / 180);
  ctx.scale(worldTr.scale ?? 1, worldTr.scale ?? 1);
}

function _cssFont(style) {
  const weight  = style.fontWeight ?? 'normal';
  const size    = style.fontSize   ?? 48;
  const family  = style.fontFamily ?? 'sans-serif';
  return `${weight} ${size}px ${family}`;
}

// 한 줄씩 렌더하는 공통 로직
// reveal: 텍스트를 f/frameCount 비율로 글자 단위 공개
function _drawLines(ctx, text, style, f, frameCount) {
  const { color = '#ffffff', align = 'center', lineHeight = 1.2, letterSpacing = 0,
          shadow, stroke, reveal, typewriter } = style;
  const fontSize = style.fontSize ?? 48;

  ctx.font      = _cssFont(style);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';

  const lines = String(text ?? '').split('\n');
  const totalChars = lines.join('').length;

  // typewriter / reveal: 공개할 글자 수 결정
  let visibleChars = totalChars;
  if (typewriter || reveal) {
    const progress = frameCount <= 1 ? 1 : f / (frameCount - 1);
    visibleChars = Math.round(progress * totalChars);
  }

  const lh = fontSize * lineHeight;
  const totalH = lines.length * lh;
  let charIdx = 0;
  let startY = -totalH / 2;

  if (shadow) {
    ctx.shadowColor   = shadow.color   ?? 'rgba(0,0,0,0.5)';
    ctx.shadowOffsetX = shadow.offsetX ?? 2;
    ctx.shadowOffsetY = shadow.offsetY ?? 2;
    ctx.shadowBlur    = 0; // ctx.filter 미사용이므로 blur 없음
  }

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const y    = startY + li * lh;

    if (letterSpacing !== 0) {
      // 글자별 배치 (letterSpacing 적용)
      let curX = _lineStartX(ctx, line, letterSpacing, align);
      for (let ci = 0; ci < line.length; ci++) {
        if (charIdx >= visibleChars) break;
        const ch = line[ci];
        if (stroke) {
          ctx.strokeStyle = stroke.color ?? '#000000';
          ctx.lineWidth   = stroke.width ?? 2;
          ctx.strokeText(ch, curX, y);
        }
        ctx.fillText(ch, curX, y);
        curX += ctx.measureText(ch).width + letterSpacing;
        charIdx++;
      }
      if (charIdx >= visibleChars) break;
    } else {
      const visibleLine = line.slice(0, Math.max(0, visibleChars - charIdx));
      if (stroke) {
        ctx.strokeStyle = stroke.color ?? '#000000';
        ctx.lineWidth   = stroke.width ?? 2;
        ctx.strokeText(visibleLine, 0, y);
      }
      ctx.fillText(visibleLine, 0, y);
      charIdx += line.length;
      if (charIdx >= visibleChars) break;
    }
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
}

function _lineStartX(ctx, line, letterSpacing, align) {
  const totalW = [...line].reduce((s, ch) => s + ctx.measureText(ch).width + letterSpacing, 0);
  if (align === 'right')  return totalW / 2;
  if (align === 'left')   return -totalW / 2;
  return -totalW / 2; // center: 좌측부터
}

export function renderTextLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { pool, width, height, f, frameCount } = rctx;

  const text  = layer.text ?? '';
  const style = layer.style ?? {};

  const tmp  = pool.borrow(width, height);
  const tmpC = tmp.getContext('2d');

  tmpC.save();
  _applyTransform(tmpC, worldTr, width, height);
  _drawLines(tmpC, text, style, f, frameCount);
  tmpC.restore();

  if (layer.mask && rctx.renderMask) {
    const { sourceId, mode = 'alpha', invert = false, feather = 0 } = layer.mask;
    const sourceLayer = rctx.doc.layers[sourceId];
    if (sourceLayer) {
      const maskCanvas = rctx.renderMask(sourceLayer, f, width, height, { mode, invert, feather });
      if (maskCanvas) {
        tmpC.setTransform(1, 0, 0, 1, 0, 0);
        tmpC.globalAlpha = 1;
        tmpC.globalCompositeOperation = 'destination-in';
        tmpC.drawImage(maskCanvas, 0, 0);
        tmpC.globalCompositeOperation = 'source-over';
        pool.release(maskCanvas);
      }
    }
  }

  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = _blendOp(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
