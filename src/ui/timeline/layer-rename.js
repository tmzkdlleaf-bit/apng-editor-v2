// 타임라인 레이어 이름 편집 — layer-list.js 에서 나눴다(R23d item 12). 동작은 그대로.

export function startRename(store, id, nameEl, rebuild) {
  const layer = store.get().layers[id];
  if (!layer) return;
  const input = document.createElement('input');
  input.className = 'tl-name-edit';
  input.value = layer.name || '';
  input.style.cssText = 'width:100%; font:inherit; background:var(--bg2); color:var(--fg); border:1px solid var(--acc); padding:0 2px; font-size:12px;';
  nameEl.replaceWith(input);
  input.select();
  // Enter 와 blur 양쪽에서 불려도 한 번만 적용(되돌리기 1건). 이름이 같으면 적용하지 않는다.
  let _done = false;
  function _commit() {
    if (_done) return;
    _done = true;
    const newName = input.value.trim() || layer.name;
    if (newName !== layer.name) store.apply({ type: 'setLayer', id, patch: { name: newName } });
    else rebuild(); // 변경 없음 — 입력 칸만 정리
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      // 한글 조합(IME) 중 Enter 는 글자 확정용이므로 무시(마지막 글자 유실·중복 방지).
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault(); input.blur(); // 확정은 blur 한 경로로 통일
    } else if (e.key === 'Escape') {
      if (e.isComposing || e.keyCode === 229) return;
      _done = true; rebuild();
    }
    e.stopPropagation();
  });
  input.addEventListener('blur', _commit);
}
