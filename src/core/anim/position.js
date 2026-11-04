// 위치 계산(R18) — x·y 를 함께 보고 곡선 이동 경로를 지원한다. DOM 없음.
//   곡선 손잡이는 transform.x 의 키에 key.sp = { ix, iy, ox, oy }(문서 px, 그 키 위치 기준 상대값).
//   x·y 키 프레임이 같고 sp 가 하나라도 있으면 키 사이를 3차 베지어로 잇는다(길이 비율로 속도 고르게).
//   조건이 안 맞으면 지금처럼 x·y 를 evalProp 으로 따로 계산한다(결과 비트 단위 동일).
import { evalProp } from './prop.js';
import { ease } from './easing.js';

const _SAMPLES = 32;                 // 곡선 길이 표 표본 수
const _cache = new WeakMap();        // xkeys(배열) → { ykeys, tables:[seg별 {u,len}[]] }

function _framesMatch(xkeys, ykeys) {
  if (!xkeys?.length || !ykeys?.length || xkeys.length !== ykeys.length) return false;
  for (let i = 0; i < xkeys.length; i++) if (xkeys[i].f !== ykeys[i].f) return false;
  return true;
}
function _hasSp(xkeys) { return xkeys.some((k) => k.sp); }

// 곡선을 쓰는 조건인지.
export function isCurvedPath(transform) {
  const xk = transform?.x?.keys, yk = transform?.y?.keys;
  return !!(xk && yk && xk.length >= 2 && _framesMatch(xk, yk) && _hasSp(xk));
}

function _ctrl(xkeys, ykeys, i) {
  const P0 = { x: xkeys[i].v, y: ykeys[i].v };
  const P1 = { x: xkeys[i + 1].v, y: ykeys[i + 1].v };
  const o = xkeys[i].sp, ihandle = xkeys[i + 1].sp;
  const C0 = { x: P0.x + (o?.ox ?? 0), y: P0.y + (o?.oy ?? 0) };
  const C1 = { x: P1.x + (ihandle?.ix ?? 0), y: P1.y + (ihandle?.iy ?? 0) };
  return { P0, C0, C1, P1 };
}
function _bez(P0, C0, C1, P1, u) {
  const v = 1 - u;
  const a = v * v * v, b = 3 * v * v * u, c = 3 * v * u * u, d = u * u * u;
  return { x: a * P0.x + b * C0.x + c * C1.x + d * P1.x, y: a * P0.y + b * C0.y + c * C1.y + d * P1.y };
}

function _tables(transform) {
  const xkeys = transform.x.keys, ykeys = transform.y.keys;
  let ent = _cache.get(xkeys);
  if (ent && ent.ykeys === ykeys) return ent.tables;
  const tables = [];
  for (let i = 0; i < xkeys.length - 1; i++) {
    const { P0, C0, C1, P1 } = _ctrl(xkeys, ykeys, i);
    const tbl = [{ u: 0, len: 0 }];
    let prev = _bez(P0, C0, C1, P1, 0), acc = 0;
    for (let s = 1; s <= _SAMPLES; s++) {
      const u = s / _SAMPLES;
      const p = _bez(P0, C0, C1, P1, u);
      acc += Math.hypot(p.x - prev.x, p.y - prev.y);
      tbl.push({ u, len: acc });
      prev = p;
    }
    tables.push(tbl);
  }
  ent = { ykeys, tables };
  _cache.set(xkeys, ent);
  return tables;
}

// 길이 비율 frac(0~1) → 곡선 파라미터 u. (속도가 고르도록 이징 비율을 길이 비율로.)
function _uAtLenFrac(tbl, frac) {
  const total = tbl[tbl.length - 1].len;
  if (total <= 0) return frac;
  const target = frac * total;
  for (let i = 1; i < tbl.length; i++) {
    if (tbl[i].len >= target) {
      const a = tbl[i - 1], b = tbl[i];
      const span = b.len - a.len;
      const t = span <= 0 ? 0 : (target - a.len) / span;
      return a.u + (b.u - a.u) * t;
    }
  }
  return 1;
}

// 곡선(또는 직선 fallback) 위의 {x,y}.
function _xy(transform, f) {
  if (!isCurvedPath(transform)) {
    return { x: evalProp(transform.x, f), y: evalProp(transform.y, f) };
  }
  const xkeys = transform.x.keys, ykeys = transform.y.keys;
  const n = xkeys.length;
  if (f <= xkeys[0].f) return { x: xkeys[0].v, y: ykeys[0].v };
  if (f >= xkeys[n - 1].f) return { x: xkeys[n - 1].v, y: ykeys[n - 1].v };
  const tables = _tables(transform);
  for (let i = 0; i < n - 1; i++) {
    const lo = xkeys[i], hi = xkeys[i + 1];
    if (lo.f <= f && f < hi.f) {
      const span = hi.f - lo.f;
      const tt = span === 0 ? 1 : (f - lo.f) / span;
      const et = ease(lo.ease ?? 'linear', tt, lo.bezier); // x 키 이징이 진행도
      const u = _uAtLenFrac(tables[i], et);
      const { P0, C0, C1, P1 } = _ctrl(xkeys, ykeys, i);
      return _bez(P0, C0, C1, P1, u);
    }
  }
  return { x: xkeys[n - 1].v, y: ykeys[n - 1].v };
}

// evalPosition(transform, f) → { x, y, angle }. angle = 진행 방향(도).
export function evalPosition(transform, f) {
  const p = _xy(transform, f);
  const h = 0.5;
  const a = _xy(transform, f - h), b = _xy(transform, f + h);
  const dx = b.x - a.x, dy = b.y - a.y;
  const angle = (dx || dy) ? Math.atan2(dy, dx) * 180 / Math.PI : 0;
  return { x: p.x, y: p.y, angle };
}
