// 경로로 레이어의 Prop 객체를 찾는 공용 함수(R16-5). DOM 없음.
// UI·타임라인이 layer.transform[key] 처럼 경로를 직접 파고들지 않게 한 곳으로 모은다.
//   'transform.x'        → layer.transform.x       ({ value, keys })
//   'paramAnim.center'   → layer.paramAnim.center   ({ keys })
// 없으면 null.
export function getProp(layer, path) {
  if (!layer || !path) return null;
  const parts = path.split('.');
  let cur = layer;
  for (const p of parts) {
    if (cur == null) return null;
    cur = cur[p];
  }
  return cur ?? null;
}
