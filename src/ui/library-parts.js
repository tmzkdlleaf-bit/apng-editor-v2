// 내 부품(R14-3) — 그룹을 저장해 다른 프로젝트에서 다시 쓴다.
// 저장: 그룹+자손 레이어·에셋 메타·썸네일을 IndexedDB library 저장소에.
// 넣기: 새 id 로 복제(core/doc/part.js)해 현재 문서 가운데에 넣는다(되돌리기 1건).
// 파일: .apnglib 로 여러 부품+에셋을 내보내기/불러오기(다른 컴퓨터로).
import { createDoc } from '../core/doc/schema.js';
import { collectPart, remapPart } from '../core/doc/part.js';
import { getAsset } from '../core/io/assets.js';
import { putLibraryPart, getLibraryPart, listLibraryParts, deleteLibraryPart } from '../core/io/idb.js';
import { buildLibraryFile, importLibraryFile } from '../core/io/project-file.js';
import { createRenderEngine } from '../core/render/frame.js';
import { effects as effectsRegistry } from '../effects/registry.js';
import motionRegistry from '../motions/registry.js';
import { saveFile } from '../platform/index.js';
import { showToast } from './shell/status.js';

function _id(p) { try { return p + crypto.randomUUID(); } catch { return p + Math.random().toString(36).slice(2) + Date.now().toString(36); } }
function _canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// 부품 썸네일(0번 프레임) — 필요한 에셋을 먼저 로드해 이미지까지 보이게.
async function _renderThumb(srcDoc, part, size = 128) {
  try {
    const bmps = {};
    for (const aid of (part.assetIds ?? [])) {
      try { const b = await getAsset(aid); if (b) bmps[aid] = await createImageBitmap(b); } catch {}
    }
    const assets = { getBitmap: (id) => bmps[id] ?? null, getAnimFrames: () => null };
    const engine = createRenderEngine({ createCanvas: _canvas, assets, effects: effectsRegistry, motions: motionRegistry });
    const dw = srcDoc.meta.width, dh = srcDoc.meta.height;
    const tmp = { ...createDoc({ width: dw, height: dh }), layers: part.layers, order: [part.rootId], assets: {} };
    const scale = Math.min(size / dw, size / dh);
    const off = _canvas(Math.max(1, Math.round(dw * scale)), Math.max(1, Math.round(dh * scale)));
    engine.renderFrame(off.getContext('2d', { willReadFrequently: true }), tmp, 0, { scale });
    for (const b of Object.values(bmps)) { try { b.close?.(); } catch {} }
    return off.toDataURL('image/png');
  } catch { return null; }
}

// 선택한 그룹을 내 부품으로 저장. 반환: 저장된 레코드(또는 null).
export async function saveGroupAsPart(store, editorState, name) {
  const doc = store.get();
  const rootId = editorState.get().selection.find((id) => doc.layers[id]?.type === 'group');
  if (!rootId) { showToast('그룹을 선택하세요.'); return null; }
  const part = collectPart(doc, rootId);
  const assetMeta = {};
  for (const aid of part.assetIds) if (doc.assets?.[aid]) assetMeta[aid] = doc.assets[aid];
  const thumb = await _renderThumb(doc, part);
  const rec = {
    id: _id('lib_'), name: (name && name.trim()) || (doc.layers[rootId].name || '부품'),
    createdAt: Date.now(), layers: part.layers, rootId: part.rootId,
    assetIds: part.assetIds, assets: assetMeta, thumb,
  };
  await putLibraryPart(rec);
  showToast(`내 부품 "${rec.name}" 저장됨`);
  return rec;
}

// 부품을 현재 문서에 넣는다(가운데). 되돌리기 1건. 반환: 새 루트 id.
export function insertPartIntoDoc(store, editorState, part, { center = true } = {}) {
  const doc = store.get();
  const c = center ? { x: Math.round(doc.meta.width / 2), y: Math.round(doc.meta.height / 2) } : null;
  const { layers, rootId } = remapPart(part, { center: c });
  const assets = {};
  for (const aid of (part.assetIds ?? [])) if (part.assets?.[aid]) assets[aid] = part.assets[aid];
  store.apply({ type: 'insertPart', layers, rootId, assets });
  editorState.set({ selection: [rootId] });
  return rootId;
}

// ── 내 부품 창 ────────────────────────────────────────────────────────────
let _open = null;
let _fileInput = null;

