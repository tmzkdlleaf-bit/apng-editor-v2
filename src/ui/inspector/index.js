// 인스펙터 패널 — 섹션 순서·접힘 (item 9)
// 배치 → 움직임 → 모습 → 보정 → 외곽선·색 덮기·매트 → 정렬
import { createLayoutSection }     from './layout-section.js';
import { createAppearanceSection } from './appearance-section.js';
import { createAlignSection }      from './align-section.js';
import { makePlaceholderSection }  from './section-shell.js';

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

  // 섹션 (순서 고정)
  const layout     = createLayoutSection(store, editorState);        // 배치
  const motion     = makePlaceholderSection('움직임', '프리셋 모션 · 클립 — 준비 중');
  const appearance = createAppearanceSection(store, editorState);    // 모습
  const adjust     = makePlaceholderSection('보정', '밝기 · 대비 · 색조 — 준비 중');
  const outline    = makePlaceholderSection('외곽선 · 색 덮기 · 매트', '준비 중');
  const align      = createAlignSection(store, editorState);         // 정렬

  const sections = [layout, motion, appearance, adjust, outline, align];
  for (const s of sections) scrollEl.appendChild(s.el);
  scrollEl.appendChild(emptyEl);

  function _update() {
    const ids = editorState.get().selection;
    const doc = store.get();
    const show = ids.length > 0;

    emptyEl.style.display = show ? 'none' : 'block';
    for (const s of sections) s.el.style.display = show ? '' : 'none';

    if (!show) {
      summaryEl.style.display = 'none';
      multiEl.style.display   = 'none';
      return;
    }

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
    for (const s of sections) s.destroy?.();
  }

  return { destroy };
}
