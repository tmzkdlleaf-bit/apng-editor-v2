// 타임라인 트랙 그리기 — 무상태 그리기·기하 함수만 모은다(상호작용·드래그 상태는 track-canvas.js).
//   (R23d item 12: track-canvas.js 에서 떼어냄, 동작 동일)
import { animatedProps } from './rows.js';
import { getProp } from '../../core/anim/props.js';
import motionRegistry from '../../motions/registry.js';

export const ROW_H    = 28;  // C3: 28px
export const HEAD_H   = 24;
export const HANDLE_W = 10;  // 스트레치 핸들 폭 (px)

function _motionsGet(id) { return motionRegistry.get(id); }

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function selKey(id, path, f) { return `${id}|${path}|${f}`; }
export function selSet(es) {
  const s = new Set();
  for (const r of es.kfSelection) s.add(selKey(r.id, r.path, r.f));
  return s;
}

// 레이어의 키 있는 속성 프레임 전부 (합집합) — 변형 + 효과 수치(paramAnim)
export function mergedKeyFrames(layer) {
  const set = new Set();
  for (const p of animatedProps(layer)) {
    if (p.remap) continue; // 다시 매기기 키는 레이어 병합 줄에 섞지 않는다(끌 수 없음)
    for (const kf of (getProp(layer, p.path)?.keys ?? [])) set.add(kf.f);
  }
  return set;
}

export function camKeyFrames(doc) {
  const set = new Set();
  for (const k of ['x', 'y', 'zoom']) {
    for (const kf of (doc.camera?.[k]?.keys ?? [])) set.add(kf.f);
  }
  return set;
}

function diamond(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy);
  ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy);
  ctx.closePath();
}

// R19-3: 키 모양으로 이징 종류 구분 — 일정(linear)=마름모, 곡선(cubicBezier)=모래시계,
//   정지(hold)=네모, 이름 이징=원.
function keyShape(ctx, cx, cy, s, ease) {
  if (ease === 'hold') { ctx.beginPath(); ctx.rect(cx - s, cy - s, s * 2, s * 2); return; }
  if (ease === 'cubicBezier') { // 모래시계(bowtie)
    ctx.beginPath();
    ctx.moveTo(cx - s, cy - s); ctx.lineTo(cx + s, cy - s);
    ctx.lineTo(cx - s, cy + s); ctx.lineTo(cx + s, cy + s);
    ctx.closePath(); return;
  }
  if (ease && ease !== 'linear') { ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); return; }
  diamond(ctx, cx, cy, s);
}

export function drawHeader(ctx, { fc, curF, totalW, pxPerF }) {
  const frameToX = (f) => f * pxPerF + pxPerF / 2;
  const bgColor   = cssVar('--tl')    || '#1a1c1f';
  const textColor = cssVar('--dim')   || '#9a9ea6';
  const accColor  = cssVar('--acc')   || '#f0a35e';
  const lineColor = cssVar('--line2') || '#2b2e33';

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, totalW, HEAD_H);
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';

  // 눈금 간격 — 칸 폭(pxPerF)에 맞춰 라벨이 겹치지 않는 가장 촘촘한 단계. (item 5)
  let step = 1;
  for (const s of [1, 2, 5, 10, 20, 50, 100]) { if (s * pxPerF >= 32) { step = s; break; } step = s; }
  for (let f = 0; f < fc; f += step) {
    const x = frameToX(f);
    ctx.fillStyle = lineColor;
    ctx.fillRect(x, HEAD_H - 6, 1, 6);
    ctx.fillStyle = textColor;
    ctx.fillText(String(f), x, HEAD_H - 8);
  }

  const px = frameToX(curF);
  ctx.fillStyle = accColor;
  ctx.fillRect(px - 1, 0, 2, HEAD_H);
  ctx.beginPath();
  ctx.moveTo(px - 5, 0); ctx.lineTo(px + 5, 0); ctx.lineTo(px, 8);
  ctx.closePath(); ctx.fill();
}

