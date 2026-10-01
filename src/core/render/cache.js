// 레이어 콘텐츠 LRU 캐시 — 총 픽셀 수 상한으로 퇴거
const DEFAULT_MAX_PX = 64 * 1024 * 1024; // 64메가픽셀

export function createCache(createCanvas, maxPx = DEFAULT_MAX_PX) {
  const _map = new Map(); // key → { canvas, px }
  let _totalPx = 0;
  let _adjustCount = 0;
  let _lastHits = 0;
  let _lastMisses = 0;

  function get(key) {
    if (!_map.has(key)) {
      _lastMisses++;
      return null;
    }
    const entry = _map.get(key);
    _map.delete(key);
    _map.set(key, entry);
    _lastHits++;
    return entry.canvas;
  }

  function set(key, canvas) {
    if (_map.has(key)) {
      const old = _map.get(key);
      _totalPx -= old.px;
      _map.delete(key);
    }
    const px = canvas.width * canvas.height;
    _totalPx += px;
    _map.set(key, { canvas, px });
    const iter = _map.keys();
    while (_totalPx > maxPx && _map.size > 1) {
      const oldest = iter.next().value;
      const e = _map.get(oldest);
      _totalPx -= e.px;
      _map.delete(oldest);
    }
  }

  function invalidate(layerId) {
    if (!layerId) {
      _map.clear();
      _totalPx = 0;
      return;
    }
    for (const key of [..._map.keys()]) {
      if (key.startsWith(layerId + ':')) {
        const e = _map.get(key);
        _totalPx -= e.px;
        _map.delete(key);
      }
    }
  }

  function resetFrameStats() {
    _adjustCount = 0;
    _lastHits = 0;
    _lastMisses = 0;
  }

  function incAdjustCount() { _adjustCount++; }
  function getAdjustCount() { return _adjustCount; }
  function getLastHits()    { return _lastHits; }
  function getLastMisses()  { return _lastMisses; }

  // 하위 호환 유지
  function resetAdjustCount() { _adjustCount = 0; }

  return { get, set, invalidate, resetFrameStats, resetAdjustCount, incAdjustCount, getAdjustCount, getLastHits, getLastMisses };
}
