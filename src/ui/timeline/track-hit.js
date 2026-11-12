// 타임라인 트랙 히트 테스트 — 눌린 자리가 키·클립 끝·스트레치 핸들·빈칸 중 무엇인지.
//   track-canvas.js 에서 나눴다(R23d item 12). g = { pxPerF, frameToX, xToFrame, keyX }.
import { animatedProps } from './rows.js';
import { getProp } from '../../core/anim/props.js';
import { ROW_H, HANDLE_W, mergedKeyFrames } from './track-draw.js';

export const KF_HIT   = 7;   // 키프레임 히트 반경 (px)
export const CLIP_HIT = 6;   // 클립 끝단 히트 폭 (px)

// ── 히트 테스트 ───────────────────────────────────────────────────────
// 반환: { kind:'keyframe'|'clip-start'|'clip-end'|'handle'|'empty', ... }
export function hitTest(x, y, doc, es, rows, g) {
  const rowI = Math.floor(y / ROW_H);
  const fc   = doc.meta.frameCount ?? 1;
  if (rowI < 0 || rowI >= rows.length) return { kind: 'empty', f: g.xToFrame(x), rowI };
  const row = rows[rowI];
  const y0  = rowI * ROW_H;

  // 스트레치 핸들 (선택 키가 이 행에 2개 이상일 때)
  const handle = handleRectForRow(row, es, g);
  if (handle && x >= handle.x && x <= handle.x + HANDLE_W
      && y >= y0 + 4 && y <= y0 + ROW_H - 4) {
    return { kind: 'handle', row, minF: handle.minF, maxF: handle.maxF };
  }

  // 키프레임
  if (row.kind === 'layer') {
    const layer = doc.layers[row.id];
    if (layer) {
      // 클립 끝단 → 트림, 가운데 → 몸통(선택/메뉴)
      if (layer.clips?.length) {
        for (const clip of layer.clips) {
          const ws = clip.winStart ?? clip.start;
          const we = clip.winEnd ?? (clip.start + clip.length);
          const x0 = ws * g.pxPerF;
          const x1 = we * g.pxPerF;
          if (Math.abs(x - x0) <= CLIP_HIT) return { kind: 'clip-start', id: row.id, clipId: clip.id, origStart: clip.start, origLength: clip.length };
          if (Math.abs(x - x1) <= CLIP_HIT) return { kind: 'clip-end',   id: row.id, clipId: clip.id, origStart: clip.start, origLength: clip.length };
          if (x > x0 && x < x1) return { kind: 'clip-body', id: row.id, clipId: clip.id };
        }
      }
      for (const f of mergedKeyFrames(layer)) {
        if (f < 0 || f >= fc) continue;
        if (Math.abs(x - g.keyX(doc, row.id, f, false)) <= KF_HIT) {
          // 이 프레임의 모든 키 있는 속성 ref(다시 매기기 줄은 제외 — 끌 수 없음)
          const refs = animatedProps(layer)
            .filter(p => !p.remap && (getProp(layer, p.path)?.keys ?? []).some(k => k.f === f))
            .map(p => ({ id: row.id, path: p.path, f }));
          if (refs.length) return { kind: 'keyframe', refs, f, row };
        }
      }
    }
  } else if (row.kind === 'prop') {
    if (row.remap) return { kind: 'empty', f: g.xToFrame(x), rowI, row }; // 다시 매기기 키는 끌 수 없음
    const layer = doc.layers[row.id];
    for (const kf of (getProp(layer, row.path)?.keys ?? [])) {
      if (kf.f < 0 || kf.f >= fc) continue;
      if (Math.abs(x - g.keyX(doc, row.id, kf.f, false)) <= KF_HIT) {
        return { kind: 'keyframe', refs: [{ id: row.id, path: row.path, f: kf.f }], f: kf.f, row };
      }
    }
  }

  return { kind: 'empty', f: g.xToFrame(x), rowI, row };
}

// 선택 키가 있는 행의 스트레치 핸들 위치 (키 2개 이상)
export function handleRectForRow(row, es, g) {
  if (!row || (row.kind !== 'layer' && row.kind !== 'prop')) return null;
  const frames = [];
  for (const r of es.kfSelection) {
    if (r.id !== row.id) continue;
    if (row.kind === 'prop' && r.path !== row.path) continue;
    frames.push(r.f);
  }
  if (frames.length < 2) return null;
  const minF = Math.min(...frames), maxF = Math.max(...frames);
  return { x: g.frameToX(maxF) + KF_HIT, minF, maxF };
}

