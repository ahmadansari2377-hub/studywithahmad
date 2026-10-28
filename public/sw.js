// Study with Ahmad service worker: makes the site installable as an app and lets it open offline.
// Pages and files come from the network first (so updates show straight away) and fall back to the
// cache when there is no internet. /api requests are never cached.
const CACHE = "swa-v5";
// Script / font hosts whose (opaque) responses are worth keeping for offline use
const CDN = ["cdnjs.cloudflare.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];
const SHELL = ["/", "/study.css", "/study.js", "/syllabus.js", "/entrytests.js", "/solver.js", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/downloads/")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        // keep a copy of our own files and the CDN libraries / fonts
        if ((res.ok && (url.origin === location.origin || res.type === "cors")) || (res.type === "opaque" && CDN.includes(url.hostname))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("/") : Response.error())))
  );
});
