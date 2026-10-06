// 내보내기 화면 — 모달. 실제 인코딩 결과를 미리보기로 재생하고, 용도 프리셋·목표 맞추기·여러 형식을 다룬다.
// 렌더는 미리보기(stage)가 아니라 인코딩 결과 그대로. 굽기는 프레임마다 양보하고 인코딩은 워커라 메인이 멈추지 않는다.
import { effects as effectsRegistry } from '../../effects/registry.js';
import motionRegistry from '../../motions/registry.js';
import { getAsset } from '../../core/io/assets.js';
import { getPresets, getPreset, isDefaultPreset, saveUserPreset } from '../../export/presets.js';
import { exportAnimation, getExportWarnings } from '../../export/index.js';
import { fitToTarget, exportMany } from '../../export/fit.js';
import { showToast } from '../shell/status.js';
import { saveFile } from '../../platform/index.js';

const SETTINGS_KEY = 'apng2.exportSettings';
const SCALE_MULS = [1, 0.75, 0.5, 0.25];
const APNG_COLORS = [{ v: 0, label: '무손실' }, { v: 256, label: '256색' }, { v: 128, label: '128색' }, { v: 64, label: '64색' }, { v: 32, label: '32색' }];

function createCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function fmtBytes(b) {
  if (b == null) return '-';
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(2) + ' MB';
  return (b / 1024).toFixed(1) + ' KB';
}
function fmtDuration(ms) { return (ms / 1000).toFixed(2) + '초'; }

function defaultSettings(preset) {
  return {
    presetId: preset.id,
    format: preset.format,
    scaleMul: 1,
    colors: preset.colors ?? 0,
    lossless: false,
    quality: 80,
    trim: !!preset.trim,
    loopMode: 'infinite',  // 'infinite' | 'count'
    loopCount: 1,
    allowFrameReduction: false,
    modified: false,
  };
}

