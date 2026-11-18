// feedback-server/src/pwa.mjs
// 听屿开发者管理中心 PWA 清单、正式矢量图标及严格白名单 Service Worker（严禁缓存任何 API、日志、凭据或更新策略）。

export const pwaManifest = JSON.stringify({
    name: '听屿开发者管理中心',
    short_name: '听屿管理',
    description: 'TINGYU · Developer Console — 用户反馈、诊断日志、版本审核与远程发布中心',
    start_url: '/admin',
    scope: '/admin',
    display: 'standalone',
    orientation: 'any',
    background_color: '#E6EDF5',
    theme_color: '#385B73',
    icons: [
        {
            src: '/admin/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
        },
    ],
}, null, 2);

export const pwaIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <rect width="192" height="192" rx="44" fill="#385B73"/>
  <circle cx="96" cy="86" r="46" fill="#CEDDE9" opacity="0.22"/>
  <path d="M52 118c18-16 34-16 52 0s34 16 44 4" fill="none" stroke="#F5F8FC" stroke-width="10" stroke-linecap="round"/>
  <path d="M68 88l28-30 28 30H68z" fill="#F5F8FC"/>
  <circle cx="128" cy="58" r="9" fill="#AAC8DF"/>
</svg>`;

export const pwaServiceWorker = String.raw`
const CACHE_NAME = 'tingyu-dev-console-shell-v1';
const STATIC_SHELL = ['/admin', '/admin/app.css', '/admin/app.js', '/admin/manifest.webmanifest', '/admin/icon.svg'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 严格安全边界：绝不拦截或缓存任何 API、日志、健康检查、登录会话及公开更新策略接口
  if (url.origin !== self.location.origin || !STATIC_SHELL.includes(url.pathname)) {
    return;
  }
  event.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
`;
