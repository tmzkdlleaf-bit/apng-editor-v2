// 타임라인 트랙 팝업 메뉴 — 클립 메뉴(F3-3)·이징 메뉴·커스텀 베지어 편집.
//   track-canvas.js 에서 나눴다(R23d item 12). 동작은 그대로.
import { EASE_LABELS } from '../../core/anim/easing.js';
import { easeCurveSvg } from '../controls/ease-preview.js';
import { createBezierEditor } from '../controls/bezier-editor.js';

export function createTrackMenus({ store, editorState, applyEase }) {
  // ── 클립 메뉴(F3-3): 루프 토글·자르기·복제·삭제 ───────────────────────
  let _clipMenu = null;
  function _closeClipMenu() { if (_clipMenu) { _clipMenu.remove(); _clipMenu = null; document.removeEventListener('pointerdown', _onClipMenuDown, true); } }
  function _onClipMenuDown(ev) { if (_clipMenu && !_clipMenu.contains(ev.target)) _closeClipMenu(); }
  function _showClipMenu(clientX, clientY, layerId, clipId) {
    _closeClipMenu();
    const doc = store.get();
    const clip = (doc.layers[layerId]?.clips ?? []).find(c => c.id === clipId);
    if (!clip) return;
    const f = editorState.get().f;
    const items = [
      [clip.loop ? '루프 끄기' : '루프 켜기', () => store.apply({ type: 'setClip', id: layerId, clipId, patch: { loop: !clip.loop } })],
      ['재생선에서 자르기', () => store.apply({ type: 'splitClip', id: layerId, clipId, f })],
      ['복제', () => store.apply({ type: 'duplicateClip', id: layerId, clipId })],
      ['삭제', () => store.apply({ type: 'removeClip', id: layerId, clipId })],
    ];
    const menu = document.createElement('div');
    menu.className = 'kf-ease-menu';
    for (const [label, fn] of items) {
      const b = document.createElement('button');
      b.className = 'kf-ease-item'; b.textContent = label;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); _closeClipMenu(); fn(); });
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    menu.style.left = Math.min(clientX, window.innerWidth - menu.offsetWidth - 8) + 'px';
    menu.style.top  = Math.min(clientY, window.innerHeight - menu.offsetHeight - 8) + 'px';
    _clipMenu = menu;
    setTimeout(() => document.addEventListener('pointerdown', _onClipMenuDown, true), 0);
  }

  // ── 이징 메뉴 ─────────────────────────────────────────────────────────
  let _easeMenu = null;
  function _closeEaseMenu() { if (_easeMenu) { _easeMenu.remove(); _easeMenu = null; } }

  let _bezier = null;
  function _showEaseMenu(clientX, clientY, targets) {
    _closeEaseMenu();
    const menu = document.createElement('div');
    menu.className = 'kf-ease-menu';
    for (const [name, label] of Object.entries(EASE_LABELS)) {
      const item = document.createElement('button');
      item.className = 'kf-ease-item';
      // 작은 곡선 그림 + 이름
      item.innerHTML = `<span class="kf-ease-curve">${easeCurveSvg(name)}</span><span>${label}</span>`;
      item.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (name === 'cubicBezier') { _openBezierEditor(targets); return; }
        applyEase(targets, name);
        _closeEaseMenu();
      });
      menu.appendChild(item);
    }
    document.body.appendChild(menu);
    menu.style.left = Math.min(clientX, window.innerWidth  - menu.offsetWidth  - 8) + 'px';
    menu.style.top  = Math.min(clientY, window.innerHeight - menu.offsetHeight - 8) + 'px';
    _easeMenu = menu;
    setTimeout(() => document.addEventListener('pointerdown', _onDocDown, { once: true }), 0);
  }

  // 커스텀 베지어 편집 — 그래프에서 제어점 끌기 + 숫자 입력. 바깥 클릭/적용 시 커밋.
  function _openBezierEditor(targets) {
    _closeEaseMenu();
    if (_bezier) { _bezier.destroy(); _bezier.wrap.remove(); _bezier = null; }
    const wrap = document.createElement('div');
    wrap.className = 'kf-ease-menu bezier-popover';
    const title = document.createElement('div'); title.className = 'bezier-title'; title.textContent = '커스텀 베지어';
    wrap.appendChild(title);
    const editor = createBezierEditor({
      value: [0.25, 0.1, 0.25, 1.0],
      onCommit: (v) => applyEase(targets, 'cubicBezier', v),
    });
    wrap.appendChild(editor.el);
    const applyBtn = document.createElement('button'); applyBtn.className = 'accent sm'; applyBtn.textContent = '적용';
    applyBtn.addEventListener('click', (ev) => { ev.stopPropagation(); applyEase(targets, 'cubicBezier', editor.getValue()); _closeBezier(); });
    wrap.appendChild(applyBtn);
    document.body.appendChild(wrap);
    const r = { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
    wrap.style.left = Math.min(200, r.innerWidth - wrap.offsetWidth - 8) + 'px';
    wrap.style.top  = Math.min(120, r.innerHeight - wrap.offsetHeight - 8) + 'px';
    _bezier = { wrap, editor, destroy: editor.destroy };
    const onDown = (e) => { if (!wrap.contains(e.target)) _closeBezier(); };
    setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
    _bezier.onDown = onDown;
  }
  function _closeBezier() {
    if (!_bezier) return;
    document.removeEventListener('pointerdown', _bezier.onDown, true);
    _bezier.editor.destroy(); _bezier.wrap.remove(); _bezier = null;
  }
  function _onDocDown(e) {
    if (_easeMenu && !_easeMenu.contains(e.target)) _closeEaseMenu();
  }

  function closeAll() { _closeEaseMenu(); _closeClipMenu(); _closeBezier(); }

  return { showClipMenu: _showClipMenu, showEaseMenu: _showEaseMenu, closeAll };
}
