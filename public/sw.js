/// <reference lib="webworker" />

/**
 * Service Worker - 吃了么 PWA
 * 实现缓存策略和离线支持
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-assets-${CACHE_VERSION}`;
const PAGES_CACHE = `pages-${CACHE_VERSION}`;
const IMAGES_CACHE = `images-${CACHE_VERSION}`;

/** 预缓存的核心资源 */
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
];

/** 安装事件 - 预缓存核心资源 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

/** 激活事件 - 清理旧缓存 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            return name !== STATIC_CACHE && name !== PAGES_CACHE && name !== IMAGES_CACHE;
          })
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

/** 
 * Fetch 事件 - 根据请求类型选择缓存策略
 * - 静态资源: CacheFirst
 * - 页面导航: NetworkFirst
 * - API 请求: NetworkFirst
 * - 图片: CacheFirst
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳过非 GET 请求
  if (request.method !== 'GET') return;

  // 跳过 chrome-extension 等非 http(s) 请求
  if (!url.protocol.startsWith('http')) return;

  // 静态资源 - CacheFirst
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 图片 - CacheFirst
  if (isImage(url.pathname)) {
    event.respondWith(cacheFirst(request, IMAGES_CACHE));
    return;
  }

  // 页面导航 - NetworkFirst
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, PAGES_CACHE));
    return;
  }
});

/** CacheFirst 策略 - 优先使用缓存 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

/** NetworkFirst 策略 - 优先使用网络 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503 });
  }
}

/** 判断是否为静态资源 */
function isStaticAsset(pathname) {
  return /\.(js|css|woff2?)$/.test(pathname) || pathname.startsWith('/_next/static/');
}

/** 判断是否为图片 */
function isImage(pathname) {
  return /\.(png|jpg|jpeg|gif|webp|svg|ico)$/.test(pathname);
}

// --- Push Notification Handling ---

/**
 * Push 事件 - 接收推送消息并显示通知
 * Requirement 17.4: Support push notifications
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // If not JSON, use text as body
    payload = {
      title: '吃了么',
      body: event.data.text(),
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: 'default',
      data: { type: 'system', url: '/', timestamp: Date.now() },
    };
  }

  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192x192.png',
    badge: payload.badge || '/icons/icon-72x72.png',
    tag: payload.tag || 'default',
    data: payload.data || { url: '/' },
    renotify: payload.renotify ?? false,
    requireInteraction: payload.requireInteraction ?? false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || '吃了么', options)
  );
});

/**
 * Notification Click 事件 - 点击通知后导航到对应页面
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if ('navigate' in client) {
            return client.navigate(url);
          }
          return client;
        }
      }
      // Otherwise open a new window
      return self.clients.openWindow(url);
    })
  );
});
