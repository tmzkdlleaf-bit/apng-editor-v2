// R23b — 패널에서 화면·타임라인으로 끌어 놓기 공용 규약.
//   효과(fx)·모션(motion)·에셋(asset) 세 가지. dataTransfer 의 전용 MIME 타입으로 종류를 구분한다.
export const DND_FX = 'application/x-apng-fx';
export const DND_MOTION = 'application/x-apng-motion';
export const DND_ASSET = 'application/x-apng-asset';

const _TYPES = [[DND_FX, 'fx'], [DND_MOTION, 'motion'], [DND_ASSET, 'asset']];

// 끌기 시작 — 종류별 MIME + text/plain(폴백)에 id 를 싣는다.
export function setDrag(e, type, id) {
  try {
    e.dataTransfer.setData(type, id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'copy';
  } catch {}
}

// dragover 단계 — 보안상 getData 는 못 읽으므로 types 로만 우리 끌기인지 판별.
export function hasDrag(e) {
  const t = e.dataTransfer?.types;
  if (!t) return false;
  const list = Array.from(t);
  return _TYPES.some(([type]) => list.includes(type));
}

// drop 단계 — { kind, id } 반환(없으면 null).
export function readDrag(e) {
  const dt = e.dataTransfer; if (!dt) return null;
  for (const [type, kind] of _TYPES) {
    const id = dt.getData(type);
    if (id) return { kind, id };
  }
  return null;
}
