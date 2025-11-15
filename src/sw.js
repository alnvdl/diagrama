const CACHE_NAME = "diagrama-cache-v1";

// These are the files under the produced dist folder. You shouldn't have to
// change this unless the build process changes.
const OFFLINE_URLS = [
    "/diagrama",
    "index.html",
    "diagrama.js",
    "diagrama.css",
    "manifest.json",
    "icon16.png",
    "icon48.png",
    "icon180.png",
    "icon.svg",
    "material-symbols/font.css"
];

self.addEventListener("install", event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => {
        cache.addAll(OFFLINE_URLS);
    }));
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;
    event.respondWith(
        // Try the network first.
        fetch(event.request)
            .then(response => {
                // Update the cache if there's a hit.
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                // Cannot fetch, fallback to cache.
                return caches.match(event.request).then(cached => {
                    if (cached) return cached;
                    // Fallback to / for navigation requests.
                    if (event.request.mode === "navigate") {
                        return caches.match("/");
                    }
                });
            })
    );
});
