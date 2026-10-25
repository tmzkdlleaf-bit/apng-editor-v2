// 코코포리아 화면 미리보기(R14-2) — 내보낸 실제 파일을 사용자 화면 캡처 위에 올려 본다.
// 코코포리아의 정확한 표시 규칙은 추측하지 않는다. 사용자가 크기·위치를 직접 맞춘다.
//   배경: 사용자가 넣은 스크린샷(IndexedDB 에셋, 마지막 id 를 localStorage 기억, 에셋 정리 보호).
//   그 위에 방금 내보낸 Blob 을 <img> 로 — 브라우저가 실제 재생하는 속도·반복 그대로.
import { putAsset, getAsset } from '../../core/io/assets.js';
import { showToast } from '../shell/status.js';

const BG_KEY  = 'apng2.ccfoliaBg';     // 마지막 배경 에셋 id
const POS_KEY = 'apng2.ccfoliaPos';    // { scale, x, y }

let _open = null;
const _urls = [];
function _trackUrl(u) { _urls.push(u); return u; }
function _revokeAll() { for (const u of _urls) { try { URL.revokeObjectURL(u); } catch {} } _urls.length = 0; }

function _loadPos() { try { return JSON.parse(localStorage.getItem(POS_KEY)) || {}; } catch { return {}; } }
function _savePos(p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {} }

