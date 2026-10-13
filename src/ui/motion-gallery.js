// 모션 갤러리(F3-2, item 4) — 큰 창: 분류 목록 + 검색 + 카드(올리면 재생) + 큰 미리보기 + [적용].
// openMotionGallery(anchorEl, { onPick(motion) }). anchorEl 은 호환을 위해 받지만 창은 가운데 모달.
import { getAllMotions } from '../motions/registry.js';
import { defaultParams } from '../motions/contract.js';
import { createGalleryModal } from './gallery-modal.js';

const KIND_LABEL = { enter: '등장', exit: '퇴장', loop: '반복', emphasis: '강조' };

export function openMotionGallery(anchorEl, { onPick = () => {} } = {}) {
  // 시험용 모션(id 'test-' 접두)은 사용자 갤러리에서 숨긴다(레지스트리엔 테스트 재료로 남김).
  const motions = getAllMotions().filter((m) => !m.id.startsWith('test-'));
  const categoryOf = (m) => m.category || KIND_LABEL[m.kind] || '기타';

  // 점 하나에 모션 변화량을 적용해 그리는 미리보기(0..1 순환).
  function _makePreview(cv, motion) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2;
    const p = defaultParams(motion);
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--acc').trim() || '#f0a35e';
    const r = Math.min(W, H) * 0.14;
    const env = { w: W, h: H, frameCount: motion.defaultLength ?? 24, fps: 12 };
    let raf = null, t0 = 0;
    function frame(t) {
      ctx.clearRect(0, 0, W, H);
      const d = motion.evaluate(t, p, env) ?? {};
      const sc = d.scale ?? 1, al = d.alpha ?? 1;
      const x = cx + (d.x ?? 0) * 0.6, y = cy + (d.y ?? 0) * 0.6;
      ctx.save();
      ctx.globalAlpha = Math.max(0.1, Math.min(1, al));
      ctx.fillStyle = acc;
      ctx.beginPath(); ctx.arc(x, y, Math.max(2, r * sc), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    function drawStatic() { frame(0); }
    function tick(ts) { if (!t0) t0 = ts; frame(((ts - t0) / 1000) % 1); raf = requestAnimationFrame(tick); }
    function play() { if (!raf) { t0 = 0; raf = requestAnimationFrame(tick); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } drawStatic(); }
    return { drawStatic, play, stop };
  }

  return createGalleryModal({
    title: '모션 추가',
    items: motions,
    categoryOf,
    makePreview: _makePreview,
    describe: (m) => m.description || `${KIND_LABEL[m.kind] ?? m.kind} 모션`,
    onPick,
  });
}
