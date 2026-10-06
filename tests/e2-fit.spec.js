// E2 — 용도 프리셋 + 목표 용량 맞추기.
import { test, expect } from '@playwright/test';

async function gotoDemo(page) {
  await page.goto('/?demo=1');
  await page.waitForFunction(() => !!(window.__store && window.__stage));
  await page.waitForTimeout(300);
}

test.describe('E2 — 용량 맞추기', () => {
  // ── 코코포리아 APNG → ≤1,000,000바이트, 고른 후보가 로그상 처음으로 맞는 것 ──
  test('[코코 APNG] ≤1MB, 처음으로 맞는 후보 선택', async ({ page }) => {
    await gotoDemo(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { fitToTarget } = await import('/src/export/fit.js');
      const { getPreset } = await import('/src/export/presets.js');
      const { doc, deps } = await H.demoDeps();
      const logs = [];
      const res = await fitToTarget(doc, getPreset('ccfolia-apng'), deps, { onLog: (e) => logs.push(e) });
      const firstUnder = logs.find((l) => l.bytes != null && l.bytes <= 1_000_000);
      return { bytes: res.bytes, reached: res.reached, chosen: res.bytes, firstUnderBytes: firstUnder?.bytes, settings: res.settings };
    });
    expect(r.reached).toBe(true);
    expect(r.bytes).toBeLessThanOrEqual(1_000_000);
    expect(r.bytes).toBe(r.firstUnderBytes); // 로그상 처음으로 목표에 든 후보가 선택됨
  });

  // ── 디스코드 스티커 → 320×320 안, ≤512,000, APNG 애니메이션 ──────────────
  test('[디스코드 스티커] 320 안·≤512KB·APNG 애니메이션', async ({ page }) => {
    await gotoDemo(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { fitToTarget } = await import('/src/export/fit.js');
      const { getPreset } = await import('/src/export/presets.js');
      const { doc, deps } = await H.demoDeps();
      const res = await fitToTarget(doc, getPreset('discord-sticker'), deps, {});
      const buf = await res.blob.arrayBuffer();
      const dec = await H.decode(buf, 'image/png');
      return { w: res.width, h: res.height, bytes: res.bytes, reached: res.reached, n: dec.n, rep: dec.rep };
    });
    expect(r.reached).toBe(true);
    expect(r.w).toBeLessThanOrEqual(320);
    expect(r.h).toBeLessThanOrEqual(320);
    expect(r.bytes).toBeLessThanOrEqual(512_000);
    expect(r.n).toBeGreaterThan(1); // 애니메이션
  });

  // ── 디스코드 이모지 → 128×128 안, GIF, ≤256,000 ──────────────────────────
  test('[디스코드 이모지] 128 안·GIF·≤256KB', async ({ page }) => {
    await gotoDemo(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { fitToTarget } = await import('/src/export/fit.js');
      const { getPreset } = await import('/src/export/presets.js');
      const { doc, deps } = await H.demoDeps();
      const res = await fitToTarget(doc, getPreset('discord-emoji'), deps, {});
      const buf = await res.blob.arrayBuffer();
      const dec = await H.decode(buf, 'image/gif');
      return { w: res.width, h: res.height, bytes: res.bytes, fmt: res.format, reached: res.reached, n: dec.n };
    });
    expect(r.reached).toBe(true);
    expect(r.fmt).toBe('gif');
    expect(r.w).toBeLessThanOrEqual(128);
    expect(r.h).toBeLessThanOrEqual(128);
    expect(r.bytes).toBeLessThanOrEqual(256_000);
    expect(r.n).toBeGreaterThan(1);
  });

  // ── 불가능한 목표(10KB) → "목표를 넘음" + 가장 작은 결과 ──────────────────
  test('[불가능 목표] 10KB → 넘음 + 가장 작은 결과', async ({ page }) => {
    await gotoDemo(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { fitToTarget } = await import('/src/export/fit.js');
      const { doc, deps } = await H.demoDeps();
      const preset = { id: 'tiny', name: '불가능', format: 'gif', targetBytes: 10_000 };
      const logs = [];
      const res = await fitToTarget(doc, preset, deps, { onLog: (e) => logs.push(e) });
      const minLog = Math.min(...logs.filter((l) => l.bytes != null).map((l) => l.bytes));
      return { reached: res.reached, bytes: res.bytes, minLog, hasBlob: res.blob.size > 0 };
    });
    expect(r.reached).toBe(false);
    expect(r.hasBlob).toBe(true);
    expect(r.bytes).toBe(r.minLog); // 가장 작은 결과
  });

  // ── 프레임 줄이기 허용 → 실패하던 목표 충족(프레임 절반·전체 길이 같음) ────
  test('[프레임 줄이기] 실패 목표가 맞춰짐 · halveFrames 절반·길이 유지', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { fitToTarget, halveFrames } = await import('/src/export/fit.js');
      const { bakeFrames } = await import('/src/core/export/bake.js');
      const { createRenderEngine } = await import('/src/core/render/frame.js');

      // halveFrames 단위 검증: 안 합쳐질 만큼 큰 캔버스에서 8프레임 → 4, 전체 길이 같음
      const doc8 = H.movingShapeDoc({ width: 64, height: 64, fps: 10, frameCount: 8, x0: 8, x1: 56 });
      const engine = createRenderEngine({ createCanvas: H.createCanvas });
      const baked = await bakeFrames(engine, doc8, { createCanvas: H.createCanvas });
      const half = halveFrames(baked);
      const sum = (b) => b.frames.reduce((a, f) => a + f.delayMs, 0);
      const unit = { n: baked.frames.length, halfN: half.frames.length,
        lenSame: sum(baked) === sum(half), expectHalf: Math.ceil(baked.frames.length / 2) };

      // 통합 검증: 70% 목표는 정상(off)으로 실패, 프레임 줄이기(on)로 충족
      const doc = H.movingShapeDoc({ width: 16, height: 16, fps: 10, frameCount: 8, x0: 2, x1: 12 });
      const deps = { createCanvas: H.createCanvas };
      const probe = await fitToTarget(doc, { id: 'p', format: 'gif', targetBytes: 1 }, deps, {});
      const target = Math.floor(probe.bytes * 0.7);
      const off = await fitToTarget(doc, { id: 'p', format: 'gif', targetBytes: target }, deps, {});
      const on = await fitToTarget(doc, { id: 'p', format: 'gif', targetBytes: target },
        { ...deps, allowFrameReduction: true }, {});
      return { unit, offReached: off.reached, onReached: on.reached, onReduced: on.settings.frameReduced };
    });
    expect(r.unit.n).toBe(8);
    expect(r.unit.halfN).toBe(r.unit.expectHalf); // 8 → 4
    expect(r.unit.halfN).toBe(4);
    expect(r.unit.lenSame).toBe(true);            // 전체 길이 보존
    expect(r.offReached).toBe(false);
    expect(r.onReached).toBe(true);
    expect(r.onReduced).toBe(true);
  });

  // ── 같은 크기 후보 여러 개 → 굽기 1회 ────────────────────────────────────
  test('[굽기 공유] 같은 크기 후보 여럿 → 굽기 1회', async ({ page }) => {
    await gotoDemo(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { fitToTarget } = await import('/src/export/fit.js');
      const { getPreset } = await import('/src/export/presets.js');
      const { doc, deps } = await H.demoDeps();
      // 코코 APNG는 크기1에서 목표(1MB)에 들어 크기1만 굽는다 → bake 1회
      const res = await fitToTarget(doc, getPreset('ccfolia-apng'), deps, {});
      return { bakeCount: res.bakeCount, scaleMul: res.settings.scaleMul, reached: res.reached };
    });
    expect(r.reached).toBe(true);
    expect(r.scaleMul).toBe(1);
    expect(r.bakeCount).toBe(1);
  });

  // ── 여러 형식 한 번에(코코 APNG + WebP) → 결과 2개, 각자 충족 ─────────────
  test('[여러 형식] 코코 APNG+WebP → 2개, 각자 ≤1MB', async ({ page }) => {
    await gotoDemo(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { exportMany } = await import('/src/export/fit.js');
      const { getPreset } = await import('/src/export/presets.js');
      const { doc, deps } = await H.demoDeps();
      const { results, bakeCount } = await exportMany(
        doc, [getPreset('ccfolia-apng'), getPreset('ccfolia-webp')], deps, {});
      return {
        n: results.length, bakeCount,
        a: { fmt: results[0].format, bytes: results[0].bytes, reached: results[0].reached },
        b: { fmt: results[1].format, bytes: results[1].bytes, reached: results[1].reached },
      };
    });
    expect(r.n).toBe(2);
    expect(r.a.fmt).toBe('apng');
    expect(r.b.fmt).toBe('webp');
    expect(r.a.bytes).toBeLessThanOrEqual(1_000_000);
    expect(r.b.bytes).toBeLessThanOrEqual(1_000_000);
    expect(r.a.reached).toBe(true);
    expect(r.b.reached).toBe(true);
    // 크기1 굽기 공유: APNG·WebP 모두 크기1·trim=false → bake 1회
    expect(r.bakeCount).toBe(1);
  });

  // ── 취소 → 이후 결과 없음 ────────────────────────────────────────────────
  test('[취소] 맞추기 중 abort → AbortError, 결과 없음', async ({ page }) => {
    await gotoDemo(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { fitToTarget } = await import('/src/export/fit.js');
      const { getPreset } = await import('/src/export/presets.js');
      const { doc, deps } = await H.demoDeps();
      const ctrl = new AbortController();
      const p = fitToTarget(doc, getPreset('ccfolia-apng'), deps, { signal: ctrl.signal });
      setTimeout(() => ctrl.abort(), 5);
      try { const res = await p; return { ok: true, bytes: res.bytes }; }
      catch (e) { return { ok: false, name: e.name }; }
    });
    expect(r.ok).toBe(false);
    expect(r.name).toBe('AbortError');
  });

  // ── 프리셋 저장소: 기본 삭제 불가, 사용자 저장/삭제, 프로젝트별 마지막 기억 ──
  test('[프리셋 저장소] 기본 삭제 불가·사용자 저장/삭제·마지막 기억', async ({ page }) => {
    await page.goto('/');
    const r = await page.evaluate(async () => {
      const P = await import('/src/export/presets.js');
      const delDefault = P.deleteUserPreset('ccfolia-apng'); // false
      const saved = P.saveUserPreset({ name: '내 프리셋', format: 'webp', targetBytes: 300000 });
      const hasSaved = P.getPresets().some((p) => p.id === saved.id);
      const delUser = P.deleteUserPreset(saved.id); // true
      const goneUser = !P.getPresets().some((p) => p.id === saved.id);
      P.setLastPresetId('prj_x', 'discord-emoji');
      const last = P.getLastPresetId('prj_x');
      const count = P.DEFAULT_PRESETS.length;
      return { delDefault, hasSaved, delUser, goneUser, last, count };
    });
    expect(r.delDefault).toBe(false);
    expect(r.hasSaved).toBe(true);
    expect(r.delUser).toBe(true);
    expect(r.goneUser).toBe(true);
    expect(r.last).toBe('discord-emoji');
    expect(r.count).toBe(6);
  });

  // ── 보고용: demo=1 기준 프리셋별 결과 표 ──────────────────────────────────
  test('[표] demo=1 프리셋별 결과(설정·용량·시간)', async ({ page }) => {
    // 6개 프리셋을 실제로 굽는 무거운 측정 테스트. 단독 ~12s지만 전체 병렬 실행 중
    // 머신 부하로 기본 30s를 넘길 수 있어 넉넉히 둔다(어서션이 아니라 보고용).
    test.setTimeout(120_000);
    await gotoDemo(page);
    const r = await page.evaluate(async () => {
      const H = await import('/tests/e1-helpers.js');
      const { fitToTarget } = await import('/src/export/fit.js');
      const { getPresets } = await import('/src/export/presets.js');
      const { doc, deps } = await H.demoDeps();
      const rows = [];
      for (const preset of getPresets()) {
        const t0 = performance.now();
        const res = await fitToTarget(doc, preset, deps, {});
        const ms = Math.round(performance.now() - t0);
        const s = res.settings;
        const setting = res.format === 'apng' ? (s.colors === 0 ? '무손실' : `${s.colors}색`)
          : res.format === 'webp' ? (s.lossless ? '무손실' : `q${s.quality}`) : 'GIF255';
        rows.push({ id: preset.id, fmt: res.format, size: `${res.width}x${res.height}`,
          setting: `x${s.scaleMul} ${setting}${s.frameReduced ? ' 프레임½' : ''}`,
          kb: +(res.bytes / 1024).toFixed(1), reached: res.reached, ms });
      }
      return rows;
    });
    console.log('[E2 프리셋별 결과표 — demo=1 768x768x24]');
    for (const row of r) {
      console.log(`  ${row.id.padEnd(16)} ${row.fmt.padEnd(4)} ${row.size.padEnd(9)} ${row.setting.padEnd(18)} ${String(row.kb).padStart(8)}KB ${row.reached ? '충족' : '넘음'} ${String(row.ms).padStart(6)}ms`);
      expect(row.kb).toBeGreaterThan(0);
    }
  });
});
