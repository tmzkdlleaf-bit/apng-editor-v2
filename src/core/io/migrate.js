// 문서 버전 마이그레이션 — version을 보고 최신으로 올린다.
// 지금은 v1뿐. 뒤 버전이 생기면 MIGRATIONS[n] = (doc) => doc(n+1) 을 추가한다.

export const CURRENT_VERSION = 2;

// version n → n+1 변환 함수 목록
const MIGRATIONS = {
  // v1 → v2: 변환에 가로·세로 보정(scaleX·scaleY) 추가. 기본 1이라 렌더는 그대로(픽셀 동일).
  1: (doc) => {
    const layers = {};
    for (const [id, layer] of Object.entries(doc.layers ?? {})) {
      const tr = layer.transform ?? {};
      layers[id] = {
        ...layer,
        transform: {
          ...tr,
          scaleX: tr.scaleX ?? { value: 1 },
          scaleY: tr.scaleY ?? { value: 1 },
        },
      };
    }
    return { ...doc, version: 2, layers };
  },
};

export function migrate(doc) {
  if (!doc || typeof doc !== 'object') {
    throw new Error('문서를 읽을 수 없습니다.');
  }
  const v = doc.version;
  if (typeof v !== 'number') {
    throw new Error('문서 버전을 알 수 없습니다.');
  }
  if (v > CURRENT_VERSION) {
    throw new Error(`지원하지 않는 문서 버전입니다: ${v} (최신 ${CURRENT_VERSION})`);
  }
  let d = doc;
  while (d.version < CURRENT_VERSION) {
    const step = MIGRATIONS[d.version];
    if (!step) throw new Error(`버전 ${d.version} 마이그레이션 함수가 없습니다.`);
    d = step(d);
  }
  return d;
}
