// Dev helper: screenshots of an exercise animation in a real (headless) Chromium-based browser, for checking a motion by eye when no
// visible browser is at hand (docs/animation-design.md, "Checking a motion"). Not part of the app or of CI. Needs Node >= 22 (WebSocket)
// and Edge or Chrome (path in $BROWSER, else the usual Windows / macOS / Linux locations), and the repo served over http, e.g.
//   cd <repo> && python -m http.server 8799
//   cd tools/test && node animshot.js "Conventional deadlift" --t 0,0.25,0.42 [--var Grip=Neutral] [--side Right] [--turn 300] [--zoom 3] [--out dir] [--url http://127.0.0.1:8799/]
// Drives the page only through its UI (exercise deep link, "Play movement", the variation buttons, the position slider #animT);
// --side Left|Right|Both presses that button of a single-sided exercise (#animSide); --turn drags the view horizontally by that many pixels
// (orbit), --zoom N wheels N steps in (negative: out) before the shots. Writes <out>/<exercise>[-<option>][-<side>]-t<t>.png.
const {spawn}=require('child_process'),fs=require('fs'),path=require('path'),os=require('os');
const a=process.argv.slice(2),flag=(f,d)=>{const i=a.indexOf(f);if(i<0) return d;const v=a[i+1];a.splice(i,2);return v;};
const vars=[];let v;while((v=flag('--var',null))) vars.push(v.split('='));
const side=flag('--side',null),ts=flag('--t','0,0.5').split(',').map(Number),turn=+flag('--turn','0'),zoom=+flag('--zoom','0'),out=flag('--out','.'),url=flag('--url','http://127.0.0.1:8799/'),name=a[0];
if(!name){console.error('usage: node animshot.js "Exercise" [--t 0,0.5] [--var Group=Option] [--turn px] [--out dir] [--url base]');process.exit(2);}
const cands=[process.env.BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/microsoft-edge'].filter(Boolean);
const exe=cands.find(p=>fs.existsSync(p));if(!exe){console.error('no Edge/Chrome found; set BROWSER');process.exit(2);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),port=9300+Math.floor(Math.random()*500),prof=fs.mkdtempSync(path.join(os.tmpdir(),'animshot-'));
const br=spawn(exe,['--headless=new','--remote-debugging-port='+port,'--user-data-dir='+prof,'--window-size=1400,900','--hide-scrollbars','--enable-unsafe-swiftshader','--no-first-run','about:blank'],{stdio:'ignore'});
(async()=>{
  let ws=null;
  for(let i=0;i<100&&!ws;i++){ try{ const l=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json(); const p=l.find(x=>x.type==='page'); if(p) ws=p.webSocketDebuggerUrl; }catch(e){} if(!ws) await sleep(200); }
  if(!ws) throw new Error('browser did not start');
  const sock=new WebSocket(ws);await new Promise((r,j)=>{sock.onopen=r;sock.onerror=j;});
  let id=0;const pend=new Map();sock.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend.has(d.id)){pend.get(d.id)(d);pend.delete(d.id);}};
  const cmd=(method,params)=>new Promise(r=>{const i=++id;pend.set(i,r);sock.send(JSON.stringify({id:i,method,params:params||{}}));});
  const ev=async js=>{const r=await cmd('Runtime.evaluate',{expression:js,awaitPromise:true,returnByValue:true});if(r.result&&r.result.exceptionDetails) throw new Error(js+': '+JSON.stringify(r.result.exceptionDetails));return r.result&&r.result.result&&r.result.result.value;};
  const until=async(js,ms,what)=>{const t0=Date.now();while(!(await ev(js))){if(Date.now()-t0>(ms||60000)) throw new Error('timeout: '+what);await sleep(150);}};
  await cmd('Page.enable');await cmd('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false});
  await cmd('Page.navigate',{url:url+'#ex='+encodeURIComponent(name)});
  await until('!document.getElementById("loading")&&!!document.querySelector("#card h2")',120000,'page load');
  for(const [g,o] of vars){ const ok=await ev(`(()=>{const b=[...document.querySelectorAll('#card [data-var]')].find(x=>x.textContent.trim()===${JSON.stringify(o)});if(b){b.click();return true;}return false;})()`); if(!ok) throw new Error('no variation button '+g+'='+o); }
  await until('!!document.querySelector(\'#card [data-act="anim"]\')',10000,'Play button (is the exercise animated?)');
  await ev('document.querySelector(\'#card [data-act="anim"]\').click()');
  await until('!document.getElementById("animPP").disabled',60000,'movement data');
  await ev('(()=>{const p=document.getElementById("animPP");if(p.textContent==="Pause")p.click();})()');
  if(side){ const ok=await ev(`(()=>{const b=[...document.querySelectorAll('#animSide button')].find(x=>x.textContent.trim()===${JSON.stringify(side)});if(b&&!document.getElementById('animSide').hidden){b.click();return true;}return false;})()`); if(!ok) throw new Error('no side button '+side+' (is the exercise flagged "side" in animations.json?)'); }
  if(turn){ const x=700,y=450;await cmd('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});for(let k=1;k<=10;k++) await cmd('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+turn*k/10,y,button:'left',buttons:1});await cmd('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+turn,y,button:'left'}); }
  if(zoom){ for(let k=0;k<Math.abs(zoom);k++) await cmd('Input.dispatchMouseEvent',{type:'mouseWheel',x:700,y:450,deltaX:0,deltaY:zoom>0?-100:100}); }
  fs.mkdirSync(out,{recursive:true});
  // the shot covers the 3D view left of the exercise card
  const clip=await ev('(()=>{const v=document.getElementById("vp").getBoundingClientRect(),c=document.getElementById("card").getBoundingClientRect();const r=c.width&&c.left>v.left?c.left-8:v.right;return {x:v.left,y:v.top,width:r-v.left,height:v.height,scale:1};})()');
  const tag=(name+(vars.length?'-'+vars.map(z=>z[1]).join('-'):'')+(side?'-'+side:'')).replace(/[^A-Za-z0-9]+/g,'-').replace(/-+$/,'');
  for(const t of ts){
    await ev(`(()=>{const s=document.getElementById("animT");s.value=String(Math.round(${t}*1000));s.dispatchEvent(new Event("input",{bubbles:true}));})()`);
    await sleep(1800);   // camera damping
    const r=await cmd('Page.captureScreenshot',{format:'png',clip});const f=path.join(out,tag+'-t'+t+'.png');fs.writeFileSync(f,Buffer.from(r.result.data,'base64'));console.log(f);
  }
  sock.close();
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;}).finally(()=>{br.kill();setTimeout(()=>{try{fs.rmSync(prof,{recursive:true,force:true});}catch(e){}},1500);});
