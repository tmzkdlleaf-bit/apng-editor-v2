// U0 — 공통 드롭다운 컴포넌트 + 앱 전체에 네이티브 <select> 0개.
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

test.describe('U0 — 드롭다운', () => {
  test('[1] 열기·키보드 선택·Esc·바깥 클릭 닫힘·onChange 1건', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => true);
    const r = await page.evaluate(async () => {
      const { createDropdown } = await import('/src/ui/controls/dropdown.js');
      const changes = [];
      const dd = createDropdown({
        options: [
          { value: 'a', label: '가나' },
          { value: 'b', label: '다라' },
          { value: 'c', label: '마바' },
        ],
        value: 'a',
        onChange: (v) => changes.push(v),
      });
      document.body.appendChild(dd.el);
      const out = {};

      // 열기(클릭)
      dd.el.click();
      out.openedList = !!document.querySelector('.dropdown-list') && !document.querySelector('.dropdown-list').hidden;

      // ArrowDown ×2 → Enter 선택(=세 번째 'c')
      const key = (k) => dd.el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
      key('ArrowDown'); key('ArrowDown'); key('Enter');
      out.afterSelect = dd.getValue();
      out.closedAfterSelect = !document.querySelector('.dropdown-list');

      // 같은 값 다시 선택 → onChange 추가 호출 없음
      dd.el.click(); key('Enter'); // 현재값(c)에서 열고 바로 Enter
      out.changesLen = changes.length;
      out.changes = changes.slice();

      // Esc 로 닫힘
      dd.el.click();
      out.openBeforeEsc = !!document.querySelector('.dropdown-list');
      key('Escape');
      out.closedAfterEsc = !document.querySelector('.dropdown-list');

      // 바깥 클릭으로 닫힘
      dd.el.click();
      out.openBeforeOutside = !!document.querySelector('.dropdown-list');
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      out.closedAfterOutside = !document.querySelector('.dropdown-list');

      dd.destroy();
      return out;
    });
    expect(r.openedList).toBe(true);
    expect(r.afterSelect).toBe('c');
    expect(r.closedAfterSelect).toBe(true);
    expect(r.changesLen).toBe(1);        // 값이 실제 바뀐 1건만(같은 값 재선택은 미발생)
    expect(r.changes).toEqual(['c']);
    expect(r.openBeforeEsc).toBe(true);
    expect(r.closedAfterEsc).toBe(true);
    expect(r.openBeforeOutside).toBe(true);
    expect(r.closedAfterOutside).toBe(true);
  });

  test('[2] 타이핑 서치로 항목 찾기', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => true);
    const active = await page.evaluate(async () => {
      const { createDropdown } = await import('/src/ui/controls/dropdown.js');
      const dd = createDropdown({
        options: [{ value: 'a', label: 'apple' }, { value: 'b', label: 'banana' }, { value: 'c', label: 'cherry' }],
        value: 'a',
      });
      document.body.appendChild(dd.el);
      dd.el.click();
      dd.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
      const act = document.querySelector('.dropdown-option.is-active');
      const txt = act ? act.textContent : null;
      dd.destroy();
      return txt;
    });
    expect(active).toBe('banana');
  });

  test('[3] 앱 소스에 네이티브 <select> 0개', () => {
    // 주석은 제외하고(설명문에 "<select>" 가 쓰일 수 있음) 실제 코드만 본다.
    const stripComments = (s) => s
      .replace(/\/\*[\s\S]*?\*\//g, '')   // /* ... */
      .replace(/<!--[\s\S]*?-->/g, '')     // <!-- ... -->
      .replace(/(^|[^:])\/\/.*$/gm, '$1'); // // ... (URL 의 // 는 앞에 : 가 있어 보존)
    const hasSelect = (txt) => /<select[\s>]/.test(txt) || /createElement\((['"])select\1\)/.test(txt);
    const offenders = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(js|html)$/.test(name)) continue;
        if (hasSelect(stripComments(readFileSync(p, 'utf8')))) offenders.push(p);
      }
    };
    walk(join(__dir, '..', 'src'));
    if (hasSelect(stripComments(readFileSync(join(__dir, '..', 'index.html'), 'utf8')))) offenders.push('index.html');
    expect(offenders).toEqual([]);
  });
});
