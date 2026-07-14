const CACHE_NAME = 'cute-editor-v10'; // 升级了版本号

self.addEventListener('install', e => self.skipWaiting());

// 新增：激活时清理旧版本的缓存，防止占用用户手机空间
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    
    // 新增：绝对不要缓存 API 请求（Telegram 和 WebDAV 同步）
    if (url.hostname.includes('api.telegram.org') || url.pathname.includes('meow_editor')) {
        e.respondWith(fetch(e.request));
        return;
    }

    e.respondWith(
        fetch(e.request)
        .then(res => {
            // 新增：只缓存成功的 GET 请求，避免缓存报错页面
            if (e.request.method === 'GET' && res.status === 200) {
                const resClone = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
            }
            return res;
        })
        .catch(() => caches.match(e.request))
    );
});