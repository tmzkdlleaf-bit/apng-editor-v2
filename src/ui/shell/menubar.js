// R23c — 메뉴 막대. 위쪽 막대의 흩어진 버튼을 파일·편집·레이어·효과·애니메이션·보기·도움말 메뉴로 모은다.
//   웹 메뉴 하나를 데스크톱(Tauri)에서도 그대로 쓴다. 항목 옆 단축키 글자는 shortcuts.js 의 표에서만 읽는다.
//   키보드: Alt 로 막대에 초점, 좌우로 메뉴 이동, 위아래로 항목 이동, Enter 실행, Esc 닫기.
import { SHORTCUTS } from '../shortcuts.js';

function _keysFor(scLabel) {
  const row = SHORTCUTS.find((s) => s.label === scLabel);
  return row ? row.keys : null;
}

// menus: [{ id, label, items: [ { label, sc?, keys?, run?, enabled?, sep? } ] }]
export function createMenubar(menus, { onOpenChange } = {}) {
  const bar = document.createElement('div');
  bar.className = 'menubar';
  bar.setAttribute('role', 'menubar');

  const tops = [];            // { btn, def, dd }
  let _open = null;           // 열린 메뉴 index 또는 null
  let _focus = -1;            // 키보드로 초점 둔 top index
  let _itemFocus = -1;

  function _setOpen(v) {
    const was = _open !== null, now = v !== null;
    _open = v;
    if (was !== now) onOpenChange?.(now);
  }

  menus.forEach((def, mi) => {
    const group = document.createElement('div'); group.className = 'menu-group';
    const btn = document.createElement('button');
    btn.className = 'menu-top'; btn.type = 'button';
    btn.textContent = def.label; btn.dataset.menu = def.id ?? def.label;
    btn.setAttribute('aria-haspopup', 'true');
    const dd = document.createElement('div'); dd.className = 'menu-dropdown'; dd.hidden = true;
    btn.addEventListener('click', (e) => { e.stopPropagation(); (_open === mi) ? _close() : _openMenu(mi); });
    btn.addEventListener('mouseenter', () => { if (_open !== null && _open !== mi) _openMenu(mi); });
    group.append(btn, dd);
    bar.appendChild(group);
    tops.push({ btn, def, dd });
  });

  function _buildDropdown(mi) {
    const { def, dd } = tops[mi];
    dd.textContent = '';
    for (const it of def.items) {
      if (it.sep) { const s = document.createElement('div'); s.className = 'menu-sep'; dd.appendChild(s); continue; }
      const row = document.createElement('button');
      row.className = 'menu-item'; row.type = 'button';
      row.disabled = it.enabled ? !it.enabled() : false;
      const lbl = document.createElement('span'); lbl.className = 'menu-item-label'; lbl.textContent = it.label;
      row.appendChild(lbl);
      const keys = it.keys ?? (it.sc ? _keysFor(it.sc) : null);
      if (keys) { const k = document.createElement('span'); k.className = 'menu-key'; k.textContent = keys.join('+'); row.appendChild(k); }
      row.addEventListener('click', (e) => { e.stopPropagation(); if (row.disabled) return; _close(); it.run?.(); });
      row.addEventListener('mouseenter', () => { _itemFocus = _items(mi).indexOf(row); _markItems(mi); });
      dd.appendChild(row);
    }
  }

  function _items(mi) { return [...tops[mi].dd.querySelectorAll('.menu-item:not(:disabled)')]; }
  function _markItems(mi) { const its = _items(mi); its.forEach((el, i) => el.classList.toggle('is-focus', i === _itemFocus)); }

  function _openMenu(mi) {
    if (_open !== null && _open !== mi) { tops[_open].dd.hidden = true; tops[_open].btn.classList.remove('is-open'); }
    _buildDropdown(mi);
    tops[mi].dd.hidden = false; tops[mi].btn.classList.add('is-open');
    _focus = mi; _itemFocus = -1;
    _setOpen(mi);
    setTimeout(() => document.addEventListener('pointerdown', _onOutside, true), 0);
  }
  function _close() {
    if (_open !== null) { tops[_open].dd.hidden = true; tops[_open].btn.classList.remove('is-open'); }
    _setOpen(null); _itemFocus = -1;
    document.removeEventListener('pointerdown', _onOutside, true);
  }
  function _onOutside(e) { if (!bar.contains(e.target)) { _close(); _focus = -1; } }

  function _moveItem(dir) {
    const its = _items(_open); if (!its.length) return;
    _itemFocus = (_itemFocus + dir + its.length) % its.length;
    _markItems(_open);
    its[_itemFocus]?.focus?.();
  }

  function _onKey(e) {
    // Alt 단독 → 막대에 초점(열지는 않음).
    if (e.key === 'Alt' && _open === null && _focus === -1) { e.preventDefault(); _focus = 0; tops[0].btn.focus(); return; }
    if (_open === null && _focus === -1) return;    // 막대가 활성 상태가 아니면 아무 것도 안 함
    if (e.key === 'Escape') { e.preventDefault(); _close(); _focus = -1; return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); const n = (_focus + 1) % tops.length; (_open !== null) ? _openMenu(n) : (tops[(_focus = n)].btn.focus()); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); const n = (_focus - 1 + tops.length) % tops.length; (_open !== null) ? _openMenu(n) : (tops[(_focus = n)].btn.focus()); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); if (_open === null) _openMenu(_focus); _moveItem(1); return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); if (_open !== null) _moveItem(-1); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (_open === null) { _openMenu(_focus); _moveItem(1); }
      else { const el = _items(_open)[_itemFocus]; if (el) el.click(); }
      return;
    }
  }

  document.addEventListener('keydown', _onKey, true);

  function destroy() {
    document.removeEventListener('keydown', _onKey, true);
    document.removeEventListener('pointerdown', _onOutside, true);
  }
  return { el: bar, destroy, close: _close, openMenu: _openMenu };
}
