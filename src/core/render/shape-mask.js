// R21 — 펜/도형 가리기(마스크). 레이어 자체 좌표 경로(R17 drawLeafWithFx)의 효과 다음·변형 전 단계에서
//   레이어 내용 알파를 가리기 알파로 자른다(destination-in). DOM 없음. 캔버스는 pool 에서 빌린다.
//   점 좌표는 레이어 자체 좌표(왼쪽 위 0,0, px). work 캔버스에서 doc 영역은 [pad,pad, dW*k,dH*k].
import { evalProp } from '../anim/prop.js';
import { applyBlur } from './adjust.js';

const _GCO = { add: 'source-over', subtract: 'destination-out', intersect: 'destination-in', difference: 'xor' };

// 켜진 가리기(mode!=='none', 경로 점 있음) 목록을 order 순으로.
export function activeMasks(layer) {
  const m = layer?.masks;
  if (!m || !Array.isArray(m.order) || !m.items) return [];
  const out = [];
  for (const id of m.order) {
    const it = m.items[id];
    if (!it || it.mode === 'none') continue;
    const path = evalProp(it.path, 0);
    if (!path?.pts?.length) continue;
    out.push(it);
  }
  return out;
}
export function hasActiveMasks(layer) { return activeMasks(layer).length > 0; }

function _drawPath(ctx, path) {
  const pts = path.pts; if (!pts?.length) return;
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  const segs = path.closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    ctx.bezierCurveTo(a.x + (a.ox ?? 0), a.y + (a.oy ?? 0), b.x + (b.ix ?? 0), b.y + (b.iy ?? 0), b.x, b.y);
  }
  if (path.closed) ctx.closePath();
}

// 가리기 하나의 알파(흐림·넓히기·반전·불투명도 반영)를 one 캔버스에 그린다.
function _buildOne(pool, W, H, k, pad, path, feather, expand, opacity, invert) {
  let one = pool.borrow(W, H);
  let oc = one.getContext('2d');
  oc.setTransform(1, 0, 0, 1, 0, 0); oc.clearRect(0, 0, one.width, one.height);
  oc.setTransform(k, 0, 0, k, pad, pad);
  oc.fillStyle = `rgba(255,255,255,${opacity})`;
  _drawPath(oc, path); oc.fill();
  if (expand) {
    oc.lineJoin = 'round'; oc.lineWidth = 2 * Math.abs(expand);
    _drawPath(oc, path);
    if (expand > 0) { oc.globalCompositeOperation = 'source-over'; oc.strokeStyle = `rgba(255,255,255,${opacity})`; oc.stroke(); }
    else { oc.globalCompositeOperation = 'destination-out'; oc.strokeStyle = '#fff'; oc.stroke(); oc.globalCompositeOperation = 'source-over'; }
  }
  oc.setTransform(1, 0, 0, 1, 0, 0);
  if (feather > 0) { const id = oc.getImageData(0, 0, W, H); applyBlur(id, feather * k); oc.putImageData(id, 0, 0); }
  if (invert) {
    const inv = pool.borrow(W, H); const ic = inv.getContext('2d');
    ic.setTransform(1, 0, 0, 1, 0, 0); ic.clearRect(0, 0, inv.width, inv.height);
    ic.fillStyle = `rgba(255,255,255,${opacity})`; ic.fillRect(0, 0, W, H);
    ic.globalCompositeOperation = 'destination-out'; ic.drawImage(one, 0, 0); ic.globalCompositeOperation = 'source-over';
    pool.release(one); one = inv; oc = ic;
  }
  return one;
}

// 가리기 알파 캔버스를 만든다(또는 캐시에서). work 와 같은 크기. cache 가 소유하므로 release 하지 않는다.
function _buildMaskAlpha(env, layer) {
  const { f, k, pad, W, H, pool, cache } = env;
  const masks = activeMasks(layer);
  if (!masks.length) return null;

  // 캐시 서명: 경로 계산값·흐림·넓히기·불투명도·방식·반전·크기·k (모두 같으면 재사용 → 키 없으면 프레임 간 캐시)
  const sig = masks.map((m) => JSON.stringify({
    mode: m.mode, inv: !!m.invert,
    fe: evalProp(m.feather ?? { value: 0 }, f), ex: evalProp(m.expand ?? { value: 0 }, f),
    op: evalProp(m.opacity ?? { value: 1 }, f), path: evalProp(m.path, f),
  })).join('|');
  const key = `${layer.id}:mask:${W}x${H}:k${k.toFixed(3)}:p${pad}:${sig}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const mcan = pool.borrow(W, H);
  const mc = mcan.getContext('2d');
  mc.setTransform(1, 0, 0, 1, 0, 0); mc.clearRect(0, 0, mcan.width, mcan.height);
  if (masks[0].mode === 'subtract') { mc.fillStyle = '#fff'; mc.fillRect(0, 0, W, H); } // 빼기로 시작하면 가득 찬 상태

  for (const m of masks) {
    const feather = evalProp(m.feather ?? { value: 0 }, f);
    const expand  = evalProp(m.expand ?? { value: 0 }, f);
    const opacity = Math.max(0, Math.min(1, evalProp(m.opacity ?? { value: 1 }, f)));
    const path    = evalProp(m.path, f);
    const one = _buildOne(pool, W, H, k, pad, path, feather, expand, opacity, !!m.invert);
    mc.setTransform(1, 0, 0, 1, 0, 0);
    mc.globalCompositeOperation = _GCO[m.mode] ?? 'source-over';
    mc.drawImage(one, 0, 0);
    mc.globalCompositeOperation = 'source-over';
    pool.release(one);
  }
  cache.set(key, mcan);
  return mcan;
}

// work(레이어 내용, 효과 적용 뒤)에 가리기 알파를 destination-in 으로 곱한다.
export function applyMasksToWork(work, env, layer) {
  const mask = _buildMaskAlpha(env, layer);
  if (!mask) return;
  const wc = work.getContext('2d');
  wc.setTransform(1, 0, 0, 1, 0, 0);
  wc.globalAlpha = 1;
  wc.globalCompositeOperation = 'destination-in';
  wc.drawImage(mask, 0, 0);
  wc.globalCompositeOperation = 'source-over';
}
