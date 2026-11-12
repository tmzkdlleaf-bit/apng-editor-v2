// 레이어 추가 메뉴 — 버튼 클릭 또는 캔버스 드래그로 레이어 추가
import { createLayer } from '../core/doc/schema.js';
import { groupSelection } from './group-ops.js';
import { putAsset } from '../core/io/assets.js';
import { showToast } from './shell/status.js';
import { SHAPE_PACK, shapePreviewSvg } from './shapes-pack.js';
import { probeAnim } from '../core/io/anim-decode.js';
import { reduceAnim, planReduce, estAnimMemory, ANIM_MEM_LIMIT } from './anim-reduce.js';
import { openEffectsPanel } from './shell/panel-actions.js';
import { importPsdFile } from './psd-import.js';
import { openMyParts } from './library-parts.js';
import { getEffect } from '../effects/registry.js';

// AddMenu 설계: 이미지 / 움직이는 이미지 / 글자 / 도형(격자) / 이펙트 / 그룹 / 조정 / PSD
// 이번에 안 되는 항목은 disabled + "준비 중"
const _MENU = [
  { kind: 'image',    label: '이미지',                type: 'image' },
  { kind: 'anim',     label: '움직이는 이미지 (GIF·APNG·WebP)', type: 'anim' },
  { kind: 'text',     label: '글자',                  type: 'text'  },
  { group: '도형', grid: 'shapes' },
  { group: '실사 소재(시뮬레이션)' },
  { kind: 'footage', label: '불길', footage: 'fire' },
  { kind: 'footage', label: '연기 기둥', footage: 'smoke' },
  { kind: 'footage', label: '폭발(한 번)', footage: 'explosion' },
  { group: '기타' },
  { kind: 'effect',   label: '이펙트',   type: 'effect' },
  { kind: 'group',    label: '그룹',     type: 'group' },
  { kind: 'adjust',   label: '조정',     type: 'adjust' },
  { kind: 'myparts',  label: '내 부품',  type: 'myparts' },
  { kind: 'psd',      label: 'PSD 가져오기', type: 'psd' },
];

