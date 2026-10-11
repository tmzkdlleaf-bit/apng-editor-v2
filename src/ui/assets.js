// 에셋 어댑터 — IndexedDB Blob → ImageBitmap (동기 getBitmap + 비동기 준비)
// getBitmap은 동기 반환. 비트맵이 아직 없으면 null을 주고, 준비되면 onReady(assetId)로 알린다.
import { getAsset } from '../core/io/assets.js';
import { decodeAnim } from '../core/io/anim-decode.js';

export function createAssets(store, onReady) {
  // assetId → ImageBitmap | null | 'pending'
  const _cache = new Map();
  // assetId → { frames, delays } | null | 'pending' (움직이는 이미지)
  const _animCache = new Map();
  // 준비 완료 알림을 받을 추가 구독자(썸네일 등). 생성자 onReady 와 별개.
  const _readyListeners = new Set();
  function _notifyReady(assetId) {
    onReady?.(assetId);
    for (const fn of _readyListeners) { try { fn(assetId); } catch {} }
  }

  // 진행 중인 디코드 수 — 0 이면 에셋 로딩이 유휴(테스트·측정이 "준비 완료"를 기다릴 수 있게).
  let _pending = 0;

  function _load(assetId) {
    _cache.set(assetId, 'pending');
    _pending++;
    getAsset(assetId)
      .then((blob) => {
        if (!blob) { _cache.set(assetId, null); return null; }
        return createImageBitmap(blob).then((bmp) => {
          _cache.set(assetId, bmp);
          _notifyReady(assetId);
        });
      })
      .catch(() => { _cache.set(assetId, null); })
      .finally(() => { _pending--; });
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

  function _loadAnim(assetId) {
    _animCache.set(assetId, 'pending');
    _pending++;
    getAsset(assetId)
      .then((blob) => {
        if (!blob) { _animCache.set(assetId, null); return null; }
        return decodeAnim(blob).then((res) => {
          _animCache.set(assetId, res); // { frames, delays } 또는 null
          _notifyReady(assetId);
        });
      })
      .catch(() => { _animCache.set(assetId, null); })
      .finally(() => { _pending--; });
  }

  // 움직이는 이미지 프레임 — { frames: ImageBitmap[], delays: number[](ms) } 또는 null(아직/실패).
  function getAnimFrames(assetId) {
    if (assetId == null) return null;
    if (_animCache.has(assetId)) {
      const v = _animCache.get(assetId);
      return (v && v !== 'pending') ? v : null;
    }
    _loadAnim(assetId);
    return null;
  }

  function invalidate(assetId) {
    if (assetId != null) { _cache.delete(assetId); _animCache.delete(assetId); }
    else { _cache.clear(); _animCache.clear(); }
  }

  // 에셋 준비 완료 구독(썸네일 무효화용). unsub 반환.
  function subscribeReady(fn) { _readyListeners.add(fn); return () => _readyListeners.delete(fn); }
  // 진행 중인 디코드 수(0 = 유휴).
  function pendingCount() { return _pending; }

  return { getBitmap, getAnimFrames, invalidate, subscribeReady, pendingCount };
}
