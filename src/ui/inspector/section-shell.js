// 접히는 인스펙터 섹션 틀 (머리 + 몸통)
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
  chevron.textContent = '▾';

  header.append(title, summary, chevron);

  const body = document.createElement('div');
  body.className = 'inspector-section-body';

  let _collapsed = collapsed;
  header.addEventListener('click', () => {
    _collapsed = !_collapsed;
    section.classList.toggle('collapsed', _collapsed);
  });

  section.append(header, body);
  return { section, header, body, summary, title };
}

// 미구현 섹션 — 접힌 머리 + 요약 줄
export function makePlaceholderSection(titleText, summaryText) {
  const { section, summary } = makeSectionShell(titleText, true);
  summary.textContent = summaryText;
  summary.classList.add('is-placeholder');
  return { el: section, destroy() {} };
}