// result: { blob, filename, mime }
export function openCcfoliaPreview(result) {
  closeCcfoliaPreview();
  const modal = document.createElement('div'); modal.className = 'ccf-modal';
  const panel = document.createElement('div'); panel.className = 'ccf-panel';
  modal.appendChild(panel);

  const head = document.createElement('div'); head.className = 'ccf-head';
  head.innerHTML = '<span class="ccf-title">화면에서 미리보기</span>';
  const headRight = document.createElement('div'); headRight.className = 'ccf-head-right';
  const bgBtn = document.createElement('button'); bgBtn.className = 'quiet sm'; bgBtn.textContent = '배경 넣기';
  const closeBtn = document.createElement('button'); closeBtn.className = 'ccf-close'; closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeCcfoliaPreview);
  headRight.append(bgBtn, closeBtn);
  head.appendChild(headRight);
  panel.appendChild(head);

  // 무대(배경 + 올린 파일)
  const stage = document.createElement('div'); stage.className = 'ccf-stage';
  const bgImg = document.createElement('img'); bgImg.className = 'ccf-bg'; bgImg.alt = '';
  const hint = document.createElement('div'); hint.className = 'ccf-bg-hint'; hint.textContent = '코코포리아 화면 캡처를 넣으세요';
  const overlay = document.createElement('img'); overlay.className = 'ccf-overlay'; overlay.alt = '내보낸 결과';
  stage.append(bgImg, hint, overlay);
  panel.appendChild(stage);

  // 조절 바
  const bar = document.createElement('div'); bar.className = 'ccf-bar';
  const scaleLabel = document.createElement('span'); scaleLabel.className = 'ccf-scale-label';
  const centerBtn = document.createElement('button'); centerBtn.className = 'sm'; centerBtn.textContent = '가운데';
  const fillBtn   = document.createElement('button'); fillBtn.className = 'sm'; fillBtn.textContent = '화면 꽉';
  const realBtn   = document.createElement('button'); realBtn.className = 'sm'; realBtn.textContent = '원래 크기';
  const replayBtn = document.createElement('button'); replayBtn.className = 'sm'; replayBtn.textContent = '다시 재생';
  bar.append(scaleLabel, centerBtn, fillBtn, realBtn, replayBtn);
  panel.appendChild(bar);

  // 상태
  let pos = { scale: 1, x: 0.5, y: 0.5, ..._loadPos() }; // x,y = 무대 비율(0~1) 중심
  let natW = result.width || 0, natH = result.height || 0;

  // 내보낸 결과를 <img> 로.
  const url = _trackUrl(URL.createObjectURL(result.blob));
  overlay.src = url;
  overlay.addEventListener('load', () => { natW = overlay.naturalWidth || natW; natH = overlay.naturalHeight || natH; _applyPos(); });

  function _applyPos() {
    const sr = stage.getBoundingClientRect();
    const w = natW * pos.scale, h = natH * pos.scale;
    overlay.style.width = w + 'px'; overlay.style.height = h + 'px';
    overlay.style.left = (pos.x * sr.width - w / 2) + 'px';
    overlay.style.top  = (pos.y * sr.height - h / 2) + 'px';
    scaleLabel.textContent = `${Math.round(pos.scale * 100)}%`;
    _savePos(pos);
  }

  centerBtn.addEventListener('click', () => { pos.x = 0.5; pos.y = 0.5; _applyPos(); });
  realBtn.addEventListener('click', () => { pos.scale = 1; _applyPos(); });
  fillBtn.addEventListener('click', () => {
    const sr = stage.getBoundingClientRect();
    if (natW && natH) pos.scale = Math.min(sr.width / natW, sr.height / natH);
    pos.x = 0.5; pos.y = 0.5; _applyPos();
  });
  // 다시 재생 — src 를 비웠다 다시 넣어 처음부터(반복 1회 파일 확인용).
  replayBtn.addEventListener('click', () => { overlay.src = ''; overlay.src = url; });

  // 끌어서 위치, 휠로 크기.
  let drag = null;
  overlay.addEventListener('pointerdown', (e) => {
    e.preventDefault(); overlay.setPointerCapture?.(e.pointerId);
    const sr = stage.getBoundingClientRect();
    drag = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y, w: sr.width, h: sr.height };
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!drag) return;
    pos.x = drag.x + (e.clientX - drag.px) / drag.w;
    pos.y = drag.y + (e.clientY - drag.py) / drag.h;
    _applyPos();
  });
  overlay.addEventListener('pointerup', (e) => { if (drag) { drag = null; overlay.releasePointerCapture?.(e.pointerId); } });
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    pos.scale = Math.max(0.05, Math.min(8, pos.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    _applyPos();
  }, { passive: false });

  // 배경 불러오기/넣기.
  async function _showBg(assetId) {
    if (!assetId) { bgImg.style.display = 'none'; hint.style.display = ''; return; }
    try {
      const blob = await getAsset(assetId);
      if (!blob) { bgImg.style.display = 'none'; hint.style.display = ''; return; }
      bgImg.src = _trackUrl(URL.createObjectURL(blob));
      bgImg.style.display = ''; hint.style.display = 'none';
    } catch { bgImg.style.display = 'none'; hint.style.display = ''; }
  }
  const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]; fileInput.value = '';
    if (!file) return;
    try {
      const { id } = await putAsset(file, '코코포리아 배경');
      try { localStorage.setItem(BG_KEY, id); } catch {}
      await _showBg(id);
    } catch (e) { showToast('배경을 넣지 못했습니다: ' + (e?.message ?? e)); }
  });
  bgBtn.addEventListener('click', () => fileInput.click());
  document.body.appendChild(fileInput);

  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeCcfoliaPreview(); });
  document.body.appendChild(modal);
  document.addEventListener('keydown', _onKey, true);
  _open = { modal, fileInput };

  // 마지막 배경 복원 + 초기 배치.
  let lastBg = null; try { lastBg = localStorage.getItem(BG_KEY); } catch {}
  _showBg(lastBg);
  requestAnimationFrame(_applyPos);

  // 테스트용
  window.__ccfoliaPreview = { overlay, bgImg, el: modal, getPos: () => ({ ...pos }) };
  return { close: closeCcfoliaPreview };
}

function _onKey(e) { if (e.key === 'Escape') closeCcfoliaPreview(); }

export function closeCcfoliaPreview() {
  if (_open) {
    _open.modal.remove();
    _open.fileInput?.remove();
    _open = null;
    document.removeEventListener('keydown', _onKey, true);
  }
  _revokeAll(); // 객체 URL 해제(배경·올린 파일)
  if (window.__ccfoliaPreview) window.__ccfoliaPreview = null;
}
