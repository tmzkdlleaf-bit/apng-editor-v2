// 내보내기 화면 — 모달. 실제 인코딩 결과를 미리보기로 재생하고, 용도 프리셋·목표 맞추기·여러 형식을 다룬다.
// 렌더는 미리보기(stage)가 아니라 인코딩 결과 그대로. 굽기는 프레임마다 양보하고 인코딩은 워커라 메인이 멈추지 않는다.
import { effects as effectsRegistry } from '../../effects/registry.js';
import motionRegistry from '../../motions/registry.js';
import { getAsset } from '../../core/io/assets.js';
import { decodeAnim } from '../../core/io/anim-decode.js';
import { getPresets, getPreset, isDefaultPreset, saveUserPreset } from '../../export/presets.js';
import { exportAnimation, getExportWarnings } from '../../export/index.js';
import { fitToTarget, exportMany } from '../../export/fit.js';
import { showToast } from '../shell/status.js';
import { saveFile } from '../../platform/index.js';
import { createDropdown } from '../controls/dropdown.js';
import { ensureDocFonts } from '../fonts.js';

const SETTINGS_KEY = 'apng2.exportSettings';
const SCALE_MULS = [1, 0.75, 0.5, 0.25];
const APNG_COLORS = [{ v: 0, label: '무손실' }, { v: 256, label: '256색' }, { v: 128, label: '128색' }, { v: 64, label: '64색' }, { v: 32, label: '32색' }];

function createCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// 용량은 1000 단위(KB = 1000바이트). 1,000,000바이트 이상은 MB.
function fmtBytes(b) {
  if (b == null) return '-';
  if (b >= 1000 * 1000) return (b / 1000 / 1000).toFixed(2) + ' MB';
  return (b / 1000).toFixed(1) + ' KB';
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
    fitMode: 'quality',    // 'quality'(화질 우선) | 'keepSize'(크기 유지) | 'keepColor'(색 유지)
    modified: false,
  };
}

