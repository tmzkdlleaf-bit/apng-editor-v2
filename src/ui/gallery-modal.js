// 큰 갤러리 창(item 4) — 모션·이펙트 갤러리 공용 틀.
//   왼쪽 분류 목록 · 가운데 검색+카드 격자(마우스 올리면 재생) · 오른쪽 큰 미리보기+설명+[적용].
//   Esc·바깥(백드롭) 클릭으로 닫힘. 카드 미리보기는 "보이는(올린) 카드"만 재생한다.
//
// createGalleryModal({
//   title, items, categoryOf, categoriesOrder,
//   makePreview(canvas, item) -> { drawStatic, play, stop },   // 카드·큰 미리보기 공용
//   describe(item) -> string,
//   onPick(item),
// }) -> { close, el }

export function createGalleryModal({
  title = '갤러리',
  items = [],
  categoryOf = () => '기타',
  categoriesOrder = null,
  makePreview,
  describe = () => '',
  onPick = () => {},
} = {}) {
  const cats = categoriesOrder
    ? categoriesOrder
    : ['전체', ...Array.from(new Set(items.map(categoryOf)))];
  let _cat = '전체';
  let _query = '';
  let _selected = null;
  const _cardPreviews = []; // 카드 미리보기(호버 재생)
  let _bigPreview = null;   // 오른쪽 큰 미리보기(자동 재생)

  const overlay = document.createElement('div');
  overlay.className = 'gallery-modal';
  const panel = document.createElement('div');
  panel.className = 'gallery-panel';
  overlay.appendChild(panel);

  // 머리: 제목 · 검색 · 닫기
  const head = document.createElement('div'); head.className = 'gallery-head';
  const titleEl = document.createElement('div'); titleEl.className = 'gallery-title'; titleEl.textContent = title;
  const search = document.createElement('input'); search.className = 'gallery-search'; search.type = 'text'; search.placeholder = '검색…';
  search.setAttribute('aria-label', title + ' 검색');
  search.addEventListener('input', () => { _query = search.value.trim().toLowerCase(); _renderGrid(); });
  const closeBtn = document.createElement('button'); closeBtn.className = 'gallery-close'; closeBtn.textContent = '✕';
  closeBtn.title = '닫기 (Esc)'; closeBtn.setAttribute('aria-label', '닫기');
  closeBtn.addEventListener('click', () => _close());
  head.append(titleEl, search, closeBtn);

  // 본문: 분류 목록 · 격자 · 미리보기
  const bodyEl = document.createElement('div'); bodyEl.className = 'gallery-body';
  const catList = document.createElement('div'); catList.className = 'gallery-cats';
  const grid = document.createElement('div'); grid.className = 'gallery-grid';
  const aside = document.createElement('div'); aside.className = 'gallery-aside';
  bodyEl.append(catList, grid, aside);

  panel.append(head, bodyEl);

  function _renderCats() {
    catList.textContent = '';
    for (const c of cats) {
      const b = document.createElement('button');
      b.className = 'gallery-cat' + (c === _cat ? ' is-on' : '');
      b.textContent = c;
      b.addEventListener('click', () => { _cat = c; _renderCats(); _renderGrid(); });
      catList.appendChild(b);
    }
  }

  function _filtered() {
    return items.filter((it) =>
      (_cat === '전체' || categoryOf(it) === _cat) &&
      (!_query || (it.name || '').toLowerCase().includes(_query)));
  }

  function _renderGrid() {
    for (const p of _cardPreviews) p.stop();
    _cardPreviews.length = 0;
    grid.textContent = '';
    const list = _filtered();
    if (!list.length) {
      const empty = document.createElement('div'); empty.className = 'gallery-empty'; empty.textContent = '결과 없음';
      grid.appendChild(empty);
      return;
    }
    for (const it of list) {
      const card = document.createElement('button');
      card.className = 'gallery-card';
      card.dataset.id = it.id;
      const cv = document.createElement('canvas'); cv.width = 160; cv.height = 104; cv.className = 'gallery-card-preview';
      const nm = document.createElement('div'); nm.className = 'gallery-card-name'; nm.textContent = it.name;
      card.append(cv, nm);
      const prev = makePreview(cv, it);
      _cardPreviews.push(prev);
      prev.drawStatic();
      card.addEventListener('mouseenter', () => prev.play());   // 보이는(올린) 카드만 재생
      card.addEventListener('mouseleave', () => prev.stop());
      card.addEventListener('click', (e) => { e.stopPropagation(); _select(it); });
      card.addEventListener('dblclick', (e) => { e.stopPropagation(); _apply(it); });
      grid.appendChild(card);
    }
    // 선택 표시 복원
    if (_selected) _markSelectedCard();
  }

  function _markSelectedCard() {
    for (const el of grid.querySelectorAll('.gallery-card')) {
      el.classList.toggle('is-sel', el.dataset.id === _selected?.id);
    }
  }

  function _select(it) {
    _selected = it;
    _markSelectedCard();
    _renderAside();
  }

  function _renderAside() {
    if (_bigPreview) { _bigPreview.stop(); _bigPreview = null; }
    aside.textContent = '';
    if (!_selected) {
      const hint = document.createElement('div'); hint.className = 'gallery-aside-hint';
      hint.textContent = '항목을 고르면 큰 미리보기와 설명이 보입니다.';
      aside.appendChild(hint);
      return;
    }
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 208; cv.className = 'gallery-big-preview';
    const nm = document.createElement('div'); nm.className = 'gallery-big-name'; nm.textContent = _selected.name;
    const desc = document.createElement('div'); desc.className = 'gallery-big-desc'; desc.textContent = describe(_selected) || '';
    const applyBtn = document.createElement('button'); applyBtn.className = 'accent'; applyBtn.textContent = '적용';
    applyBtn.addEventListener('click', () => _apply(_selected));
    aside.append(cv, nm, desc, applyBtn);
    _bigPreview = makePreview(cv, _selected);
    _bigPreview.play(); // 큰 미리보기는 자동 재생
  }

  function _apply(it) {
    _close();
    onPick(it);
  }

  function _close() {
    for (const p of _cardPreviews) p.stop();
    if (_bigPreview) { _bigPreview.stop(); _bigPreview = null; }
    document.removeEventListener('keydown', _onKey, true);
    overlay.remove();
  }
  function _onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); _close(); } }
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) _close(); }); // 백드롭 클릭

  document.body.appendChild(overlay);
  _renderCats(); _renderGrid(); _renderAside();
  setTimeout(() => document.addEventListener('keydown', _onKey, true), 0);
  search.focus();

  return { close: _close, el: overlay, panel };
}
