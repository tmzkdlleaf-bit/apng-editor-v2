// 이펙트 갤러리(F4-1) — 분류 칩 + 카드(마우스 올리면 움직이는 미리보기) + 검색.
// openEffectGallery(anchorEl, { onPick(effect) }) → 팝오버. 보이는(재생 중인) 카드만 렌더.
import { getAllEffects } from '../effects/registry.js';
import { effects as effectsMap } from '../effects/registry.js';
import { createRenderEngine } from '../core/render/frame.js';
import { createDoc, createLayer } from '../core/doc/schema.js';

const CATEGORIES = ['전체', '날씨', '빛', '사이버', '연출', '오버레이', '파티클', '판타지'];

export function openEffectGallery(anchorEl, { onPick = () => {} } = {}) {
  const all = getAllEffects();
  let _cat = '전체';
  let _query = '';
  const _previews = [];

  const pop = document.createElement('div');
  pop.className = 'motion-gallery fx-gallery';
  const title = document.createElement('div'); title.className = 'mg-title'; title.textContent = '이펙트 추가';
  pop.appendChild(title);
  const search = document.createElement('input');
  search.className = 'fx-search'; search.type = 'text'; search.placeholder = '검색…';
  search.addEventListener('input', () => { _query = search.value.trim().toLowerCase(); _renderGrid(); });
  pop.appendChild(search);
  const chips = document.createElement('div'); chips.className = 'mg-chips'; pop.appendChild(chips);
  const grid = document.createElement('div'); grid.className = 'mg-grid'; pop.appendChild(grid);

  function _renderChips() {
    chips.textContent = '';
    for (const c of CATEGORIES) {
      const b = document.createElement('button');
      b.className = 'mg-chip' + (c === _cat ? ' is-on' : '');
      b.textContent = c;
      b.addEventListener('click', () => { _cat = c; _renderChips(); _renderGrid(); });
      chips.appendChild(b);
    }
  }

  function _filtered() {
    return all.filter((e) => (_cat === '전체' || e.category === _cat) && (!_query || e.name.toLowerCase().includes(_query)));
  }

  function _renderGrid() {
    for (const p of _previews) p.stop();
    _previews.length = 0;
    grid.textContent = '';
    for (const e of _filtered()) {
      const card = document.createElement('button');
      card.className = 'mg-card'; card.dataset.effect = e.id;
      const cv = document.createElement('canvas'); cv.width = 72; cv.height = 48; cv.className = 'mg-preview';
      const nm = document.createElement('div'); nm.className = 'mg-name'; nm.textContent = e.name;
      card.append(cv, nm);
      const prev = _makePreview(cv, e);
      _previews.push(prev);
      prev.drawStatic();
      card.addEventListener('mouseenter', () => prev.play());   // 보이는(올린) 카드만 재생
      card.addEventListener('mouseleave', () => prev.stop());
      card.addEventListener('click', (ev) => { ev.stopPropagation(); _close(); onPick(e); });
      grid.appendChild(card);
    }
  }

  // 작은 효과 미리보기 — 엔진으로 그 효과만 72×48 로 렌더(프레임 순환).
  function _makePreview(cv, effect) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, N = 24;
    const doc = createDoc({ width: W, height: H, fps: 12, frameCount: N });
    const fx = createLayer('effect', { name: 'p', effectId: effect.id });
    doc.layers[fx.id] = fx; doc.order.push(fx.id);
    const eng = createRenderEngine({ createCanvas: (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }, effects: effectsMap });
    let raf = null, t0 = 0;
    function frame(f) {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#121315'; ctx.fillRect(0, 0, W, H);
      try { eng.renderFrame(ctx, doc, f, {}); } catch {}
    }
    function drawStatic() { frame(0); }
    function tick(ts) { if (!t0) t0 = ts; frame(Math.floor(((ts - t0) / 1000 * 12)) % N); raf = requestAnimationFrame(tick); }
    function play() { if (!raf) { t0 = 0; raf = requestAnimationFrame(tick); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } drawStatic(); }
    return { drawStatic, play, stop };
  }

  function _close() {
    for (const p of _previews) p.stop();
    document.removeEventListener('pointerdown', _onDown, true);
    document.removeEventListener('keydown', _onKey, true);
    pop.remove();
  }
  function _onDown(e) { if (!pop.contains(e.target) && e.target !== anchorEl) _close(); }
  function _onKey(e) { if (e.key === 'Escape') _close(); }

  document.body.appendChild(pop);
  _renderChips(); _renderGrid();
  const r = anchorEl.getBoundingClientRect();
  pop.style.left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 8) + 'px';
  pop.style.top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';
  setTimeout(() => { document.addEventListener('pointerdown', _onDown, true); document.addEventListener('keydown', _onKey, true); }, 0);
  search.focus();
  return { close: _close, el: pop };
}
