// 작업용 캔버스 풀 — LRU + 총 픽셀 상한(64MP)
// A1: 총 보관 픽셀 상한 초과 시 오래된 슬롯부터 해제
const DEFAULT_MAX_PX = 64 * 1024 * 1024; // 64MP

export function createPool(createCanvas, maxPoolPx = DEFAULT_MAX_PX) {
  // key = "WxH" → { canvases: canvas[], lastUsed: number }
  const _slots = new Map();
  let _poolPx     = 0;
  let _maxBorrowW = 0;
  let _maxBorrowH = 0;

  function borrow(w, h) {
    if (w > _maxBorrowW) _maxBorrowW = w;
    if (h > _maxBorrowH) _maxBorrowH = h;

    const key  = `${w}x${h}`;
    const slot = _slots.get(key);
    let c;
    if (slot?.canvases.length) {
      c = slot.canvases.pop();
      slot.lastUsed = Date.now();
      _poolPx -= w * h;
    } else {
      c = createCanvas(w, h);
    }

    const cx = c.getContext('2d');
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, w, h);
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';
    return c;
  }

  function release(canvas) {
    const w   = canvas.width;
    const h   = canvas.height;
    const key = `${w}x${h}`;
    if (!_slots.has(key)) _slots.set(key, { canvases: [], lastUsed: 0 });
    const slot = _slots.get(key);
    slot.canvases.push(canvas);
    slot.lastUsed = Date.now();
    _poolPx += w * h;
    _evict();
  }

  function _evict() {
    if (_poolPx <= maxPoolPx) return;
    // lastUsed 오름차순 (가장 오래된 것 먼저 해제)
    const sorted = [..._slots.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, slot] of sorted) {
      if (_poolPx <= maxPoolPx) break;
      while (slot.canvases.length && _poolPx > maxPoolPx) {
        const c = slot.canvases.pop();
        _poolPx -= c.width * c.height;
      }
      if (!slot.canvases.length) _slots.delete(key);
    }
  }

  function getTotalPx()   { return _poolPx; }
  function getMaxPx()     { return maxPoolPx; }
  function getSlotCount() { return _slots.size; }

  function resetBorrowStats() { _maxBorrowW = 0; _maxBorrowH = 0; }
  function getBorrowStats()   { return { maxBorrowW: _maxBorrowW, maxBorrowH: _maxBorrowH }; }

  return { borrow, release, getTotalPx, getMaxPx, getSlotCount, resetBorrowStats, getBorrowStats };
}
