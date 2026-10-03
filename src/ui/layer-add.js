// 레이어 추가 메뉴 — 버튼 클릭 시 드롭다운 표시
import { createLayer } from '../core/doc/schema.js';

const _ITEMS = [
  { key: 'rect',     label: '사각형',   type: 'shape', shape: { kind: 'rect',    w: 100, h: 100, fill: '#5eb8f0', stroke: null } },
  { key: 'ellipse',  label: '원',       type: 'shape', shape: { kind: 'ellipse', w: 80,  h: 80,  fill: '#f0a35e', stroke: null } },
  { key: 'triangle', label: '삼각형',   type: 'shape', shape: { kind: 'polygon', sides: 3, w: 80, h: 80, fill: '#9b59b6', stroke: null } },
  { key: 'hexagon',  label: '육각형',   type: 'shape', shape: { kind: 'polygon', sides: 6, w: 80, h: 80, fill: '#2ecc71', stroke: null } },
  { key: 'text',     label: '텍스트',   type: 'text'  },
  { key: 'image',    label: '이미지',   type: 'image' },
];

export function createLayerAddMenu(store, editorState, containerEl) {
  const btn  = document.createElement('button');
  btn.className = 'tl-add-btn';
  btn.dataset.action = 'add-layer';
  btn.textContent = '+ 레이어';
  btn.title = '레이어 추가';

  const menu = document.createElement('div');
  menu.className = 'layer-add-menu';
  menu.style.display = 'none';

  for (const item of _ITEMS) {
    const el = document.createElement('button');
    el.className = 'layer-add-item';
    el.dataset.kind = item.key;
    el.textContent = item.label;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      _addLayer(item);
      _close();
    });
    menu.appendChild(el);
  }

  // 이미지 파일 입력
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    _addImageFile(file);
    fileInput.value = '';
  });

  containerEl.appendChild(btn);
  containerEl.appendChild(menu);
  document.body.appendChild(fileInput);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', _close);

  function _close() { menu.style.display = 'none'; }

  function _addLayer(item) {
    const doc   = store.get();
    const cx    = Math.round(doc.meta.width  / 2);
    const cy    = Math.round(doc.meta.height / 2);

    if (item.key === 'image') {
      fileInput.click();
      return;
    }

    const layer = createLayer(item.type, { name: item.label });
    layer.transform.x.value = cx;
    layer.transform.y.value = cy;

    if (item.type === 'shape') {
      layer.shape = { ...item.shape };
    } else if (item.type === 'text') {
      layer.text  = '텍스트';
      layer.size  = 48;
      layer.color = '#ffffff';
    }

    // 현재 선택 위치 바로 위에 삽입 (기본: 최상단)
    const topIndex = doc.order.length;
    store.apply({ type: 'addLayer', layer, index: topIndex });
    editorState.set({ selection: [layer.id] });
  }

  function _addImageFile(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const doc     = store.get();
      const assetId = 'img_' + Date.now();
      const layer   = createLayer('image', { name: file.name.replace(/\.[^.]+$/, ''), assetId });
      layer.transform.x.value = Math.round(doc.meta.width  / 2);
      layer.transform.y.value = Math.round(doc.meta.height / 2);

      store.apply({ type: 'addLayer', layer, index: doc.order.length });
      // 에셋 저장 (store.apply setMeta로 불가 → doc을 직접 건드릴 수 없으므로
      // assets는 store 밖 별도 관리 or addAsset 명령 필요 — 여기서는 별도 addAsset 처리)
      // P6 범위: 파일 선택 경로만 열고 assetId 기록; 렌더는 assets 모듈에서 처리
      store.get().assets[assetId] = { dataUrl };
      editorState.set({ selection: [layer.id] });
    };
    reader.readAsDataURL(file);
  }

  function destroy() {
    document.removeEventListener('click', _close);
    fileInput.remove();
  }

  return { btn, menu, destroy };
}
