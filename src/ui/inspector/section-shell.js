// 접히는 인스펙터 섹션 틀 (머리 + 몸통)
import { iconMarkup } from '../icons.js';

export function makeSectionShell(titleText, collapsed = false) {
  const section = document.createElement('div');
  section.className = 'inspector-section' + (collapsed ? ' collapsed' : '');

  const header = document.createElement('div');
  header.className = 'inspector-section-header';

  const title = document.createElement('span');
  title.className = 'inspector-section-title';
  title.textContent = titleText;

  const summary = document.createElement('span');
  summary.className = 'inspector-section-summary';

  const chevron = document.createElement('span');
  chevron.className = 'inspector-section-chevron';
  chevron.innerHTML = iconMarkup('chevron');
  chevron.setAttribute('aria-hidden', 'true');

  header.append(title, summary, chevron);
  // 섹션 머리 전체(줄 전체)가 접기/펼치기 — 버튼 역할·키보드 접근(item 6).
  header.setAttribute('role', 'button');
  header.setAttribute('tabindex', '0');

  const body = document.createElement('div');
  body.className = 'inspector-section-body';

  let _collapsed = collapsed;
  function _toggle() { _collapsed = !_collapsed; section.classList.toggle('collapsed', _collapsed); }
  header.addEventListener('click', _toggle);
  header.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _toggle(); }
  });

  section.append(header, body);
  return { section, header, body, summary, title };
}

// 미구현 섹션 — 접힌 머리 + 요약 줄. 펼치면 안내 한 줄과 항목명(item 6).
export function makePlaceholderSection(titleText, summaryText) {
  const { section, summary, body } = makeSectionShell(titleText, true);
  summary.textContent = summaryText;
  summary.classList.add('is-placeholder');

  const note = document.createElement('div');
  note.className = 'inspector-soon';
  note.innerHTML = `<div class="inspector-soon-msg">이 기능은 다음 업데이트에 들어갑니다.</div>`
    + `<div class="inspector-soon-item">${summaryText}</div>`;
  body.appendChild(note);

  return { el: section, destroy() {} };
}
