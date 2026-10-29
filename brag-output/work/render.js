// Render video.html frame by frame in headless Edge.
//   node render.js stills 1.0,2.5,...   -> still-<t>.png (all frames up to the last time are stepped, only these are captured)
//   node render.js full                  -> frames piped to ffmpeg -> video.mp4 (no audio) + sfx.json
const puppeteer = require("puppeteer-core"), fs = require("fs"), { spawn } = require("child_process");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const FFMPEG = "C:/Users/peer-/miniconda3/Library/bin/ffmpeg.exe";
const mode = process.argv[2] || "stills";
(async () => {
  const b = await puppeteer.launch({ executablePath: EDGE, headless: "new", protocolTimeout: 600000,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--hide-scrollbars", "--force-color-profile=srgb"] });
  const p = await b.newPage();
  p.on("console", m => { if (m.type() === "error" || m.type() === "warn") console.log("console:", m.text()); });
  p.on("pageerror", e => console.log("pageerror:", e.message));
  await p.setViewport({ width: 1920, height: 1080 });
  await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  await p.goto("http://localhost:8765/v/video.html", { waitUntil: "load" });
  console.log("ready", await p.evaluate("ready"));
  const FPS = await p.evaluate("FPS"), DUR = await p.evaluate("DUR"), N = Math.round(FPS * DUR);
  if (mode === "stills") {
    const ts = process.argv[3].split(",").map(Number), want = new Map(ts.map(t => [Math.round(t * FPS), t]));
    const last = Math.max(...want.keys());
    for (let f = 0; f <= last; f++) {
      await p.evaluate(`frame(${f / FPS})`);
      if (want.has(f)) { await p.screenshot({ path: `still-${want.get(f).toFixed(2)}.png` }); console.log("still", want.get(f)); }
    }
  } else {
    const ff = spawn(FFMPEG, ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
      "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-r", String(FPS), "video.mp4"], { stdio: ["pipe", "inherit", "inherit"] });
    const t0 = Date.now();
    for (let f = 0; f < N; f++) {
      await p.evaluate(`frame(${f / FPS})`);
      const buf = await p.screenshot({ type: "jpeg", quality: 96, optimizeForSpeed: true });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once("drain", r));
      if (f % 60 === 0) console.log(`frame ${f}/${N} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end(); await new Promise(r => ff.on("close", r));
    fs.writeFileSync("sfx.json", JSON.stringify(await p.evaluate("SFX")));
    console.log("done", ((Date.now() - t0) / 1000).toFixed(0) + "s");
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
