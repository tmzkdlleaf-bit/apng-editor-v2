// PSD 가져오기 핵심 로직 — DOM 없음. ag-psd 로 파싱한 결과 트리를 우리 모델로 정규화한다.
// 캔버스/네트워크를 쓰지 않는다(픽셀 인코딩은 주입받은 encode 콜백이 담당 — 워커의 OffscreenCanvas).

// PSD 블렌드 모드(ag-psd 소문자+공백) → 우리 12종.
// 우리 모델에 대응이 있는 것만 매핑한다. 그 외는 normal 로 두고 경고 목록에 담는다.
// 'pass through'(그룹 통과)·'dissolve'(확률적 normal)는 개념상 normal 로 조용히 대체한다.
// (바꿀 수 있는 기본값: 아래 표를 늘리면 더 많은 모드를 지원 처리할 수 있다.)
export const PSD_BLEND_MAP = {
  'normal':       'normal',
  'pass through': 'normal',
  'dissolve':     'normal',
  'darken':       'darken',
  'multiply':     'multiply',
  'color burn':   'color-burn',
  'lighten':      'lighten',
  'screen':       'screen',
  'color dodge':  'color-dodge',
  'overlay':      'overlay',
  'soft light':   'soft-light',
  'hard light':   'hard-light',
  'difference':   'difference',
  'exclusion':    'exclusion',
};

// 조용히 normal 로 둬도 경고하지 않는 모드(구조적/근사 동일).
const _SILENT = new Set(['normal', 'pass through', 'dissolve']);

export function mapBlend(mode) {
  const m   = String(mode ?? 'normal');
  const hit = PSD_BLEND_MAP[m];
  if (hit) return { blend: hit, supported: true, warn: false, mode: m };
  return { blend: 'normal', supported: false, warn: !_SILENT.has(m), mode: m };
}

// opacity 정규화: ag-psd(v31)는 0~1 실수. 혹시 0~255 로 오면 255 로 나눈다.
function _opacity(v) {
  if (v == null) return 1;
  return v > 1 ? Math.max(0, Math.min(1, v / 255)) : Math.max(0, Math.min(1, v));
}

function _bounds(node) {
  const left = node.left ?? 0;
  const top  = node.top  ?? 0;
  const iw   = node.imageData?.width  ?? 0;
  const ih   = node.imageData?.height ?? 0;
  const w = (node.right  != null) ? (node.right  - left) : iw;
  const h = (node.bottom != null) ? (node.bottom - top)  : ih;
  return { left, top, w, h };
}

// psd.children 를 재귀 순회해 우리 모델 트리로 정규화한다.
// encode(imageData) → Promise<any>: 래스터 픽셀을 저장 가능한 형태(워커: PNG Blob)로 인코딩.
// 반환: { nodes, warnings }
//   nodes: [{ kind:'group'|'raster', name, blend, opacity, hidden, ... }]
//          group: { children:[...] }
//          raster: { left, top, w, h, isText, data }   (data = encode 결과)
//   warnings: { unsupportedBlends:[이름...], textLayers:수, emptyLayers:수 }
export async function walkPsd(psd, encode) {
  const warnings = { unsupportedBlends: [], textLayers: 0, emptyLayers: 0 };
  const seenBlend = new Set();

  async function walk(children) {
    const out = [];
    for (const node of (children ?? [])) {
      const bm = mapBlend(node.blendMode);
      if (bm.warn && !seenBlend.has(bm.mode)) { seenBlend.add(bm.mode); warnings.unsupportedBlends.push(bm.mode); }

      if (node.children) {
        const kids = await walk(node.children);
        if (!kids.length) continue; // 빈 그룹은 건너뜀
        out.push({
          kind: 'group',
          name: node.name || '그룹',
          blend: bm.blend,
          opacity: _opacity(node.opacity),
          hidden: !!node.hidden,
          children: kids,
        });
        continue;
      }

      // 래스터(텍스트 레이어는 ag-psd 가 이미 픽셀로 렌더해 imageData 로 준다 → 이미지로 가져옴)
      const isText = !!node.text;
      const { left, top, w, h } = _bounds(node);
      if (!node.imageData || w <= 0 || h <= 0) { warnings.emptyLayers++; continue; }
      if (isText) warnings.textLayers++;

      const data = await encode(node.imageData);
      out.push({
        kind: 'raster',
        name: node.name || (isText ? '글자' : '레이어'),
        blend: bm.blend,
        opacity: _opacity(node.opacity),
        hidden: !!node.hidden,
        isText,
        left, top, w, h,
        data,
      });
    }
    return out;
  }

  const nodes = await walk(psd.children);
  return { nodes, warnings };
}
