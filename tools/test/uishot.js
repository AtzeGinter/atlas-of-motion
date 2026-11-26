// Dev helper (not CI): screenshots of the app UI at phone and desktop size in headless Edge / Chrome over CDP (Node >= 22), for checking
// layout changes by eye. Seeds a small training calendar (three templates, a weekly pattern, a finished strength session and a finished
// run in the past days) into localStorage, then drives the page through its UI. Serve the repo over http first, e.g.
//   cd <repo> && python -m http.server 8801
//   cd tools/test && node uishot.js --out <dir> [--url http://127.0.0.1:8801/] [--only phone|desktop] [--desk 1100x800] [--dark] [--scenes anat,ex,card,wk,st,...]
// Scenes: anat, ex, card (Back squat card), wk (Workout tab), wkfull (Workout tab, sheet full / scrolled on desktop), st (Settings),
// anim-<exercise> (playing, paused at t=0.15 / 0.5 / 0.85; several: anim-Pull-up,anim-Push-up), first (first visit: empty storage),
// muscle (gluteus maximus card), best (Exercises tab, "Best exercises for a muscle" open), today (today's session started in the Today view,
// two sets logged, rest timer running), recap (today's session finished: the body recap), bones (femur selected, muscles off), bonesmus (humerus selected), ov (week overview), sx (Statistics), more (Workout tab, today's session card with "⋯ More" open).
// Writes <out>/<size>[-dark]-<scene>.png.
const {spawn}=require('child_process'),fs=require('fs'),path=require('path'),os=require('os');
const a=process.argv.slice(2),flag=(f,d)=>{const i=a.indexOf(f);if(i<0) return d;const v=a[i+1];a.splice(i,2);return v;},has=f=>{const i=a.indexOf(f);if(i<0) return false;a.splice(i,1);return true;};
const out=flag('--out','.'),url=flag('--url','http://127.0.0.1:8801/'),only=flag('--only',null),dark=has('--dark'),desk=flag('--desk','1440x900').split('x').map(Number);
const scenes=flag('--scenes','anat,ex,card,wk,wkfull,st,anim-Bulgarian split squat,anim-Pull-up,anim-Push-up').split(',');
const cands=[process.env.BROWSER,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/microsoft-edge'].filter(Boolean);
const exe=cands.find(p=>fs.existsSync(p));if(!exe){console.error('no Edge/Chrome found; set BROWSER');process.exit(2);}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dk=n=>{const t=new Date();t.setDate(t.getDate()+n);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');};
function seed(){
  const it=(n,s)=>({n:n,sets:s,v:[]}), now=Date.now();
  const T=[{id:'t1',name:'Push',items:[it('Barbell bench press',4),it('Overhead press',3),it('Triceps pushdown',3)],ses:[]},
    {id:'t2',name:'Pull',items:[it('Pull-up',4),it('Barbell row',3),it('Barbell curl',3)],ses:[]},
    {id:'t3',name:'Legs',items:[it('Back squat',4),it('Romanian deadlift',3),it('Standing calf raise',3)],ses:[]}];
  const sets=(n,r,w)=>Array.from({length:n},()=>({r:r,w:w,done:true}));
  const cal={v:1,mig:1,seq:30,note:0,pattern:[{id:'p1',tid:'t1',wd:[0,3],from:dk(-14)},{id:'p2',tid:'t2',wd:[1,4],from:dk(-14)},{id:'p3',tid:'t3',wd:[2,5],from:dk(-14)}],days:{}};
  const mixed=(rw)=>rw.map(x=>({r:x[0],w:x[1],done:true}));
  cal.days[dk(-7)]=[{id:'i0',tid:'t1',pid:'p1',name:'Push',items:T[0].items,ses:[],status:'done',startedAt:now-7*864e5,finishedAt:now-7*864e5+3000e3,
    lg:{ex:[{n:'Barbell bench press',v:[],o:0,sets:sets(4,5,80)},{n:'Overhead press',v:[],o:1,sets:mixed([[6,50],[6,50],[5,50]])},{n:'Triceps pushdown',v:[],o:2,sets:mixed([[12,25],[12,25],[10,27.5]])}],ses:[]}}];
  cal.days[dk(-2)]=[{id:'i1',tid:'t3',name:'Legs',items:T[2].items,ses:[],status:'done',startedAt:now-2*864e5,finishedAt:now-2*864e5+3600e3,
    lg:{ex:[{n:'Back squat',v:[],o:0,sets:sets(4,5,100)},{n:'Romanian deadlift',v:[],o:1,sets:sets(3,8,80)},{n:'Standing calf raise',v:[],o:2,sets:sets(3,12,60)}],ses:[]}}];
  cal.days[dk(-1)]=[{id:'i2',name:'Easy run',items:[],ses:[{a:'running',k:'easy',min:40,o:0}],status:'done',startedAt:now-864e5,finishedAt:now-864e5+2400e3,lg:{ex:[],ses:[{a:'running',k:'easy',min:40,o:0,done:true,act:42}]}}];
  return {'aom.tpl.v1':JSON.stringify(T),'aom.cal.v1':JSON.stringify(cal),'aom.set.v1':JSON.stringify({units:'kg',weekStart:'mon',theme:dark?'dark':'light',endMin:[150,300],easyMin:75,vo2:[1,2]})};
}
async function run(size){
  const ph=size==='phone', W=ph?412:desk[0], H=ph?915:desk[1], port=9300+Math.floor(Math.random()*500), prof=fs.mkdtempSync(path.join(os.tmpdir(),'uishot-'));
  const br=spawn(exe,['--headless=new','--remote-debugging-port='+port,'--user-data-dir='+prof,'--window-size='+W+','+H,'--hide-scrollbars','--enable-unsafe-swiftshader','--no-first-run','about:blank'],{stdio:'ignore'});
  try{
    let ws=null;
    for(let i=0;i<100&&!ws;i++){ try{ const l=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json(); const p=l.find(x=>x.type==='page'); if(p) ws=p.webSocketDebuggerUrl; }catch(e){} if(!ws) await sleep(200); }
    if(!ws) throw new Error('browser did not start');
    const sock=new WebSocket(ws);await new Promise((r,j)=>{sock.onopen=r;sock.onerror=j;});
    let id=0;const pend=new Map();sock.onmessage=m=>{const d=JSON.parse(m.data);if(d.id&&pend.has(d.id)){pend.get(d.id)(d);pend.delete(d.id);}};
    const cmd=(method,params)=>new Promise(r=>{const i=++id;pend.set(i,r);sock.send(JSON.stringify({id:i,method,params:params||{}}));});
    const ev=async js=>{const r=await cmd('Runtime.evaluate',{expression:js,awaitPromise:true,returnByValue:true});if(r.result&&r.result.exceptionDetails) throw new Error(js+': '+JSON.stringify(r.result.exceptionDetails));return r.result&&r.result.result&&r.result.result.value;};
    const until=async(js,ms,what)=>{const t0=Date.now();while(!(await ev(js))){if(Date.now()-t0>(ms||60000)) throw new Error('timeout: '+what);await sleep(150);}};
    await cmd('Page.enable');
    await cmd('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:ph?2:1,mobile:ph});
    if(ph) await cmd('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:dark?'dark':'light'},{name:'prefers-reduced-motion',value:'no-preference'}]});
    const S=seed(); fs.mkdirSync(out,{recursive:true});
    const load=async(hash,empty)=>{
      await cmd('Page.navigate',{url:url+'?shot'});await until('document.readyState==="complete"',30000,'blank load');
      const S0=empty?{'aom.set.v1':S['aom.set.v1']}:S;
      await ev('(()=>{localStorage.clear();const s='+JSON.stringify(S0)+';Object.keys(s).forEach(k=>localStorage.setItem(k,s[k]));return true;})()');
      await cmd('Page.navigate',{url:url+'?shot'+(hash||'')});
      await until('!document.getElementById("loading")',120000,'page load');await sleep(700);
    };
    const shot=async name=>{ await sleep(1500); const r=await cmd('Page.captureScreenshot',{format:'png'}); const f=path.join(out,size+(!ph&&desk[0]!==1440?desk[0]:'')+(dark?'-dark':'')+'-'+name+'.png'); fs.writeFileSync(f,Buffer.from(r.result.data,'base64')); console.log(f); };
    // open a tab through the phone bottom bar when there is one, else the sidebar tab
    const tab=t=>ev(`(()=>{const n=document.querySelector('#bnav [data-nav="${t}"]');const b=n&&getComputedStyle(n).display!=="none"?n:document.querySelector('.tabs [data-tab="${t}"]');b.click();return true;})()`);
    for(const sc of scenes){
      if(sc==='anat'){ await load(); if(ph) await tab('anat'); await shot('anat'); }
      else if(sc==='bones'||sc==='bonesmus'){ await load('#b='+encodeURIComponent(sc==='bones'?'femur':'humerus')); if(ph) await tab('anat');
        if(sc==='bones') await ev('(()=>{["tMuscles","tTendons"].forEach(i=>{const c=document.getElementById(i);if(c.checked){c.checked=false;c.dispatchEvent(new Event("change",{bubbles:true}));}});return true;})()');
        await shot(sc); }
      else if(sc==='ex'){ await load(); await tab('ex'); await shot('ex'); }
      else if(sc==='card'){ await load('#ex='+encodeURIComponent('Back squat')); await shot('card'); }
      else if(sc==='wk'||sc==='wkfull'){ await load(); await tab('wk');
        if(sc==='wkfull'){ if(ph) await ev('(()=>{const g=document.getElementById("grab");for(let i=0;i<3&&document.getElementById("side").dataset.sheet!=="full";i++) g.click();return true;})()');
          await sleep(500); await ev('(()=>{const s=document.getElementById("sbody");s.scrollTop=s.scrollHeight*0.45;return true;})()'); }
        await shot(sc); }
      else if(sc==='st'){ await load('#settings'); await shot('st'); }
      else if(sc==='first'){ await load('',true); await shot('first'); }
      else if(sc==='muscle'){ await load('#m='+encodeURIComponent('gluteus maximus')); await shot('muscle'); }
      else if(sc==='best'){ await load(); await tab('ex');
        await ev('(()=>{const f=document.getElementById("bestFold");f.open=true;if(f.scrollIntoView) f.scrollIntoView({block:"start"});return true;})()'); await shot('best'); }
      else if(sc==='today'||sc==='more'){ await load(); await tab('wk');
        if(sc==='more'){ await ev('(()=>{document.querySelector("#sessList .scard [data-sact=\\"more\\"]").click();const c=document.querySelector("#sessList .scard");if(c.scrollIntoView) c.scrollIntoView({block:"center"});return true;})()'); }
        else { await ev('(()=>{document.querySelector("#sessList .scard .strain").click();return true;})()');
          await until('!document.getElementById("td").hidden',10000,'Today view');
          await ev('(()=>{[...document.querySelectorAll("#td [data-f=done]")].slice(0,2).forEach(c=>c.click());return true;})()'); }
        await shot(sc); }
      else if(sc==='recap'){ await load(); await tab('wk');
        await ev('(()=>{document.querySelector("#sessList .scard .strain").click();return true;})()');
        await until('!document.getElementById("td").hidden',10000,'Today view');
        await ev('(()=>{[...document.querySelectorAll("#td [data-f=done]")].forEach(c=>{if(!c.checked)c.click();});document.getElementById("tdFinish").click();return true;})()');
        await until('!document.getElementById("rcBan").hidden',10000,'recap'); await sleep(1200); await shot('recap'); }
      else if(sc==='ov'){ await load(); await tab('wk'); await ev('(()=>{document.getElementById("ovOpen").click();return true;})()'); await shot('ov'); }
      else if(sc==='sx'){ await load('#stats'); await shot('sx'); }
      else if(sc.startsWith('anim-')){
        const n=sc.slice(5); await load('#ex='+encodeURIComponent(n));
        await until('!!document.querySelector(\'#card [data-act="anim"]\')',10000,'Play button');
        await ev('document.querySelector(\'#card [data-act="anim"]\').click()');
        await until('!document.getElementById("animPP").disabled',60000,'movement data');
        await sleep(2500); await shot(n.replace(/[^A-Za-z0-9]+/g,'-')+'-play');
        await ev('(()=>{const p=document.getElementById("animPP");if(/Pause/.test(p.textContent))p.click();return true;})()');
        for(const t of [0.15,0.5,0.85]){ await ev(`(()=>{const s=document.getElementById("animT");s.value=String(Math.round(${t}*1000));s.dispatchEvent(new Event("input",{bubbles:true}));return true;})()`); await shot(n.replace(/[^A-Za-z0-9]+/g,'-')+'-t'+t); }
      }
    }
    sock.close();
  } finally { br.kill(); setTimeout(()=>{try{fs.rmSync(prof,{recursive:true,force:true});}catch(e){}},1500); }
}
(async()=>{ for(const s of ['phone','desktop']) if(!only||only===s) await run(s); })().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
