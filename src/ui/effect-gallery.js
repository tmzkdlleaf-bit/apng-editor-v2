// 이펙트 갤러리(F4-1, item 4) — 큰 창: 분류 목록 + 검색 + 카드(올리면 재생) + 큰 미리보기 + [적용].
// openEffectGallery(anchorEl, { onPick(effect) }). anchorEl 은 호환을 위해 받지만 창은 가운데 모달.
import { getAllEffects } from '../effects/registry.js';
import { effects as effectsMap } from '../effects/registry.js';
import { createRenderEngine } from '../core/render/frame.js';
import { createDoc, createLayer } from '../core/doc/schema.js';
import { createGalleryModal } from './gallery-modal.js';

const CATEGORIES = ['전체', '날씨', '빛', '사이버', '연출', '오버레이', '파티클', '판타지'];

export function openEffectGallery(anchorEl, { onPick = () => {} } = {}) {
  const all = getAllEffects();

  // 효과 하나만 그리는 미리보기 엔진(프레임 순환).
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

  return createGalleryModal({
    title: '이펙트 추가',
    items: all,
    categoriesOrder: CATEGORIES,
    categoryOf: (e) => e.category || '기타',
    makePreview: _makePreview,
    describe: (e) => e.description || `${e.category || ''} 효과`,
    onPick,
  });
}
