// Probe: load the real app headless at 1920x1080 and screenshot a few states.
const puppeteer = require("puppeteer-core");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1920,1080"] });
  const p = await b.newPage();
  p.on("console", m => { if (m.type() === "error") console.log("console:", m.text()); });
  p.on("pageerror", e => console.log("pageerror:", e.message));
  await p.setViewport({ width: Number(process.argv[2] || 1920), height: Number(process.argv[3] || 1080) });
  await p.goto("http://localhost:8765/app.html", { waitUntil: "load" });
  await p.waitForFunction(() => window.__v && !document.querySelector("#loading,.loading:not([hidden])"), { timeout: 60000 }).catch(e => console.log("wait", e.message));
  await new Promise(r => setTimeout(r, 1500));
  const t0 = Date.now(); await p.screenshot({ path: "probe-0.png" }); console.log("shot ms", Date.now() - t0);
  console.log(await p.evaluate(() => JSON.stringify({ gl: __v.renderer.getContext().getParameter(__v.renderer.getContext().VERSION), r: __v.orbit.r })));
  await p.evaluate(() => __v.selectEx(__v.EX.findIndex(e => e.n === "Back squat")));
  await new Promise(r => setTimeout(r, 1500)); await p.screenshot({ path: "probe-1.png" });
  await p.evaluate(() => __v.select("muscle", "gluteus maximus", true));
  await new Promise(r => setTimeout(r, 1500)); await p.screenshot({ path: "probe-2.png" });
  await b.close();
})();
