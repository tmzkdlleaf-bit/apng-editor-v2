// 레이어 콘텐츠 LRU 캐시 — 총 픽셀 수 상한으로 퇴거
const DEFAULT_MAX_PX = 64 * 1024 * 1024; // 64메가픽셀

export function createCache(createCanvas, maxPx = DEFAULT_MAX_PX) {
  // Map 순서 = 삽입/접근 순서 (앞 = 오래됨)
  const _map = new Map(); // key → { canvas, px }
  let _totalPx = 0;
  let adjustCount = 0;   // 이번 renderFrame에서 applyAdjust를 실제로 수행한 횟수

  function get(key) {
    if (!_map.has(key)) return null;
    const entry = _map.get(key);
    // LRU: 최근 접근을 뒤로 이동
    _map.delete(key);
    _map.set(key, entry);
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
    // 상한 초과 시 가장 오래된 항목 퇴거
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
    // 레이어 id를 포함하는 키 모두 삭제
    for (const key of [..._map.keys()]) {
      if (key.startsWith(layerId + ':')) {
        const e = _map.get(key);
        _totalPx -= e.px;
        _map.delete(key);
      }
    }
  }

  function resetAdjustCount() { adjustCount = 0; }
  function incAdjustCount()   { adjustCount++;    }
  function getAdjustCount()   { return adjustCount; }

  return { get, set, invalidate, resetAdjustCount, incAdjustCount, getAdjustCount };
}
