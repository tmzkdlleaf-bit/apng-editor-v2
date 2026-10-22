// 키 줄이기(Douglas–Peucker) — 오차 허용치(tol) 이내로 선형 보간되는 중간 키를 뺀다.
// 순수 함수(DOM 없음) — core·worker·테스트에서 그대로 쓴다. points 는 { f, v, ... } 배열(f 오름차순).
export function reduceKeys(points, tol = 2) {
  if (points.length <= 2) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = -1, idx = -1;
    const pa = points[a], pb = points[b];
    const df = pb.f - pa.f;
    for (let i = a + 1; i < b; i++) {
      const t = df === 0 ? 0 : (points[i].f - pa.f) / df;
      const interp = pa.v + (pb.v - pa.v) * t;
      const d = Math.abs(points[i].v - interp);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}
