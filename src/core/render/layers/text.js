// 텍스트 레이어 렌더러 — ctx.filter 미사용
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';

function _cssFont(size, weight, font) {
  return `${weight ?? 400} ${size ?? 48}px ${font ?? 'sans-serif'}`;
}

// 결정론 진행도 [0,1] — 렌더 경로라 Date.now/random 금지. loop: once(유지)/loop/pingpong.
function _progress(f, startF, endF, loop) {
  const dur = Math.max(1, (endF ?? 0) - (startF ?? 0));
  let t = (f - (startF ?? 0)) / dur;
  if (loop === 'loop')      t = ((t % 1) + 1) % 1;
  else if (loop === 'pingpong') { const m = ((t % 2) + 2) % 2; t = m > 1 ? 2 - m : m; }
  else                      t = Math.max(0, Math.min(1, t)); // once
  return t;
}
function _smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

function _drawLines(ctx, layer, f, frameCount) {
  const text         = layer.text         ?? '';
  const color        = layer.color        ?? '#ffffff';
  const align        = layer.align        ?? 'center';
  const lineHeight   = layer.lineHeight   ?? 1.2;
  const letterSpacing = layer.letterSpacing ?? 0;
  const shadow       = layer.shadow;
  const stroke       = layer.stroke;
  const reveal       = layer.reveal;
  const charAnim     = layer.charAnim;
  const fontSize     = layer.size         ?? 48;

  ctx.font         = _cssFont(layer.size, layer.weight, layer.font);
  ctx.fillStyle    = color;
  ctx.textAlign    = align;
  ctx.textBaseline = 'top';

  const lines      = String(text).split('\n');
  const totalChars = lines.join('').length;

  if (shadow) {
    ctx.shadowColor   = shadow.color   ?? 'rgba(0,0,0,0.5)';
    ctx.shadowOffsetX = shadow.offsetX ?? 2;
    ctx.shadowOffsetY = shadow.offsetY ?? 2;
    ctx.shadowBlur    = shadow.blur    ?? 0;   // 그림자 흐림(F1) — ctx.shadowBlur 은 사파리도 지원
  }

  const lh     = fontSize * lineHeight;
  const totalH = lines.length * lh;
  const startY = -totalH / 2;

  // 타자기: 공개된 글자 수(글자/단어 단위). reveal 없으면 전부.
  let visibleChars = totalChars;
  if (reveal) {
    const p = _progress(f, reveal.startF ?? 0, reveal.endF ?? (frameCount - 1), reveal.loop ?? 'once');
    if ((reveal.mode ?? 'char') === 'word') visibleChars = _wordReveal(lines, p);
    else visibleChars = Math.round(p * totalChars);
  }

  // 글자별 애니메이션이 있으면 글자마다 alpha/translate/scale 을 달리 적용(char-by-char).
  const perChar = !!charAnim || letterSpacing !== 0 || !!reveal;

  if (!perChar) {
    // 정적 빠른 경로(기존과 동일)
    for (let li = 0; li < lines.length; li++) {
      const y = startY + li * lh;
      if (stroke) { ctx.strokeStyle = stroke.color ?? '#000000'; ctx.lineWidth = stroke.width ?? 2; ctx.strokeText(lines[li], 0, y); }
      ctx.fillText(lines[li], 0, y);
    }
    _clearShadow(ctx);
    return;
  }

  // char-by-char
  const animP = charAnim ? _progress(f, charAnim.startF ?? 0, charAnim.endF ?? (frameCount - 1), charAnim.loop ?? 'once') : 1;
  const stagger = Math.max(0, Math.min(0.95, charAnim?.stagger ?? 0.7));
  const type = charAnim?.type ?? 'fade';

  let charIdx = 0;
  const baseAlpha = ctx.globalAlpha;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const y = startY + li * lh;
    let curX = _lineStartX(ctx, line, letterSpacing, align);
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left'; // 수동 배치
    for (let ci = 0; ci < line.length; ci++) {
      const globalIdx = charIdx;
      charIdx++;
      const ch = line[ci];
      const chW = ctx.measureText(ch).width;
      if (globalIdx >= visibleChars) { curX += chW + letterSpacing; continue; }

      let a = baseAlpha, dx = 0, dy = 0, sc = 1;
      if (charAnim) {
        const t0 = totalChars <= 1 ? 0 : stagger * (globalIdx / (totalChars - 1));
        const lp = _smooth((animP - t0) / Math.max(0.01, 1 - stagger));
        a = baseAlpha * lp;
        if (type === 'slideup') dy = (1 - lp) * fontSize * 0.6;
        else if (type === 'pop') sc = 0.2 + 0.8 * lp;
      }
      if (a <= 0.003) { curX += chW + letterSpacing; continue; }

      ctx.save();
      ctx.globalAlpha = a;
      const cx = curX + chW / 2;
      ctx.translate(cx, y + fontSize / 2 + dy);
      if (sc !== 1) ctx.scale(sc, sc);
      if (stroke) { ctx.strokeStyle = stroke.color ?? '#000000'; ctx.lineWidth = stroke.width ?? 2; ctx.strokeText(ch, -chW / 2, -fontSize / 2); }
      ctx.fillText(ch, -chW / 2, -fontSize / 2);
      ctx.restore();
      curX += chW + letterSpacing;
    }
    ctx.textAlign = prevAlign;

    // 커서(타자기): 공개가 끝나지 않았으면 마지막 글자 뒤에 깜빡이는 막대
    if (reveal?.cursor && visibleChars < totalChars && charIdx >= visibleChars && charIdx - line.length < visibleChars) {
      const blink = (f % 12) < 6 ? 1 : 0.15;
      ctx.save(); ctx.globalAlpha = baseAlpha * blink; ctx.fillRect(curX, y, Math.max(2, fontSize * 0.06), fontSize); ctx.restore();
    }
  }
  _clearShadow(ctx);
}

function _wordReveal(lines, p) {
  // 단어 단위 공개 → 공개된 '글자 수'로 환산
  const flat = lines.join('\n');
  const words = flat.split(/(\s+)/); // 공백 보존
  const realWords = words.filter((w) => w.trim().length);
  const showW = Math.round(p * realWords.length);
  let shown = 0, chars = 0, done = 0;
  for (const tok of words) {
    if (tok.trim().length) { if (done >= showW) break; done++; }
    chars += tok.length;
  }
  return chars;
}
function _clearShadow(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 0; }

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
    ? Math.abs(layer.shadow.offsetX ?? 0) + Math.abs(layer.shadow.offsetY ?? 0) + (layer.shadow.blur ?? 0) + 4
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
  const { pool, cache, width, height, viewOffsetX = 0, viewOffsetY = 0, f, frameCount } = rctx;

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

  // 동적 텍스트(reveal/charAnim) 또는 마스크: view 크기 작업 캔버스
  const tmpW = width;
  const tmpH = height;
  const tmp  = pool.borrow(tmpW, tmpH);
  const tmpC = tmp.getContext('2d');

  tmpC.save();
  tmpC.translate(-viewOffsetX, -viewOffsetY);
  applyTransform(tmpC, worldTr);
  _drawLines(tmpC, layer, f, frameCount);
  tmpC.restore();  // identity로 복원

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

  // tmp는 물리 픽셀 기준 — outputCtx를 identity로 리셋 후 blit
  outputCtx.save();
  outputCtx.setTransform(1, 0, 0, 1, 0, 0);
  outputCtx.globalAlpha = totalAlpha;
  outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
  outputCtx.drawImage(tmp, 0, 0);
  outputCtx.restore();
  pool.release(tmp);
}
