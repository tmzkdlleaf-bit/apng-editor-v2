// 문서가 쓰는 글꼴이 실제로 로드됐는지 보장(내보내기·썸네일 전 호출).
// 글꼴은 vendor/fonts 의 woff2 로 내장 — 인터넷이 없어도 같은 결과가 나와야 한다.
// 기본(generic) 패밀리는 로드 대상이 아니다.
const _GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);

export function docFontSpecs(doc) {
  const specs = new Set();
  for (const l of Object.values(doc?.layers ?? {})) {
    if (l?.type === 'text' && l.font && !_GENERIC.has(String(l.font).trim())) {
      specs.add(`${l.weight ?? 400} 48px "${l.font}"`);
    }
  }
  return [...specs];
}

// 문서 글꼴을 모두 로드하고 기다린다. { ok } 반환(하나라도 실패하면 ok=false).
export async function ensureDocFonts(doc) {
  if (typeof document === 'undefined' || !document.fonts) return { ok: true };
  const specs = docFontSpecs(doc);
  if (!specs.length) return { ok: true };
  await Promise.all(specs.map((s) => document.fonts.load(s).catch(() => {})));
  try { await document.fonts.ready; } catch {}
  let ok = true;
  for (const s of specs) { try { if (!document.fonts.check(s)) ok = false; } catch { ok = false; } }
  return { ok };
}
