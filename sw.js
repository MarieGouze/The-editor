const CACHE_NAME = 'cute-editor-v9';

self.addEventListener('install', e => self.skipWaiting());

self.addEventListener('fetch', e => {
    e.respondWith(
        fetch(e.request)
        .then(res => {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
            return res;
        })
        .catch(() => caches.match(e.request))
    );
});
