// 서비스 워커(F5-5) — 번들러 없이 직접 작성. 오프라인 실행.
// 전략: 같은 출처 GET 은 캐시 우선 + 런타임 캐시(처음 받은 파일을 캐시에 저장) → 한 번 열면 오프라인 가능.
//        설치 시 sw-files.json(빌드가 생성한 앱 파일 목록)이 있으면 미리 캐시(첫 방문 오프라인 대비).
// 버전은 빌드 스크립트가 교체한다. 새 버전이 활성화되면 클라이언트에 알려 "새로고침" 안내를 띄운다.

const VERSION = '__SW_VERSION__';          // 빌드가 교체(없으면 dev 기본값 사용)
const CACHE = 'apng2-' + (VERSION === '__SW_VERSION__' ? 'dev' : VERSION);
// 글꼴은 버전과 무관한 별도 캐시에 둔다(R13-3). 새 버전 activate 때 지우지 않으므로,
// 글자 레이어용 글꼴을 한 번 받아 두면 업데이트 후에도 다시 받지 않는다.
const FONT_CACHE = 'apng2-fonts';
const _isFont = (url) => /\/vendor\/fonts\/.+\.woff2$/i.test(url.pathname);

self.addEventListener('install', (e) => {
  // skipWaiting 하지 않는다 — 새 워커는 대기(waiting) 상태로 두고, "새로고침" 버튼이 보내는
  // skip-waiting 메시지로만 교체한다. 첫 설치(기존 컨트롤러 없음)는 대기 단계가 없어 곧바로 활성화된다.
  // 바로 활성화되면 controllerchange 가 버튼보다 먼저 일어나 reload 흐름이 깨진다(R7-1).
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 미리 캐시는 브라우저 HTTP 캐시를 거치지 않게 받는다(옛 파일이 새 캐시에 섞이는 것 방지).
    const reload = (url) => new Request(url, { cache: 'reload' });
    try {
      const res = await fetch('./sw-files.json', { cache: 'no-cache' });
      if (res.ok) {
        const files = await res.json();
        if (Array.isArray(files) && files.length) await cache.addAll(files.map(reload));
      }
    } catch { /* dev 등 목록 없음 — 런타임 캐시로 대체 */ }
    // 최소한 진입점은 캐시
    try { await cache.add(reload('./')); } catch {}
    try { await cache.add(reload('./index.html')); } catch {}
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // 이전 버전 캐시만 지운다 — 현재 버전 캐시와 글꼴 캐시(apng2-fonts)는 보존(R13-3).
    await Promise.all(keys.filter((k) => k.startsWith('apng2-') && k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k)));
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

  // 글꼴(woff2, R13-3):
  //   화면용 글꼴은 설치 때 미리 받아 버전 캐시에 있다 → 거기서 바로 준다(글꼴 캐시를 만들지 않음).
  //   글자 레이어용 글꼴은 미리 받지 않으므로, 처음 쓸 때 받아 버전과 무관한 글꼴 캐시(apng2-fonts)에
  //   남긴다 → 업데이트(activate)로 지워지지 않아 오프라인·새 버전에서도 다시 받지 않는다.
  if (_isFont(url)) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const pre = await cache.match(req);
      if (pre) return pre;                       // 미리 받은 화면용 글꼴
      const fc = await caches.open(FONT_CACHE);
      const hit = await fc.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') fc.put(req, res.clone());
      return res;
    })());
    return;
  }

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