export function initExport(store, editorState, projectApi = null) {
  const projectId = () => projectApi?.getId?.() ?? 'local';
  const projectName = () => projectApi?.getName?.() ?? '프로젝트';

  let deps = null;         // { assets } 준비된 에셋 어댑터
  let open = false;
  let _openToken = 0;      // 열기마다 증가 — 준비(prepareDeps)가 늦게 끝나도 닫혔으면 버리게
  let running = false;
  let abortCtrl = null;
  let estTimer = null;
  let estCtrl = null;
  let lastResult = null;   // { blob, url, bytes, width, height, frameCount, durationMs, format, filename }
  const multiResults = []; // 함께 만들기 결과
  const together = new Set();
  const _dds = [];  // 현재 떠 있는 드롭다운들(재렌더·닫기 때 정리)

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
          <div class="ex-preview-wrap">
            <img class="ex-preview" alt="출력 미리보기" style="display:none;">
            <div class="ex-preview-empty" id="ex-preview-empty">
              <div class="ex-preview-msg">만드는 중…</div>
              <div class="ex-preview-bar"><div class="ex-preview-bar-fill" id="ex-preview-bar-fill"></div></div>
            </div>
          </div>
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
          <div class="ex-mem" id="ex-mem" style="display:none;"></div>
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
  const previewEmpty = $('#ex-preview-empty');
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
  const memEl = $('#ex-mem');
  const runBtn = $('#ex-run');

  // 메모리 경고 → "○○% 크기로 내보내기" 버튼. 배율 = √(한도÷예상)을 0.05 단위로 내림.
  function suggestShrinkMul(warning, curMul) {
    const est = warning?.estimatedBytes, lim = warning?.limitBytes;
    if (!est || !lim || est <= lim) return null;
    let mul = Math.floor((curMul * Math.sqrt(lim / est)) / 0.05) * 0.05;
    mul = Math.max(0.05, Math.min(1, mul));
    return mul;
  }
  function hideMemButton() { memEl.style.display = 'none'; memEl.textContent = ''; }
  function showMemButton(warning, rerun) {
    const mul = suggestShrinkMul(warning, settings.scaleMul);
    memEl.textContent = '';
    if (mul == null) { memEl.style.display = 'none'; return; }
    const btn = document.createElement('button');
    btn.className = 'accent ex-mem-btn';
    btn.textContent = `${Math.round(mul * 100)}% 크기로 내보내기`;
    btn.addEventListener('click', () => {
      settings.scaleMul = mul; settings.modified = true; saveSettings(); renderSettings();
      hideMemButton(); rerun();
    });
    memEl.appendChild(btn);
    memEl.style.display = '';
  }

  // ── 설정 패널 렌더 ───────────────────────────────────────────────────────
  function renderSettings() {
    const presets = getPresets();
    const preset = getPreset(settings.presetId);
    const modifiedTag = settings.modified ? ' <span class="ex-modified">(수정됨)</span>' : '';
    const colorField = settings.format === 'apng'
      ? `<label>색상 수</label><span class="ex-dd" data-dd="colors"></span>`
      : settings.format === 'webp'
      ? `<label>품질</label><span class="ex-quality-row"><input class="ex-ctl" data-k="lossless" type="checkbox" ${settings.lossless ? 'checked' : ''} id="ex-ll"><label for="ex-ll" class="ex-inline">무손실</label><input class="ex-ctl" data-k="quality" type="range" min="30" max="100" value="${settings.quality}" ${settings.lossless ? 'disabled' : ''}><span id="ex-qval">${settings.quality}</span></span>`
      : `<label>색상 수</label><span class="ex-note">GIF는 256색 고정(투명 1비트)</span>`;

    settingsEl.innerHTML = `
      <div class="ex-row"><label>용도</label>
        <span class="ex-preset-pick">
          <span class="ex-dd" data-dd="presetId"></span>
          <span class="ex-preset-name">${preset ? '' : ''}${modifiedTag}</span>
        </span>
      </div>
      <div class="ex-row"><label>형식</label>
        <div class="ex-seg" role="group" aria-label="형식">
          ${['apng', 'webp', 'gif'].map((f) => `<button type="button" class="ex-seg-btn${settings.format === f ? ' is-on' : ''}" data-format="${f}">${f.toUpperCase()}</button>`).join('')}
        </div>
      </div>
      <div class="ex-row"><label>크기</label>
        <span class="ex-dd" data-dd="scaleMul"></span>
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
      <div class="ex-row"><label>맞추기 방식</label>
        <div class="ex-seg" role="group" aria-label="맞추기 방식">
          ${[['quality', '화질 우선'], ['keepSize', '크기 유지'], ['keepColor', '색 유지']].map(([v, l]) => `<button type="button" class="ex-mode-btn${settings.fitMode === v ? ' is-on' : ''}" data-mode="${v}">${l}</button>`).join('')}
        </div>
      </div>
    `;
    // 컨트롤 이벤트
    settingsEl.querySelectorAll('.ex-ctl').forEach((el) => {
      const ev = (el.type === 'range') ? 'input' : 'change';
      el.addEventListener(ev, () => onControl(el));
    });

    // 형식 세그먼트 버튼
    settingsEl.querySelectorAll('.ex-seg-btn').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.format === settings.format) return;
        settings.format = b.dataset.format;
        settings.modified = true;
        saveSettings();
        renderSettings();      // 형식에 따라 색상/품질 칸이 바뀜
        scheduleEstimate();
      });
    });

    // 맞추기 방식 세그먼트 버튼(목표에 맞추기·함께 만들기에 적용). 결과 파일을 바꾸지 않으니 예상 재계산 불필요.
    settingsEl.querySelectorAll('.ex-mode-btn').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.dataset.mode === settings.fitMode) return;
        settings.fitMode = b.dataset.mode;
        saveSettings();
        renderSettings();
      });
    });

    // 드롭다운 마운트(select 대체). 이전 드롭다운은 정리.
    _destroyDropdowns();
    // 용도: 변경은 "수정됨"이 아니라 프리셋 적용
    _mountDropdown('presetId', presets.map((p) => ({ value: p.id, label: p.name })), settings.presetId, (v) => applyPreset(v));
    // 메모리 버튼 등으로 들어온 비표준 배율도 목록에 넣어 표시한다.
    const scaleVals = [...new Set([...SCALE_MULS, settings.scaleMul])].sort((a, b) => b - a);
    _mountDropdown('scaleMul', scaleVals.map((s) => ({ value: String(s), label: `${Math.round(s * 100)}%` })), String(settings.scaleMul), (v) => _setSetting('scaleMul', parseFloat(v)));
    if (settings.format === 'apng') {
      _mountDropdown('colors', APNG_COLORS.map((c) => ({ value: String(c.v), label: c.label })), String(settings.colors), (v) => _setSetting('colors', parseFloat(v)));
    }

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

  // 드롭다운(용도/크기/색상 수)에서 값이 바뀌었을 때 — onControl 의 색상/크기 경로와 동일.
  function _setSetting(k, v) {
    settings[k] = v;
    settings.modified = true;
    const nameSpan = settingsEl.querySelector('.ex-preset-name');
    if (nameSpan && !nameSpan.querySelector('.ex-modified')) {
      nameSpan.innerHTML = ' <span class="ex-modified">(수정됨)</span>';
    }
    saveSettings();
    renderTarget();
    scheduleEstimate();
  }

  function _mountDropdown(key, options, value, onChange) {
    const mount = settingsEl.querySelector(`.ex-dd[data-dd="${key}"]`);
    if (!mount) return;
    const dd = createDropdown({ ariaLabel: mount.previousElementSibling?.textContent || key, options, value, onChange });
    mount.appendChild(dd.el);
    _dds.push(dd);
  }
  function _destroyDropdowns() {
    _dds.forEach((d) => d.destroy());
    _dds.length = 0;
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
    targetEl.textContent = `목표 ${fmtBytes(t)} 이하`;
    const bytes = lastResult?.bytes;
    if (bytes != null) {
      const ok = bytes <= t;
      targetEl.textContent = `목표 ${fmtBytes(t)} 이하 · ${ok ? '안에 듦' : '넘음'}`;
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
      if (w.type === 'oneshot') { lines.push(w.message); continue; }
      if (w.type !== 'seam') continue;
      const issues = w.issues ?? [];
      if (issues.some((i) => i.prop)) lines.push('루프 이음새: 시작과 끝 상태가 달라 반복이 매끄럽지 않을 수 있습니다.');
      // 움직이는 이미지·글자 이음새(R10): 레이어 이름 포함 — 레이어 이름은 사용자·파일에서 오므로 textContent 로.
      for (const i of issues.filter((x) => x.kind === 'anim')) lines.push(`움직이는 이미지 '${doc.layers[i.layerId]?.name ?? '이미지'}': 문서 길이가 GIF 길이의 배수가 아닙니다(루프 검사에서 맞추기).`);
      for (const i of issues.filter((x) => x.kind === 'text')) lines.push(`글자 '${doc.layers[i.layerId]?.name ?? '글자'}': 타자기·글자 애니가 반복될 때 처음으로 돌아갑니다.`);
    }
    // 레이어 이름이 섞이므로 textContent 로 넣어 HTML 해석을 막는다(R7-7).
    warnEl.textContent = '';
    if (lines.length) {
      warnEl.style.display = '';
      for (const l of lines) { const d = document.createElement('div'); d.textContent = '주의: ' + l; warnEl.appendChild(d); }
    } else {
      warnEl.style.display = 'none';
    }
  }

  function renderTogether() {
    const presets = getPresets().filter((p) => p.id !== settings.presetId);
    // 용도 이름은 사용자·localStorage 에서 온 글자다 — textContent 로 넣어 HTML 해석을 막는다(R7-7).
    togetherEl.textContent = '';
    const title = document.createElement('div'); title.className = 'ex-together-title'; title.textContent = '함께 만들기';
    togetherEl.appendChild(title);
    for (const p of presets) {
      const label = document.createElement('label'); label.className = 'ex-inline';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'ex-together-ctl';
      cb.value = p.id; cb.checked = together.has(p.id);
      label.append(cb, document.createTextNode(p.name));
      togetherEl.appendChild(label);
    }
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
    previewImg.style.display = '';           // 결과 보이기
    previewEmpty.style.display = 'none';
    infoEl.textContent = `${result.width} × ${result.height} · ${result.frameCount}프레임 · ${fmtDuration(result.durationMs)}`;
    sizeEl.textContent = fmtBytes(result.bytes);
    renderTarget();
  }

  // 결과 나오기 전: 체커 배경 + "만드는 중…" placeholder 표시(깨진 이미지 아이콘 방지).
  function showPreviewPending() {
    previewImg.style.display = 'none';
    previewEmpty.style.display = '';
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
    if (!lastResult) showPreviewPending();   // 아직 결과 없으면 "만드는 중…" 유지
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

  // 오류 안내 문구. 메모리 초과는 한국어로 크기를 줄이라고 안내한다.
  function errText(err) {
    if (err?.code === 'memory') return '캔버스·프레임 수가 커서 메모리가 부족합니다. 크기를 줄여 보세요.';
    return err?.message ?? String(err);
  }

  async function runFit() {
    if (running || !deps) return;
    const myDeps = deps;  // 이 작업이 쓰는 비트맵. 재열기로 교체되면 finally 에서 이걸 닫는다.
    const preset = getPreset(settings.presetId);
    if (!preset || preset.targetBytes == null) return;
    const doc = store.get();
    stopEstimate();
    hideMemButton();
    abortCtrl = new AbortController();
    setBusy(true); showProgress(true); setStep('맞추는 중…'); resultsEl.style.display = 'none';
    // 현재 형식·트림·크기제한을 반영한 프리셋으로 맞춘다
    const fitPreset = { ...preset, format: settings.format, trim: settings.trim };
    try {
      const res = await fitToTarget(doc, fitPreset, {
        createCanvas, assets: deps.assets, effects: effectsRegistry, motions: motionRegistry,
        name: projectName(), allowFrameReduction: settings.allowFrameReduction, mode: settings.fitMode,
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
      else { const t = errText(err); setStep('오류: ' + t); showToast('맞추기 실패: ' + t); if (err?.code === 'memory') showMemButton(err.warning, runFit); }
    } finally {
      setBusy(false); abortCtrl = null;
      // 재열기로 deps 가 교체됐으면 이 작업이 쓰던 비트맵을 닫는다. 아니고 창이 닫혔으면 현재 deps 를 닫는다.
      if (myDeps && myDeps !== deps) { try { myDeps.dispose?.(); } catch {} }
      else if (!open) _disposeDeps();
    }
  }

  // ── 동작: 내보내기(단일 또는 여러 형식) ─────────────────────────────────
  async function runExport() {
    if (running || !deps) return;
    const myDeps = deps;  // 이 작업이 쓰는 비트맵. 재열기로 교체되면 finally 에서 이걸 닫는다.
    const doc = store.get();
    stopEstimate();
    window.__lastExport = null;
    abortCtrl = new AbortController();
    hideMemButton();
    setBusy(true); showProgress(true); resultsEl.style.display = 'none'; resultsEl.innerHTML = '';
    multiResults.length = 0;
    // 굽기 전에 문서가 쓰는 글꼴이 실제로 로드됐는지 기다린다(결과물 글자가 폴백으로 달라지지 않게).
    try { const { ok } = await ensureDocFonts(doc); if (!ok) showToast('일부 글꼴을 불러오지 못했습니다. 결과 글자가 다르게 보일 수 있습니다.'); } catch {}
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
          name: projectName(), allowFrameReduction: settings.allowFrameReduction, mode: settings.fitMode,
        }, {
          signal: abortCtrl.signal,
          onLog: (e) => { if (e.text) appendLog(`[${e.presetId}] ${e.text}`); },
        });
        renderResults(presets, results);
        setStep('완료');
      }
    } catch (err) {
      if (err?.name === 'AbortError') setStep('취소됨');
      else { const t = errText(err); setStep('오류: ' + t); showToast('내보내기 실패: ' + t); if (err?.code === 'memory') showMemButton(err.warning, runExport); }
    } finally {
      setBusy(false); abortCtrl = null;
      // 재열기로 deps 가 교체됐으면 이 작업이 쓰던 비트맵을 닫는다. 아니고 창이 닫혔으면 현재 deps 를 닫는다.
      if (myDeps && myDeps !== deps) { try { myDeps.dispose?.(); } catch {} }
      else if (!open) _disposeDeps();
    }
  }

  function renderResults(presets, results) {
    resultsEl.style.display = '';
    resultsEl.innerHTML = `<div class="ex-results-title">결과</div>`;
    results.forEach((res, i) => {
      const row = document.createElement('div');
      row.className = 'ex-result-row';
      // 용도 이름은 사용자·localStorage 에서 온 글자다 — textContent 로 넣어 HTML 해석을 막는다(R7-7).
      const nameEl = document.createElement('span'); nameEl.className = 'ex-result-name'; nameEl.textContent = presets[i].name;

      // 메모리로 실패한 용도(R9-2 A): "○○% 크기로" 버튼으로 그 배율에 다시 내보낸다.
      if (res.error === 'memory') {
        const metaEl = document.createElement('span'); metaEl.className = 'ex-result-meta over'; metaEl.textContent = '메모리 부족';
        const mul = suggestShrinkMul(res.warning, settings.scaleMul);
        const btn = document.createElement('button'); btn.className = 'ex-result-save';
        btn.textContent = mul != null ? `${Math.round(mul * 100)}% 크기로` : '크기 줄이기';
        btn.addEventListener('click', () => {
          if (mul != null) { settings.scaleMul = mul; settings.modified = true; saveSettings(); renderSettings(); }
          runExport();
        });
        row.append(nameEl, metaEl, btn);
        resultsEl.appendChild(row);
        return;
      }

      const t = presets[i].targetBytes;
      const ok = t == null ? true : res.bytes <= t;
      const metaEl = document.createElement('span'); metaEl.className = 'ex-result-meta';
      // 형식·크기·용량은 모두 코드가 만든 숫자/상수다.
      metaEl.innerHTML = `${res.format.toUpperCase()} · ${res.width}×${res.height} · ${fmtBytes(res.bytes)} <span class="${ok ? 'ok' : 'over'}">${t == null ? '' : (ok ? '충족' : '넘음')}</span>`;
      const saveBtn = document.createElement('button'); saveBtn.className = 'ex-result-save'; saveBtn.textContent = '저장';
      row.append(nameEl, metaEl, saveBtn);
      saveBtn.addEventListener('click', () => {
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
  async function prepareDeps(token) {
    const doc = store.get();
    // 레이어 종류별로 에셋을 모은다(그룹·인스턴스 안의 레이어도 doc.layers 평면 맵에 다 있음).
    const imgIds = new Set();
    const animIds = new Set();
    for (const l of Object.values(doc.layers ?? {})) {
      if (!l || l.assetId == null) continue;
      if (l.type === 'anim') animIds.add(l.assetId);
      else if (l.type === 'image') imgIds.add(l.assetId);
    }

    const bmps = {};   // assetId → ImageBitmap (정지 이미지)
    const anims = {};  // assetId → { frames, delays } (움직이는 이미지)

    for (const aid of imgIds) {
      try { const b = await getAsset(aid); if (b) bmps[aid] = await createImageBitmap(b); } catch {}
    }
    for (const aid of animIds) {
      try {
        const b = await getAsset(aid);
        if (!b) continue;
        const res = await decodeAnim(b);
        if (res && res.frames?.length) anims[aid] = res;
        else { const bmp = await createImageBitmap(b); bmps[aid] = bmp; } // 디코드 실패 시 정지 이미지로
      } catch {}
    }

    const built = {
      assets: {
        getBitmap: (id) => bmps[id] ?? null,
        getAnimFrames: (id) => anims[id] ?? null,
      },
      // 창을 닫을 때 만든 비트맵을 모두 close() 한다(메모리 누수 방지).
      dispose() {
        for (const bmp of Object.values(bmps)) { try { bmp.close?.(); } catch {} }
        for (const a of Object.values(anims)) {
          for (const fr of (a.frames ?? [])) { try { fr.close?.(); } catch {} }
        }
      },
    };
    // 준비가 끝났을 때 창이 닫혔거나 다시 열렸으면 만든 비트맵을 바로 닫고 버린다.
    if (token !== _openToken || !open) { built.dispose(); return; }
    deps = built;
  }

  function _disposeDeps() {
    if (deps?.dispose) { try { deps.dispose(); } catch {} }
    deps = null;
  }

  async function doOpen() {
    if (open) return;
    // 이전 세션 비트맵이 남아 있으면(굽는 중 닫기로 정리가 미뤄진 경우) 넘겨받아 정리한다 — 재열기 누수 방지.
    // 아직 굽는 중이면 지금 닫으면 진행 중 그리기가 깨지므로, deps 참조만 떼 두고(교체) 그 작업의 finally 가 닫게 한다.
    if (deps) {
      const stale = deps;
      deps = null;
      if (!running) { try { stale.dispose?.(); } catch {} }
    }
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
    const myToken = ++_openToken;
    await prepareDeps(myToken);
    if (myToken !== _openToken || !open) return; // 준비 중 닫힘/재열림
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
    _openToken++;  // 진행 중 prepareDeps 를 무효화
    modal.style.display = 'none';
    clearTimeout(estTimer);
    if (estCtrl) { estCtrl.abort(); estCtrl = null; }
    if (lastResult?.url) { URL.revokeObjectURL(lastResult.url); }
    lastResult = null;
    // 굽는 중이면 실제로 멈춘 뒤(run 의 finally) 비트맵을 닫는다. 아니면 지금 닫는다.
    if (!running) _disposeDeps();
    _destroyDropdowns();
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
    isBusy: () => running,
    depsReady: () => !!deps,
    getState: () => ({ ...settings, together: [...together] }),
    getLastResult: () => lastResult,
    el: modal,
  };
  window.__exportUI = api;
  return api;
}
