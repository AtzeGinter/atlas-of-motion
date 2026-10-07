/* Atlas of Motion service worker. GENERATED as ../sw.js by tools/assemble.py (edit tools/sw.template.js, not sw.js).
   - App shell (HTML, fonts, three.js, manifest, icons) is precached under a build-specific cache name.
   - Navigations: network first (so updates arrive), cache fallback when offline or slow.
   - geo/*.bin: cache first; they are content-hashed via ?v=, cached on first use only (the High level is ~10 MB).
   All URLs are relative to this file so the site works from a sub-path (GitHub Pages project sites). */
const BUILD = "b8066be88b";
const SHELL = "aom-shell-" + BUILD;
const GEO = "aom-geo-b3a651cdef";   // changes only when a geo/*.bin changes, so shell-only updates keep downloaded meshes
const PRECACHE = [
  "index.html",
  "manifest.webmanifest",
  "vendor/three.min.js",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "fonts/archivo-latin.woff2",
  "fonts/fraunces-latin.woff2",
  "fonts/source-serif-4-latin-400.woff2",
  "fonts/source-serif-4-latin-italic-400.woff2"
];
const NAV_TIMEOUT_MS = 5000;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: "reload" })))   /* bypass the HTTP cache so shell files are never mixed across builds */).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("aom-") && k !== SHELL && k !== GEO) await caches.delete(k);
    await self.clients.claim();
  })());
});

const INDEX = new URL("./index.html", self.location).href;

function navigate(e) {
  // network first; the copy for offline use is stored via a waitUntil registered synchronously (Safari rejects late waitUntil calls)
  const net = fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" });
  e.waitUntil(net.then(res => res.ok && !res.redirected ? caches.open(SHELL).then(c => c.put(INDEX, res.clone())) : null).catch(() => {}));
  const cached = () => caches.open(SHELL).then(c => c.match(INDEX));
  return (async () => {
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), NAV_TIMEOUT_MS));
      const res = await Promise.race([net, timeout]);
      if (res.ok && !res.redirected) return res;
      return (await cached()) || res;
    } catch (err) {
      const c = await cached();
      return c || net;     // nothing cached yet: wait for the network after all
    }
  })();
}

function geo(e) {
  // cache first (files are content-hashed via ?v=); a miss is fetched and stored on first use
  const p = (async () => {
    const cache = await caches.open(GEO);
    const hit = await cache.match(e.request);
    if (hit) return { res: hit };
    const res = await fetch(e.request);
    return { res, save: res.ok && res.status === 200 ? cache.put(e.request, res.clone()).catch(() => {}) : null };
  })();
  e.waitUntil(p.then(x => x.save).catch(() => {}));
  return p.then(x => x.res);   // a failure surfaces as a network error; the page then retries with &direct=1
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.searchParams.has("direct")) return;   // explicit bypass: let the browser fetch it itself
  if (req.mode === "navigate") { e.respondWith(navigate(e)); return; }
  if (/\/geo\/[^/]+\.bin$/.test(url.pathname)) { e.respondWith(geo(e)); return; }
  e.respondWith(caches.open(SHELL).then(c => c.match(req)).then(hit => hit || fetch(req)));
});
