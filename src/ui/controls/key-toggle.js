// 공용 키 조각(R16-4) — [시계][◀ 이전 키][◆ 마름모][다음 키 ▶].
// 속성 패널·타임라인에서 공유한다. R23~R24 에서 자리를 옮길 때 그대로 쓴다.
//
// createKeyToggle(opts) → { el, update(state), destroy }
//   opts.showClock  : 시계 버튼(효과 수치처럼 켜고 끄는 값). 변형은 끈다.
//   opts.showArrows : 이전/다음 키로 가기 화살표.
//   opts.title      : 마름모 툴팁.
//   onClock / onDiamond / onPrev / onNext : 콜백.
// update({ clock, diamond, hasKeys }):
//   clock   : 'on' | 'off' | 'mixed'
//   diamond : 'on'(현재 프레임 키) | 'other'(다른 프레임에 키) | ''(없음)
//   hasKeys : 화살표 활성 여부
import { iconMarkup } from '../icons.js';

export function createKeyToggle({
  showClock = false, showArrows = false, title = '현재 프레임 키프레임',
  onClock, onDiamond, onPrev, onNext,
} = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'key-toggle';

  let clockBtn = null;
  if (showClock) {
    clockBtn = document.createElement('button');
    clockBtn.className = 'kt-clock';
    clockBtn.title = '수치에 키프레임 쓰기';
    clockBtn.setAttribute('aria-label', '키프레임 켜기/끄기');
    clockBtn.innerHTML = iconMarkup('clock', { size: 13 });
    clockBtn.addEventListener('click', (e) => { e.stopPropagation(); onClock?.(); });
    wrap.appendChild(clockBtn);
  }

  let prevBtn = null, nextBtn = null;
  if (showArrows) {
    prevBtn = document.createElement('button');
    prevBtn.className = 'kt-arrow kt-prev'; prevBtn.title = '이전 키로';
    prevBtn.setAttribute('aria-label', '이전 키로');
    prevBtn.innerHTML = iconMarkup('prev', { size: 12 });
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); onPrev?.(); });
    wrap.appendChild(prevBtn);
  }

  const dia = document.createElement('button');
  dia.className = 'kf-diamond';
  dia.title = title;
  dia.addEventListener('click', (e) => { e.stopPropagation(); onDiamond?.(); });
  wrap.appendChild(dia);

  if (showArrows) {
    nextBtn = document.createElement('button');
    nextBtn.className = 'kt-arrow kt-next'; nextBtn.title = '다음 키로';
    nextBtn.setAttribute('aria-label', '다음 키로');
    nextBtn.innerHTML = iconMarkup('next', { size: 12 });
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); onNext?.(); });
    wrap.appendChild(nextBtn);
  }

  function update({ clock = 'off', diamond = '', hasKeys = false } = {}) {
    if (clockBtn) {
      clockBtn.classList.toggle('is-on', clock === 'on');
      clockBtn.classList.toggle('is-mixed', clock === 'mixed');
      clockBtn.setAttribute('aria-pressed', clock === 'on' ? 'true' : 'false');
    }
    dia.classList.remove('on', 'other');
    if (diamond === 'on') dia.classList.add('on');
    else if (diamond === 'other') dia.classList.add('other');
    if (prevBtn) prevBtn.disabled = !hasKeys;
    if (nextBtn) nextBtn.disabled = !hasKeys;
  }

  function destroy() {}
  return { el: wrap, clockBtn, diamond: dia, prevBtn, nextBtn, update, destroy };
}