export function openMyParts(store, editorState) {
  closeMyParts();
  const modal = document.createElement('div'); modal.className = 'library-modal';
  const panel = document.createElement('div'); panel.className = 'library-panel';
  modal.appendChild(panel);

  const head = document.createElement('div'); head.className = 'library-head';
  head.innerHTML = `<span class="library-title">내 부품</span>`;
  const right = document.createElement('div'); right.className = 'library-head-right';
  const impBtn = document.createElement('button'); impBtn.className = 'quiet sm'; impBtn.textContent = '부품 파일 불러오기';
  impBtn.addEventListener('click', () => _fileInput.click());
  const expBtn = document.createElement('button'); expBtn.className = 'quiet sm'; expBtn.textContent = '부품 파일 내보내기';
  expBtn.addEventListener('click', async () => {
    const parts = await listLibraryParts();
    if (!parts.length) { showToast('저장된 부품이 없습니다.'); return; }
    const file = await buildLibraryFile(parts);
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
    await saveFile('내부품.apnglib', blob);
  });
  const closeBtn = document.createElement('button'); closeBtn.className = 'library-close'; closeBtn.textContent = '×';
  closeBtn.addEventListener('click', closeMyParts);
  right.append(impBtn, expBtn, closeBtn);
  head.appendChild(right);
  panel.appendChild(head);

  const grid = document.createElement('div'); grid.className = 'library-grid';
  panel.appendChild(grid);

  async function _render() {
    const list = (await listLibraryParts()).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    grid.textContent = '';
    if (!list.length) { grid.innerHTML = '<div class="library-empty">저장된 부품이 없습니다. 그룹을 우클릭해 “내 부품으로 저장”하세요.</div>'; return; }
    for (const p of list) {
      const card = document.createElement('div'); card.className = 'library-card'; card.dataset.id = p.id;
      const thumb = document.createElement('div'); thumb.className = 'library-thumb';
      if (p.thumb) { const img = document.createElement('img'); img.src = p.thumb; img.alt = ''; thumb.appendChild(img); }
      else { thumb.classList.add('no-thumb'); thumb.textContent = '미리보기 없음'; }
      const name = document.createElement('div'); name.className = 'library-name'; name.textContent = p.name || '부품';
      const acts = document.createElement('div'); acts.className = 'library-acts';
      const put = _btn('넣기', async () => {
        const full = await getLibraryPart(p.id);
        if (full) { insertPartIntoDoc(store, editorState, full); closeMyParts(); }
      }, 'accent');
      const ren = _btn('이름', async () => {
        const nn = prompt('새 이름', p.name || '');
        if (nn != null && nn.trim()) { const full = await getLibraryPart(p.id); full.name = nn.trim(); await putLibraryPart(full); _render(); }
      });
      const del = _btn('삭제', async () => { if (confirm('이 부품을 지울까요?')) { await deleteLibraryPart(p.id); _render(); } }, 'danger');
      acts.append(put, ren, del);
      thumb.addEventListener('dblclick', async () => { const full = await getLibraryPart(p.id); if (full) { insertPartIntoDoc(store, editorState, full); closeMyParts(); } });
      card.append(thumb, name, acts);
      grid.appendChild(card);
    }
  }

  _fileInput = document.createElement('input'); _fileInput.type = 'file'; _fileInput.accept = '.apnglib,application/json'; _fileInput.style.display = 'none';
  _fileInput.addEventListener('change', async () => {
    const file = _fileInput.files?.[0]; _fileInput.value = '';
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      const { parts } = await importLibraryFile(payload);
      for (const part of parts) { part.id = _id('lib_'); await putLibraryPart(part); } // 새 id 로(충돌 방지)
      showToast(`부품 ${parts.length}개를 불러왔습니다.`);
      _render();
    } catch (e) { showToast('부품 파일을 불러오지 못했습니다: ' + (e?.message ?? e)); }
  });
  document.body.appendChild(_fileInput);

  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeMyParts(); });
  document.body.appendChild(modal);
  document.addEventListener('keydown', _onKey, true);
  _open = modal;
  _render();
  return { close: closeMyParts };
}

function _btn(label, fn, cls = '') {
  const b = document.createElement('button');
  b.className = 'lib-btn sm' + (cls === 'danger' ? ' lib-danger' : cls === 'accent' ? ' accent' : '');
  b.textContent = label;
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}
function _onKey(e) { if (e.key === 'Escape') closeMyParts(); }
export function closeMyParts() {
  if (_open) { _open.remove(); _open = null; document.removeEventListener('keydown', _onKey, true); }
  if (_fileInput) { _fileInput.remove(); _fileInput = null; }
}
