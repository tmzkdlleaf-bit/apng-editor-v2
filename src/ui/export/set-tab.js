// 세트(바리에이션) 탭 — 내보내기 창 안(R13-1).
// 레이어를 "바꿀 칸(slot)"으로 추가하고, 표(행=변형, 열=칸)로 값을 입력한다.
// 값은 store.apply({type:'setVariants'}) 로만 바꾼다(되돌리기 1건씩).
// "이 변형으로 미리보기"는 editorState.previewVariantId 로 렌더에만 적용(문서 불변).
// "세트 전부 내보내기"는 export/index.js 의 exportSet 로 zip 하나를 만든다.
import { createRenderEngine } from '../../core/render/frame.js';
import { effects as effectsRegistry } from '../../effects/registry.js';
import motionRegistry from '../../motions/registry.js';
import { getAsset, putAsset } from '../../core/io/assets.js';
import { decodeAnim } from '../../core/io/anim-decode.js';
import { kindForLayer, applyVariant, safeVariantName } from '../../core/doc/variants.js';
import { exportSet } from '../../export/index.js';
import { createDropdown } from '../controls/dropdown.js';
import { showToast } from '../shell/status.js';
import { saveFile } from '../../platform/index.js';

const KIND_LABEL = { text: '글자', image: '그림', color: '색' };

