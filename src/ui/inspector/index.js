// 인스펙터 패널 — 섹션 순서·접힘 (item 9)
// 배치 → 움직임 → 모습 → 보정 → 외곽선·색 덮기·매트 → 정렬
import { createLayoutSection }     from './layout-section.js';
import { createAppearanceSection } from './appearance-section.js';
import { createAlignSection }      from './align-section.js';
import { createAdjustSection }     from './adjust-section.js';
import { createTextSection }       from './text-section.js';
import { createShapeSection }      from './shape-section.js';
import { createTintSection, createMatteSection, createOutlineSection, createExitSection } from './fx-sections.js';
import { createAnimSection } from './info-sections.js';
import { createGroupSection } from './group-section.js';
import { createCameraSection } from './camera-section.js';
import { createInstanceSection } from './instance-section.js';
import { createMotionSection } from './motion-section.js';
import { createEffectSection } from './effect-section.js';
import { makePlaceholderSection }  from './section-shell.js';

const _TYPE_KO = {
  shape: '도형', image: '이미지', text: '텍스트', effect: '이펙트',
  group: '그룹', anim: '애니메이션', adjust: '보정', instance: '인스턴스',
};

export function initInspector(containerEl, store, editorState, getStageDeps = null) {
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
  const motion     = createMotionSection(store, editorState);        // 움직임(F3)
  const appearance = createAppearanceSection(store, editorState);    // 모습
  const shape      = createShapeSection(store, editorState);         // 도형(F1)
  const text       = createTextSection(store, editorState);          // 글자(F1)
  const anim       = createAnimSection(store, editorState);          // 움직이는 이미지 자리(F1-9)
  const group      = createGroupSection(store, editorState);         // 그룹 자리(F1-9)
  const instance   = createInstanceSection(store, editorState);      // 인스턴스(F2-5)
  const effect     = createEffectSection(store, editorState);        // 이펙트(F4)
  const adjust     = createAdjustSection(store, editorState);        // 보정(F1)
  const tint       = createTintSection(store, editorState);          // 색 덮기(F1)
  const matte      = createMatteSection(store, editorState, getStageDeps); // 트랙 매트(F1)
  const outline    = createOutlineSection(store, editorState);       // 외곽선(F1)
  const exit       = createExitSection(store, editorState);          // 흩어지며 퇴장(F1)
  const camera     = createCameraSection(store, editorState);        // 카메라 자리(F1-9)
  const align      = createAlignSection(store, editorState);         // 정렬

  const sections = [layout, motion, appearance, shape, text, anim, group, instance, effect, adjust, tint, matte, outline, exit, camera, align];
  // 스스로 display 를 관리하는 섹션 — 인스펙터의 블랭킷 토글이 전혀 건드리지 않는다
  // (레이어 타입/카메라 키 유무에 따라 각자 숨김/표시).
  const selfManaged = new Set([shape, text, anim, group, instance, effect, adjust, tint, matte, outline, exit, camera]);
  for (const s of sections) scrollEl.appendChild(s.el);
  scrollEl.appendChild(emptyEl);

  function _update() {
    const ids = editorState.get().selection;
    const doc = store.get();
    const show = ids.length > 0;

    // self-managed 섹션은 각자 숨김/표시를 결정하므로 건드리지 않는다.
    // (레이어 타입에 맞는 섹션만 자기 _refresh 로 보이고, 카메라는 키 유무로.)
    for (const s of sections) {
      if (selfManaged.has(s)) continue;
      s.el.style.display = show ? '' : 'none';
    }

    // "레이어를 선택하세요" 안내: 선택이 없고 카메라 섹션도 안 보일 때만.
    const camVisible = camera.el.style.display !== 'none';
    emptyEl.style.display = (!show && !camVisible) ? 'block' : 'none';

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
