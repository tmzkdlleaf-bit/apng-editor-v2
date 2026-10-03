// 그룹 만들기·풀기 공용 로직 (단축키 + 추가 메뉴에서 사용)
import { showToast } from './shell/status.js';

// 새로 추가된 그룹 레이어 id를 패치에서 찾기
function _newGroupId(patches) {
  for (const p of patches) {
    if (p.path.length === 2 && p.path[0] === 'layers' && p.before === undefined
        && p.after?.type === 'group') {
      return p.path[1];
    }
  }
  return null;
}

// 선택 레이어들로 그룹 (같은 부모일 때만). 선택이 없으면 toast로 안내.
export function groupSelection(store, editorState) {
  const es  = editorState.get();
  const doc = store.get();
  const ids = es.selection.filter(id => doc.layers[id]);
  if (!ids.length) { showToast('그룹으로 묶을 레이어를 선택하세요.'); return null; }

  const parents = new Set(ids.map(id => doc.layers[id].parentId ?? null));
  if (parents.size > 1) {
    showToast('같은 그룹 안의 레이어끼리만 묶을 수 있습니다.');
    return null;
  }

  const patches = store.apply({ type: 'group', ids: [...ids] });
  const gid = _newGroupId(patches);
  if (gid) editorState.set({ selection: [gid], expanded: { ...es.expanded, [gid]: true } });
  return gid;
}

// 선택한 그룹 풀기
export function ungroupSelection(store, editorState) {
  const es  = editorState.get();
  const doc = store.get();
  const groupIds = es.selection.filter(id => doc.layers[id]?.type === 'group');
  if (!groupIds.length) { showToast('풀 그룹을 선택하세요.'); return; }

  const freed = [];
  for (const gid of groupIds) {
    const g = doc.layers[gid];
    if (g?.childOrder) freed.push(...g.childOrder);
  }
  const cmds = groupIds.map(gid => ({ type: 'ungroup', groupId: gid }));
  store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  editorState.set({ selection: freed });
}
