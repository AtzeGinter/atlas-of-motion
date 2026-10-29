// Tiny static server: repo root at /, the video page from work/ at /v/, and /app.html = index.html with an
// internal-state hook (replaces the //@licexport marker) and without the service-worker registration.
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../.."), WORK = __dirname;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".woff2": "font/woff2", ".bin": "application/octet-stream", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
const HOOK = "window.__v={orbit,goal,camera,renderer,scene,select,selectEx,setMode,clearEx,openTab,openOv,closeOv,setOvView,addToPlan,setWin,selectDay," +
  "EX,state,byKey,applyVisuals,baseRadius,focusOn,renderCard,setLod,revealCard,setDirty:()=>{dirty=true}," +
  "startCmp:()=>{cmpPick=true;syncBanner();},get sel(){return sel},get selEx(){return selEx},get mode(){return mode},get volOn(){return volOn},set volOn(x){volOn=x}};";
function app() {
  let s = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  if (!s.includes("//@licexport")) throw new Error("hook marker missing");
  s = s.replace("//@licexport", HOOK).replace(/if\("serviceWorker" in navigator[^\n]*\n/, "\n");
  return s;
}
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split("?")[0]);
  try {
    if (u === "/app.html") { res.writeHead(200, { "Content-Type": TYPES[".html"] }); return res.end(app()); }
    const f = u.startsWith("/v/") ? path.join(WORK, u.slice(3)) : path.join(ROOT, u);
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const d = fs.readFileSync(f);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(d);
  } catch (e) { res.writeHead(404); res.end(String(e.message)); }
}).listen(8765, () => console.log("http://localhost:8765"));
