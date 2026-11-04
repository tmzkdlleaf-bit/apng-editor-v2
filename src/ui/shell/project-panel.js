// R23b — 왼쪽 "프로젝트" 탭. 문서에 든 에셋(이미지·움직이는 이미지·PSD 조각) 목록.
//   줄마다 썸네일·이름·픽셀 크기·쓰는 레이어 수. 검색 + 가져오기 버튼(화면/패널에 끌어 놓기).
//   줄을 화면/타임라인에 끌어 놓으면 레이어가 생긴다. 우클릭: 이름 바꾸기·교체·사용 안 하는 것 지우기.
import { putAsset } from '../../core/io/assets.js';
import { collectAssetIds } from '../../core/io/assets.js';
import { probeAnim } from '../../core/io/anim-decode.js';
import { importPsdFile } from '../psd-import.js';
import { addAssetLayer } from '../layer-ops.js';
import { setDrag, DND_ASSET } from './panel-dnd.js';
import { showToast } from './status.js';
import { createLayer } from '../../core/doc/schema.js';

export function createProjectPanel(store, editorState, getDeps = () => ({})) {
  const el = document.createElement('div');
  el.className = 'side-panel project-panel';

  // 검색 + 가져오기
  const top = document.createElement('div'); top.className = 'side-search';
  const search = document.createElement('input');
  search.type = 'search'; search.className = 'project-search'; search.placeholder = '에셋 검색';
  search.setAttribute('aria-label', '에셋 검색');
  const importBtn = document.createElement('button');
  importBtn.className = 'accent sm project-import'; importBtn.textContent = '가져오기';
  top.append(search, importBtn);
  el.appendChild(top);

  const listEl = document.createElement('div'); listEl.className = 'side-list';
  el.appendChild(listEl);

  // 파일 입력(이미지·움직이는 이미지 공용 + PSD)
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.style.display = 'none';
  fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif,.psd,image/vnd.adobe.photoshop';
  fileInput.multiple = true;
  fileInput.addEventListener('change', () => { _importFiles([...fileInput.files]); fileInput.value = ''; });
  el.appendChild(fileInput);
  importBtn.addEventListener('click', () => fileInput.click());

  let _query = '';
  search.addEventListener('input', () => { _query = search.value.trim().toLowerCase(); _render(); });

  // 패널 위에 파일을 끌어 놓아도 가져온다.
  el.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.items ?? [])].some((it) => it.kind === 'file')) { e.preventDefault(); el.classList.add('drop-hot'); }
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop-hot'));
  el.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) { e.preventDefault(); _importFiles(files); }
    el.classList.remove('drop-hot');
  });

  // ── 가져오기 ─────────────────────────────────────────────────────────
  function _importFiles(files) {
    for (const f of files) {
      if (/\.psd$/i.test(f.name) || f.type === 'image/vnd.adobe.photoshop') {
        showToast('PSD 를 분석하는 중...');
        importPsdFile(f, store, editorState).catch(() => showToast('PSD 를 불러올 수 없습니다.'));
      } else if ((f.type || '').startsWith('image/')) {
        _importImage(f).catch(() => {});
      }
    }
  }

  async function _importImage(file) {
    const name = file.name.replace(/\.[^.]+$/, '');
    const { id, meta } = await putAsset(file, name);
    if (!meta.width || !meta.height) { showToast('이미지로 읽을 수 없는 파일입니다.'); return; }
    const probe = await probeAnim(file).catch(() => ({ animated: false }));
    const doc = store.get();
    const assetMeta = probe.animated
      ? { ...meta, animated: true, frameCount: probe.frameCount, delays: probe.delays, durationMs: probe.durationMs }
      : meta;
    const layer = createLayer(probe.animated ? 'anim' : 'image', { name, assetId: id });
    layer.transform.x.value = Math.round(doc.meta.width / 2);
    layer.transform.y.value = Math.round(doc.meta.height / 2);
    const cmds = [];
    if (!doc.assets?.[id]) cmds.push({ type: 'addAsset', id, asset: assetMeta });
    cmds.push({ type: 'addLayer', layer, index: doc.order.length });
    store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
    editorState.set({ selection: [layer.id] });
  }

  // ── 목록 ─────────────────────────────────────────────────────────────
  function _usage(id) {
    const doc = store.get(); let n = 0;
    for (const lid of Object.keys(doc.layers ?? {})) {
      const l = doc.layers[lid]; if (!l) continue;
      if (l.assetId === id || l.mask?.assetId === id) n++;
    }
    return n;
  }

  function _render() {
    listEl.textContent = '';
    const doc = store.get();
    const assets = doc.assets ?? {};
    const ids = Object.keys(assets).filter((id) => {
      const a = assets[id]; if (!a) return false;
      return !_query || (a.name || '').toLowerCase().includes(_query);
    });
    if (!ids.length) {
      const empty = document.createElement('div'); empty.className = 'side-empty';
      empty.textContent = Object.keys(assets).length ? '결과 없음' : '가져온 에셋이 없습니다. [가져오기]';
      listEl.appendChild(empty);
      return;
    }
    const used = collectAssetIds(doc);
    for (const id of ids) listEl.appendChild(_assetRow(id, assets[id], used.has(id)));
  }

  function _assetRow(id, asset, inUse) {
    const row = document.createElement('div'); row.className = 'asset-row'; row.dataset.assetId = id;
    row.draggable = true;
    row.addEventListener('dragstart', (e) => setDrag(e, DND_ASSET, id));

    const thumb = document.createElement('canvas'); thumb.className = 'asset-thumb'; thumb.width = 40; thumb.height = 40;
    _drawThumb(thumb, id);

    const info = document.createElement('div'); info.className = 'asset-info';
    const nm = document.createElement('div'); nm.className = 'asset-name'; nm.textContent = asset.name || '이미지';
    const meta = document.createElement('div'); meta.className = 'asset-meta';
    const used = _usage(id);
    meta.textContent = `${asset.width || 0}×${asset.height || 0}${asset.animated ? ' · 움직임' : ''} · ${used}곳`;
    info.append(nm, meta);

    row.append(thumb, info);
    row.addEventListener('dblclick', () => addAssetLayer(store, editorState, id));
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); _openMenu(e, id, asset, inUse); });
    return row;
  }

  function _drawThumb(cv, id) {
    const deps = getDeps() || {};
    const assets = deps.assets;
    const ctx = cv.getContext('2d');
    const draw = () => {
      const doc = store.get(); const a = doc.assets?.[id]; if (!a) return;
      const bm = a.animated ? assets?.getAnimFrames?.(id)?.frames?.[0] : assets?.getBitmap?.(id);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!bm) return;
      const s = Math.min(cv.width / bm.width, cv.height / bm.height);
      const w = Math.max(1, bm.width * s), h = Math.max(1, bm.height * s);
      ctx.drawImage(bm, (cv.width - w) / 2, (cv.height - h) / 2, w, h);
    };
    draw();
    if (assets?.subscribeReady) {
      const un = assets.subscribeReady((aid) => { if (aid === id) { draw(); un?.(); } });
    }
  }

  // ── 우클릭 메뉴 ──────────────────────────────────────────────────────
  let _menu = null;
  function _closeMenu() { if (_menu) { _menu.remove(); _menu = null; document.removeEventListener('click', _closeMenu); } }
  function _openMenu(e, id, asset, inUse) {
    _closeMenu();
    const menu = document.createElement('div'); menu.className = 'project-menu asset-menu';
    const rename = document.createElement('button'); rename.textContent = '이름 바꾸기';
    rename.addEventListener('click', () => { _closeMenu(); _rename(id, asset); });
    const replace = document.createElement('button'); replace.textContent = '교체 (쓰는 레이어 전부)';
    replace.addEventListener('click', () => { _closeMenu(); _replace(id); });
    const del = document.createElement('button'); del.textContent = '사용 안 하는 것 지우기';
    del.disabled = inUse;       // R7 에셋 보존: 쓰는 레이어가 있으면 못 지운다.
    if (inUse) del.title = '아직 쓰는 레이어가 있어 지울 수 없습니다.';
    del.addEventListener('click', () => { _closeMenu(); if (!inUse) store.apply({ type: 'removeAsset', id }); });
    menu.append(rename, replace, del);
    document.body.appendChild(menu);
    menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
    _menu = menu;
    setTimeout(() => document.addEventListener('click', _closeMenu), 0);
  }

  function _rename(id, asset) {
    if (typeof prompt !== 'function') return;
    const name = prompt('에셋 이름', asset.name || '');
    if (name == null) return;
    store.apply({ type: 'addAsset', id, asset: { ...asset, name: name.trim() || asset.name } });
  }

  // 교체: 새 파일을 가져와 같은 에셋을 쓰는 레이어의 assetId 를 전부 새 것으로. 되돌리기 1건.
  const replaceInput = document.createElement('input');
  replaceInput.type = 'file'; replaceInput.style.display = 'none';
  replaceInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
  let _replaceOldId = null;
  replaceInput.addEventListener('change', async () => {
    const file = replaceInput.files[0]; replaceInput.value = '';
    const oldId = _replaceOldId; _replaceOldId = null;
    if (!file || !oldId) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    const { id: newId, meta } = await putAsset(file, name);
    if (!meta.width || !meta.height) { showToast('이미지로 읽을 수 없는 파일입니다.'); return; }
    const probe = await probeAnim(file).catch(() => ({ animated: false }));
    const assetMeta = probe.animated ? { ...meta, animated: true, frameCount: probe.frameCount, delays: probe.delays, durationMs: probe.durationMs } : meta;
    const doc = store.get();
    const cmds = [];
    if (!doc.assets?.[newId]) cmds.push({ type: 'addAsset', id: newId, asset: assetMeta });
    for (const lid of Object.keys(doc.layers ?? {})) {
      if (doc.layers[lid]?.assetId === oldId) cmds.push({ type: 'setLayer', id: lid, patch: { assetId: newId } });
    }
    if (newId !== oldId) cmds.push({ type: 'removeAsset', id: oldId });
    if (cmds.length) store.apply(cmds.length === 1 ? cmds[0] : { type: 'batch', cmds });
  });
  el.appendChild(replaceInput);
  function _replace(id) { _replaceOldId = id; replaceInput.click(); }

  const unsubStore = store.subscribe({ any: true }, _render);
  _render();

  function destroy() { unsubStore(); _closeMenu(); }
  return { el, destroy };
}
