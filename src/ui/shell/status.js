// 임시 상태 메시지(토스트) — 화면 하단에 잠깐 표시
let _toastEl = null;
let _toastTimer = null;

export function showToast(msg, ms = 2600) {
  if (!_toastEl) {
    _toastEl = document.createElement('div');
    _toastEl.className = 'app-toast';
    document.body.appendChild(_toastEl);
  }
  _toastEl.textContent = msg;
  _toastEl.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { _toastEl.classList.remove('show'); }, ms);
}
