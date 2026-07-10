/**
 * Service Worker — 応援歌練習アプリ
 * Cache First 戦略（オフラインでも歌詞・一覧を閲覧できる）
 */
'use strict';

const CACHE_NAME = 'ouenka-v2.0.0';

const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data.json',
  './manifest.json',
  './hero.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] 事前キャッシュ失敗:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;   // 外部（YouTube等）はスルー
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }))
      .catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('オフラインです', { status: 503 });
      })
  );
});
