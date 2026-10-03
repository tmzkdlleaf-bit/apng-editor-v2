// 인스펙터 패널 — 선택 레이어에 따라 섹션 표시
import { createLayoutSection } from './layout-section.js';

const _TYPE_KO = {
  shape: '도형', image: '이미지', text: '텍스트', effect: '이펙트',
  group: '그룹', anim: '애니메이션', adjust: '보정', instance: '인스턴스',
};

export function initInspector(containerEl, store, editorState) {
  const scrollEl = document.createElement('div');
  scrollEl.className = 'inspector-scroll';

  const emptyEl = document.createElement('div');
  emptyEl.className = 'inspector-empty';
  emptyEl.textContent = '레이어를 선택하세요';

  const summaryEl = document.createElement('div');
  summaryEl.className = 'inspector-layer-summary';
  summaryEl.style.display = 'none';

  const nameEl = document.createElement('span');
  nameEl.className = 'inspector-layer-name';
  const typeEl = document.createElement('span');
  typeEl.className = 'inspector-layer-type';
  summaryEl.append(nameEl, typeEl);

  const multiEl = document.createElement('div');
  multiEl.className = 'inspector-multi';
  multiEl.style.display = 'none';

  containerEl.append(summaryEl, multiEl, scrollEl);

  // 레이아웃 섹션
  const layoutSection = createLayoutSection(store, editorState);
  scrollEl.appendChild(layoutSection.el);
  scrollEl.appendChild(emptyEl);

  function _update() {
    const ids = editorState.get().selection;
    const doc = store.get();

    if (!ids.length) {
      summaryEl.style.display = 'none';
      multiEl.style.display   = 'none';
      emptyEl.style.display   = 'block';
      layoutSection.el.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    layoutSection.el.style.display = '';

    if (ids.length === 1) {
      const layer = doc.layers[ids[0]];
      summaryEl.style.display = 'flex';
      multiEl.style.display   = 'none';
      if (layer) {
        nameEl.textContent = layer.name || layer.type;
        typeEl.textContent = _TYPE_KO[layer.type] ?? layer.type;
      }
    } else {
      summaryEl.style.display = 'none';
      multiEl.style.display   = 'block';
      multiEl.textContent     = `${ids.length}개 레이어 선택됨`;
    }
  }

  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _update(); });
  const unsubStore = store.subscribe({ layers: true }, _update);

  _update();

  function destroy() {
    unsubES();
    unsubStore();
    layoutSection.destroy();
  }

  return { destroy };
}
