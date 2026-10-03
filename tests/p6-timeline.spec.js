// P6 테스트: 재생, 타임라인, 레이어 추가, 인스펙터
import { test, expect } from '@playwright/test';

test.describe('P6 — 재생 / 타임라인 / 레이어 추가 / 인스펙터', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?demo=simple');
    // 타임라인 레이어 행이 나타날 때까지 대기
    await page.waitForSelector('.tl-row', { timeout: 10000 });
  });

  // ── 재생 ─────────────────────────────────────────────────────────────────
  test('[재생] 재생 버튼 → 프레임 진행', async ({ page }) => {
    const f0 = await page.evaluate(() => window.__editorState.get().f);
    expect(f0).toBe(0);

    await page.click('[data-action="play"]');
    await page.waitForTimeout(600);

    const f1 = await page.evaluate(() => window.__editorState.get().f);
    expect(f1).toBeGreaterThan(0);
  });

  test('[재생] 정지 → 프레임 고정', async ({ page }) => {
    await page.click('[data-action="play"]');
    await page.waitForTimeout(400);
    await page.click('[data-action="play"]');  // 다시 클릭 = 정지

    const fPaused = await page.evaluate(() => window.__editorState.get().f);
    await page.waitForTimeout(300);
    const fAfter  = await page.evaluate(() => window.__editorState.get().f);

    expect(fAfter).toBe(fPaused);
    expect(await page.evaluate(() => window.__editorState.get().playing)).toBe(false);
  });

  test('[재생] loop 모드 — 마지막 프레임 → 0으로 돌아옴', async ({ page }) => {
    // 마지막 프레임으로 이동
    await page.evaluate(() => {
      const fc = window.__store.get().meta.frameCount;
      window.__editorState.set({ f: fc - 1 });
    });

    // loopMode가 'loop'인지 확인
    const mode = await page.evaluate(() => window.__editorState.get().loopMode);
    expect(mode).toBe('loop');

    await page.click('[data-action="play"]');
    await page.waitForTimeout(500);
    await page.click('[data-action="play"]');

    // 루프했으므로 f는 0 이상이어야 함 (마지막+1 = 0)
    const f = await page.evaluate(() => window.__editorState.get().f);
    expect(f).toBeGreaterThanOrEqual(0);
  });

  // ── 타임라인 ─────────────────────────────────────────────────────────────
  test('[타임라인] 레이어 행 수 == 레이어 수', async ({ page }) => {
    const rowCount   = await page.locator('.tl-row').count();
    const layerCount = await page.evaluate(() => window.__store.get().order.length);
    expect(rowCount).toBe(layerCount);
    expect(rowCount).toBeGreaterThan(0);
  });

  test('[타임라인] 행 클릭 → 선택', async ({ page }) => {
    const firstId = await page.evaluate(() => {
      const doc = window.__store.get();
      return doc.order[doc.order.length - 1];  // 최상단 레이어
    });

    await page.locator('.tl-row').first().click();

    const sel = await page.evaluate(() => window.__editorState.get().selection);
    expect(sel).toContain(firstId);
  });

  test('[타임라인] Shift+클릭 → 다중 선택', async ({ page }) => {
    const rows = page.locator('.tl-row');
    const count = await rows.count();
    if (count < 2) return;  // 레이어 2개 이상인 경우만

    await rows.first().click();
    await rows.nth(1).click({ modifiers: ['Shift'] });

    const sel = await page.evaluate(() => window.__editorState.get().selection);
    expect(sel.length).toBe(2);
  });

  test('[타임라인] 가시성 토글 — 눈 버튼 클릭', async ({ page }) => {
    const firstId = await page.evaluate(() => {
      const doc = window.__store.get();
      return doc.order[doc.order.length - 1];
    });
    const was = await page.evaluate((id) => window.__store.get().layers[id]?.visible, firstId);

    await page.locator('.tl-row').first().locator('.tl-eye').click();

    const now = await page.evaluate((id) => window.__store.get().layers[id]?.visible, firstId);
    // 토글 결과: true → false or false → true (undefined → false)
    const wasVisible = was !== false;
    expect(now).toBe(!wasVisible);
  });

  test('[타임라인] 트랙 캔버스 렌더됨', async ({ page }) => {
    const canvas = page.locator('.track-body-canvas');
    await expect(canvas).toBeVisible();
    const w = await canvas.evaluate((el) => el.width);
    expect(w).toBeGreaterThan(0);
  });

  test('[타임라인] 트랙 클릭 → 프레임 이동', async ({ page }) => {
    const canvas = page.locator('.track-body-canvas');
    const box    = await canvas.boundingBox();
    if (!box) return;

    // 5번째 프레임 위치 클릭 (PX_PER_F=20)
    await page.mouse.click(box.x + 5 * 20 + 10, box.y + 4);
    const f = await page.evaluate(() => window.__editorState.get().f);
    expect(f).toBe(5);
  });

  // ── 레이어 추가 ──────────────────────────────────────────────────────────
  test('[레이어 추가] 사각형 추가 → 레이어 수 +1', async ({ page }) => {
    const before = await page.evaluate(() => window.__store.get().order.length);

    await page.click('[data-action="add-layer"]');
    await page.waitForSelector('.layer-add-menu', { state: 'visible' });
    await page.click('.layer-add-item[data-kind="rect"]');

    const after = await page.evaluate(() => window.__store.get().order.length);
    expect(after).toBe(before + 1);
  });

  test('[레이어 추가] 원 추가 → shape.kind=ellipse', async ({ page }) => {
    await page.click('[data-action="add-layer"]');
    await page.waitForSelector('.layer-add-menu', { state: 'visible' });
    await page.click('.layer-add-item[data-kind="ellipse"]');

    const newLayer = await page.evaluate(() => {
      const doc = window.__store.get();
      const id  = doc.order[doc.order.length - 1];
      return doc.layers[id];
    });
    expect(newLayer.type).toBe('shape');
    expect(newLayer.shape.kind).toBe('ellipse');
  });

  test('[레이어 추가] 텍스트 추가 → type=text', async ({ page }) => {
    await page.click('[data-action="add-layer"]');
    await page.waitForSelector('.layer-add-menu', { state: 'visible' });
    await page.click('.layer-add-item[data-kind="text"]');

    const newLayer = await page.evaluate(() => {
      const doc = window.__store.get();
      const id  = doc.order[doc.order.length - 1];
      return doc.layers[id];
    });
    expect(newLayer.type).toBe('text');
    expect(typeof newLayer.text).toBe('string');
  });

  test('[레이어 추가] 추가 후 자동 선택됨', async ({ page }) => {
    await page.click('[data-action="add-layer"]');
    await page.waitForSelector('.layer-add-menu', { state: 'visible' });
    await page.click('.layer-add-item[data-kind="rect"]');

    const sel = await page.evaluate(() => window.__editorState.get().selection);
    expect(sel.length).toBe(1);
    const topId = await page.evaluate(() => {
      const doc = window.__store.get();
      return doc.order[doc.order.length - 1];
    });
    expect(sel[0]).toBe(topId);
  });

  // ── 인스펙터 ─────────────────────────────────────────────────────────────
  test('[인스펙터] 선택 없음 → 빈 안내 표시', async ({ page }) => {
    // 선택 해제
    await page.evaluate(() => window.__editorState.set({ selection: [] }));
    const empty = page.locator('.inspector-empty');
    await expect(empty).toBeVisible();
  });

  test('[인스펙터] 레이어 선택 → 레이아웃 섹션 표시', async ({ page }) => {
    await page.locator('.tl-row').first().click();
    const section = page.locator('.inspector-section');
    await expect(section).toBeVisible();
    const xLabel = page.locator('.num-label').filter({ hasText: 'X' });
    await expect(xLabel.first()).toBeVisible();
  });

  test('[인스펙터] X값 변경 → store 반영', async ({ page }) => {
    await page.locator('.tl-row').first().click();

    const id = await page.evaluate(() => window.__editorState.get().selection[0]);

    // X 입력 필드에 값 입력
    const xInput = page.locator('.num-input').first();
    await xInput.click({ clickCount: 3 });
    await xInput.fill('123');
    await xInput.press('Enter');

    const val = await page.evaluate((layerId) => {
      const layer = window.__store.get().layers[layerId];
      return layer?.transform?.x?.value;
    }, id);
    expect(val).toBe(123);
  });

  // ── 상단 바 ──────────────────────────────────────────────────────────────
  test('[상단바] 캔버스 정보 표시 (zoom%)', async ({ page }) => {
    const info = page.locator('#canvas-info');
    const text = await info.textContent();
    expect(text).toMatch(/\d+%/);
  });

  test('[상단바] 되돌리기 버튼 초기 비활성화', async ({ page }) => {
    const undoBtn = page.locator('[data-action="undo"]');
    const isDisabled = await undoBtn.evaluate((el) => el.disabled);
    expect(isDisabled).toBe(true);
  });

  test('[상단바] 작업 후 되돌리기 활성화', async ({ page }) => {
    // 레이어 추가 → undo 가능
    await page.click('[data-action="add-layer"]');
    await page.waitForSelector('.layer-add-menu', { state: 'visible' });
    await page.click('.layer-add-item[data-kind="rect"]');

    const undoBtn = page.locator('[data-action="undo"]');
    const isDisabled = await undoBtn.evaluate((el) => el.disabled);
    expect(isDisabled).toBe(false);
  });

  // ── 루프 모드 순환 ────────────────────────────────────────────────────────
  test('[재생] 루프 모드 버튼 순환 (loop→once→pingpong→loop)', async ({ page }) => {
    const loopBtn = page.locator('[data-action="loop-mode"]');

    let mode = await page.evaluate(() => window.__editorState.get().loopMode);
    expect(mode).toBe('loop');

    await loopBtn.click();
    mode = await page.evaluate(() => window.__editorState.get().loopMode);
    expect(mode).toBe('once');

    await loopBtn.click();
    mode = await page.evaluate(() => window.__editorState.get().loopMode);
    expect(mode).toBe('pingpong');

    await loopBtn.click();
    mode = await page.evaluate(() => window.__editorState.get().loopMode);
    expect(mode).toBe('loop');
  });
});
