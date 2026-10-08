// F3-1 — 모션 계약 + 시험 프리셋 3개.
import { test, expect } from '@playwright/test';

test('F3-1 — 시험 프리셋 3개: 계약 필드 + 루프 t0==t1', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => true);
  const r = await page.evaluate(async () => {
    const { getAllMotions } = await import('/src/motions/registry.js');
    const { isLoopSeamOk, defaultParams } = await import('/src/motions/contract.js');
    const ms = getAllMotions();
    const out = { ids: ms.map((m) => m.id), checks: {} };
    for (const m of ms) {
      // 계약 필드 존재
      const hasFields = !!m.id && !!m.name && !!m.category && !!m.kind &&
        typeof m.defaultLength === 'number' && Array.isArray(m.params) && typeof m.evaluate === 'function';
      out.checks[m.id] = { hasFields, loopOk: isLoopSeamOk(m), kind: m.kind };
    }
    // 시험 3종 구체 검사
    const float = ms.find((m) => m.id === 'test-float');
    const fade = ms.find((m) => m.id === 'test-fade-in');
    const v0 = float.evaluate(0, defaultParams(float));
    const v1 = float.evaluate(1, defaultParams(float));
    out.floatSeam = Math.abs((v0.y ?? 0) - (v1.y ?? 0));
    out.fadeStart = fade.evaluate(0, {}).alpha;
    out.fadeEnd = fade.evaluate(1, {}).alpha;
    return out;
  });
  expect(r.ids).toEqual(expect.arrayContaining(['test-shake', 'test-fade-in', 'test-float']));
  for (const id of r.ids) {
    expect(r.checks[id].hasFields).toBe(true);
    expect(r.checks[id].loopOk).toBe(true); // loop 아니면 true, loop 면 이음매 통과
  }
  expect(r.floatSeam).toBeLessThan(1e-6);   // 루프 t0==t1
  expect(r.fadeStart).toBe(0);
  expect(r.fadeEnd).toBe(1);
});

test('F3-1 — createClip 이 motion.defaultLength·kind(loop) 를 쓴다', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => true);
  const r = await page.evaluate(async () => {
    const { createClip } = await import('/src/core/doc/schema.js');
    const { getMotion } = await import('/src/motions/registry.js');
    const float = getMotion('test-float');   // loop, defaultLength 24
    const fade = getMotion('test-fade-in');  // enter, defaultLength 12
    const c1 = createClip(float, { start: 0 });
    const c2 = createClip(fade, { start: 5 });
    return { len1: c1.length, loop1: c1.loop, len2: c2.length, loop2: c2.loop };
  });
  expect(r.len1).toBe(24);
  expect(r.loop1).toBe(true);
  expect(r.len2).toBe(12);
  expect(r.loop2).toBe(false);
});
