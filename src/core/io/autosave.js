// 자동 저장 — 기록(apply/commit/undo/redo) 후 디바운스 저장. preview 중에는 저장하지 않는다.
// 저장 자체(IndexedDB 쓰기)와 썸네일 생성은 주입받는다(DOM/캔버스 의존 분리).
// 탭 숨김/닫힘 리스너는 document가 있을 때만 건다(워커/테스트 안전).

export function createAutosave(opts) {
  const {
    store,                         // 문서 store (subscribe, get)
    getProjectId,                  // () => id | null
    getProjectName = () => '',     // () => name
    saveRecord,                    // async (rec) => void   rec={ id, name, doc, thumb?, updatedAt }
    renderThumbnail = null,        // async (doc) => Blob|null  (선택)
    onStatus = () => {},           // ('saved'|'saving'|'error') => void
    onQuota  = () => {},           // () => void (용량 부족 안내)
    delay         = 1000,
    thumbInterval = 5000,
    quotaInterval = 30000,
    now = () => Date.now(),
  } = opts;

  let _timer       = null;
  let _pending     = false;
  let _lastThumb   = null;
  let _lastThumbAt = 0;      // 0 → 첫 저장에서 바로 썸네일 생성
  let _lastQuotaAt = -Infinity;
  let _saving      = false;
  let _dirtyAgain  = false;

  function _arm() {
    _pending = true;
    clearTimeout(_timer);
    _timer = setTimeout(() => { flush(); }, delay);
  }

  async function flush({ withThumb = true } = {}) {
    if (!_pending) return;
    // 열린 드래그 중에는 _doc에 preview 중간값이 들어 있다. 저장하지 말고 commit 뒤로 미룬다.
    if (store.isBatching?.()) { _arm(); return; }
    if (_saving) { _dirtyAgain = true; return; }
    _pending = false;
    clearTimeout(_timer);
    _timer = null;

    const id = getProjectId();
    if (!id) return;

    _saving = true;
    onStatus('saving');
    try {
      const doc = structuredClone(store.get());

      if (withThumb && renderThumbnail && (now() - _lastThumbAt > thumbInterval)) {
        _lastThumbAt = now();
        try { _lastThumb = await renderThumbnail(doc); } catch { /* 썸네일 실패는 저장을 막지 않는다 */ }
      }

      const rec = { id, name: getProjectName(), doc, updatedAt: now() };
      if (_lastThumb != null) rec.thumb = _lastThumb;

      await saveRecord(rec);
      onStatus('saved');
    } catch (err) {
      onStatus('error');
      const quota = err?.name === 'QuotaExceededError' || err?.name === 'NS_ERROR_DOM_QUOTA_REACHED';
      if (quota && (now() - _lastQuotaAt > quotaInterval)) {
        _lastQuotaAt = now();
        onQuota();
      }
    } finally {
      _saving = false;
      if (_dirtyAgain) { _dirtyAgain = false; _arm(); }
    }
  }

  // 기록 변경 구독 — preview/cancel 은 저장 대상이 아니다.
  const _unsub = store.subscribe({ any: true }, (notif) => {
    if (notif.source === 'preview' || notif.source === 'cancel') return;
    _arm();
  });

  // 탭 전환/닫힘 시 즉시 flush (썸네일은 건너뛴다)
  function _onHide() {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      flush({ withThumb: false });
    }
  }
  function _onPageHide() { flush({ withThumb: false }); }

  const _hasDom = typeof document !== 'undefined';
  if (_hasDom) {
    document.addEventListener('visibilitychange', _onHide);
    window.addEventListener('pagehide', _onPageHide);
  }

  function destroy() {
    clearTimeout(_timer);
    _unsub();
    if (_hasDom) {
      document.removeEventListener('visibilitychange', _onHide);
      window.removeEventListener('pagehide', _onPageHide);
    }
  }

  return { flush, destroy, _isPending: () => _pending };
}
