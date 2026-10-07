// 도형 모음(F2-3) — 레이어 추가 메뉴 "도형" 격자에 쓰는 정의 + 미리보기 아이콘.
// 점 데이터는 0..1 정규화(old/src/tools/asset-packs.js 의 0..100 좌표를 정규화).

const DIAMOND = null; // 다이아몬드는 polygon(sides 4)로 표현
const HEART = [
  [0.50, 1.00], [0.00, 0.398], [0.00, 0.205], [0.18, 0.00], [0.35, 0.00],
  [0.50, 0.205], [0.65, 0.00], [0.82, 0.00], [1.00, 0.205], [1.00, 0.398],
].map(([x, y]) => ({ x, y }));
const CROSS = [
  [0.35, 0], [0.65, 0], [0.65, 0.35], [1, 0.35], [1, 0.65], [0.65, 0.65],
  [0.65, 1], [0.35, 1], [0.35, 0.65], [0, 0.65], [0, 0.35], [0.35, 0.35],
].map(([x, y]) => ({ x, y }));
const ARROW = [
  [0, 0.333], [0.60, 0.333], [0.60, 0], [1, 0.50], [0.60, 1], [0.60, 0.667], [0, 0.667],
].map(([x, y]) => ({ x, y }));
const LIGHTNING = [
  [0.625, 0], [1.0, 0], [0.4375, 0.48], [0.8125, 0.48], [0.375, 1.0],
  [0, 1.0], [0.5625, 0.52], [0.1875, 0.52],
].map(([x, y]) => ({ x, y }));

// 각 항목: { key, label, shape() }. shape() 는 layer.shape 객체.
export const SHAPE_PACK = [
  { key: 'rect',      label: '사각형',     shape: () => ({ kind: 'rect',    w: 100, h: 100, radius: 0,  fill: '#5eb8f0', stroke: null }) },
  { key: 'round',     label: '둥근 사각형', shape: () => ({ kind: 'rect',    w: 100, h: 100, radius: 20, fill: '#5eb8f0', stroke: null }) },
  { key: 'ellipse',   label: '원',         shape: () => ({ kind: 'ellipse', w: 100, h: 100, fill: '#f0a35e', stroke: null }) },
  { key: 'triangle',  label: '삼각형',     shape: () => ({ kind: 'polygon', sides: 3, w: 100, h: 100, fill: '#9b59b6', stroke: null }) },
  { key: 'hexagon',   label: '육각형',     shape: () => ({ kind: 'polygon', sides: 6, w: 100, h: 100, fill: '#2ecc71', stroke: null }) },
  { key: 'star',      label: '별',         shape: () => ({ kind: 'star',    sides: 5, innerRatio: 0.5, w: 100, h: 100, fill: '#ffd700', stroke: null }) },
  { key: 'diamond',   label: '다이아몬드', shape: () => ({ kind: 'polygon', sides: 4, w: 100, h: 100, fill: '#44ccff', stroke: null }) },
  { key: 'heart',     label: '하트',       shape: () => ({ kind: 'path', points: HEART, closed: true, w: 100, h: 88,  fill: '#ff4488', stroke: null }) },
  { key: 'cross',     label: '십자',       shape: () => ({ kind: 'path', points: CROSS, closed: true, w: 100, h: 100, fill: '#ff8844', stroke: null }) },
  { key: 'arrow',     label: '화살표',     shape: () => ({ kind: 'path', points: ARROW, closed: true, w: 100, h: 60,  fill: '#ff6644', stroke: null }) },
  { key: 'lightning', label: '번개',       shape: () => ({ kind: 'path', points: LIGHTNING, closed: true, w: 80, h: 100, fill: '#ffee22', stroke: null }) },
  { key: 'line',      label: '선',         shape: () => ({ kind: 'line',    w: 100, h: 2, fill: null, stroke: { color: '#cccccc', width: 3 } }) },
];

// 미리보기 SVG(격자 아이콘). 20px 상자에 도형을 그린다. currentColor 테두리.
export function shapePreviewSvg(def, size = 20) {
  const sh = def.shape();
  const S = size, pad = 2, inner = S - pad * 2;
  const cx = S / 2, cy = S / 2;
  const kind = sh.kind;
  const w = Math.min(inner, inner * (sh.w / Math.max(sh.w, sh.h)));
  const h = Math.min(inner, inner * (sh.h / Math.max(sh.w, sh.h)));
  const attrs = 'fill="currentColor"';
  let body = '';
  if (kind === 'rect') {
    body = `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${(sh.radius ?? 0) / 100 * w}" ${attrs}/>`;
  } else if (kind === 'ellipse') {
    body = `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" ${attrs}/>`;
  } else if (kind === 'line') {
    body = `<line x1="${cx - w / 2}" y1="${cy}" x2="${cx + w / 2}" y2="${cy}" stroke="currentColor" stroke-width="2"/>`;
  } else {
    // polygon/star/path → 점 목록으로
    const pts = _pointsOf(sh);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(cx + (p.x - 0.5) * w).toFixed(1)},${(cy + (p.y - 0.5) * h).toFixed(1)}`).join(' ') + ' Z';
    body = `<path d="${d}" ${attrs}/>`;
  }
  return `<svg class="shape-preview" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" aria-hidden="true">${body}</svg>`;
}

// 도형 종류를 정규화 점 배열로(미리보기용).
function _pointsOf(sh) {
  if (sh.kind === 'path') return sh.points;
  if (sh.kind === 'polygon' || sh.kind === 'star') {
    const out = [];
    if (sh.kind === 'star') {
      const n = Math.max(3, sh.sides ?? 5); const ir = sh.innerRatio ?? 0.5;
      for (let i = 0; i < n * 2; i++) {
        const r = (i % 2 === 0 ? 0.5 : 0.5 * ir);
        const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
        out.push({ x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r });
      }
    } else {
      const n = Math.max(3, sh.sides ?? 6);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
        out.push({ x: 0.5 + Math.cos(a) * 0.5, y: 0.5 + Math.sin(a) * 0.5 });
      }
    }
    return out;
  }
  return [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
}
