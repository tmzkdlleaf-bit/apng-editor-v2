// R23b — 왼쪽 "효과" 탭. 검색 + 분류 접기 목록(효과 7종 + 모션 클립 4종).
//   줄을 화면/타임라인 레이어에 끌어 놓거나 더블클릭해 효과를 더한다(가운데 갤러리 창을 대신한다).
//   줄에 마우스를 올리면 작은 미리보기를 띄운다. 분류 이름·목록은 레지스트리에서 읽는다.
import { getAllEffects, effects as effectsMap } from '../../effects/registry.js';
import { getAllMotions } from '../../motions/registry.js';
import { defaultParams } from '../../motions/contract.js';
import { createRenderEngine } from '../../core/render/frame.js';
import { createDoc, createLayer } from '../../core/doc/schema.js';
import { addEffectLayer, addFxToLayer, addMotionToLayers } from '../layer-ops.js';
import { setDrag, DND_FX, DND_MOTION } from './panel-dnd.js';
import { showToast } from './status.js';

// 효과 분류 표시 순서(프롬프트). 목록에 없는 분류는 뒤에 '기타'로.
const FX_CATS = ['빛', '날씨', '파티클', '오버레이', '사이버', '판타지', '연출', '공포', '변형', '전환']; // R28: 공포·변형·전환 추가
const MOTION_KINDS = [['enter', '등장'], ['exit', '퇴장'], ['loop', '반복'], ['emphasis', '강조']];

