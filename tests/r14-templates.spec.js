// R14-1 — 코코포리아 컷인 템플릿 6종. 생성·렌더 오류 없음, 반복용(6) 이음새 0,
// 한 번 재생용(1·5) playback=once, 2·3·4 에 세트 변형 들어 있음.
import { test, expect } from '@playwright/test';

const NEW_KEYS = ['cutin-slide', 'cutin-critical', 'cutin-fumble', 'cutin-result', 'cutin-transition', 'cutin-loop-frame'];

test.describe('R14-1 컷인 템플릿', () => {
  test('[생성·렌더] 템플릿마다 문서 생성·프레임 렌더 오류 없음', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async (keys) => {
      const { createProjectFromTemplate, TEMPLATES } = await import('/src/ui/templates.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');
      const { effects } = await import('/src/effects/registry.js');
      const motions = (await import('/src/motions/registry.js')).default;
      const createCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
      const engine = createRenderEngine({ createCanvas, effects, motions });
      const out = {};
      for (const key of keys) {
        const doc = createProjectFromTemplate(key, 'ccfolia-cutin');
        const c = createCanvas(doc.meta.width, doc.meta.height);
        // 몇 프레임 렌더(오류 없이).
        const fs = [0, Math.floor(doc.meta.frameCount / 2), doc.meta.frameCount - 1];
        for (const f of fs) engine.renderFrame(c.getContext('2d', { willReadFrequently: true }), doc, f, { scale: 1 });
        out[key] = {
          layers: Object.keys(doc.layers).length,
          playback: doc.meta.playback,
          hasVariants: !!doc.variants,
          slotCount: doc.variants?.slots?.length ?? 0,
          rowCount: doc.variants?.rows?.length ?? 0,
          w: doc.meta.width, h: doc.meta.height,
        };
      }
      out._total = TEMPLATES.length;
      return out;
    }, NEW_KEYS);

    expect(r._total).toBe(10); // 기존 4 + 신규 6
    for (const key of NEW_KEYS) {
      expect(r[key].layers, `${key} 레이어 생성됨`).toBeGreaterThan(0);
      expect(r[key].w).toBe(768); expect(r[key].h).toBe(768);
    }
    // 한 번 재생용
    expect(r['cutin-slide'].playback).toBe('once');
    expect(r['cutin-transition'].playback).toBe('once');
    // 세트 변형(2·3·4)
    for (const key of ['cutin-critical', 'cutin-fumble', 'cutin-result']) {
      expect(r[key].hasVariants, `${key} 세트 있음`).toBe(true);
      expect(r[key].slotCount).toBeGreaterThanOrEqual(1);
      expect(r[key].rowCount).toBe(4);
    }
  });

  test('[이음새] 반복 배경(6)은 루프 경고 0', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { createProjectFromTemplate } = await import('/src/ui/templates.js');
      const { checkLoopSeam } = await import('/src/core/anim/seam.js');
      const motions = (await import('/src/motions/registry.js')).default;
      const doc = createProjectFromTemplate('cutin-loop-frame', 'ccfolia-cutin');
      const issues = checkLoopSeam(doc, motions);
      return { count: issues.length, playback: doc.meta.playback };
    });
    expect(r.playback).toBe('loop');
    expect(r.count).toBe(0);
  });

  test('[세트 변형] 크리티컬 판정 글자 세트에 성공/실패/크리티컬/펌블', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const { createProjectFromTemplate } = await import('/src/ui/templates.js');
      const { applyVariant } = await import('/src/core/doc/variants.js');
      const doc = createProjectFromTemplate('cutin-critical', 'ccfolia-cutin');
      const slot = doc.variants.slots[0];
      const texts = doc.variants.rows.map((row) => applyVariant(doc, row).layers[slot.layerId].text);
      return { names: doc.variants.rows.map((r) => r.name), texts };
    });
    expect(r.names).toEqual(['성공', '실패', '크리티컬', '펌블']);
    expect(r.texts).toEqual(['성공', '실패', '대성공', '대실패']);
  });
});