export function initExport(store, editorState, projectApi = null) {
  const projectId = () => projectApi?.getId?.() ?? 'local';
  const projectName = () => projectApi?.getName?.() ?? '프로젝트';

  let deps = null;         // { assets } 준비된 에셋 어댑터
  let open = false;
  let running = false;
  let abortCtrl = null;
  let estTimer = null;
  let estCtrl = null;
  let lastResult = null;   // { blob, url, bytes, width, height, frameCount, durationMs, format, filename }
  const multiResults = []; // 함께 만들기 결과
  const together = new Set();

  let settings = loadSettings();

  function loadSettings() {
    const base = defaultSettings(getPresets()[0]);
    try {
      const raw = localStorage.getItem(`${SETTINGS_KEY}.${projectId()}`);
      if (raw) return { ...base, ...JSON.parse(raw) };
    } catch {}
    return base;
  }
  function saveSettings() {
    try { localStorage.setItem(`${SETTINGS_KEY}.${projectId()}`, JSON.stringify(settings)); } catch {}
  }

  // ── DOM ────────────────────────────────────────────────────────────────
  const modal = document.createElement('div');
  modal.className = 'export-modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="export-dialog" role="dialog" aria-label="내보내기">
      <div class="ex-head">
        <span class="ex-title">내보내기</span>
        <button class="ex-close" aria-label="닫기">×</button>
      </div>
      <div class="ex-body">
        <div class="ex-left">
          <div class="ex-preview-wrap"><img class="ex-preview" alt="출력 미리보기"></div>
          <div class="ex-info" id="ex-info">-</div>
        </div>
        <div class="ex-right">
          <div class="ex-size-box">
            <div class="ex-size" id="ex-size">-</div>
            <div class="ex-target" id="ex-target"></div>
            <button class="ex-fit" id="ex-fit">목표에 맞추기</button>
          </div>
          <div class="ex-settings" id="ex-settings"></div>
          <div class="ex-warn" id="ex-warn" style="display:none;"></div>
          <div class="ex-together" id="ex-together"></div>
          <div class="ex-progress" id="ex-progress" style="display:none;">
            <div class="ex-bar"><div class="ex-bar-fill" id="ex-bar-fill"></div></div>
            <div class="ex-step" id="ex-step"></div>
            <button class="ex-cancel" id="ex-cancel">취소</button>
            <details class="ex-log-wrap"><summary>로그</summary><pre class="ex-log" id="ex-log"></pre></details>
          </div>
          <div class="ex-results" id="ex-results" style="display:none;"></div>
        </div>
      </div>
      <div class="ex-foot">
        <button class="ex-save-preset" id="ex-save-preset">용도로 저장</button>
        <span class="ex-foot-spacer"></span>
        <button class="ex-cancel-btn" id="ex-foot-cancel">취소</button>
        <button class="accent ex-run" id="ex-run">내보내기</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const $ = (sel) => modal.querySelector(sel);
  const previewImg = $('.ex-preview');
  const infoEl = $('#ex-info');
  const sizeEl = $('#ex-size');
  const targetEl = $('#ex-target');
  const fitBtn = $('#ex-fit');
  const settingsEl = $('#ex-settings');
  const warnEl = $('#ex-warn');
  const togetherEl = $('#ex-together');
  const progressEl = $('#ex-progress');
  const barFill = $('#ex-bar-fill');
  const stepEl = $('#ex-step');
  const logEl = $('#ex-log');
  const resultsEl = $('#ex-results');
  const runBtn = $('#ex-run');

  // ── 설정 패널 렌더 ───────────────────────────────────────────────────────
  function renderSettings() {
    const presets = getPresets();
    const preset = getPreset(settings.presetId);
    const modifiedTag = settings.modified ? ' <span class="ex-modified">(수정됨)</span>' : '';
    const colorField = settings.format === 'apng'
      ? `<label>색상 수</label><select class="ex-ctl" data-k="colors">${APNG_COLORS.map((c) => `<option value="${c.v}" ${settings.colors === c.v ? 'selected' : ''}>${c.label}</option>`).join('')}</select>`
      : settings.format === 'webp'
      ? `<label>품질</label><span class="ex-quality-row"><input class="ex-ctl" data-k="lossless" type="checkbox" ${settings.lossless ? 'checked' : ''} id="ex-ll"><label for="ex-ll" class="ex-inline">무손실</label><input class="ex-ctl" data-k="quality" type="range" min="30" max="100" value="${settings.quality}" ${settings.lossless ? 'disabled' : ''}><span id="ex-qval">${settings.quality}</span></span>`
      : `<label>색상 수</label><span class="ex-note">GIF는 256색 고정(투명 1비트)</span>`;

    settingsEl.innerHTML = `
      <div class="ex-row"><label>용도</label>
        <span class="ex-preset-pick">
          <select class="ex-ctl" data-k="presetId">${presets.map((p) => `<option value="${p.id}" ${settings.presetId === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
          <span class="ex-preset-name">${preset ? '' : ''}${modifiedTag}</span>
        </span>
      </div>
      <div class="ex-row"><label>형식</label>
        <span class="ex-formats">
          ${['apng', 'webp', 'gif'].map((f) => `<label class="ex-inline"><input type="radio" name="ex-format" class="ex-ctl" data-k="format" value="${f}" ${settings.format === f ? 'checked' : ''}>${f.toUpperCase()}</label>`).join('')}
        </span>
      </div>
      <div class="ex-row"><label>크기</label>
        <select class="ex-ctl" data-k="scaleMul">${SCALE_MULS.map((s) => `<option value="${s}" ${settings.scaleMul === s ? 'selected' : ''}>${s}×</option>`).join('')}</select>
      </div>
      <div class="ex-row">${colorField}</div>
      <div class="ex-row"><label>투명 여백</label><label class="ex-inline"><input type="checkbox" class="ex-ctl" data-k="trim" ${settings.trim ? 'checked' : ''}>잘라내기</label></div>
      <div class="ex-row"><label>반복</label>
        <span class="ex-loops">
          <label class="ex-inline"><input type="radio" name="ex-loop" class="ex-ctl" data-k="loopMode" value="infinite" ${settings.loopMode === 'infinite' ? 'checked' : ''}>무한</label>
          <label class="ex-inline"><input type="radio" name="ex-loop" class="ex-ctl" data-k="loopMode" value="count" ${settings.loopMode === 'count' ? 'checked' : ''}>횟수</label>
          <input type="number" class="ex-ctl" data-k="loopCount" min="1" max="1000" value="${settings.loopCount}" ${settings.loopMode === 'count' ? '' : 'disabled'} style="width:64px;">
        </span>
      </div>
      <div class="ex-row"><label>프레임 줄이기</label><label class="ex-inline"><input type="checkbox" class="ex-ctl" data-k="allowFrameReduction" ${settings.allowFrameReduction ? 'checked' : ''}>목표 못 맞출 때 허용</label></div>
    `;
    // 컨트롤 이벤트
    settingsEl.querySelectorAll('.ex-ctl').forEach((el) => {
      const ev = (el.type === 'range') ? 'input' : 'change';
      el.addEventListener(ev, () => onControl(el));
    });
    // 용도 select 변경은 "수정됨"이 아니라 프리셋 적용
    const presetSel = settingsEl.querySelector('[data-k="presetId"]');
    presetSel?.addEventListener('change', () => applyPreset(presetSel.value));

    renderTarget();
    renderTogether();
    renderWarnings();
  }

  function onControl(el) {
    const k = el.dataset.k;
    if (k === 'presetId') return; // 별도 처리
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'number' || el.type === 'range') v = parseFloat(el.value);
    else v = el.value;
    if (k === 'colors' || k === 'scaleMul') v = parseFloat(v);
    settings[k] = v;
    settings.modified = true;
    const nameSpan = settingsEl.querySelector('.ex-preset-name');
    if (nameSpan && !nameSpan.querySelector('.ex-modified')) {
      nameSpan.innerHTML = ' <span class="ex-modified">(수정됨)</span>';
    }
    saveSettings();
    if (k === 'format' || k === 'lossless' || k === 'loopMode') renderSettings();
    else {
      if (k === 'quality') { const q = settingsEl.querySelector('#ex-qval'); if (q) q.textContent = String(v); }
      renderTarget();
    }
    scheduleEstimate();
  }

  function applyPreset(id) {
    const p = getPreset(id);
    if (!p) return;
    settings = { ...defaultSettings(p), presetId: id, loopMode: settings.loopMode, loopCount: settings.loopCount, allowFrameReduction: settings.allowFrameReduction };
    settings.modified = false;
    saveSettings();
    renderSettings();
    scheduleEstimate();
  }

  function baseScaleOf(preset) {
    const doc = store.get();
    let s = 1;
    if (preset?.maxWidth)  s = Math.min(s, preset.maxWidth / doc.meta.width);
    if (preset?.maxHeight) s = Math.min(s, preset.maxHeight / doc.meta.height);
    return s;
  }

  function currentTarget() {
    const p = getPreset(settings.presetId);
    return p?.targetBytes ?? null;
  }

  function renderTarget() {
    const t = currentTarget();
    fitBtn.style.display = t == null ? 'none' : '';
    if (t == null) { targetEl.textContent = '목표 용량 없음'; targetEl.className = 'ex-target'; return; }
    targetEl.textContent = `목표 ${(t / 1024).toFixed(0)} KB 이하`;
    const bytes = lastResult?.bytes;
    if (bytes != null) {
      const ok = bytes <= t;
      targetEl.textContent = `목표 ${(t / 1024).toFixed(0)} KB — ${ok ? '안에 듦' : '넘음'}`;
      targetEl.className = 'ex-target ' + (ok ? 'ok' : 'over');
    } else {
      targetEl.className = 'ex-target';
    }
  }

  function renderWarnings() {
    const doc = store.get();
    const loops = settings.loopMode === 'infinite' ? 0 : Math.max(1, settings.loopCount);
    const ws = getExportWarnings(doc, { loops, motions: motionRegistry });
    const lines = [];
    if (doc.meta.playback === 'pingpong') lines.push('핑퐁: 앞뒤로 재생됩니다(0→N→0).');
    for (const w of ws) {
      if (w.type === 'oneshot') lines.push(w.message);
      else if (w.type === 'seam') lines.push('루프 이음새: 시작과 끝 상태가 달라 반복이 매끄럽지 않을 수 있습니다.');
    }
    if (lines.length) { warnEl.style.display = ''; warnEl.innerHTML = lines.map((l) => `<div>⚠ ${l}</div>`).join(''); }
    else { warnEl.style.display = 'none'; warnEl.innerHTML = ''; }
  }

  function renderTogether() {
    const presets = getPresets().filter((p) => p.id !== settings.presetId);
    togetherEl.innerHTML = `<div class="ex-together-title">함께 만들기</div>` +
      presets.map((p) => `<label class="ex-inline"><input type="checkbox" class="ex-together-ctl" value="${p.id}" ${together.has(p.id) ? 'checked' : ''}>${p.name}</label>`).join('');
    togetherEl.querySelectorAll('.ex-together-ctl').forEach((el) => {
      el.addEventListener('change', () => {
        if (el.checked) together.add(el.value); else together.delete(el.value);
        updateRunLabel();
      });
    });
  }

  function updateRunLabel() {
    const n = 1 + together.size;
    runBtn.textContent = n > 1 ? `${n}개 내보내기` : '내보내기';
  }

  // ── 미리보기 / 예상 용량 ─────────────────────────────────────────────────
  function setPreview(result) {
    if (lastResult?.url) URL.revokeObjectURL(lastResult.url);
    const url = URL.createObjectURL(result.blob);
    result.url = url;
    lastResult = result;
    previewImg.src = url;
    infoEl.textContent = `${result.width} × ${result.height} · ${result.frameCount}프레임 · ${fmtDuration(result.durationMs)}`;
    sizeEl.textContent = fmtBytes(result.bytes);
    renderTarget();
  }

  function buildOpts(extra = {}) {
    const doc = store.get();
    const preset = getPreset(settings.presetId);
    const eff = baseScaleOf(preset) * settings.scaleMul;
    const o = {
      format: settings.format, scale: eff, trim: settings.trim,
      playback: doc.meta.playback ?? 'loop',
      loops: settings.loopMode === 'infinite' ? 0 : Math.max(1, settings.loopCount),
      createCanvas, assets: deps.assets, effects: effectsRegistry, motions: motionRegistry,
      name: projectName(), ...extra,
    };
    if (settings.format === 'apng') o.colors = settings.colors;
    if (settings.format === 'webp') { o.lossless = settings.lossless ? 1 : 0; o.quality = settings.quality; }
    return o;
  }

  function scheduleEstimate() {
    if (!open || !deps) return;
    clearTimeout(estTimer);
    sizeEl.textContent = '계산 중…';
    estTimer = setTimeout(async () => {
      if (estCtrl) estCtrl.abort();
      estCtrl = new AbortController();
      const doc = store.get();
      try {
        const res = await exportAnimation(doc, buildOpts({ signal: estCtrl.signal }));
        setPreview(res);
      } catch (err) {
        if (err?.name !== 'AbortError') sizeEl.textContent = '예상 실패';
      }
    }, 500);
  }

  // ── 진행 UI ──────────────────────────────────────────────────────────────
  function showProgress(show) { progressEl.style.display = show ? '' : 'none'; if (show) { barFill.style.width = '0%'; logEl.textContent = ''; } }
  function setBar(done, total) { barFill.style.width = total ? Math.round((done / total) * 100) + '%' : '0%'; }
  function setStep(t) { stepEl.textContent = t; }
  function appendLog(t) { logEl.textContent += t + '\n'; }

  function setBusy(busy) {
    running = busy;
    runBtn.disabled = busy;
    fitBtn.disabled = busy || currentTarget() == null;
    settingsEl.querySelectorAll('.ex-ctl').forEach((el) => { el.disabled = busy; });
    if (!busy) { // range의 무손실 비활성 재적용
      if (settings.format === 'webp' && settings.lossless) { const q = settingsEl.querySelector('[data-k="quality"]'); if (q) q.disabled = true; }
      const lc = settingsEl.querySelector('[data-k="loopCount"]'); if (lc) lc.disabled = settings.loopMode !== 'count';
    }
  }

  // 웹: 다운로드 / 데스크톱: 저장 대화상자 (platform이 분기)
  function download(blob, filename) {
    saveFile(filename, blob).catch((e) => showToast('저장 실패: ' + (e?.message ?? e)));
  }

  // ── 동작: 목표에 맞추기 ──────────────────────────────────────────────────
  function stopEstimate() { clearTimeout(estTimer); if (estCtrl) { estCtrl.abort(); estCtrl = null; } }

  async function runFit() {
    if (running || !deps) return;
    const preset = getPreset(settings.presetId);
    if (!preset || preset.targetBytes == null) return;
    const doc = store.get();
    stopEstimate();
    abortCtrl = new AbortController();
    setBusy(true); showProgress(true); setStep('맞추는 중…'); resultsEl.style.display = 'none';
    // 현재 형식·트림·크기제한을 반영한 프리셋으로 맞춘다
    const fitPreset = { ...preset, format: settings.format, trim: settings.trim };
    try {
      const res = await fitToTarget(doc, fitPreset, {
        createCanvas, assets: deps.assets, effects: effectsRegistry, motions: motionRegistry,
        name: projectName(), allowFrameReduction: settings.allowFrameReduction,
      }, {
        signal: abortCtrl.signal,
        onLog: (e) => { if (e.text) { appendLog(e.text); setStep('맞추는 중: ' + e.text); } },
      });
      // 고른 설정을 UI에 반영
      settings.scaleMul = res.settings.scaleMul;
      if (settings.format === 'apng') settings.colors = res.settings.colors ?? settings.colors;
      if (settings.format === 'webp') { settings.lossless = !!res.settings.lossless; settings.quality = res.settings.quality ?? settings.quality; }
      settings.allowFrameReduction = res.settings.frameReduced || settings.allowFrameReduction;
      settings.modified = true;
      saveSettings();
      renderSettings();
      setPreview(res);
      setStep(res.reached ? `완료: ${fmtBytes(res.bytes)}` : `목표 넘음 — 최소 ${fmtBytes(res.bytes)}`);
      if (!res.reached) showToast('목표 용량에 맞추지 못했습니다. 가장 작은 결과를 표시합니다.');
    } catch (err) {
      if (err?.name === 'AbortError') setStep('취소됨');
      else { setStep('오류: ' + err.message); showToast('맞추기 실패: ' + err.message); }
    } finally {
      setBusy(false); abortCtrl = null;
    }
  }

  // ── 동작: 내보내기(단일 또는 여러 형식) ─────────────────────────────────
  async function runExport() {
    if (running || !deps) return;
    const doc = store.get();
    stopEstimate();
    window.__lastExport = null;
    abortCtrl = new AbortController();
    setBusy(true); showProgress(true); resultsEl.style.display = 'none'; resultsEl.innerHTML = '';
    multiResults.length = 0;
    try {
      if (together.size === 0) {
        // 단일: 현재 설정 그대로 인코딩해서 저장
        setStep('내보내는 중…');
        const res = await exportAnimation(doc, buildOpts({
          signal: abortCtrl.signal,
          onProgress: (p) => { setStep(p.phase === 'bake' ? `굽는 중 ${p.done}/${p.total}` : '인코딩 중…'); setBar(p.done, p.total); },
        }));
        setPreview(res);
        lastResult.filename = res.settings.filename;
        download(res.blob, res.settings.filename);
        window.__lastExport = { filename: res.settings.filename, mime: res.settings.mime, bytes: res.bytes };
        setStep(`저장 완료: ${fmtBytes(res.bytes)}`);
      } else {
        // 여러 형식: 현재 프리셋 + 선택한 프리셋들을 각자 맞춰 저장
        const ids = [settings.presetId, ...together];
        const presets = ids.map((id) => getPreset(id)).filter(Boolean);
        setStep(`${presets.length}개 만드는 중…`);
        const { results } = await exportMany(doc, presets, {
          createCanvas, assets: deps.assets, effects: effectsRegistry, motions: motionRegistry,
          name: projectName(), allowFrameReduction: settings.allowFrameReduction,
        }, {
          signal: abortCtrl.signal,
          onLog: (e) => { if (e.text) appendLog(`[${e.presetId}] ${e.text}`); },
        });
        renderResults(presets, results);
        setStep('완료');
      }
    } catch (err) {
      if (err?.name === 'AbortError') setStep('취소됨');
      else { setStep('오류: ' + err.message); showToast('내보내기 실패: ' + err.message); }
    } finally {
      setBusy(false); abortCtrl = null;
    }
  }

  function renderResults(presets, results) {
    resultsEl.style.display = '';
    resultsEl.innerHTML = `<div class="ex-results-title">결과</div>`;
    results.forEach((res, i) => {
      const t = presets[i].targetBytes;
      const ok = t == null ? true : res.bytes <= t;
      const row = document.createElement('div');
      row.className = 'ex-result-row';
      row.innerHTML = `<span class="ex-result-name">${presets[i].name}</span>
        <span class="ex-result-meta">${res.format.toUpperCase()} · ${res.width}×${res.height} · ${fmtBytes(res.bytes)} <span class="${ok ? 'ok' : 'over'}">${t == null ? '' : (ok ? '충족' : '넘음')}</span></span>
        <button class="ex-result-save">저장</button>`;
      row.querySelector('.ex-result-save').addEventListener('click', () => {
        download(res.blob, res.settings.filename);
        window.__lastExport = { filename: res.settings.filename, mime: res.settings.mime, bytes: res.bytes };
      });
      resultsEl.appendChild(row);
      multiResults.push({ preset: presets[i], res });
    });
  }

  function cancel() {
    if (abortCtrl) abortCtrl.abort();
  }

  // ── 용도로 저장 ──────────────────────────────────────────────────────────
  function saveAsPreset() {
    const name = prompt ? null : null; // prompt 금지(모달 블로킹) — 간단히 자동 이름
    const base = getPreset(settings.presetId);
    const rec = {
      name: `${base?.name ?? '사용자'} (내 설정)`,
      format: settings.format,
      targetBytes: base?.targetBytes ?? null,
      maxWidth: base?.maxWidth, maxHeight: base?.maxHeight,
      trim: settings.trim,
      colors: settings.format === 'apng' ? settings.colors : undefined,
    };
    const saved = saveUserPreset(rec);
    settings.presetId = saved.id; settings.modified = false; saveSettings();
    renderSettings();
    showToast(`용도 "${saved.name}" 저장됨`);
  }

  // ── 열기/닫기 ────────────────────────────────────────────────────────────
  async function prepareDeps() {
    const doc = store.get();
    const bmps = {};
    for (const aid of Object.keys(doc.assets ?? {})) {
      try { const b = await getAsset(aid); if (b) bmps[aid] = await createImageBitmap(b); } catch {}
    }
    deps = { assets: { getBitmap: (id) => bmps[id] ?? null, getAnimFrames: () => null } };
  }

  async function doOpen() {
    if (open) return;
    open = true;
    window.__lastExport = null;
    settings = loadSettings();
    together.clear();
    multiResults.length = 0;
    modal.style.display = 'flex';
    showProgress(false);
    resultsEl.style.display = 'none';
    renderSettings();
    updateRunLabel();
    await prepareDeps();
    scheduleEstimate();
  }

  function doClose() {
    if (!open) return;
    if (running) {
      const ok = confirm('내보내기를 취소하고 닫을까요?');
      if (!ok) return;
      cancel();
    }
    open = false;
    modal.style.display = 'none';
    clearTimeout(estTimer);
    if (estCtrl) { estCtrl.abort(); estCtrl = null; }
    if (lastResult?.url) { URL.revokeObjectURL(lastResult.url); }
    lastResult = null;
  }

  // 이벤트 배선
  $('.ex-close').addEventListener('click', doClose);
  $('#ex-foot-cancel').addEventListener('click', doClose);
  $('#ex-run').addEventListener('click', runExport);
  $('#ex-fit').addEventListener('click', runFit);
  $('#ex-cancel').addEventListener('click', cancel);
  $('#ex-save-preset').addEventListener('click', saveAsPreset);
  modal.addEventListener('click', (e) => { if (e.target === modal && !running) doClose(); });

  // Ctrl+E 열기 / Esc 닫기
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'e') { e.preventDefault(); if (open) doClose(); else doOpen(); return; }
    if (open && e.key === 'Escape') { e.preventDefault(); doClose(); }
  });

  // 테스트/디버그용
  const api = {
    open: doOpen, close: doClose,
    isOpen: () => open,
    getState: () => ({ ...settings, together: [...together] }),
    getLastResult: () => lastResult,
    el: modal,
  };
  window.__exportUI = api;
  return api;
}
