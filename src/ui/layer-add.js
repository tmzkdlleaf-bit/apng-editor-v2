// 레이어 추가 메뉴 — 버튼 클릭 또는 캔버스 드래그로 레이어 추가
import { createLayer, newId } from '../core/doc/schema.js';

// AddMenu 설계: 이미지 / 글자 / 도형 / 이펙트 / 그룹 / 조정 / 움직이는 이미지 / PSD
// 이번에 안 되는 항목은 disabled + "준비 중"
const _MENU = [
  { kind: 'image',    label: '이미지',                type: 'image' },
  { kind: 'anim',     label: '움직이는 이미지 (GIF·APNG)', disabled: true },
  { kind: 'text',     label: '글자',                  type: 'text'  },
  { group: '도형' },
  { kind: 'rect',     label: '사각형',   type: 'shape', shape: { kind: 'rect',    w: 100, h: 100, fill: '#5eb8f0', stroke: null } },
  { kind: 'ellipse',  label: '원',       type: 'shape', shape: { kind: 'ellipse', w: 80,  h: 80,  fill: '#f0a35e', stroke: null } },
  { kind: 'triangle', label: '삼각형',   type: 'shape', shape: { kind: 'polygon', sides: 3, w: 80, h: 80, fill: '#9b59b6', stroke: null } },
  { kind: 'hexagon',  label: '육각형',   type: 'shape', shape: { kind: 'polygon', sides: 6, w: 80, h: 80, fill: '#2ecc71', stroke: null } },
  { group: '기타' },
  { kind: 'effect',   label: '이펙트',   disabled: true },
  { kind: 'group',    label: '그룹',     disabled: true },
  { kind: 'adjust',   label: '조정',     disabled: true },
  { kind: 'psd',      label: 'PSD',      disabled: true },
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

  for (const item of _MENU) {
    if (item.group) {
      const g = document.createElement('div');
      g.className = 'layer-add-group';
      g.textContent = item.group;
      menu.appendChild(g);
      continue;
    }
    const el = document.createElement('button');
    el.className = 'layer-add-item' + (item.disabled ? ' disabled' : '');
    el.dataset.kind = item.kind;
    if (item.disabled) {
      el.disabled = true;
      const lbl = document.createElement('span');
      lbl.textContent = item.label;
      const tag = document.createElement('span');
      tag.className = 'layer-add-soon';
      tag.textContent = '준비 중';
      el.append(lbl, tag);
    } else {
      el.textContent = item.label;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        _addLayer(item);
        _close();
      });
    }
    menu.appendChild(el);
  }

  // 이미지 파일 입력
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp';
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
    const doc = store.get();
    const cx  = Math.round(doc.meta.width  / 2);
    const cy  = Math.round(doc.meta.height / 2);

    if (item.kind === 'image') {
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

    const topIndex = doc.order.length;
    store.apply({ type: 'addLayer', layer, index: topIndex });
    editorState.set({ selection: [layer.id] });
  }

  // A4: addAsset + addLayer를 batch 한 건으로 → 되돌리기/다시하기 일치
  function _addImageFile(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const doc     = store.get();
      const assetId = newId('img_');
      const name    = file.name.replace(/\.[^.]+$/, '');
      const layer   = createLayer('image', { name, assetId });
      layer.transform.x.value = Math.round(doc.meta.width  / 2);
      layer.transform.y.value = Math.round(doc.meta.height / 2);

      store.apply({
        type: 'batch',
        cmds: [
          { type: 'addAsset', id: assetId, asset: { dataUrl } },
          { type: 'addLayer', layer, index: doc.order.length },
        ],
      });
      editorState.set({ selection: [layer.id] });
    };
    reader.readAsDataURL(file);
  }

  // D1: 캔버스로 끌어다 놓기 — PNG·JPG·WebP
  function setupDropTarget(stageEl) {
    if (!stageEl) return;

    stageEl.addEventListener('dragover', (e) => {
      const hasImage = [...(e.dataTransfer?.items ?? [])].some(
        (it) => it.kind === 'file' && it.type.startsWith('image/')
      );
      if (hasImage) e.preventDefault();
    });

    stageEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = [...(e.dataTransfer?.files ?? [])].filter(
        (f) => f.type === 'image/png' || f.type === 'image/jpeg' || f.type === 'image/webp'
      );
      for (const file of files) _addImageFile(file);
    });
  }

  function destroy() {
    document.removeEventListener('click', _close);
    fileInput.remove();
  }

  return { btn, menu, destroy, setupDropTarget };
}
