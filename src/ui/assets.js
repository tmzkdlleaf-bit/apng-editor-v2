// 에셋 어댑터 — doc.assets(dataUrl 문자열) → canvas 비트맵
// getBitmap / getAnimFrames 는 동기 반환. 비동기 디코딩 완료 시 onReady(assetId) 호출.
export function createAssets(store, onReady) {
  // assetId → canvas | null | 'pending'
  const _cache = new Map();

  function _decodeDataUrl(assetId, dataUrl) {
    if (_cache.get(assetId) === 'pending') return;
    _cache.set(assetId, 'pending');

    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width  = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      _cache.set(assetId, c);
      onReady?.(assetId);
    };
    img.onerror = () => {
      _cache.set(assetId, null);
    };
    // data: URL은 동기적으로 로드될 때가 많음 — onload는 항상 비동기로 발화
    img.src = dataUrl;
  }

  function _getOrLoad(assetId) {
    if (_cache.has(assetId)) {
      const v = _cache.get(assetId);
      return (v && v !== 'pending') ? v : null;
    }

    const doc   = store.get();
    const asset = doc.assets?.[assetId];
    if (!asset) { _cache.set(assetId, null); return null; }

    const dataUrl = typeof asset === 'string' ? asset : asset.dataUrl;
    if (!dataUrl) { _cache.set(assetId, null); return null; }

    // data: URL: Image가 'complete'이면 즉시 사용 가능
    const img = new Image();
    img.src = dataUrl;
    if (img.complete && img.naturalWidth > 0) {
      const c = document.createElement('canvas');
      c.width  = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      _cache.set(assetId, c);
      return c;
    }

    // 비동기 디코딩
    _decodeDataUrl(assetId, dataUrl);
    return null;
  }

  function getBitmap(assetId) {
    if (assetId == null) return null;
    return _getOrLoad(assetId);
  }

  function getAnimFrames(assetId) {
    // 향후 애니메이션 에셋 지원 예정
    return null;
  }

  function invalidate(assetId) {
    if (assetId != null) _cache.delete(String(assetId));
    else _cache.clear();
  }

  return { getBitmap, getAnimFrames, invalidate };
}
