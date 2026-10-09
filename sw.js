// 서비스 워커(F5-5) — 번들러 없이 직접 작성. 오프라인 실행.
// 전략: 같은 출처 GET 은 캐시 우선 + 런타임 캐시(처음 받은 파일을 캐시에 저장) → 한 번 열면 오프라인 가능.
//        설치 시 sw-files.json(빌드가 생성한 앱 파일 목록)이 있으면 미리 캐시(첫 방문 오프라인 대비).
// 버전은 빌드 스크립트가 교체한다. 새 버전이 활성화되면 클라이언트에 알려 "새로고침" 안내를 띄운다.

const VERSION = '__SW_VERSION__';          // 빌드가 교체(없으면 dev 기본값 사용)
const CACHE = 'apng2-' + (VERSION === '__SW_VERSION__' ? 'dev' : VERSION);

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch('./sw-files.json', { cache: 'no-cache' });
      if (res.ok) {
        const files = await res.json();
        if (Array.isArray(files) && files.length) await cache.addAll(files);
      }
    } catch { /* dev 등 목록 없음 — 런타임 캐시로 대체 */ }
    // 최소한 진입점은 캐시
    try { await cache.add('./'); } catch {}
    try { await cache.add('./index.html'); } catch {}
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('apng2-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    // 새 버전 활성화를 알림(상단 "새로고침" 안내용)
    const clients = await self.clients.matchAll();
    for (const c of clients) c.postMessage({ type: 'sw-activated', version: VERSION });
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 외부(구글 폰트 등)는 건드리지 않음
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    if (cached) {
      // 백그라운드 갱신(stale-while-revalidate 느낌) — 실패해도 캐시 반환
      fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res.ok && (res.type === 'basic')) cache.put(req, res.clone());
      return res;
    } catch {
      // 오프라인·네비게이션이면 index.html 로 대체
      if (req.mode === 'navigate') { const idx = await cache.match('./index.html'); if (idx) return idx; }
      throw new Error('offline and not cached');
    }
  })());
});

self.addEventListener('message', (e) => { if (e.data?.type === 'skip-waiting') self.skipWaiting(); });