export function drawBody(ctx, { doc, rows, es, fc, totalW, totalH, pxPerF, boxSel, keyX, handleRectForRow }) {
  const frameToX = (f) => f * pxPerF + pxPerF / 2;
  const bgColor   = cssVar('--tl')      || '#1a1c1f';
  const lineColor = cssVar('--rowline') || '#24272b';
  const line2     = cssVar('--line2')   || '#2b2e33';
  const accColor  = cssVar('--acc')     || '#f0a35e';
  const clipBg    = cssVar('--clipbg')  || '#4a3524';
  const clipTextColor = cssVar('--cliptext') || '#f5d3b0';
  const selRow    = cssVar('--selrow')  || '#2a241e';
  const dimColor  = cssVar('--dim')     || '#9a9ea6';

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, totalW, totalH);

  const sel    = new Set(es.selection);
  const sSet   = selSet(es);

  ctx.fillStyle = line2;
  for (let f = 0; f < fc; f++) {
    if (f % 5 === 0) ctx.fillRect(f * pxPerF, 0, 1, totalH);
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const y0  = i * ROW_H;
    const cy  = y0 + ROW_H / 2;

    if (row.kind === 'camera') {
      for (const f of camKeyFrames(doc)) {
        if (f < 0 || f >= fc) continue;
        ctx.fillStyle = dimColor;
        diamond(ctx, frameToX(f), cy, 5); ctx.fill();
      }
      ctx.fillStyle = lineColor;
      ctx.fillRect(0, y0 + ROW_H - 1, totalW, 1);
      continue;
    }

    const layer = doc.layers[row.id];
    if (!layer) continue;

    if (row.kind === 'layer' && sel.has(row.id)) {
      ctx.fillStyle = selRow;
      ctx.fillRect(0, y0, totalW, ROW_H);
    }

    // 클립 (레이어 행만) — 창(winStart/winEnd) 기준 막대 + 프리셋 이름 + 루프 표시
    if (row.kind === 'layer' && layer.clips?.length) {
      for (const clip of layer.clips) {
        const ws = clip.winStart ?? clip.start;
        const we = clip.winEnd ?? (clip.start + clip.length);
        const x  = ws * pxPerF;
        const cw = (we - ws) * pxPerF;
        ctx.fillStyle = clipBg;
        ctx.fillRect(x + 1, y0 + 4, cw - 2, ROW_H - 8);
        ctx.fillStyle = accColor;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(x, y0 + 4, 3, ROW_H - 8);
        ctx.fillRect(x + cw - 3, y0 + 4, 3, ROW_H - 8);
        ctx.globalAlpha = 1;
        // 프리셋 이름 + 루프(↻)
        const mot = _motionsGet(clip.motionId);
        const label = (clip.loop ? '↻ ' : '') + (mot?.name ?? clip.motionId ?? '');
        if (label && cw > 24) {
          ctx.save();
          ctx.beginPath(); ctx.rect(x + 4, y0, cw - 8, ROW_H); ctx.clip();
          ctx.fillStyle = clipTextColor;
          ctx.font = '10px ' + (cssVar('--font-ui') || 'sans-serif');
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x + 6, cy);
          ctx.restore();
        }
      }
    }

    // 키프레임 — 속성 행은 이징 종류로 모양을 구분(R19-3), 레이어 병합 행은 마름모.
    if (row.kind === 'prop') {
      // 다시 매기기 줄은 바깥 f 로 바로 그리고 흐리게(끌 수 없음). 그 밖은 바깥 위치로 변환.
      ctx.globalAlpha = row.remap ? 0.4 : 1;
      for (const k of (getProp(layer, row.path)?.keys ?? [])) {
        if (k.f < 0 || k.f >= fc) continue;
        const isSel = !row.remap && sSet.has(selKey(row.id, row.path, k.f));
        keyShape(ctx, keyX(doc, row.id, k.f, row.remap), cy, 4, k.ease);
        ctx.fillStyle = isSel ? '#ffffff' : accColor;
        ctx.fill();
        if (isSel) { ctx.strokeStyle = accColor; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    } else {
      for (const f of mergedKeyFrames(layer)) {
        if (f < 0 || f >= fc) continue;
        const isSel = animatedProps(layer).some(p => !p.remap && sSet.has(selKey(row.id, p.path, f)));
        diamond(ctx, keyX(doc, row.id, f, false), cy, 5);
        ctx.fillStyle = isSel ? '#ffffff' : accColor;
        ctx.fill();
        if (isSel) { ctx.strokeStyle = accColor; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
    }

    // 스트레치 핸들
    const handle = handleRectForRow(row, es);
    if (handle) {
      ctx.fillStyle = accColor;
      ctx.fillRect(handle.x, y0 + 6, HANDLE_W, ROW_H - 12);
    }

    ctx.fillStyle = lineColor;
    ctx.fillRect(0, y0 + ROW_H - 1, totalW, 1);
  }

  // 재생선
  const px = frameToX(es.f);
  ctx.fillStyle = accColor;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(px - 1, 0, 2, totalH);
  ctx.globalAlpha = 1;

  // 박스 선택 사각형
  if (boxSel) {
    const bx = Math.min(boxSel.x0, boxSel.x1);
    const by = Math.min(boxSel.y0, boxSel.y1);
    const bw = Math.abs(boxSel.x1 - boxSel.x0);
    const bh = Math.abs(boxSel.y1 - boxSel.y0);
    ctx.strokeStyle = accColor;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = accColor;
    ctx.fillRect(bx, by, bw, bh);
    ctx.globalAlpha = 1;
  }
}
