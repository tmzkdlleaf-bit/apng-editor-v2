// 텍스트 레이어 렌더러 — ctx.filter 미사용
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';

function _cssFont(size, weight, font) {
  return `${weight ?? 400} ${size ?? 48}px ${font ?? 'sans-serif'}`;
}

// 한 줄씩 렌더하는 공통 로직
function _drawLines(ctx, layer, f, frameCount) {
  const text         = layer.text         ?? '';
  const color        = layer.color        ?? '#ffffff';
  const align        = layer.align        ?? 'center';
  const lineHeight   = layer.lineHeight   ?? 1.2;
  const letterSpacing = layer.letterSpacing ?? 0;
  const shadow       = layer.shadow;
  const stroke       = layer.stroke;
  const reveal       = layer.reveal;
  const fontSize     = layer.size         ?? 48;

  ctx.font         = _cssFont(layer.size, layer.weight, layer.font);
  ctx.fillStyle    = color;
  ctx.textAlign    = align;
  ctx.textBaseline = 'top';

  const lines      = String(text).split('\n');
  const totalChars = lines.join('').length;

  let visibleChars = totalChars;
  if (reveal) {
    const progress = frameCount <= 1 ? 1 : f / (frameCount - 1);
    visibleChars = Math.round(progress * totalChars);
  }

  const lh     = fontSize * lineHeight;
  const totalH = lines.length * lh;
  let charIdx  = 0;
  let startY   = -totalH / 2;

  if (shadow) {
    ctx.shadowColor   = shadow.color   ?? 'rgba(0,0,0,0.5)';
    ctx.shadowOffsetX = shadow.offsetX ?? 2;
    ctx.shadowOffsetY = shadow.offsetY ?? 2;
    ctx.shadowBlur    = 0;
  }

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const y    = startY + li * lh;

    if (letterSpacing !== 0) {
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
  if (align === 'right') return  totalW / 2;
  return -totalW / 2;
}

export function renderTextLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { pool, width, height, f, frameCount } = rctx;

  const tmp  = pool.borrow(width, height);
  const tmpC = tmp.getContext('2d');

  tmpC.save();
  applyTransform(tmpC, worldTr);
  _drawLines(tmpC, layer, f, frameCount);
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
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
