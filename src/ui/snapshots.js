// 저장 시점 창(R12-3) — 시각·이름·썸네일 목록. 고르면 이 시점으로 되돌리기 / 새 프로젝트로 열기.
// 직접 "지금 시점 저장"(이름 입력)도 둔다. library.js 와 같은 모달 틀.
let _open = null;
let _urls = [];

function _fmtTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function _thumbUrl(thumb) {
  if (!thumb) return null;
  if (typeof thumb === 'string') return thumb;
  try { const u = URL.createObjectURL(thumb); _urls.push(u); return u; } catch { return null; }
}

export function openSnapshots(projectApi) {
  closeSnapshots();

  const modal = document.createElement('div'); modal.className = 'library-modal';
  const panel = document.createElement('div'); panel.className = 'library-panel';
  modal.appendChild(panel);

  const head = document.createElement('div'); head.className = 'library-head';
  head.innerHTML = `<span class="library-title">저장 시점</span>`;
  const headRight = document.createElement('div'); headRight.className = 'library-head-right';
  const saveBtn = document.createElement('button'); saveBtn.className = 'btn accent sm'; saveBtn.textContent = '+ 지금 시점 저장';
  saveBtn.addEventListener('click', async () => {
    const name = prompt('이 시점의 이름(선택)', '');
    if (name === null) return; // 취소
    await projectApi.createSnapshot(name.trim());
    _render();
  });
  const closeBtn = document.createElement('button'); closeBtn.className = 'library-close'; closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeSnapshots);
  headRight.append(saveBtn, closeBtn);
  head.appendChild(headRight);
  panel.appendChild(head);

  const grid = document.createElement('div'); grid.className = 'library-grid';
  panel.appendChild(grid);

  async function _render() {
    for (const u of _urls) { try { URL.revokeObjectURL(u); } catch {} }
    _urls = [];
    const list = await projectApi.listSnapshots();
    grid.textContent = '';
    if (!list.length) { grid.innerHTML = '<div class="library-empty">저장 시점이 없습니다. 작업하면 자동으로 쌓이고, “지금 시점 저장”으로 직접 남길 수도 있습니다.</div>'; return; }
    for (const s of list) {
      const card = document.createElement('div'); card.className = 'library-card'; card.dataset.id = s.id;
      const thumb = document.createElement('div'); thumb.className = 'library-thumb';
      const url = _thumbUrl(s.thumb);
      if (url) { const img = document.createElement('img'); img.src = url; img.alt = ''; thumb.appendChild(img); }
      else { thumb.classList.add('no-thumb'); thumb.textContent = '미리보기 없음'; }
      const name = document.createElement('div'); name.className = 'library-name';
      name.textContent = s.label || (s.auto ? '자동 저장' : '직접 저장');
      const time = document.createElement('div'); time.className = 'library-time';
      time.textContent = _fmtTime(s.createdAt) + (s.auto ? '' : ' · 직접');
      const acts = document.createElement('div'); acts.className = 'library-acts';
      const rev = _btn('이 시점으로 되돌리기', async () => {
        if (confirm('현재 상태는 자동으로 한 번 저장되고, 이 시점으로 되돌립니다.')) {
          const ok = await projectApi.revertToSnapshot(s.id);
          if (ok) closeSnapshots();
        }
      }, 'accent');
      const asNew = _btn('새 프로젝트로 열기', async () => { await projectApi.openSnapshotAsNewProject(s.id); });
      const del = _btn('삭제', async () => { if (confirm('이 저장 시점을 지울까요?')) { await projectApi.deleteSnapshot(s.id); _render(); } }, 'danger');
      acts.append(rev, asNew, del);
      card.append(thumb, name, time, acts);
      grid.appendChild(card);
    }
  }

  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeSnapshots(); });
  document.body.appendChild(modal);
  document.addEventListener('keydown', _onKey, true);
  _open = modal;
  _render();
  return { close: closeSnapshots };
}

function _btn(label, fn, cls = '') {
  const b = document.createElement('button');
  b.className = 'lib-btn sm' + (cls === 'danger' ? ' lib-danger' : cls === 'accent' ? ' accent' : '');
  b.textContent = label;
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}
function _onKey(e) { if (e.key === 'Escape') closeSnapshots(); }
export function closeSnapshots() {
  if (_open) { _open.remove(); _open = null; document.removeEventListener('keydown', _onKey, true); }
  for (const u of _urls) { try { URL.revokeObjectURL(u); } catch {} }
  _urls = [];
}
