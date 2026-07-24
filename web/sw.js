/* KNK 지킴 — 서비스워커.
   목적: PWA 설치 요건 충족(홈 화면에 추가) + 정적 자원 캐시.
   API 요청은 절대 캐시하지 않는다(검증 데이터는 항상 최신이어야 함). */
const CACHE = 'knk-jikim-v1';
const STATIC = ['/', '/index.html', '/css/style.css', '/js/app.js',
                '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
                '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/photos/')) return;   // API·사진은 네트워크 직행
  // 정적 자원: 네트워크 우선, 실패 시(오프라인) 캐시
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
