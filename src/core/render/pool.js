// 작업용 캔버스 풀 — 렌더 경로에서 매 프레임 캔버스 생성 금지
export function createPool(createCanvas) {
  const _slots = new Map(); // "WxH" → canvas[]
  let _maxBorrowW = 0;
  let _maxBorrowH = 0;

  function borrow(w, h) {
    if (w > _maxBorrowW) _maxBorrowW = w;
    if (h > _maxBorrowH) _maxBorrowH = h;
    const key = `${w}x${h}`;
    const list = _slots.get(key);
    const c = list?.length ? list.pop() : createCanvas(w, h);
    const cx = c.getContext('2d');
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(0, 0, w, h);
    cx.globalAlpha = 1;
    cx.globalCompositeOperation = 'source-over';
    return c;
  }

  function release(canvas) {
    const key = `${canvas.width}x${canvas.height}`;
    if (!_slots.has(key)) _slots.set(key, []);
    _slots.get(key).push(canvas);
  }

  function resetBorrowStats() { _maxBorrowW = 0; _maxBorrowH = 0; }
  function getBorrowStats()    { return { maxBorrowW: _maxBorrowW, maxBorrowH: _maxBorrowH }; }

  return { borrow, release, resetBorrowStats, getBorrowStats };
}
