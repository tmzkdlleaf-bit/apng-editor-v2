// 직접 만든 드롭다운 — 브라우저 기본 <select> 대체. 토큰 색만 써서 다크/라이트 모두 또렷하게.
// createDropdown({ options, value, onChange, renderItem, ariaLabel, className }) →
//   { el, getValue, setValue, setOptions, open, close, isOpen, destroy }
//
// options: [{ value, label, render?(optionEl) }]  (value 는 문자열로 비교)
// 키보드: ↑↓ 이동, Enter/Space 선택, Esc 닫기, 글자 입력으로 항목 찾기(타이핑 서치).
//   마우스 휠로 값 바꾸기는 하지 않는다(실수 방지).
// onChange(value) 는 값이 실제로 '바뀔 때만' 호출한다(되돌리기/기록 1건).
// 미리보기가 필요한 항목은 renderItem(optionEl, option) 으로 그린다(예: 블렌드 견본).
//
// 목록은 document.body 에 fixed 로 띄워 패널 클리핑을 피한다.

let _idSeq = 0;

export function createDropdown({
  options = [],
  value = null,
  onChange = () => {},
  renderItem = null,
  ariaLabel = '',
  className = '',
} = {}) {
  let _options = options.slice();
  let _value = value != null ? String(value) : (_options[0] ? String(_options[0].value) : '');
  let _open = false;
  let _activeIndex = -1;
  let _typeBuf = '';
  let _typeTimer = null;
  const _listId = `dd-list-${++_idSeq}`;

  // ── 트리거 버튼 ─────────────────────────────────────────────────────
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'dropdown' + (className ? ' ' + className : '');
  el.setAttribute('role', 'combobox');
  el.setAttribute('aria-haspopup', 'listbox');
  el.setAttribute('aria-expanded', 'false');
  el.setAttribute('aria-controls', _listId);
  if (ariaLabel) el.setAttribute('aria-label', ariaLabel);

  const valueEl = document.createElement('span');
  valueEl.className = 'dropdown-value';
  const caret = document.createElement('span');
  caret.className = 'dropdown-caret';
  caret.setAttribute('aria-hidden', 'true');
  el.append(valueEl, caret);

  // ── 목록(body 에 fixed) ─────────────────────────────────────────────
  const list = document.createElement('div');
  list.className = 'dropdown-list';
  list.id = _listId;
  list.setAttribute('role', 'listbox');
  if (ariaLabel) list.setAttribute('aria-label', ariaLabel);
  list.hidden = true;

  function _optById(i) { return list.children[i]; }

  function _renderTrigger() {
    const opt = _options.find((o) => String(o.value) === _value);
    valueEl.textContent = '';
    if (opt && renderItem) renderItem(valueEl, opt);
    else valueEl.textContent = opt ? opt.label : '';
    el.dataset.value = _value;  // 테스트·외부에서 현재 값 읽기용
  }

  function _buildList() {
    list.textContent = '';
    _options.forEach((o, i) => {
      const item = document.createElement('div');
      item.className = 'dropdown-option';
      item.setAttribute('role', 'option');
      item.dataset.index = String(i);
      item.dataset.value = String(o.value);
      item.id = `${_listId}-opt-${i}`;
      const selected = String(o.value) === _value;
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
      if (renderItem) renderItem(item, o);
      else item.textContent = o.label;
      item.addEventListener('pointerenter', () => _setActive(i, false));
      item.addEventListener('click', () => { _choose(i); });
      list.appendChild(item);
    });
  }

  function _setActive(i, scroll = true) {
    _activeIndex = i;
    for (let k = 0; k < list.children.length; k++) {
      list.children[k].classList.toggle('is-active', k === i);
    }
    const node = _optById(i);
    if (node) {
      el.setAttribute('aria-activedescendant', node.id);
      if (scroll) node.scrollIntoView({ block: 'nearest' });
    }
  }

  function _position() {
    const r = el.getBoundingClientRect();
    list.style.minWidth = r.width + 'px';
    list.style.left = r.left + 'px';
    // 아래로 띄우되, 화면 아래가 좁으면 위로.
    const below = window.innerHeight - r.bottom;
    const want = Math.min(list.scrollHeight || 240, 280);
    if (below < want && r.top > below) {
      list.style.top = '';
      list.style.bottom = (window.innerHeight - r.top) + 'px';
    } else {
      list.style.bottom = '';
      list.style.top = r.bottom + 'px';
    }
  }

  function open() {
    if (_open || el.disabled) return;
    _open = true;
    _buildList();
    document.body.appendChild(list);
    list.hidden = false;
    el.setAttribute('aria-expanded', 'true');
    el.classList.add('is-open');
    _position();
    const sel = _options.findIndex((o) => String(o.value) === _value);
    _setActive(sel >= 0 ? sel : 0);
    document.addEventListener('pointerdown', _onDocDown, true);
    window.addEventListener('resize', _position);
    window.addEventListener('scroll', _position, true);
  }

  function close() {
    if (!_open) return;
    _open = false;
    list.hidden = true;
    if (list.parentNode) list.parentNode.removeChild(list);
    el.setAttribute('aria-expanded', 'false');
    el.removeAttribute('aria-activedescendant');
    el.classList.remove('is-open');
    document.removeEventListener('pointerdown', _onDocDown, true);
    window.removeEventListener('resize', _position);
    window.removeEventListener('scroll', _position, true);
  }

  function _onDocDown(e) {
    if (el.contains(e.target) || list.contains(e.target)) return;
    close();
  }

  function _choose(i) {
    const opt = _options[i];
    if (!opt) { close(); return; }
    const next = String(opt.value);
    const changed = next !== _value;
    _value = next;
    _renderTrigger();
    close();
    el.focus();
    if (changed) onChange(opt.value);
  }

  // ── 키보드 ──────────────────────────────────────────────────────────
  el.addEventListener('keydown', (e) => {
    if (!_open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault(); open(); return;
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); _setActive(Math.min(_activeIndex + 1, _options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _setActive(Math.max(_activeIndex - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); _setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); _setActive(_options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _choose(_activeIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); el.focus(); }
    else if (e.key === 'Tab') { close(); }
    else if (e.key.length === 1) { _typeAhead(e.key); }
  });

  function _typeAhead(ch) {
    clearTimeout(_typeTimer);
    _typeBuf += ch.toLowerCase();
    _typeTimer = setTimeout(() => { _typeBuf = ''; }, 600);
    const start = _activeIndex + (_typeBuf.length > 1 ? 0 : 1);
    for (let k = 0; k < _options.length; k++) {
      const idx = (start + k) % _options.length;
      const lbl = (_options[idx].label || '').toLowerCase();
      if (lbl.startsWith(_typeBuf)) { _setActive(idx); return; }
    }
  }

  el.addEventListener('click', () => { if (_open) close(); else open(); });

  // ── 바깥 API ────────────────────────────────────────────────────────
  function getValue() { return _value; }
  function setValue(v) {
    _value = v != null ? String(v) : '';
    _renderTrigger();
    if (_open) _buildList();
  }
  function setOptions(next) {
    _options = next.slice();
    if (!_options.some((o) => String(o.value) === _value)) {
      _value = _options[0] ? String(_options[0].value) : '';
    }
    _renderTrigger();
    if (_open) _buildList();
  }
  function destroy() {
    close();
    clearTimeout(_typeTimer);
  }

  _renderTrigger();
  return { el, getValue, setValue, setOptions, open, close, isOpen: () => _open, destroy };
}
