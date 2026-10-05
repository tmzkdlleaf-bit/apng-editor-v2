// 에셋 어댑터 — IndexedDB Blob → ImageBitmap (동기 getBitmap + 비동기 준비)
// getBitmap은 동기 반환. 비트맵이 아직 없으면 null을 주고, 준비되면 onReady(assetId)로 알린다.
import { getAsset } from '../core/io/assets.js';

export function createAssets(store, onReady) {
  // assetId → ImageBitmap | null | 'pending'
  const _cache = new Map();

  function _load(assetId) {
    _cache.set(assetId, 'pending');
    getAsset(assetId)
      .then((blob) => {
        if (!blob) { _cache.set(assetId, null); return null; }
        return createImageBitmap(blob).then((bmp) => {
          _cache.set(assetId, bmp);
          onReady?.(assetId);
        });
      })
      .catch(() => { _cache.set(assetId, null); });
  }

  function getBitmap(assetId) {
    if (assetId == null) return null;
    if (_cache.has(assetId)) {
      const v = _cache.get(assetId);
      return (v && v !== 'pending') ? v : null;
    }
    _load(assetId);
    return null;
  }

  function getAnimFrames(_assetId) {
    // 향후 애니메이션 에셋 지원 예정
    return null;
  }

  function invalidate(assetId) {
    if (assetId != null) _cache.delete(assetId);
    else _cache.clear();
  }

  return { getBitmap, getAnimFrames, invalidate };
}
