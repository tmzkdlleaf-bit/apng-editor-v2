// 인스펙터 패널 — 선택 레이어에 따라 섹션 표시
import { createLayoutSection } from './layout-section.js';
import { createLayerSection }  from './layer-section.js';
import { createShapeSection }  from './shape-section.js';
import { createTextSection }   from './text-section.js';

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

  // 섹션들 (E1~E4)
  const layoutSection = createLayoutSection(store, editorState); // E1: 배치
  const layerSection  = createLayerSection(store, editorState);  // E2: 레이어
  const shapeSection  = createShapeSection(store, editorState);  // E3: 도형
  const textSection   = createTextSection(store, editorState);   // E4: 텍스트

  scrollEl.append(
    layoutSection.el,
    layerSection.el,
    shapeSection.el,
    textSection.el,
    emptyEl,
  );

  function _update() {
    const ids = editorState.get().selection;
    const doc = store.get();

    if (!ids.length) {
      summaryEl.style.display = 'none';
      multiEl.style.display   = 'none';
      emptyEl.style.display   = 'block';
      layoutSection.el.style.display = 'none';
      layerSection.el.style.display  = 'none';
      shapeSection.el.style.display  = 'none';
      textSection.el.style.display   = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    layoutSection.el.style.display = '';
    layerSection.el.style.display  = '';

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
    // shape/text 섹션은 각자 _refresh에서 자기 type에 맞게 표시·숨김
  }

  const unsubES    = editorState.subscribe((p) => { if ('selection' in p) _update(); });
  const unsubStore = store.subscribe({ layers: true }, _update);

  _update();

  function destroy() {
    unsubES();
    unsubStore();
    layoutSection.destroy();
    layerSection.destroy();
    shapeSection.destroy();
    textSection.destroy();
  }

  return { destroy };
}
