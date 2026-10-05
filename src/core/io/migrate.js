// 문서 버전 마이그레이션 — version을 보고 최신으로 올린다.
// 지금은 v1뿐. 뒤 버전이 생기면 MIGRATIONS[n] = (doc) => doc(n+1) 을 추가한다.

export const CURRENT_VERSION = 1;

// version n → n+1 변환 함수 목록
const MIGRATIONS = {
  // 1: (doc) => ({ ...doc, version: 2, ... }),
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
