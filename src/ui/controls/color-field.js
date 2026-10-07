// 색 고르기 컨트롤 — 견본 + 16진수 입력 + 최근 색 8개 + 스포이트(브라우저 EyeDropper 있으면).
// createColorField({ value, onInput, onChange, allowNone }) →
//   { el, getValue, setValue, destroy }
// onInput(hex)  — 드래그/타이핑 중 실시간(미리보기). onChange(hex) — 확정(기록 1건).
// allowNone 이면 '없음'(null) 선택 가능. getValue()는 '#rrggbb' 또는 null.
//
// 최근 색은 localStorage 'apng2.recentColors'(전역 공유, 최대 8개).

const RECENT_KEY = 'apng2.recentColors';
const RECENT_MAX = 8;

function _loadRecent() {
  try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(a) ? a.slice(0, RECENT_MAX) : []; }
  catch { return []; }
}
function _pushRecent(hex) {
  if (!hex) return;
  let a = _loadRecent().filter((c) => c.toLowerCase() !== hex.toLowerCase());
  a.unshift(hex);
  a = a.slice(0, RECENT_MAX);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(a)); } catch {}
}

function _normHex(v) {
  if (!v) return null;
  let s = String(v).trim();
  if (s[0] !== '#') s = '#' + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) s = '#' + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

export function createColorField({
  value = '#ffffff',
  onInput = () => {},
  onChange = () => {},
  allowNone = false,
} = {}) {
  let _value = _normHex(value);
  let _open = false;

  const el = document.createElement('div');
  el.className = 'color-field';

  // 견본 버튼(현재 색) — 누르면 팝오버
  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = 'cf-swatch';
  swatch.setAttribute('aria-label', '색 고르기');
  el.appendChild(swatch);

  // 16진수 입력
  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'cf-hex';
  hexInput.spellcheck = false;
  hexInput.setAttribute('aria-label', '16진수 색');
  el.appendChild(hexInput);

  // 팝오버(최근 색 + 네이티브 피커 + 스포이트 + 없음)
  const pop = document.createElement('div');
  pop.className = 'cf-pop';
  pop.hidden = true;

  const nativeInput = document.createElement('input');
  nativeInput.type = 'color';
  nativeInput.className = 'cf-native';

  const recentWrap = document.createElement('div');
  recentWrap.className = 'cf-recent';

  const tools = document.createElement('div');
  tools.className = 'cf-tools';
  const eyeBtn = document.createElement('button');
  eyeBtn.type = 'button'; eyeBtn.className = 'cf-tool'; eyeBtn.textContent = '스포이트';
  if (!window.EyeDropper) eyeBtn.style.display = 'none';
  tools.appendChild(eyeBtn);
  let noneBtn = null;
  if (allowNone) {
    noneBtn = document.createElement('button');
    noneBtn.type = 'button'; noneBtn.className = 'cf-tool'; noneBtn.textContent = '없음';
    tools.appendChild(noneBtn);
  }

  pop.append(nativeInput, recentWrap, tools);
  el.appendChild(pop);

  function _renderSwatch() {
    if (_value) { swatch.style.background = _value; swatch.classList.remove('is-none'); }
    else { swatch.style.background = ''; swatch.classList.add('is-none'); }
    if (document.activeElement !== hexInput) hexInput.value = _value ?? '없음';
  }

  function _renderRecent() {
    recentWrap.textContent = '';
    for (const c of _loadRecent()) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'cf-recent-sw';
      b.style.background = c; b.title = c; b.setAttribute('aria-label', c);
      b.addEventListener('click', () => { _commit(c); _closePop(); });
      recentWrap.appendChild(b);
    }
  }

  function _openPop() {
    if (_open) return;
    _open = true;
    _renderRecent();
    if (_value) nativeInput.value = _value;
    pop.hidden = false;
    document.addEventListener('pointerdown', _onDocDown, true);
  }
  function _closePop() {
    if (!_open) return;
    _open = false;
    pop.hidden = true;
    document.removeEventListener('pointerdown', _onDocDown, true);
  }
  function _onDocDown(e) { if (!el.contains(e.target)) _closePop(); }

  // 값 설정 — _preview(실시간) / _commit(확정, 최근색 기록)
  function _preview(hex) { _value = hex; _renderSwatch(); onInput(hex); }
  function _commit(hex) {
    _value = hex;
    _renderSwatch();
    if (hex) _pushRecent(hex);
    onChange(hex);
  }

  swatch.addEventListener('click', () => { if (_open) _closePop(); else _openPop(); });

  hexInput.addEventListener('focus', () => { hexInput.select(); });
  hexInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); const h = _normHex(hexInput.value); if (h) _commit(h); else _renderSwatch(); hexInput.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); _renderSwatch(); hexInput.blur(); }
  });
  hexInput.addEventListener('blur', () => { const h = _normHex(hexInput.value); if (h && h !== _value) _commit(h); else _renderSwatch(); });

  // 네이티브 피커: input=실시간 미리보기, change=확정
  nativeInput.addEventListener('input', () => _preview(nativeInput.value));
  nativeInput.addEventListener('change', () => _commit(nativeInput.value));

  eyeBtn.addEventListener('click', async () => {
    if (!window.EyeDropper) return;
    try { const r = await new window.EyeDropper().open(); const h = _normHex(r.sRGBHex); if (h) _commit(h); }
    catch {} // 사용자가 취소하면 무시
    _closePop();
  });
  if (noneBtn) noneBtn.addEventListener('click', () => { _commit(null); _closePop(); });

  function getValue() { return _value; }
  function setValue(v) { _value = _normHex(v); _renderSwatch(); }
  function destroy() { _closePop(); }

  _renderSwatch();
  return { el, getValue, setValue, destroy };
}
