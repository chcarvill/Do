/* Minimal offline cache for Do — Three a Day. */
const CACHE_NAME = "do-three-a-day-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./app-icon-192.png",
  "./app-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache.addAll() is all-or-nothing -- a single failed request (a typo'd
      // path, a flaky network blip during install, a 404) aborts the whole
      // install step, which means the service worker never finishes
      // registering. That silently blocks "Add to Home Screen" with no
      // visible error anywhere, since installability just requires *a*
      // successfully-registered service worker. Caching each file separately
      // means one bad file can't take the others down with it.
      Promise.all(
        ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("Skipping uncacheable asset during install:", url, err);
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