export function createEffectsPanel(store, editorState) {
  const el = document.createElement('div');
  el.className = 'side-panel effects-panel';

  // 시험용(id 'test-' 접두)은 사용자 목록에서 숨긴다.
  const fxList = getAllEffects().filter((e) => !e.id.startsWith('test-'));
  const motions = getAllMotions().filter((m) => !m.id.startsWith('test-'));

  // ── 검색 ────────────────────────────────────────────────────────────
  const searchWrap = document.createElement('div'); searchWrap.className = 'side-search';
  const search = document.createElement('input');
  search.type = 'search'; search.className = 'effects-search'; search.placeholder = '효과·모션 검색';
  search.setAttribute('aria-label', '효과 검색');
  searchWrap.appendChild(search);
  el.appendChild(searchWrap);

  const listEl = document.createElement('div'); listEl.className = 'side-list';
  el.appendChild(listEl);

  let _query = '';
  const _open = new Set();   // 펼친 분류 이름

  search.addEventListener('input', () => { _query = search.value.trim().toLowerCase(); _render(); });

  // ── 분류별 묶기 ──────────────────────────────────────────────────────
  function _fxGroups() {
    const byCat = new Map();
    for (const e of fxList) {
      const c = e.category || '기타';
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(e);
    }
    const cats = [...FX_CATS.filter((c) => byCat.has(c)), ...[...byCat.keys()].filter((c) => !FX_CATS.includes(c))];
    return cats.map((c) => ({ name: c, kind: 'fx', items: byCat.get(c) }));
  }
  function _motionGroups() {
    return MOTION_KINDS.map(([k, label]) => ({
      name: label, kind: 'motion', items: motions.filter((m) => m.kind === k),
    })).filter((g) => g.items.length);
  }

  function _matches(item) {
    if (!_query) return true;
    return (item.name || '').toLowerCase().includes(_query);
  }

  function _render() {
    _stopPreview();
    listEl.textContent = '';
    const groups = [..._fxGroups(), ..._motionGroups()];
    let shown = 0;
    for (const g of groups) {
      const items = g.items.filter(_matches);
      if (!items.length) continue;
      // 검색 중이면 모든 분류를 펼쳐 보인다. 아니면 접기 상태를 따른다.
      const open = _query ? true : _open.has(g.name);
      listEl.appendChild(_groupHead(g, items.length, open));
      if (open) {
        const body = document.createElement('div'); body.className = 'side-group-body';
        for (const it of items) body.appendChild(_itemRow(g.kind, it));
        listEl.appendChild(body);
      }
      shown += items.length;
    }
    if (!shown) {
      const empty = document.createElement('div'); empty.className = 'side-empty'; empty.textContent = '결과 없음';
      listEl.appendChild(empty);
    }
  }

  function _groupHead(g, count, open) {
    const head = document.createElement('button');
    head.className = 'side-group-head' + (open ? ' is-open' : '');
    head.type = 'button';
    const caret = document.createElement('span'); caret.className = 'side-caret'; caret.textContent = open ? '▾' : '▸';
    const name = document.createElement('span'); name.className = 'side-group-name'; name.textContent = g.name;
    const n = document.createElement('span'); n.className = 'side-group-count'; n.textContent = String(count);
    head.append(caret, name, n);
    head.addEventListener('click', () => {
      if (_query) return;            // 검색 중에는 접기 토글을 막는다(전부 펼친 상태).
      if (_open.has(g.name)) _open.delete(g.name); else _open.add(g.name);
      _render();
    });
    return head;
  }

  function _itemRow(kind, item) {
    const row = document.createElement('div');
    row.className = kind === 'fx' ? 'side-item fx-row' : 'side-item motion-row';
    row.dataset[kind === 'fx' ? 'fxId' : 'motionId'] = item.id;
    row.draggable = true;
    row.title = item.name;
    const name = document.createElement('span'); name.className = 'side-item-name'; name.textContent = item.name;
    row.appendChild(name);

    row.addEventListener('dragstart', (e) => {
      if (kind === 'fx') setDrag(e, DND_FX, item.id); else setDrag(e, DND_MOTION, item.id);
      _stopPreview();
    });
    row.addEventListener('dblclick', () => _applyDouble(kind, item.id));
    row.addEventListener('mouseenter', () => _showPreview(row, kind, item));
    row.addEventListener('mouseleave', () => _stopPreview());
    return row;
  }

  // 더블클릭 — 효과: 단일 선택이면 쌓기 추가, 아니면 효과 레이어. 모션: 선택 레이어에 적용.
  function _applyDouble(kind, id) {
    const sel = editorState.get().selection;
    if (kind === 'fx') {
      if (sel.length === 1 && store.get().layers[sel[0]]) addFxToLayer(store, sel[0], id);
      else addEffectLayer(store, editorState, id);
    } else {
      if (!sel.length) { showToast('레이어를 먼저 선택하세요.'); return; }
      addMotionToLayers(store, editorState, sel, id);
    }
  }

  // ── 마우스 올림 미리보기 ─────────────────────────────────────────────
  let _pop = null;     // { el, prev }
  function _stopPreview() { if (_pop) { _pop.prev?.stop?.(); _pop.el.remove(); _pop = null; } }
  function _showPreview(row, kind, item) {
    _stopPreview();
    const box = document.createElement('div'); box.className = 'side-preview';
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 84;
    box.appendChild(cv);
    document.body.appendChild(box);
    const r = row.getBoundingClientRect();
    box.style.left = Math.round(r.right + 6) + 'px';
    box.style.top = Math.round(r.top) + 'px';
    const prev = kind === 'fx' ? _fxPreview(cv, item) : _motionPreview(cv, item);
    _pop = { el: box, prev };
    prev.play();
  }

  function _fxPreview(cv, effect) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, N = 24;
    const doc = createDoc({ width: W, height: H, fps: 12, frameCount: N });
    const fx = createLayer('effect', { name: 'p', effectId: effect.id });
    doc.layers[fx.id] = fx; doc.order.push(fx.id);
    const eng = createRenderEngine({ createCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, effects: effectsMap });
    let raf = null, t0 = 0;
    function frame(f) { ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#121315'; ctx.fillRect(0, 0, W, H); try { eng.renderFrame(ctx, doc, f, {}); } catch {} }
    function tick(ts) { if (!t0) t0 = ts; frame(Math.floor(((ts - t0) / 1000 * 12)) % N); raf = requestAnimationFrame(tick); }
    return { play() { if (!raf) { t0 = 0; raf = requestAnimationFrame(tick); } }, stop() { if (raf) cancelAnimationFrame(raf); raf = null; } };
  }

  function _motionPreview(cv, motion) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
    const p = defaultParams(motion);
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#f0a35e';
    const rad = Math.min(W, H) * 0.14;
    const env = { w: W, h: H, frameCount: motion.defaultLength ?? 24, fps: 12 };
    let raf = null, t0 = 0;
    function frame(t) {
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#121315'; ctx.fillRect(0, 0, W, H);
      const d = motion.evaluate(t, p, env) ?? {};
      const sc = d.scale ?? 1, al = d.alpha ?? 1;
      const x = cx + (d.x ?? 0) * 0.5, y = cy + (d.y ?? 0) * 0.5;
      ctx.save(); ctx.globalAlpha = Math.max(0.1, Math.min(1, al)); ctx.fillStyle = acc;
      ctx.beginPath(); ctx.arc(x, y, Math.max(2, rad * sc), 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    function tick(ts) { if (!t0) t0 = ts; frame(((ts - t0) / 1000) % 1); raf = requestAnimationFrame(tick); }
    return { play() { if (!raf) { t0 = 0; raf = requestAnimationFrame(tick); } }, stop() { if (raf) cancelAnimationFrame(raf); raf = null; } };
  }

  _render();

  // 효과 탭이 열릴 때 호출 — 검색 칸에 초점. mode 'motion' 이면 모션 분류를 펼쳐 보인다.
  function focusSearch(mode = 'fx') {
    if (mode === 'motion') { for (const [, label] of MOTION_KINDS) _open.add(label); _render(); }
    try { search.focus(); search.select(); } catch {}
  }

  function destroy() { _stopPreview(); }
  return { el, focusSearch, destroy };
}
