// R23b — 오른쪽 "효과 컨트롤" 탭. 효과 쌓기(fx-stack)와 효과 레이어 파라미터(effect-section)를 모은다.
//   단일 선택일 때만 내용이 보인다(지금 규칙 유지). 선택이 없거나 여러 개면 "레이어 하나를 고르세요".
import { createFxStackSection } from '../inspector/fx-stack-section.js';
import { createEffectSection } from '../inspector/effect-section.js';

export function createFxControlPanel(store, editorState) {
  const el = document.createElement('div'); el.className = 'side-panel fx-control-panel';
  const scroll = document.createElement('div'); scroll.className = 'inspector-scroll';
  const empty = document.createElement('div'); empty.className = 'inspector-empty'; empty.textContent = '레이어 하나를 고르세요';

  const effect = createEffectSection(store, editorState);   // 효과 레이어 자신
  const fxStack = createFxStackSection(store, editorState);  // 레이어 효과 쌓기
  scroll.append(effect.el, fxStack.el, empty);
  el.appendChild(scroll);

  function _update() {
    empty.style.display = (editorState.get().selection.length === 1) ? 'none' : 'block';
  }
  const unsubES = editorState.subscribe((p) => { if ('selection' in p) _update(); });
  const unsubStore = store.subscribe({ layers: true }, _update);
  _update();

  function destroy() { unsubES(); unsubStore(); fxStack.destroy(); effect.destroy(); }
  return { el, destroy };
}
