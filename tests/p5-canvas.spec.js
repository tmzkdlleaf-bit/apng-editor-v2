// P5: 캔버스 조작과 숫자 칸
import { test, expect } from '@playwright/test';

test.describe('P5 캔버스 조작', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?demo=1');
    await page.waitForFunction(() => !!(window.__store && window.__stage));
  });

  // ── 헬퍼: 레이어 화면 좌표 ───────────────────────────────────────────
  async function layerScreenPos(page, layerName) {
    return page.evaluate((name) => {
      const store = window.__store;
      const stage = window.__stage;
      const editorState = window.__editorState;
      const doc = store.get();
      const layer = Object.values(doc.layers).find(l => l.name === name);
      if (!layer) return null;
      const canvas = document.querySelector('.stage-overlay');
      const rect = canvas.getBoundingClientRect();
      const sp = stage.docToScreen(
        layer.transform.x.value,
        layer.transform.y.value,
      );
      return { x: rect.left + sp.x, y: rect.top + sp.y };
    }, layerName);
  }

  // ── 1. 드래그 이동 → 되돌리기 1건 ───────────────────────────────────
  test('[이동] 드래그 1회 → 되돌리기 1건, 위치 복원', async ({ page }) => {
    const pos = await layerScreenPos(page, '사각형');
    expect(pos).not.toBeNull();

    const origPos = await page.evaluate(() => {
      const doc = window.__store.get();
      const layer = Object.values(doc.layers).find(l => l.name === '사각형');
      return { x: layer.transform.x.value, y: layer.transform.y.value };
    });

    // 드래그
    await page.mouse.move(pos.x, pos.y);
    await page.mouse.down();
    await page.mouse.move(pos.x + 50, pos.y + 30, { steps: 8 });
    await page.mouse.up();

    // 위치가 바뀌었는지 확인
    const movedPos = await page.evaluate(() => {
      const doc = window.__store.get();
      const layer = Object.values(doc.layers).find(l => l.name === '사각형');
      return { x: layer.transform.x.value, y: layer.transform.y.value };
    });
    expect(movedPos.x).not.toBeCloseTo(origPos.x, 1);

    // 되돌리기 1건
    const canUndo = await page.evaluate(() => window.__store.canUndo());
    expect(canUndo).toBe(true);

    await page.evaluate(() => window.__store.undo());

    const restoredPos = await page.evaluate(() => {
      const doc = window.__store.get();
      const layer = Object.values(doc.layers).find(l => l.name === '사각형');
      return { x: layer.transform.x.value, y: layer.transform.y.value };
    });
    expect(restoredPos.x).toBeCloseTo(origPos.x, 1);
    expect(restoredPos.y).toBeCloseTo(origPos.y, 1);

    // 더 이상 되돌릴 기록 없음
    const canUndoAfter = await page.evaluate(() => window.__store.canUndo());
    expect(canUndoAfter).toBe(false);
  });

  // ── 2. 드래그 + Esc → 기록 없음 ─────────────────────────────────────
  test('[이동] 드래그 + Esc → 기록 없음, 위치 복원', async ({ page }) => {
    const pos = await layerScreenPos(page, '사각형');
    const origPos = await page.evaluate(() => {
      const doc = window.__store.get();
      const layer = Object.values(doc.layers).find(l => l.name === '사각형');
      return { x: layer.transform.x.value, y: layer.transform.y.value };
    });

    await page.mouse.move(pos.x, pos.y);
    await page.mouse.down();
    await page.mouse.move(pos.x + 50, pos.y + 30, { steps: 5 });
    await page.keyboard.press('Escape');
    await page.mouse.up();

    // 기록 없음
    const canUndo = await page.evaluate(() => window.__store.canUndo());
    expect(canUndo).toBe(false);

    // 위치 복원됨
    const pos2 = await page.evaluate(() => {
      const doc = window.__store.get();
      const layer = Object.values(doc.layers).find(l => l.name === '사각형');
      return { x: layer.transform.x.value, y: layer.transform.y.value };
    });
    expect(pos2.x).toBeCloseTo(origPos.x, 1);
    expect(pos2.y).toBeCloseTo(origPos.y, 1);
  });

  // ── 3. hover/선택/그리드 → scene 렌더 횟수 불변 ──────────────────────
  test('[렌더] hover/선택변경/그리드 토글 → scene 렌더 횟수 증가 없음', async ({ page }) => {
    // 렌더가 안정될 때까지 잠깐 대기
    await page.waitForTimeout(200);
    const countBefore = await page.evaluate(() => window.__stage.sceneRenderCount);

    // 마우스 호버 (클릭 없이)
    const canvas = page.locator('.stage-overlay');
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2 + 10);

    // 선택 변경 (에디터 상태만 변경)
    await page.evaluate(() => {
      window.__editorState.set({ selection: [] });
      window.__editorState.set({ selection: ['dummy-id'] });
    });

    // 그리드 토글
    await page.evaluate(() => {
      window.__editorState.set({ grid: true });
      window.__editorState.set({ grid: false });
    });

    // RAF가 처리될 때까지 대기
    await page.waitForTimeout(100);

    const countAfter = await page.evaluate(() => window.__stage.sceneRenderCount);
    expect(countAfter).toBe(countBefore);
  });

  // ── 4. 숫자 칸 드래그 100px → 되돌리기 1건 ──────────────────────────
  test('[숫자칸] 레이블 드래그 100px → 되돌리기 1건', async ({ page }) => {
    // 숫자 칸을 동적으로 생성해 스토어와 연결 (fixed 위치로 강제 표시)
    const ok = await page.evaluate(async () => {
      const { createNumberField } = await import('/src/ui/controls/number-field.js');
      const store = window.__store;

      const doc = store.get();
      const layer = Object.values(doc.layers).find(l => l.name === '사각형');
      if (!layer) return 'layer not found';
      const id = layer.id;

      let began = false;
      const nf = createNumberField({
        label: 'X',
        value: layer.transform.x.value,
        step: 1,
        onBegin: () => { store.begin('X 조정'); began = true; },
        onChange: (v) => {
          store.preview({ type: 'setProp', id, path: 'transform.x', value: v });
        },
        onCommit: () => { if (began) { store.commit(); began = false; } },
        onCancel: () => { if (began) { store.cancel(); began = false; } },
      });

      // 뷰포트 안에 고정 위치로 표시
      nf.el.id = '__test-num-field';
      nf.el.style.cssText =
        'position:fixed;top:10px;left:10px;z-index:9999;' +
        'background:#1e2024;padding:8px;border-radius:4px;display:flex;gap:4px;';
      document.body.appendChild(nf.el);
      return 'ok';
    });
    expect(ok).toBe('ok');

    // 레이블 드래그
    const labelEl = page.locator('#__test-num-field .num-label');
    const lb = await labelEl.boundingBox();
    await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
    await page.mouse.down();
    await page.mouse.move(lb.x + lb.width / 2 + 100, lb.y + lb.height / 2, { steps: 10 });
    await page.mouse.up();

    const canUndo = await page.evaluate(() => window.__store.canUndo());
    expect(canUndo).toBe(true);

    await page.evaluate(() => window.__store.undo());

    const canUndoAfter = await page.evaluate(() => window.__store.canUndo());
    expect(canUndoAfter).toBe(false);
  });

  // ── 5. 스냅: 캔버스 중심 근처 → 정확히 중심으로 스냅 ─────────────────
  test('[스냅] 캔버스 중심 근처 → 정확히 중심으로 스냅', async ({ page }) => {
    // 스냅 활성화 확인
    await page.evaluate(() => window.__editorState.set({ snap: true }));

    // doc 중심 근처 (3px 차이) 위치 계산
    const nearCenterPos = await page.evaluate(() => {
      const store = window.__store;
      const stage = window.__stage;
      const doc = store.get();
      const centerX = doc.meta.width / 2 + 3;  // 중심에서 3px 떨어짐
      const centerY = doc.meta.height / 2 + 3;
      const canvas = document.querySelector('.stage-overlay');
      const rect = canvas.getBoundingClientRect();
      const sp = stage.docToScreen(centerX, centerY);
      return { x: rect.left + sp.x, y: rect.top + sp.y };
    });

    // 사각형 레이어 위치
    const startPos = await layerScreenPos(page, '사각형');

    await page.mouse.move(startPos.x, startPos.y);
    await page.mouse.down();
    await page.mouse.move(nearCenterPos.x, nearCenterPos.y, { steps: 10 });
    await page.mouse.up();

    const finalPos = await page.evaluate(() => {
      const doc = window.__store.get();
      const layer = Object.values(doc.layers).find(l => l.name === '사각형');
      return { x: layer.transform.x.value, y: layer.transform.y.value };
    });

    const docCenter = await page.evaluate(() => {
      const doc = window.__store.get();
      return { x: doc.meta.width / 2, y: doc.meta.height / 2 };
    });

    expect(Math.abs(finalPos.x - docCenter.x)).toBeLessThan(1);
    expect(Math.abs(finalPos.y - docCenter.y)).toBeLessThan(1);
  });

  // ── 6. 방향키 이동 (1px / Shift 10px) 및 잠금 레이어 무반응 ──────────
  test('[키보드] 방향키 1px, Shift+방향키 10px, 잠금 레이어 이동 없음', async ({ page }) => {
    // 사각형 선택
    const pos = await layerScreenPos(page, '사각형');
    await page.mouse.click(pos.x, pos.y);

    const origX = await page.evaluate(() => {
      const doc = window.__store.get();
      const layer = Object.values(doc.layers).find(l => l.name === '사각형');
      return layer.transform.x.value;
    });

    // 방향키 1px
    await page.keyboard.press('ArrowRight');
    const x1 = await page.evaluate(() => {
      const doc = window.__store.get();
      return Object.values(doc.layers).find(l => l.name === '사각형').transform.x.value;
    });
    expect(x1 - origX).toBeCloseTo(1, 1);

    // Shift+방향키 10px
    await page.keyboard.press('Shift+ArrowRight');
    const x2 = await page.evaluate(() => {
      const doc = window.__store.get();
      return Object.values(doc.layers).find(l => l.name === '사각형').transform.x.value;
    });
    expect(x2 - x1).toBeCloseTo(10, 1);

    // 잠금 레이어(배경)는 이동하지 않아야 함
    const bgOrigX = await page.evaluate(() => {
      const doc = window.__store.get();
      return Object.values(doc.layers).find(l => l.name === '배경').transform.x.value;
    });

    // 배경 선택 시도 (잠긴 레이어 — 클릭으로 선택 불가)
    await page.evaluate(() => {
      // 잠금 레이어를 강제로 선택
      const doc = window.__store.get();
      const bg = Object.values(doc.layers).find(l => l.name === '배경');
      window.__editorState.set({ selection: [bg.id] });
    });

    await page.keyboard.press('ArrowRight');
    const bgNewX = await page.evaluate(() => {
      const doc = window.__store.get();
      return Object.values(doc.layers).find(l => l.name === '배경').transform.x.value;
    });
    expect(bgNewX).toBeCloseTo(bgOrigX, 1);
  });
});