function _newId(p) { try { return p + crypto.randomUUID(); } catch { return p + Math.random().toString(36).slice(2); } }
function _createCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export function initSetTab({ container, store, editorState, getContext }) {
  const _dds = [];
  let _thumbEngine = null;
  const _thumbBmps = {};     // assetId → ImageBitmap (썸네일·미리보기 로드분)
  let _busy = false;
  let _abort = null;

  function variants() {
    const v = store.get().variants;
    return v && typeof v === 'object' ? v : { slots: [], rows: [] };
  }
  function commit(next) {
    store.apply({ type: 'setVariants', variants: (next.slots.length || next.rows.length) ? next : undefined });
  }
  function _clone() {
    const v = variants();
    return { slots: v.slots.map((s) => ({ ...s })), rows: v.rows.map((r) => ({ ...r, values: { ...r.values } })) };
  }

  // ── 썸네일/미리보기용 비트맵 선로드 ──
  async function _ensureBitmaps(ids) {
    for (const id of ids) {
      if (!id || _thumbBmps[id]) continue;
      try {
        const blob = await getAsset(id);
        if (blob) _thumbBmps[id] = await createImageBitmap(blob);
      } catch {}
    }
  }
  function _thumbAssets() {
    return { getBitmap: (id) => _thumbBmps[id] ?? null, getAnimFrames: () => null };
  }
  function _renderThumb(canvas, row) {
    const doc = store.get();
    if (!_thumbEngine) _thumbEngine = createRenderEngine({ createCanvas: _createCanvas, assets: _thumbAssets(), effects: effectsRegistry, motions: motionRegistry });
    const rdoc = applyVariant(doc, row);
    const { width: dw, height: dh } = doc.meta;
    const scale = Math.min(canvas.width / dw, canvas.height / dh);
    const off = _createCanvas(Math.max(1, Math.round(dw * scale)), Math.max(1, Math.round(dh * scale)));
    _thumbEngine.renderFrame(off.getContext('2d', { willReadFrequently: true }), rdoc, 0, { scale });
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, (canvas.width - off.width) / 2, (canvas.height - off.height) / 2);
  }

  // ── 레이어에서 바꿀 칸 추가 ──
  function _eligibleLayers() {
    const doc = store.get();
    const out = [];
    for (const id of doc.order ?? []) {
      const l = doc.layers[id];
      if (!l) continue;
      const kinds = kindForLayer(l);
      if (kinds && kinds.length) out.push({ id, name: l.name ?? l.type, kinds });
    }
    // 그룹 안 레이어도(평면 맵)
    for (const id of Object.keys(doc.layers ?? {})) {
      if ((doc.order ?? []).includes(id)) continue;
      const l = doc.layers[id];
      const kinds = kindForLayer(l);
      if (l && kinds && kinds.length && !out.find((x) => x.id === id)) out.push({ id, name: l.name ?? l.type, kinds });
    }
    return out;
  }
  function _addSlot(layerId, kind, label) {
    const next = _clone();
    next.slots.push({ id: _newId('vslot_'), layerId, kind, label: label || KIND_LABEL[kind] });
    commit(next);
    render();
  }
  function _removeSlot(slotId) {
    const next = _clone();
    next.slots = next.slots.filter((s) => s.id !== slotId);
    for (const r of next.rows) delete r.values[slotId];
    commit(next);
    render();
  }
  function _addRow() {
    const next = _clone();
    next.rows.push({ id: _newId('vrow_'), name: `변형 ${next.rows.length + 1}`, values: {} });
    commit(next);
    render();
  }
  function _removeRow(rowId) {
    const next = _clone();
    next.rows = next.rows.filter((r) => r.id !== rowId);
    commit(next);
    if (editorState.get().previewVariantId === rowId) editorState.set({ previewVariantId: null });
    render();
  }
  function _setValue(rowId, slotId, value) {
    const next = _clone();
    const row = next.rows.find((r) => r.id === rowId);
    if (!row) return;
    if (value == null) delete row.values[slotId]; else row.values[slotId] = value;
    commit(next);
  }
  function _setName(rowId, name) {
    const next = _clone();
    const row = next.rows.find((r) => r.id === rowId);
    if (row) { row.name = name; commit(next); }
  }

  async function _pickImage(rowId, slotId) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      try {
        const { id } = await putAsset(file);
        await _ensureBitmaps([id]);
        _setValue(rowId, slotId, id);
        render();
      } catch (e) { showToast('이미지를 넣지 못했습니다: ' + (e?.message ?? e)); }
    }, { once: true });
    input.click();
  }

  // ── 세트 전부 내보내기 ──
  async function _exportAll(statusEl, cancelBtn) {
    if (_busy) return;
    const v = variants();
    if (!v.rows.length) { showToast('내보낼 변형이 없습니다.'); return; }
    const { preset, format, scale, name, colors, lossless, quality, allowFrameReduction, mode, loops } = getContext();

    // 필요한 모든 에셋(기본 레이어 + 변형 이미지 슬롯) 비트맵을 미리 로드.
    const doc = store.get();
    const need = new Set();
    for (const l of Object.values(doc.layers ?? {})) if (l?.assetId) need.add(l.assetId);
    const imgSlots = new Set(v.slots.filter((s) => s.kind === 'image').map((s) => s.id));
    for (const r of v.rows) for (const sid of imgSlots) { const a = r.values[sid]; if (a) need.add(a); }

    const bmps = {}; const anims = {};
    for (const id of need) {
      try {
        const blob = await getAsset(id); if (!blob) continue;
        // 움직이는 이미지면 anim, 아니면 정지 비트맵.
        const layer = Object.values(doc.layers).find((l) => l?.assetId === id);
        if (layer?.type === 'anim') { const res = await decodeAnim(blob); if (res?.frames?.length) { anims[id] = res; continue; } }
        bmps[id] = await createImageBitmap(blob);
      } catch {}
    }
    const assets = { getBitmap: (id) => bmps[id] ?? null, getAnimFrames: (id) => anims[id] ?? null };

    _busy = true; _abort = new AbortController();
    cancelBtn.style.display = '';
    statusEl.textContent = '세트 만드는 중…';
    try {
      const res = await exportSet(doc, {
        rows: v.rows, preset, format, scale, name,
        colors, lossless, quality, allowFrameReduction, mode, loops,
        createCanvas: _createCanvas, assets, effects: effectsRegistry, motions: motionRegistry,
        signal: _abort.signal,
        onProgress: (p) => { if (p.phase === 'done' || p.phase === 'start') statusEl.textContent = `${p.index + 1}/${p.total} ${p.name} ${p.phase === 'done' ? '완료' : '만드는 중'}`; },
      });
      await saveFile(res.settings.filename, res.blob);
      statusEl.textContent = `완료: ${res.count}개 · ${(res.bytes / 1024 / 1024).toFixed(2)} MB`;
      window.__lastSetExport = { filename: res.settings.filename, count: res.count, bytes: res.bytes };
    } catch (err) {
      if (err?.name === 'AbortError') statusEl.textContent = '취소됨';
      else { statusEl.textContent = '오류: ' + (err?.message ?? err); showToast('세트 내보내기 실패: ' + (err?.message ?? err)); }
    } finally {
      _busy = false; _abort = null; cancelBtn.style.display = 'none';
    }
  }

  // ── 렌더 ──
  function render() {
    _dds.forEach((d) => d.destroy?.()); _dds.length = 0;
    container.textContent = '';
    const v = variants();

    // 미리 비트맵 로드(썸네일·셀 미리보기)
    const ids = new Set();
    for (const r of v.rows) for (const s of v.slots) if (s.kind === 'image' && r.values[s.id]) ids.add(r.values[s.id]);
    for (const l of Object.values(store.get().layers ?? {})) if (l?.assetId) ids.add(l.assetId);
    _ensureBitmaps([...ids]).then(() => { if (container.isConnected) _paintThumbs(); });

    // 안내
    const intro = document.createElement('p'); intro.className = 'set-intro';
    intro.textContent = '같은 연출에서 글자·그림·색만 바꿔 여러 파일을 한 번에 만듭니다. 바꿀 칸을 더하고 변형마다 값을 넣으세요.';
    container.appendChild(intro);

    // 바꿀 칸 추가 줄
    const slotBar = document.createElement('div'); slotBar.className = 'set-slotbar';
    const layers = _eligibleLayers();
    if (layers.length) {
      // layerId::kind 조합을 드롭다운으로.
      const opts = [];
      for (const ly of layers) for (const k of ly.kinds) opts.push({ value: `${ly.id}::${k}`, label: `${ly.name} — ${KIND_LABEL[k]}` });
      let picked = opts[0]?.value ?? '';
      const dd = createDropdown({ ariaLabel: '바꿀 레이어·칸', options: opts, value: picked, onChange: (val) => { picked = val; } });
      _dds.push(dd);
      const addBtn = document.createElement('button'); addBtn.className = 'btn sm'; addBtn.textContent = '바꿀 칸으로 추가';
      addBtn.addEventListener('click', () => {
        if (!picked) return;
        const [layerId, kind] = picked.split('::');
        const ly = layers.find((x) => x.id === layerId);
        _addSlot(layerId, kind, ly ? `${ly.name} ${KIND_LABEL[kind]}` : KIND_LABEL[kind]);
      });
      slotBar.append(dd.el, addBtn);
    } else {
      const none = document.createElement('span'); none.className = 'set-none'; none.textContent = '바꿀 수 있는 레이어가 없습니다(글자·이미지·도형).';
      slotBar.appendChild(none);
    }
    container.appendChild(slotBar);

    if (!v.slots.length) return;

    // 표
    const table = document.createElement('table'); table.className = 'set-table';
    const thead = document.createElement('thead'); const htr = document.createElement('tr');
    htr.appendChild(_th('미리보기'));
    htr.appendChild(_th('변형 이름'));
    for (const s of v.slots) {
      const th = document.createElement('th');
      const lab = document.createElement('span'); lab.textContent = s.label || KIND_LABEL[s.kind];
      const rm = document.createElement('button'); rm.className = 'set-slot-rm'; rm.textContent = '×'; rm.title = '이 칸 삭제';
      rm.addEventListener('click', () => _removeSlot(s.id));
      th.append(lab, rm);
      htr.appendChild(th);
    }
    htr.appendChild(_th(''));
    thead.appendChild(htr); table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const previewId = editorState.get().previewVariantId;
    for (const row of v.rows) {
      const tr = document.createElement('tr');
      if (row.id === previewId) tr.className = 'is-preview';

      // 썸네일
      const thumbTd = document.createElement('td');
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48; cv.className = 'set-thumb'; cv.dataset.rowId = row.id;
      thumbTd.appendChild(cv); tr.appendChild(thumbTd);

      // 이름
      const nameTd = document.createElement('td');
      const nameIn = document.createElement('input'); nameIn.type = 'text'; nameIn.className = 'set-name'; nameIn.value = row.name ?? '';
      nameIn.addEventListener('change', () => _setName(row.id, nameIn.value));
      nameTd.appendChild(nameIn); tr.appendChild(nameTd);

      // 값 셀
      for (const s of v.slots) {
        const td = document.createElement('td');
        td.appendChild(_cell(row, s));
        tr.appendChild(td);
      }

      // 동작
      const actTd = document.createElement('td'); actTd.className = 'set-row-acts';
      const pv = document.createElement('button'); pv.className = 'btn sm'; pv.textContent = row.id === previewId ? '미리보기 끄기' : '이 변형으로 미리보기';
      pv.addEventListener('click', () => { editorState.set({ previewVariantId: row.id === previewId ? null : row.id }); render(); });
      const del = document.createElement('button'); del.className = 'btn sm'; del.textContent = '삭제';
      del.addEventListener('click', () => _removeRow(row.id));
      actTd.append(pv, del);
      tr.appendChild(actTd);

      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);

    const rowBar = document.createElement('div'); rowBar.className = 'set-rowbar';
    const addRow = document.createElement('button'); addRow.className = 'btn sm'; addRow.textContent = '+ 변형 추가';
    addRow.addEventListener('click', _addRow);
    rowBar.appendChild(addRow);
    container.appendChild(rowBar);

    // 내보내기
    const foot = document.createElement('div'); foot.className = 'set-foot';
    const status = document.createElement('span'); status.className = 'set-status';
    const cancel = document.createElement('button'); cancel.className = 'btn sm'; cancel.textContent = '취소'; cancel.style.display = 'none';
    cancel.addEventListener('click', () => _abort?.abort());
    const run = document.createElement('button'); run.className = 'accent'; run.textContent = '세트 전부 내보내기';
    run.addEventListener('click', () => _exportAll(status, cancel));
    foot.append(run, cancel, status);
    container.appendChild(foot);

    _paintThumbs();
  }

  function _paintThumbs() {
    const v = variants();
    const byId = {}; for (const r of v.rows) byId[r.id] = r;
    for (const cv of container.querySelectorAll('canvas.set-thumb')) {
      const row = byId[cv.dataset.rowId];
      if (row) { try { _renderThumb(cv, row); } catch {} }
    }
  }

  function _th(t) { const th = document.createElement('th'); th.textContent = t; return th; }

  function _cell(row, slot) {
    const val = row.values[slot.id];
    if (slot.kind === 'text') {
      const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'set-cell-text';
      inp.placeholder = '(원래 값)'; inp.value = val ?? '';
      inp.addEventListener('change', () => { _setValue(row.id, slot.id, inp.value === '' ? null : inp.value); _paintThumbs(); });
      return inp;
    }
    if (slot.kind === 'color') {
      const wrap = document.createElement('span'); wrap.className = 'set-cell-color';
      const col = document.createElement('input'); col.type = 'color'; col.value = (typeof val === 'string' && /^#[0-9a-f]{6}$/i.test(val)) ? val : '#ffffff';
      const on = document.createElement('input'); on.type = 'checkbox'; on.checked = val != null; on.title = '이 변형에서 색 바꾸기';
      const apply = () => { _setValue(row.id, slot.id, on.checked ? col.value : null); _paintThumbs(); };
      col.addEventListener('change', () => { on.checked = true; apply(); });
      on.addEventListener('change', apply);
      wrap.append(on, col);
      return wrap;
    }
    // image
    const wrap = document.createElement('span'); wrap.className = 'set-cell-image';
    const btn = document.createElement('button'); btn.className = 'btn sm'; btn.textContent = val ? '이미지 바꾸기' : '이미지 넣기';
    btn.addEventListener('click', () => _pickImage(row.id, slot.id));
    const tag = document.createElement('span'); tag.className = 'set-cell-tag'; tag.textContent = val ? '있음' : '(원래 값)';
    const clr = document.createElement('button'); clr.className = 'set-slot-rm'; clr.textContent = '×'; clr.title = '원래 값으로';
    clr.style.display = val ? '' : 'none';
    clr.addEventListener('click', () => { _setValue(row.id, slot.id, null); render(); });
    wrap.append(btn, tag, clr);
    return wrap;
  }

  function destroy() {
    _dds.forEach((d) => d.destroy?.()); _dds.length = 0;
    for (const b of Object.values(_thumbBmps)) { try { b.close?.(); } catch {} }
    editorState.set({ previewVariantId: null });
  }

  return { render, destroy };
}
