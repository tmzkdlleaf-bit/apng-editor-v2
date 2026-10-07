// 레이어 추가 메뉴 — 버튼 클릭 또는 캔버스 드래그로 레이어 추가
import { createLayer } from '../core/doc/schema.js';
import { groupSelection } from './group-ops.js';
import { putAsset } from '../core/io/assets.js';
import { showToast } from './shell/status.js';
import { SHAPE_PACK, shapePreviewSvg } from './shapes-pack.js';

// AddMenu 설계: 이미지 / 움직이는 이미지 / 글자 / 도형(격자) / 이펙트 / 그룹 / 조정 / PSD
// 이번에 안 되는 항목은 disabled + "준비 중"
const _MENU = [
  { kind: 'image',    label: '이미지',                type: 'image' },
  { kind: 'anim',     label: '움직이는 이미지 (GIF·APNG·WebP)', disabled: true },
  { kind: 'text',     label: '글자',                  type: 'text'  },
  { group: '도형', grid: 'shapes' },
  { group: '기타' },
  { kind: 'effect',   label: '이펙트',   disabled: true },
  { kind: 'group',    label: '그룹',     type: 'group' },
  { kind: 'adjust',   label: '조정',     type: 'adjust' },
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
      // 도형 격자(F2-3): 아이콘 미리보기 버튼들
      if (item.grid === 'shapes') {
        const grid = document.createElement('div');
        grid.className = 'shape-grid';
        for (const def of SHAPE_PACK) {
          const b = document.createElement('button');
          b.className = 'shape-grid-item';
          b.dataset.shape = def.key;
          b.title = def.label;
          b.setAttribute('aria-label', def.label);
          b.innerHTML = shapePreviewSvg(def);
          b.addEventListener('click', (e) => { e.stopPropagation(); _addShape(def.shape()); _close(); });
          grid.appendChild(b);
        }
        menu.appendChild(grid);
      }
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
    _addImageFile(file).catch(() => {});
    fileInput.value = '';
  });

  containerEl.appendChild(btn);
  containerEl.appendChild(menu);
  document.body.appendChild(fileInput);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.style.display !== 'none') { menu.style.display = 'none'; return; }
    // 메뉴는 fixed 로 띄워 타임라인 스크롤 영역에 안 잘리게 한다. 아래 공간이 좁으면 위로 연다.
    menu.style.display = 'block';
    const r  = btn.getBoundingClientRect();
    const mh = menu.offsetHeight;
    const below = window.innerHeight - r.bottom;
    menu.style.left = r.left + 'px';
    menu.style.top  = (below < mh + 8 && r.top > below)
      ? Math.max(4, r.top - mh - 4) + 'px'
      : (r.bottom + 4) + 'px';
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

    // 그룹: 선택이 있으면 그것으로 묶고, 없으면 빈 그룹 추가
    if (item.type === 'group') {
      if (editorState.get().selection.length) {
        groupSelection(store, editorState);
      } else {
        const g = createLayer('group', { name: '그룹', childOrder: [] });
        store.apply({ type: 'addLayer', layer: g, index: doc.order.length });
        editorState.set({ selection: [g.id] });
      }
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
    } else if (item.type === 'adjust') {
      // 조정 레이어: 아래 레이어 전체에 보정. 처음엔 중립(보정 섹션에서 값 조절).
      layer.name = '조정';
      layer.adjust = {};
    }

    const topIndex = doc.order.length;
    store.apply({ type: 'addLayer', layer, index: topIndex });
    editorState.set({ selection: [layer.id] });
  }

  // 도형 격자에서 고른 도형을 중앙에 추가
  function _addShape(shapeObj) {
    const doc = store.get();
    const layer = createLayer('shape', { name: '도형' });
    layer.transform.x.value = Math.round(doc.meta.width / 2);
    layer.transform.y.value = Math.round(doc.meta.height / 2);
    layer.shape = { ...shapeObj };
    store.apply({ type: 'addLayer', layer, index: doc.order.length });
    editorState.set({ selection: [layer.id] });
  }

  // A4+P7: 바이트는 IndexedDB(내용 주소)로, 문서에는 메타만. addAsset+addLayer를 batch 한 건으로.
  async function _addImageFile(file) {
    const name = file.name.replace(/\.[^.]+$/, '');
    const { id: assetId, meta } = await putAsset(file, name);
    // 이미지로 디코드되지 않으면(깨진 PNG·이미지 아닌 파일) 크기가 0이다. 레이어를 만들지 않는다.
    if (!meta.width || !meta.height) {
      showToast('이미지로 읽을 수 없는 파일입니다.');
      return;
    }
    const doc   = store.get();
    const layer = createLayer('image', { name, assetId });
    layer.transform.x.value = Math.round(doc.meta.width  / 2);
    layer.transform.y.value = Math.round(doc.meta.height / 2);

    const cmds = [];
    // 같은 이미지가 이미 문서 메타에 있으면 addAsset을 생략(되돌리기 기록도 깔끔)
    if (!doc.assets?.[assetId]) {
      cmds.push({ type: 'addAsset', id: assetId, asset: meta });
    }
    cmds.push({ type: 'addLayer', layer, index: doc.order.length });
    store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    editorState.set({ selection: [layer.id] });
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
      for (const file of files) _addImageFile(file).catch(() => {});
    });
  }

  function destroy() {
    document.removeEventListener('click', _close);
    fileInput.remove();
  }

  return { btn, menu, destroy, setupDropTarget };
}
