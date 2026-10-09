// 프로젝트 목록(F5-2) + 새 프로젝트 템플릿 고르기(F5-3) — 전체 화면 패널.
import { TEMPLATES, CANVAS_PRESETS } from './templates.js';

let _open = null;

function _fmtTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function openLibrary(projectApi, { currentId = null } = {}) {
  closeLibrary();
  let _sort = 'recent'; // 'recent' | 'name'

  const modal = document.createElement('div'); modal.className = 'library-modal';
  const panel = document.createElement('div'); panel.className = 'library-panel';
  modal.appendChild(panel);

  const head = document.createElement('div'); head.className = 'library-head';
  head.innerHTML = `<span class="library-title">프로젝트 목록</span>`;
  const headRight = document.createElement('div'); headRight.className = 'library-head-right';
  const newBtn = document.createElement('button'); newBtn.className = 'btn accent sm'; newBtn.textContent = '+ 새 프로젝트';
  newBtn.addEventListener('click', () => _openNewDialog());
  const sortBtn = document.createElement('button'); sortBtn.className = 'quiet sm'; sortBtn.textContent = '정렬: 최근 수정';
  sortBtn.addEventListener('click', () => { _sort = _sort === 'recent' ? 'name' : 'recent'; sortBtn.textContent = '정렬: ' + (_sort === 'recent' ? '최근 수정' : '이름'); _render(); });
  const closeBtn = document.createElement('button'); closeBtn.className = 'library-close'; closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeLibrary);
  headRight.append(sortBtn, newBtn, closeBtn);
  head.appendChild(headRight);
  panel.appendChild(head);

  const grid = document.createElement('div'); grid.className = 'library-grid';
  panel.appendChild(grid);

  async function _render() {
    const list = await projectApi.listProjects();
    list.sort((a, b) => _sort === 'name' ? String(a.name).localeCompare(b.name) : (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    grid.textContent = '';
    if (!list.length) { grid.innerHTML = '<div class="library-empty">프로젝트가 없습니다. “새 프로젝트”로 시작하세요.</div>'; return; }
    for (const p of list) {
      const card = document.createElement('div');
      card.className = 'library-card' + (p.id === currentId ? ' is-current' : '');
      card.dataset.id = p.id;
      const thumb = document.createElement('div'); thumb.className = 'library-thumb';
      if (p.thumb) { const img = document.createElement('img'); img.src = p.thumb; img.alt = ''; thumb.appendChild(img); }
      else { thumb.classList.add('no-thumb'); thumb.textContent = '미리보기 없음'; }
      const name = document.createElement('div'); name.className = 'library-name'; name.textContent = p.name || '이름 없음';
      const time = document.createElement('div'); time.className = 'library-time'; time.textContent = _fmtTime(p.updatedAt);
      const acts = document.createElement('div'); acts.className = 'library-acts';
      const open = _btn('열기', async () => { await projectApi.openProjectById(p.id); });
      const dup  = _btn('복제', async () => { await projectApi.duplicateProject(p.id); _render(); });
      const ren  = _btn('이름', async () => { const nn = prompt('새 이름', p.name || ''); if (nn != null && nn.trim()) { await projectApi.renameProject(p.id, nn.trim()); _render(); } });
      const del  = _btn('삭제', async () => { if (confirm(`"${p.name || '이름 없음'}" 을(를) 삭제할까요?`)) { await projectApi.deleteProject(p.id); _render(); } }, 'danger');
      acts.append(open, dup, ren, del);
      thumb.addEventListener('dblclick', () => projectApi.openProjectById(p.id));
      card.append(thumb, name, time, acts);
      grid.appendChild(card);
    }
  }

  // 새 프로젝트: 템플릿 + 캔버스 프리셋 고르기
  function _openNewDialog() {
    const dlg = document.createElement('div'); dlg.className = 'newproj-dialog';
    const box = document.createElement('div'); box.className = 'newproj-box';
    box.innerHTML = `<div class="newproj-title">새 프로젝트</div>`;
    let _tpl = 'empty', _preset = 'ccfolia-cutin';
    const tplWrap = document.createElement('div'); tplWrap.className = 'newproj-section';
    tplWrap.innerHTML = '<div class="newproj-label">템플릿</div>';
    const tplGrid = document.createElement('div'); tplGrid.className = 'newproj-grid';
    for (const t of TEMPLATES) {
      const b = document.createElement('button'); b.className = 'newproj-opt' + (t.key === _tpl ? ' is-on' : ''); b.dataset.tpl = t.key; b.textContent = t.label;
      b.addEventListener('click', () => { _tpl = t.key; tplGrid.querySelectorAll('.newproj-opt').forEach((x) => x.classList.toggle('is-on', x.dataset.tpl === _tpl)); });
      tplGrid.appendChild(b);
    }
    tplWrap.appendChild(tplGrid);
    const pWrap = document.createElement('div'); pWrap.className = 'newproj-section';
    pWrap.innerHTML = '<div class="newproj-label">캔버스 크기</div>';
    const pGrid = document.createElement('div'); pGrid.className = 'newproj-grid';
    for (const p of CANVAS_PRESETS) {
      const b = document.createElement('button'); b.className = 'newproj-opt' + (p.key === _preset ? ' is-on' : ''); b.dataset.preset = p.key; b.textContent = `${p.label} (${p.w}×${p.h})`;
      b.addEventListener('click', () => { _preset = p.key; pGrid.querySelectorAll('.newproj-opt').forEach((x) => x.classList.toggle('is-on', x.dataset.preset === _preset)); });
      pGrid.appendChild(b);
    }
    pWrap.appendChild(pGrid);
    const btns = document.createElement('div'); btns.className = 'newproj-btns';
    const cancel = _btn('취소', () => dlg.remove());
    const create = _btn('만들기', async () => { dlg.remove(); await projectApi.newProjectFromTemplate(_tpl, _preset); }, 'accent');
    btns.append(cancel, create);
    box.append(tplWrap, pWrap, btns);
    dlg.appendChild(box);
    dlg.addEventListener('pointerdown', (e) => { if (e.target === dlg) dlg.remove(); });
    panel.appendChild(dlg);
  }

  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeLibrary(); });
  document.body.appendChild(modal);
  document.addEventListener('keydown', _onKey, true);
  _open = modal;
  _render();
  return { close: closeLibrary };
}

function _btn(label, fn, cls = '') {
  const b = document.createElement('button');
  b.className = 'lib-btn sm' + (cls === 'danger' ? ' lib-danger' : cls === 'accent' ? ' accent' : '');
  b.textContent = label;
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}
function _onKey(e) { if (e.key === 'Escape') closeLibrary(); }
export function closeLibrary() { if (_open) { _open.remove(); _open = null; document.removeEventListener('keydown', _onKey, true); } }
