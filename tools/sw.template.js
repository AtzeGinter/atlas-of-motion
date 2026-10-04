/* Atlas of Motion service worker. GENERATED as ../sw.js by tools/assemble.py (edit tools/sw.template.js, not sw.js).
   - App shell (HTML, fonts, three.js, manifest, icons) is precached under a build-specific cache name.
   - Navigations: network first (so updates arrive), cache fallback when offline or slow.
   - geo/*.bin: cache first; they are content-hashed via ?v=, cached on first use only (the High level is ~10 MB).
   All URLs are relative to this file so the site works from a sub-path (GitHub Pages project sites). */
const BUILD = "__BUILD__";
const SHELL = "aom-shell-" + BUILD;
const GEO = "aom-geo-__GEOHASH__";   // changes only when a geo/*.bin changes, so shell-only updates keep downloaded meshes
const PRECACHE = __PRECACHE__;
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

async function navigate(e) {
  const cache = await caches.open(SHELL);
  const net = fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(res => {
    if (res.ok && !res.redirected) e.waitUntil(cache.put(INDEX, res.clone()));
    return res;
  });
  const cached = () => cache.match(INDEX);
  try {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("slow")), NAV_TIMEOUT_MS));
    const res = await Promise.race([net, timeout]);
    if (res.ok && !res.redirected) return res;
    return (await cached()) || res;
  } catch (err) {
    net.catch(() => {});   // a late network answer still refreshes the cache for next time
    const c = await cached();
    if (c) return c;
    return net;            // nothing cached yet: wait for the network after all
  }
}

async function geo(e) {
  const cache = await caches.open(GEO);
  const hit = await cache.match(e.request);
  if (hit) return hit;
  const res = await fetch(e.request);
  if (res.ok && res.status === 200) e.waitUntil(cache.put(e.request, res.clone()).catch(() => {}));
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") { e.respondWith(navigate(e)); return; }
  if (/\/geo\/[^/]+\.bin$/.test(url.pathname)) { e.respondWith(geo(e)); return; }
  e.respondWith(caches.open(SHELL).then(c => c.match(req)).then(hit => hit || fetch(req)));
});
