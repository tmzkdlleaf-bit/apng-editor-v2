// S5-4 모션(등장 12 + 퇴장 11 + 반복 12 + 강조 8 = 43) — 수·계약·결정론·끝점·루프 이음매.
import { test, expect } from '@playwright/test';

test('S5-4 — 모션 43종: 계약·결정론·끝점·루프 이음매', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => true);
  const r = await page.evaluate(async () => {
    const { getAllMotions } = await import('/src/motions/registry.js');
    const { isLoopSeamOk, defaultParams } = await import('/src/motions/contract.js');
    const all = getAllMotions();
    const list = all.filter((m) => !m.id.startsWith('test-')); // 시험 3개 제외
    const env = { w: 120, h: 90, frameCount: 24, fps: 12 };
    const out = { total: list.length, byKind: {}, items: {} };

    function identity(v) {
      const d = { x: 0, y: 0, rotation: 0, scale: 1, scaleX: 1, scaleY: 1, alpha: 1, brightness: 0 };
      for (const k of Object.keys(d)) {
        const got = v[k] ?? d[k];
        if (Math.abs(got - d[k]) > 1e-6) return false;
      }
      return true;
    }

    for (const m of list) {
      out.byKind[m.kind] = (out.byKind[m.kind] ?? 0) + 1;
      const p = defaultParams(m);
      // 계약 필드
      const hasFields = !!m.id && !!m.name && !!m.category && !!m.kind &&
        typeof m.defaultLength === 'number' && Array.isArray(m.params) && typeof m.evaluate === 'function';
      // 결정론: 같은 t 두 번 → 동일
      const a = m.evaluate(0.37, p, env), b = m.evaluate(0.37, p, env);
      let determ = true;
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (k === 'slices') continue;
        if (Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > 1e-9) determ = false;
      }
      // 끝점: enter 는 t=1 제자리, exit 는 t=0 제자리
      let endOk = true;
      if (m.kind === 'enter') endOk = identity(m.evaluate(1, p, env));
      else if (m.kind === 'exit') endOk = identity(m.evaluate(0, p, env));
      // 중간 프레임에서 유한값(NaN 금지)
      let finite = true;
      for (const tt of [0, 0.25, 0.5, 0.75, 1]) {
        const v = m.evaluate(tt, p, env);
        for (const k of Object.keys(v)) {
          if (k === 'slices') continue;
          if (!Number.isFinite(v[k])) finite = false;
        }
      }
      out.items[m.id] = { hasFields, determ, endOk, finite, loopOk: isLoopSeamOk(m), kind: m.kind };
    }
    return out;
  });

  expect(r.total, '시험 제외 모션 수').toBe(43);
  expect(r.byKind.enter, '등장 수').toBe(12);
  expect(r.byKind.exit, '퇴장 수').toBe(11);
  expect(r.byKind.loop, '반복 수').toBe(12);
  expect(r.byKind.emphasis, '강조 수').toBe(8);

  for (const id of Object.keys(r.items)) {
    const it = r.items[id];
    expect(it.hasFields, `${id} 계약 필드`).toBe(true);
    expect(it.determ, `${id} 결정론`).toBe(true);
    expect(it.finite, `${id} 유한값`).toBe(true);
    expect(it.loopOk, `${id} 루프 이음매`).toBe(true);
    if (it.kind === 'enter' || it.kind === 'exit') expect(it.endOk, `${id} 끝점 제자리`).toBe(true);
  }
});

test('S5-4 — 모션이 렌더에 반영된다(클립 적용 시 레이어가 움직인다)', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => true);
  const r = await page.evaluate(async () => {
    const motions = (await import('/src/motions/registry.js')).default;
    const { getAllMotions } = await import('/src/motions/registry.js');
    const { evalClips } = await import('/src/core/anim/clip.js');
    const { createClip } = await import('/src/core/doc/schema.js');
    const list = getAllMotions().filter((m) => !m.id.startsWith('test-'));
    const ctx = { motions, width: 120, height: 90, frameCount: 24, env: { w: 120, h: 90, frameCount: 24, fps: 12 } };
    const out = {};
    for (const m of list) {
      const clip = createClip(m, { start: 0 });
      const layer = { clips: [clip] };
      const len = m.defaultLength ?? 24;
      // 구간 안 여러 프레임 중 하나라도 변화가 있으면 통과(루프는 특정 프레임이 영점일 수 있음)
      let moved = false;
      for (let f = 1; f < len && !moved; f++) {
        const v = evalClips(layer, f, ctx);
        moved = Math.abs(v.x) > 1e-6 || Math.abs(v.y) > 1e-6 || Math.abs(v.rotation) > 1e-6 ||
          Math.abs(v.scale - 1) > 1e-6 || Math.abs(v.scaleX - 1) > 1e-6 || Math.abs(v.scaleY - 1) > 1e-6 ||
          Math.abs(v.alpha - 1) > 1e-6 || Math.abs(v.brightness) > 1e-6;
      }
      out[m.id] = moved;
    }
    return out;
  });
  for (const id of Object.keys(r)) expect(r[id], `${id} 중간 프레임에서 변화`).toBe(true);
});