const FOOTAGE_PRESET = {
  fire: { cols: 8, rows: 8, size: 0.75, position: { x: 0.5, y: 1 }, loop: 'crossfade' },
  smoke: { cols: 8, rows: 8, size: 1.1, position: { x: 0.5, y: 1 }, loop: 'crossfade', opacity: 0.85 },
  explosion: { cols: 8, rows: 4, size: 1, position: { x: 0.5, y: 0.95 }, loop: 'once', speed: 1.5 },
};

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

  // 움직이는 이미지 파일 입력(GIF·APNG·WebP)
  const animInput = document.createElement('input');
  animInput.type = 'file';
  animInput.accept = 'image/gif,image/png,image/webp';
  animInput.style.display = 'none';
  animInput.addEventListener('change', () => {
    const file = animInput.files[0];
    if (!file) return;
    _addAnimFile(file).catch(() => {});
    animInput.value = '';
  });

  // PSD 파일 입력
  const psdInput = document.createElement('input');
  psdInput.type = 'file';
  psdInput.accept = '.psd,image/vnd.adobe.photoshop';
  psdInput.style.display = 'none';
  psdInput.addEventListener('change', () => {
    const file = psdInput.files[0];
    if (!file) return;
    showToast('PSD 를 분석하는 중...');
    importPsdFile(file, store, editorState).catch(() => showToast('PSD 를 불러올 수 없습니다.'));
    psdInput.value = '';
  });

  containerEl.appendChild(btn);
  containerEl.appendChild(menu);
  document.body.appendChild(fileInput);
  document.body.appendChild(animInput);
  document.body.appendChild(psdInput);

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
    if (item.type === 'anim') {
      animInput.click();
      return;
    }
    if (item.kind === 'psd') {
      psdInput.click();
      return;
    }
    if (item.kind === 'footage') {
      _addFootage(item.footage, item.label).catch(() => showToast('실사 소재를 불러오지 못했습니다.'));
      return;
    }
    if (item.kind === 'myparts') {
      openMyParts(store, editorState);
      return;
    }
    if (item.type === 'effect') {
      // R23b: 효과는 왼쪽 "효과" 탭에서 끌어 놓거나 더블클릭해 더한다.
      openEffectsPanel('fx');
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

  // R31: 내장 실사 소재(vendor/footage/*.webp — scripts/gen-footage.py 로 만든 유체 시뮬레이션 시트, 검은 배경).
  //   숨긴 이미지 레이어(시트) + 그것을 '소재'로 쓰는 실사 소재 효과 레이어를 한 번에(되돌리기 1건).
  async function _addFootage(kind, label) {
    const res = await fetch(`vendor/footage/${kind}.webp`);
    if (!res.ok) throw new Error('fetch');
    const blob = await res.blob();
    const file = new File([blob], `${kind}.webp`, { type: 'image/webp' });
    const { id: assetId, meta } = await putAsset(file, `실사-${label}`);
    if (!meta.width || !meta.height) throw new Error('decode');
    const doc = store.get();
    const src = createLayer('image', { name: `실사 소재 시트(${label})`, assetId });
    src.visible = false;
    src.transform.x.value = Math.round(doc.meta.width / 2);
    src.transform.y.value = Math.round(doc.meta.height / 2);
    const def = getEffect('footage');
    const params = {};
    for (const q of (def?.params ?? [])) params[q.key] = q.default;
    Object.assign(params, FOOTAGE_PRESET[kind] ?? {});
    const fx = createLayer('effect', { name: `실사 ${label}`, effectId: 'footage' });
    fx.params = params;
    fx.seed = Math.floor(Math.random() * 1e6);
    fx.transform.x.value = 0; fx.transform.y.value = 0;
    fx.sources = [{ key: 'clip', sourceId: src.id }];
    const cmds = [];
    if (!doc.assets?.[assetId]) cmds.push({ type: 'addAsset', id: assetId, asset: meta });
    cmds.push({ type: 'addLayer', layer: src, index: doc.order.length });
    cmds.push({ type: 'addLayer', layer: fx, index: doc.order.length + 1 });
    store.apply({ type: 'batch', cmds });
    editorState.set({ selection: [fx.id] });
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

  // F2-1: 움직이는 이미지 추가 — 여러 프레임이면 anim 레이어, 아니면 정지 이미지로 대체.
  async function _addAnimFile(file) {
    const name = file.name.replace(/\.[^.]+$/, '');
    const { id: assetId, meta } = await putAsset(file, name);
    if (!meta.width || !meta.height) { showToast('이미지로 읽을 수 없는 파일입니다.'); return; }

    const probe = await probeAnim(file).catch(() => ({ animated: false }));
    const doc = store.get();
    const cx = Math.round(doc.meta.width / 2), cy = Math.round(doc.meta.height / 2);

    if (!probe.animated) {
      // 정지 PNG 등 → 정지 이미지 레이어
      const layer = createLayer('image', { name, assetId });
      layer.transform.x.value = cx; layer.transform.y.value = cy;
      const cmds = [];
      if (!doc.assets?.[assetId]) cmds.push({ type: 'addAsset', id: assetId, asset: meta });
      cmds.push({ type: 'addLayer', layer, index: doc.order.length });
      store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
      editorState.set({ selection: [layer.id] });
      return;
    }

    // 움직이는 이미지 레이어 — 소스 정보(프레임 수·지연·길이)를 에셋 메타에 담는다.
    const animMeta = { ...meta, animated: true, frameCount: probe.frameCount, delays: probe.delays, durationMs: probe.durationMs };

    // R10-1: 예상 메모리가 기준(150MB)을 넘으면 줄이기 창. 그 안이면 그대로 추가.
    if (estAnimMemory(animMeta) > ANIM_MEM_LIMIT) {
      _openReduceDialog(file, animMeta, name, cx, cy);
      return;
    }
    _commitAnim(assetId, animMeta, name, cx, cy);
  }

  // 움직이는 이미지 레이어 추가(에셋 메타 포함) — 한 건으로 기록.
  function _commitAnim(assetId, animMeta, name, cx, cy) {
    const doc = store.get();
    const layer = createLayer('anim', { name, assetId });
    layer.transform.x.value = cx; layer.transform.y.value = cy;
    const cmds = [];
    if (!doc.assets?.[assetId]) cmds.push({ type: 'addAsset', id: assetId, asset: animMeta });
    cmds.push({ type: 'addLayer', layer, index: doc.order.length });
    store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    editorState.set({ selection: [layer.id] });
  }

  // R10-1 줄이기 창: 줄여서 가져오기(권장) / 그대로 / 취소.
  function _openReduceDialog(file, metaFull, name, cx, cy) {
    const plan = planReduce(metaFull);
    const mb = (b) => (b / 1024 / 1024).toFixed(0);

    const modal = document.createElement('div');
    modal.className = 'canvas-settings-dialog anim-reduce-modal';
    const panel = document.createElement('div');
    panel.className = 'cs-panel';
    const title = document.createElement('div'); title.className = 'cs-title'; title.textContent = '큰 움직이는 이미지';
    const msg = document.createElement('div'); msg.className = 'ar-msg';
    msg.textContent =
      `${metaFull.width}×${metaFull.height} · ${metaFull.frameCount}프레임 (약 ${mb(estAnimMemory(metaFull))}MB)\n`
      + `→ ${plan.newW}×${plan.newH} · ${plan.newFrameCount}프레임, 약 ${mb(plan.estBytes)}MB`;
    const prog = document.createElement('div'); prog.className = 'ar-progress'; prog.style.display = 'none';
    prog.innerHTML = '<div class="ar-bar"><div class="ar-bar-fill"></div></div>';
    const barFill = prog.querySelector('.ar-bar-fill');
    const progStep = document.createElement('span'); progStep.className = 'ar-step'; prog.appendChild(progStep);

    const btns = document.createElement('div'); btns.className = 'cs-btns';
    const cancelBtn = document.createElement('button'); cancelBtn.textContent = '취소';
    const keepBtn = document.createElement('button'); keepBtn.textContent = '그대로 가져오기';
    const reduceBtn = document.createElement('button'); reduceBtn.className = 'accent'; reduceBtn.textContent = '줄여서 가져오기';
    btns.append(cancelBtn, keepBtn, reduceBtn);

    panel.append(title, msg, prog, btns);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });

    cancelBtn.addEventListener('click', close);
    keepBtn.addEventListener('click', async () => {
      close();
      showToast('큰 이미지를 그대로 가져옵니다. 메모리를 많이 쓸 수 있습니다.');
      const { id, meta } = await putAsset(file, name);
      _commitAnim(id, { ...meta, ...metaFull }, name, cx, cy);
    });

    let ctrl = null;
    reduceBtn.addEventListener('click', async () => {
      prog.style.display = '';
      reduceBtn.disabled = true; keepBtn.disabled = true;
      cancelBtn.textContent = '중지';
      ctrl = new AbortController();
      const onCancel = () => ctrl.abort();
      cancelBtn.addEventListener('click', onCancel, { once: true });
      try {
        const r = await reduceAnim(file, metaFull, {
          signal: ctrl.signal,
          onProgress: (d, t) => { barFill.style.width = t ? Math.round((d / t) * 100) + '%' : '0%'; progStep.textContent = `${d}/${t}`; },
        });
        const { id, meta } = await putAsset(r.blob, name);
        const animMeta = { ...meta, animated: true, frameCount: r.frameCount, delays: r.delays, durationMs: r.durationMs };
        close();
        _commitAnim(id, animMeta, name, cx, cy);
        showToast(`${plan.newW}×${plan.newH} · ${r.frameCount}프레임으로 줄여 가져왔습니다.`);
      } catch (err) {
        if (err?.name === 'AbortError') { close(); return; }
        progStep.textContent = '실패: ' + (err?.message ?? err);
        reduceBtn.disabled = false; keepBtn.disabled = false; cancelBtn.textContent = '취소';
      }
    });
  }

  // D1: 캔버스로 끌어다 놓기 — PNG·JPG·WebP·GIF(움직이는 이미지 자동 판별)
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
        (f) => f.type === 'image/png' || f.type === 'image/jpeg' || f.type === 'image/webp' || f.type === 'image/gif'
      );
      // _addAnimFile 이 여러 프레임이면 anim, 아니면 정지 이미지로 분기한다.
      for (const file of files) _addAnimFile(file).catch(() => {});
    });
  }

  function destroy() {
    document.removeEventListener('click', _close);
    fileInput.remove();
    animInput.remove();
    psdInput.remove();
  }

  return { btn, menu, destroy, setupDropTarget };
}
