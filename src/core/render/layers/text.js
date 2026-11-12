// 텍스트 레이어 렌더러 — ctx.filter 미사용
import { applyTransform } from '../matrix.js';
import { blendToComposite } from '../blend.js';
import { hasActiveFx, drawLeafWithFx } from '../fx-stack.js';
import { hasActiveMasks } from '../shape-mask.js';

function _cssFont(size, weight, font) {
  return `${weight ?? 400} ${size ?? 48}px ${font ?? 'sans-serif'}`;
}

// 폭 실측용 ctx — 모듈에서 한 번만 만든다(렌더마다 새로 만들지 않음, 렌더 규칙 4).
// core 는 DOM 을 못 쓰므로 OffscreenCanvas 를 쓴다(Worker·테스트에서도 동작).
let _measureCtx = null;
function _getMeasureCtx() {
  if (!_measureCtx && typeof OffscreenCanvas !== 'undefined') {
    _measureCtx = new OffscreenCanvas(1, 1).getContext('2d');
  }
  return _measureCtx;
}

// 한 줄의 실제 폭(px). letterSpacing 은 글자 사이에만(마지막 글자 뒤 제외) 더한다.
function _measureLineWidth(mctx, line, letterSpacing) {
  const chars = [...line];
  if (!chars.length) return 0;
  let w = 0;
  for (const ch of chars) w += mctx.measureText(ch).width;
  return w + letterSpacing * Math.max(0, chars.length - 1);
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

// shadowScale: 캔버스 그림자는 CTM 축척을 안 따르므로, ctx 가 이미 scale 된 경로(동적)에서는
//   그림자 거리·흐림에 배율을 곱해 정적 경로(1배로 굽고 blit 때 확대)와 같은 크기로 보이게 한다.
function _drawLines(ctx, layer, f, frameCount, shadowScale = 1) {
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
  const totalChars = lines.reduce((s, l) => s + [...l].length, 0);  // 코드포인트 기준

  if (shadow) {
    ctx.shadowColor   = shadow.color   ?? 'rgba(0,0,0,0.5)';
    ctx.shadowOffsetX = (shadow.offsetX ?? 2) * shadowScale;
    ctx.shadowOffsetY = (shadow.offsetY ?? 2) * shadowScale;
    ctx.shadowBlur    = (shadow.blur    ?? 0) * shadowScale;   // 그림자 흐림(F1) — ctx.shadowBlur 은 사파리도 지원
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
    const chars = [...line];  // 이모지 등 2칸 문자를 쪼개지 않음(_lineStartX 와 기준 일치)
    const y = startY + li * lh;
    let curX = _lineStartX(ctx, line, letterSpacing, align);
    const prevAlign = ctx.textAlign;
    ctx.textAlign = 'left'; // 수동 배치
    for (let ci = 0; ci < chars.length; ci++) {
      const globalIdx = charIdx;
      charIdx++;
      const ch = chars[ci];
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
    if (reveal?.cursor && visibleChars < totalChars && charIdx >= visibleChars && charIdx - chars.length < visibleChars) {
      const blink = (f % 12) < 6 ? 1 : 0.15;
      ctx.save(); ctx.globalAlpha = baseAlpha * blink; ctx.fillRect(curX, y, Math.max(2, fontSize * 0.06), fontSize); ctx.restore();
    }
  }
  _clearShadow(ctx);
}

function _wordReveal(lines, p) {
  // 단어 단위 공개 → 공개된 '글자 수'로 환산.
  // globalIdx 는 줄바꿈을 세지 않으므로(줄마다 charIdx 누적) 여기서도 '\n' 을 빼고 센다.
  const flat = lines.join('\n');
  const words = flat.split(/(\s+)/); // 공백 보존
  const realWords = words.filter((w) => w.trim().length);
  const showW = Math.round(p * realWords.length);
  let chars = 0, done = 0;
  for (const tok of words) {
    if (tok.trim().length) { if (done >= showW) break; done++; }
    chars += [...tok.replace(/\n/g, '')].length;  // 줄바꿈 제외, 코드포인트 기준
  }
  return chars;
}
function _clearShadow(ctx) { ctx.shadowColor = 'transparent'; ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 0; }

// 글자별 그리기 경로의 줄 시작 x (앵커 원점 기준, 첫 글자의 왼쪽 끝).
//   left:   0            (앵커에서 오른쪽으로)
//   center: -totalW/2
//   right:  -totalW      (앵커에서 왼쪽으로, 끝이 앵커)
// totalW 는 글자 사이 간격만 더한다(마지막 글자 뒤 간격 제외).
function _lineStartX(ctx, line, letterSpacing, align) {
  const totalW = _measureLineWidth(ctx, line, letterSpacing);
  if (align === 'right')  return -totalW;
  if (align === 'center') return -totalW / 2;
  return 0;
}

function _textCacheKey(layer) {
  return `${layer.id}:text:${layer.text}:${layer.size}:${layer.weight}:${layer.font}` +
    `:${layer.color}:${layer.align}:${layer.lineHeight}:${layer.letterSpacing}` +
    `:${JSON.stringify(layer.stroke)}:${JSON.stringify(layer.shadow)}`;
}

// 텍스트 레이아웃 — measureText 로 실측한다. core 는 DOM 을 못 쓰므로 모듈 측정용
// OffscreenCanvas 를 재사용한다. 측정 ctx 가 없으면(사파리 Worker 등) 보수적으로 어림한다.
//   반환:
//     cw, ch           콘텐츠 캔버스 크기(여백 포함)
//     anchorX, anchorY 캔버스 안에서 앵커(transform 점)의 위치 = 그리기 원점 = blit 오프셋
//     W, H             여백 뺀 글자 블록 크기(실측)
//     boxOx, boxOy     선택 상자 중심이 앵커에서 떨어진 거리(정렬 반영)
// 레이아웃 캐시 — measureTextBounds(선택 상자)가 포인터 움직임마다 글자를 다시 재지 않도록.
// 콘텐츠 캐시와 같은 키. 폰트 로딩 완료 시 clearTextLayoutCache()로 비운다(폭이 달라지므로).
const _layoutCache = new Map();
export function clearTextLayoutCache() { _layoutCache.clear(); _stepLru.clear(); }

// R8-2: 렌더 배율을 단계로 맞춰 그 단계로 굽는다(글자가 확대·2배 내보내기에서 선명하게).
//   실제 배율 이상인 것 중 가장 작은 단계를 고르고, 4 초과는 4.
const _SCALE_STEPS = [0.5, 1, 1.5, 2, 3, 4];
function _scaleStep(s) {
  if (!(s > 0)) return 1;
  if (s >= 4) return 4;
  for (const step of _SCALE_STEPS) if (step >= s - 1e-6) return step;
  return 4;
}
// 레이어당 캐시된 단계는 2개까지만 — 미리보기를 확대해도 캐시가 무한히 늘지 않게.
const _stepLru = new Map(); // layerId -> [cacheKey, ...] (최근이 뒤)
function _rememberStep(cache, layerId, key) {
  let arr = (_stepLru.get(layerId) ?? []).filter((k) => k !== key);
  arr.push(key);
  while (arr.length > 2) { const old = arr.shift(); cache.del?.(old); }
  _stepLru.set(layerId, arr);
}

function _textLayout(layer) {
  const key = _textCacheKey(layer);
  const cached = _layoutCache.get(key);
  if (cached) return cached;
  const layout = _computeTextLayout(layer);
  if (_layoutCache.size > 256) _layoutCache.clear(); // 무한 증가 방지(간단 상한)
  _layoutCache.set(key, layout);
  return layout;
}

function _computeTextLayout(layer) {
  const text     = String(layer.text ?? '');
  const lines    = text.split('\n');
  const fontSize = layer.size ?? 48;
  const lineH    = layer.lineHeight ?? 1.2;
  const lSpacing = layer.letterSpacing ?? 0;
  const align    = layer.align ?? 'center';

  const mctx = _getMeasureCtx();
  let W = 1;
  if (mctx) {
    mctx.font = _cssFont(layer.size, layer.weight, layer.font);
    for (const line of lines) {
      const w = _measureLineWidth(mctx, line, Math.abs(lSpacing));
      if (w > W) W = w;
    }
  } else {
    // 폴백: 실측 불가 시 보수적 어림(한국어/CJK 포함)
    const maxLen = Math.max(1, ...lines.map((l) => [...l].length));
    W = Math.max(1, fontSize * 1.1 * maxLen + Math.abs(lSpacing) * maxLen);
  }
  const H = lines.length * fontSize * lineH;

  const strokePad = layer.stroke?.width ? Math.ceil(layer.stroke.width) + 4 : 4;
  const shadowPad = layer.shadow
    ? Math.abs(layer.shadow.offsetX ?? 0) + Math.abs(layer.shadow.offsetY ?? 0) + (layer.shadow.blur ?? 0) + 4
    : 0;
  const pad = strokePad + shadowPad;

  // 앵커(0,0) 기준 글자 x 범위 — 정렬에 따라 한쪽으로 뻗는다.
  let xmin, xmax, boxOx;
  if (align === 'left')       { xmin = 0;      xmax = W;   boxOx =  W / 2; }
  else if (align === 'right') { xmin = -W;     xmax = 0;   boxOx = -W / 2; }
  else                        { xmin = -W / 2; xmax = W / 2; boxOx = 0; }
  const ymin = -H / 2, ymax = H / 2;

  const cw = Math.max(1, Math.ceil((xmax - xmin) + pad * 2));
  const ch = Math.max(1, Math.ceil((ymax - ymin) + pad * 2));
  const anchorX = -xmin + pad;  // 캔버스 안 앵커 위치
  const anchorY = -ymin + pad;

  return { cw, ch, anchorX, anchorY, W, H, boxOx, boxOy: 0, pad };
}

// 외부 공개: hit.js 선택 상자가 실측 폭·정렬 기준점을 쓰도록 export.
//   w/h = 실측 글자 블록 크기, ox/oy = 상자 중심이 앵커에서 떨어진 거리(정렬 반영).
export function measureTextBounds(layer) {
  const { W, H, boxOx, boxOy, pad } = _textLayout(layer);
  return { w: W + pad, h: H + pad, ox: boxOx, oy: boxOy };
}

export function renderTextLayer(outputCtx, layer, worldTr, totalAlpha, rctx) {
  const { pool, cache, width, height, viewOffsetX = 0, viewOffsetY = 0, f, frameCount } = rctx;

  const isStatic = !layer.reveal && !layer.charAnim;
  const hasMask  = !!(layer.mask && rctx.renderMask);

  // R17: 쌓은 효과 — 글자를 레이어 자체 좌표에 해상도 k 로 구워(확대해도 선명) 효과 적용 뒤 변형·블렌드. R21: 가리기도.
  if (hasActiveFx(layer, rctx.effects) || hasActiveMasks(layer)) {
    const layout = _textLayout(layer);
    drawLeafWithFx(outputCtx, (k) => {
      const cw = Math.max(1, Math.ceil(layout.cw * k));
      const ch = Math.max(1, Math.ceil(layout.ch * k));
      const cc = pool.borrow(cw, ch);
      const ccx = cc.getContext('2d');
      ccx.save();
      ccx.scale(k, k);
      ccx.translate(layout.anchorX, layout.anchorY);
      _drawLines(ccx, layer, f, frameCount);
      ccx.restore();
      return { canvas: cc, srcCw: cw, srcCh: ch, release: () => pool.release(cc) };
    }, { dW: layout.cw, dH: layout.ch, ox: layout.anchorX, oy: layout.anchorY },
      layer, worldTr, totalAlpha, rctx);
    return;
  }

  if (isStatic && !hasMask) {
    // R8-2: 화면 배율(worldTr.scale = renderScale×카메라줌×레이어scale)을 단계로 맞춰 그 단계로 굽는다.
    //   step=1 이면 예전과 픽셀 단위로 같다.
    const step = _scaleStep(worldTr.scale ?? 1);
    const cacheKey = _textCacheKey(layer) + ':s' + step;
    let contentCanvas = cache?.get(cacheKey);
    if (!contentCanvas) {
      const layout = _textLayout(layer);
      const cw  = Math.max(1, Math.ceil(layout.cw * step));
      const ch  = Math.max(1, Math.ceil(layout.ch * step));
      const cc  = pool.borrow(cw, ch);
      const ccx = cc.getContext('2d');
      ccx.save();
      ccx.scale(step, step);                          // 단계 해상도로 굽는다(글자·외곽선·그림자·여백 모두 × 단계)
      ccx.translate(layout.anchorX, layout.anchorY);  // 원점 = 앵커(transform 점), 1배 좌표
      _drawLines(ccx, layer, f, frameCount);
      ccx.restore();
      contentCanvas = cc;
      contentCanvas._layout = { cw, ch, anchorX: layout.anchorX * step, anchorY: layout.anchorY * step, step };
      cache?.set(cacheKey, contentCanvas);
      if (cache) _rememberStep(cache, layer.id, cacheKey);
    }

    const { cw, ch, anchorX, anchorY, step: st } = contentCanvas._layout;

    outputCtx.save();
    applyTransform(outputCtx, worldTr, { top: -anchorY / st, bottom: (ch - anchorY) / st });
    outputCtx.scale(1 / st, 1 / st);                  // 단계로 키운 콘텐츠를 1/단계로 줄여 같은 크기로(선명하게)
    outputCtx.globalAlpha = totalAlpha;
    outputCtx.globalCompositeOperation = blendToComposite(layer.blend);
    // 앵커가 worldTr 원점에 오도록 캔버스의 cw×ch 영역만 그린다(풀 캔버스가 더 클 수 있음).
    outputCtx.drawImage(contentCanvas, 0, 0, cw, ch, -anchorX, -anchorY, cw, ch);
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
  // 동적 경로는 ctx 가 worldTr.scale 로 축척된 상태 — 그림자에 같은 배율을 곱해 정적 경로와 크기 일치
  _drawLines(tmpC, layer, f, frameCount, worldTr.scale ?? 1);
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
