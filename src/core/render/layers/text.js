// 텍스트 레이어 렌더러 — ctx.filter 미사용
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';

function _cssFont(size, weight, font) {
  return `${weight ?? 400} ${size ?? 48}px ${font ?? 'sans-serif'}`;
}

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

function _textCacheKey(layer) {
  return `${layer.id}:text:${layer.text}:${layer.size}:${layer.weight}:${layer.font}` +
    `:${layer.color}:${layer.align}:${layer.lineHeight}:${layer.letterSpacing}` +
    `:${JSON.stringify(layer.stroke)}:${JSON.stringify(layer.shadow)}`;
}

// 콘텐츠 캔버스 크기 추정 — core에서 DOM 없이 계산 (한국어/CJK 포함 보수적 추정)
function _textContentSize(layer) {
  const text      = String(layer.text ?? '');
  const lines     = text.split('\n');
  const fontSize  = layer.size ?? 48;
  const lineH     = layer.lineHeight ?? 1.2;
  const lSpacing  = layer.letterSpacing ?? 0;
  const maxLen    = Math.max(1, ...lines.map(l => l.length));
  const strokePad = layer.stroke?.width ? Math.ceil(layer.stroke.width) + 4 : 4;
  const shadowPad = layer.shadow
    ? Math.abs(layer.shadow.offsetX ?? 0) + Math.abs(layer.shadow.offsetY ?? 0) + 4
    : 0;
  const pad = strokePad + shadowPad;
  const cw = Math.max(1, Math.ceil(fontSize * 1.8 * maxLen + lSpacing * maxLen + pad * 2));
  const ch = Math.max(1, Math.ceil(lines.length * fontSize * lineH + pad * 2));
  return { cw, ch };
}

// 외부 공개: renderer와 hit.js가 동일한 추정값을 쓰도록 export
export function measureTextBounds(layer) {
  const { cw, ch } = _textContentSize(layer);
  return { w: cw, h: ch };
}

export function renderTextLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { pool, cache, docWidth, docHeight, width, height, f, frameCount } = rctx;

  const isStatic = !layer.reveal && !layer.charAnim;
  const hasMask  = !!(layer.mask && rctx.renderMask);

  if (isStatic && !hasMask) {
    const cacheKey = _textCacheKey(layer);
    let contentCanvas = cache?.get(cacheKey);
    if (!contentCanvas) {
      const { cw, ch } = _textContentSize(layer);
      const cc  = pool.borrow(cw, ch);
      const ccx = cc.getContext('2d');
      ccx.save();
      ccx.translate(cw / 2, ch / 2);
      _drawLines(ccx, layer, f, frameCount);
      ccx.restore();
      contentCanvas = cc;
      cache?.set(cacheKey, contentCanvas);
    }

    const cw = contentCanvas.width;
    const ch = contentCanvas.height;

    outputCtx.save();
    applyTransform(outputCtx, worldTr);
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    outputCtx.drawImage(contentCanvas, -cw / 2, -ch / 2);
    outputCtx.restore();
    return;
  }

  // 동적 텍스트(reveal/charAnim) 또는 마스크: 전체 문서 크기 작업 캔버스
  const tmpW = docWidth  ?? width;
  const tmpH = docHeight ?? height;
  const tmp  = pool.borrow(tmpW, tmpH);
  const tmpC = tmp.getContext('2d');

  tmpC.save();
  applyTransform(tmpC, worldTr);
  _drawLines(tmpC, layer, f, frameCount);
  tmpC.restore();

  if (layer.mask && rctx.renderMask) {
    const { sourceId, mode = 'alpha', invert = false, feather = 0 } = layer.mask;
    const sourceLayer = rctx.doc.layers[sourceId];
    if (sourceLayer) {
      const maskCanvas = rctx.renderMask(sourceLayer, f, tmpW, tmpH, { mode, invert, feather });
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

  // setTransform 리셋 없음 — outputCtx의 view 오프셋 translate 유지
  outputCtx.save();
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
