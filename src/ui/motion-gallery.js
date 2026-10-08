// 모션 갤러리(F3-2) — 분류 칩 + 카드(작은 움직임 미리보기, 마우스 올리면 재생) + 이름.
// openMotionGallery(anchorEl, { onPick(motion) }) → 팝오버. 바깥 클릭/Esc 닫힘.
import { getAllMotions } from '../motions/registry.js';
import { defaultParams } from '../motions/contract.js';

const KIND_LABEL = { enter: '등장', exit: '퇴장', loop: '반복', emphasis: '강조' };

export function openMotionGallery(anchorEl, { onPick = () => {} } = {}) {
  const motions = getAllMotions();
  const categories = ['전체', ...new Set(motions.map((m) => m.category || KIND_LABEL[m.kind] || '기타'))];
  let _cat = '전체';
  const _previews = [];

  const pop = document.createElement('div');
  pop.className = 'motion-gallery';

  const title = document.createElement('div'); title.className = 'mg-title'; title.textContent = '모션 추가';
  pop.appendChild(title);

  const chips = document.createElement('div'); chips.className = 'mg-chips';
  pop.appendChild(chips);
  const grid = document.createElement('div'); grid.className = 'mg-grid';
  pop.appendChild(grid);

  function _renderChips() {
    chips.textContent = '';
    for (const c of categories) {
      const b = document.createElement('button');
      b.className = 'mg-chip' + (c === _cat ? ' is-on' : '');
      b.textContent = c;
      b.addEventListener('click', () => { _cat = c; _renderChips(); _renderGrid(); });
      chips.appendChild(b);
    }
  }

  function _renderGrid() {
    for (const p of _previews) p.stop();
    _previews.length = 0;
    grid.textContent = '';
    const list = motions.filter((m) => _cat === '전체' || (m.category || KIND_LABEL[m.kind]) === _cat);
    for (const m of list) {
      const card = document.createElement('button');
      card.className = 'mg-card';
      card.dataset.motion = m.id;
      const cv = document.createElement('canvas'); cv.width = 72; cv.height = 48; cv.className = 'mg-preview';
      const nm = document.createElement('div'); nm.className = 'mg-name'; nm.textContent = m.name;
      const kd = document.createElement('div'); kd.className = 'mg-kind'; kd.textContent = KIND_LABEL[m.kind] ?? m.kind;
      card.append(cv, nm, kd);
      const prev = _makePreview(cv, m);
      _previews.push(prev);
      prev.drawStatic();
      card.addEventListener('mouseenter', () => prev.play());
      card.addEventListener('mouseleave', () => prev.stop());
      card.addEventListener('click', (e) => { e.stopPropagation(); _close(); onPick(m); });
      grid.appendChild(card);
    }
  }

  // 작은 미리보기: 점 하나에 모션 변화량을 적용해 그린다.
  function _makePreview(cv, motion) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
    const p = defaultParams(motion);
    let raf = null, t0 = 0;
    function frame(t) {
      ctx.clearRect(0, 0, W, H);
      const d = motion.evaluate(t, p) ?? {};
      const sc = d.scale ?? 1, al = d.alpha ?? 1;
      const x = cx + (d.x ?? 0) * 0.3, y = cy + (d.y ?? 0) * 0.3;
      ctx.save();
      ctx.globalAlpha = Math.max(0.1, Math.min(1, al));
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#f0a35e';
      ctx.beginPath(); ctx.arc(x, y, 7 * sc + (d.rotation ? 0 : 0), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    function drawStatic() { frame(0); }
    function tick(ts) { if (!t0) t0 = ts; frame(((ts - t0) / 1000) % 1); raf = requestAnimationFrame(tick); }
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
  // 위치: anchor 아래
  const r = anchorEl.getBoundingClientRect();
  pop.style.left = Math.min(r.left, window.innerWidth - pop.offsetWidth - 8) + 'px';
  pop.style.top = Math.min(r.bottom + 4, window.innerHeight - pop.offsetHeight - 8) + 'px';
  setTimeout(() => {
    document.addEventListener('pointerdown', _onDown, true);
    document.addEventListener('keydown', _onKey, true);
  }, 0);

  return { close: _close, el: pop };
}
