// Headless smoke test: loads index.html in jsdom with real three.js (WebGL stubbed), exercises the main UI flows and asserts on the result.
// Exits 1 if any assertion fails, startup fails/times out, or the page logs console errors / throws.
// Usage (Node >= 18): cd tools/test && npm install && npm test
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:fail++;console.log((c?'ok - ':'FAIL - ')+m);return !!c;};
const finish=()=>{console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);};
const die=m=>{ok(false,m);finish();};
if(typeof DecompressionStream==='undefined'||typeof Response==='undefined') die('Node >= 18 required (DecompressionStream/Response/Blob globals missing), found '+process.version);
const fs=require('fs'),path=require('path');const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..','..');
const html0=fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace(/<script src="[^"]+three[^"]+"><\/script>/,'');
const js=html0.match(/<script>([\s\S]*?)<\/script>/)[1];
const mi=js.indexOf('const META='),META=JSON.parse(js.slice(mi+11,js.indexOf('\n',mi)).replace(/;\s*$/,'')); // embedded data, to derive expectations
const errs=[];
const OLD_EQ=['Barbell','Dumbbells','Kettlebell','Cable','Machine','Bodyweight','Other'];
const TODAY='2026-10-12';   // the fixed "today" of every page instance: a Monday (opts.today overrides)
const dLab=k=>{const t=new Date(k+'T12:00:00');return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][t.getDay()]+' '+t.getDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][t.getMonth()];};   // 'Mon 12 Oct'
const addDays=(k,n)=>{const [y,m,d]=k.split('-').map(Number),t=new Date(y,m-1,d+n);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');};
// boot one page instance. opts.today: the page's "today" (YYYY-MM-DD, default TODAY); opts.win: stored window start (aom.win.v1); opts.url: page URL; opts.failFetch: every fetch rejects (w.__failFetch toggles it later); opts.lod: stored "aom.lod.v1" value. opts.phone: stub matchMedia so "(max-width:760px)" and "(pointer:coarse)" match (w.__setPhone(false) flips them and fires the change listeners); otherwise matchMedia is absent (exercises the guard)
function boot(opts){
 opts=opts||{};
 const vc=new VirtualConsole();
 vc.on('error',(...a)=>errs.push('console.error: '+a.join(' ')));vc.on('jsdomError',e=>{const m=e.stack||e.message||'';if(/Not implemented: navigation/.test(m)) return;errs.push('jsdomError: '+m);});
 const dom=new JSDOM(html0,{runScripts:'outside-only',pretendToBeVisual:true,url:opts.url||'https://example.test/',virtualConsole:vc});const w=dom.window;const THREE=require('three');
 w.addEventListener('error',e=>errs.push('uncaught: '+(e.message||e.error)));
 {const [ty,tm,td]=(opts.today||TODAY).split('-').map(Number),RD=w.Date,base=new RD(ty,tm-1,td,12,0,0).getTime(),t0=RD.now(),now=()=>base+(RD.now()-t0);
  class FD extends RD{constructor(...a){if(a.length===0)super(now());else super(...a);}static now(){return now();}}
  w.Date=FD;}
 class FR{constructor(){this.domElement=w.document.createElement('canvas');}setPixelRatio(r){w.__dpr=r;}setClearColor(){}setSize(){}render(s,c){w.__scene=s;w.__cam=c;}}
 w.THREE=Object.assign({},THREE,{WebGLRenderer:FR});w.ResizeObserver=class{observe(){}};
 // geometry is no longer embedded: serve geo/<level>.bin from the repo root, like a web server would
 w.__fetched=[];w.__failFetch=!!opts.failFetch;
 w.fetch=async(u,o)=>{const full=String(u);u=full.split('?')[0];w.__fetched.push(u);if(w.__failFetch||(w.__swFail&&!/[?&]direct=1/.test(full)))throw new TypeError('Failed to fetch');return new Response(fs.readFileSync(path.join(ROOT,u)));};
 w.DecompressionStream=DecompressionStream;w.Response=Response;w.Blob=Blob;
 w.HTMLCanvasElement.prototype.getContext=function(){return {createRadialGradient(){return{addColorStop(){}}},fillRect(){}}};
 Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return 1000}});Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return 800}});
 w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:800});w.HTMLElement.prototype.setPointerCapture=()=>{};
 w.devicePixelRatio=3;
 if(opts.phone){
  let phone=true;const mqs=[];
  w.matchMedia=q=>{const m={media:q,get matches(){return phone&&/max-width:\s*760px|pointer:\s*coarse/.test(q);},ls:[],addEventListener(t,f){this.ls.push(f);},removeEventListener(){},addListener(f){this.ls.push(f);},removeListener(){}};mqs.push(m);return m;};
  w.__setPhone=v=>{phone=v;mqs.forEach(m=>m.ls.forEach(f=>f({matches:m.matches,media:m.media})));};
 }
 if(opts.store){
  Object.keys(opts.store).forEach(k=>w.localStorage.setItem(k,opts.store[k]));
 } else if(!opts.phone){
  // seed legacy (pre-rename) storage to exercise the migration: variation INDEX arrays (Back squat Stance=Wide), an entry without v, an exercise that no longer exists, equipment minus Band
  w.localStorage.setItem('myology.plan.v1',JSON.stringify([{n:'Back squat',sets:4,v:[1,0]},{n:'Hip thrust',sets:2},{n:'Removed exercise',sets:3,v:[]}]));
  w.localStorage.setItem('myology.eq.v1',JSON.stringify(OLD_EQ));
  w.localStorage.setItem('aom.win.v1',JSON.stringify(opts.win||TODAY));   // the main instance looks at the 7 days starting today
 }
 if(opts.win&&(opts.store||opts.phone)) w.localStorage.setItem('aom.win.v1',JSON.stringify(opts.win));
 if(opts.lod) w.localStorage.setItem('aom.lod.v1',opts.lod);
 // WebCrypto for the licence check: jsdom has no crypto.subtle, so hand it Node's (opts.nosubtle: a crypto object without subtle, like an insecure context)
 if(opts.nosubtle) Object.defineProperty(w,'crypto',{value:{getRandomValues:a=>a},configurable:true});
 else if(!w.crypto||!w.crypto.subtle) Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto,configurable:true});
 w.eval(`(async()=>{try{${(opts.js||js).replace('(async function(){','await (async function(){')}}catch(e){window.__fatal=e.stack||String(e)}})()`);
 return w;
}
const w=boot();
const ev=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const d=w.document,C=()=>d.getElementById('card').textContent.replace(/\s+/g,' '),q=s=>d.querySelector(s),qa=s=>[...d.querySelectorAll(s)];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const exItem=n=>qa('#exlist .item').find(b=>b.textContent===n),exNames=()=>qa('#exlist .item').map(b=>b.textContent);
const roleKeys=r=>{const h=qa('#card h3').find(x=>x.textContent===r);return h?[...h.nextElementSibling.querySelectorAll('[data-key]')].map(b=>b.dataset.key):[];};
const bestNames=()=>qa('#best [data-ex]').map(b=>b.textContent),bestPct=()=>qa('#best small').map(s=>parseFloat(s.textContent));
const wk=()=>JSON.parse(w.localStorage.getItem('aom.cal.v1')||'null'),tpls=()=>JSON.parse(w.localStorage.getItem('aom.tpl.v1')||'[]'); // the stored calendar and templates
const D=i=>addDays(TODAY,i),sess=dk=>((wk()||{days:{}}).days[dk]||[]).filter(x=>x.id),itemsOf=i=>[].concat(...sess(D(i)).map(x=>x.items)); // D(i): date of slot i of the main instance (window = 7 days from today); sess(): stored sessions of a date
const plan=()=>{const o=wk();return o?[].concat(...Object.keys(o.days).sort().map(k=>[].concat(...o.days[k].filter(x=>x.id).map(x=>x.items)))):null;}; // plan(): flat list over all stored sessions
const addRes=n=>qa('#addres [data-add]').find(b=>b.firstChild.textContent.trim()==='+ '+n);
const addEx=n=>{q('#qa').value=n.toLowerCase();ev(q('#qa'),'input');const b=addRes(n);if(!ok(b,'search offers "'+n+'"')) return;b.click();};
const sesOf=i=>[].concat(...sess(D(i)).map(x=>x.ses)),names=i=>itemsOf(i).map(p=>p.n),dayBtn=i=>q('#wstrip [data-day="'+i+'"]'),selDay=i=>dayBtn(i).click();
const clearAll=()=>{for(let i=6;i>=0;i--){selDay(i);let g=0;while(q('#sessList [data-sact="rm"]')&&g++<20)q('#sessList [data-sact="rm"]').click();}selDay(0);}; // remove every session of the window
// total triangle-index count over all body meshes in the three.js scene (captured by the stubbed renderer)
const idxCount=win=>{let n=0;win.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind&&o.userData.kind!=='nerve'&&o.geometry.index)n+=o.geometry.index.count;});return n;};
const lodBtn=(doc,l)=>doc.querySelector('[data-lod="'+l+'"]'),lodOn=doc=>[...new Set([...doc.querySelectorAll('[data-lod]')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.lod))].join(','); // the Layers popover and the Settings page each hold one control; both must agree
async function waitFor(f,ms,what){const t=Date.now();while(!f()){if(Date.now()-t>(ms||30000)) return ok(false,'timed out waiting for '+what);await sleep(50);}return true;}
// ---- atlas look: fonts, palette tokens, one source of truth for material and legend colours ----
async function paletteRun(){
 const css=html0.slice(html0.indexOf('<style>'),html0.indexOf('</style>'));
 const rule=sel=>{const i=css.indexOf(sel+'{');return i<0?'':css.slice(i,css.indexOf('}',i));};
 ok(/@font-face\{font-family:"Fraunces"[^}]*fraunces-latin\.woff2/.test(css)&&/--f-disp:"Fraunces"/.test(css)&&['.brand h1','.card h2','.ovhead h2','.loading strong'].every(s=>/var\(--f-disp\)/.test(rule(s)))&&fs.existsSync(path.join(ROOT,'fonts','fraunces-latin.woff2'))&&fs.existsSync(path.join(ROOT,'fonts','OFL-Fraunces.txt'))&&/fonts\/fraunces-latin\.woff2/.test(fs.readFileSync(path.join(ROOT,'sw.js'),'utf8')),'Fraunces: @font-face, headings use it (--f-disp), file + OFL licence shipped and precached by the service worker');
 const ochre=(re)=>{const m=css.match(re);return m?m[1]:null;};
 const oL=ochre(/:root\{[^}]*--ochre:(#[0-9A-Fa-f]{6})/),oD=ochre(/:root\[data-theme="dark"\]\{[^}]*--ochre:(#[0-9A-Fa-f]{6})/);
 const x=boot({store:{},url:'https://example.test/#m=deltoid'}),xd=x.document,xq=s=>xd.querySelector(s),xqa=s=>[...xd.querySelectorAll(s)],ex=(el,t)=>el.dispatchEvent(new x.Event(t,{bubbles:true}));
 await waitFor(()=>!xd.getElementById('loading'),60000,'palette test instance');
 const lin=h=>new x.THREE.Color(h).convertSRGBToLinear(),same=(c,h)=>{const t=lin(h);return Math.abs(c.r-t.r)<1e-5&&Math.abs(c.g-t.g)<1e-5&&Math.abs(c.b-t.b)<1e-5;};
 const meshes=kind=>{const a=[];x.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind===kind)a.push(o);});return a;};
 const selMat=()=>meshes('muscle').find(m=>m.userData.key==='deltoid').material;
 ok(!!oL&&!!oD&&oL!==oD&&same(selMat().color,oL),'selection material (deltoid) is the --ochre of the light theme ('+oL+')');
 xd.documentElement.setAttribute('data-theme','dark');await sleep(60);
 ok(same(selMat().color,oD)&&xd.documentElement.style.getPropertyValue('--m-sel').toLowerCase()===oD.toLowerCase(),'... and follows to the dark theme --ochre ('+oD+') when the theme changes');
 xd.documentElement.setAttribute('data-theme','light');await sleep(60);
 // legend swatches: the CSS classes reference the --m-* properties, which the script sets from the same PAL entries the materials are made from
 const P=n=>xd.documentElement.style.getPropertyValue('--m-'+n);
 ok(['l3:h3','l2:h2','l1:h1','ca2:a2','ca1:a1','ceq:eq','cb1:b1','cb2:b2','v0:v0','v1:v1','v2:v2','v3:v3','sw.fat:fat','sw.end:end'].every(r=>{const a=r.split(':');return css.includes('.'+a[0]+'{background:var(--m-'+a[1]+')')&&/^#[0-9A-Fa-f]{6}$/.test(P(a[1]));}),'every legend swatch class (.l3 .l2 .l1 .ca2 .cb2 .v0-.v3 .fat .end ...) takes its colour from the --m-* palette property');
 xqa('[data-tab="ex"]')[0].click();
 const it=xqa('#exlist .item').find(b=>b.textContent==='Back squat');it.click();
 const hc=[...new Set(meshes('muscle').filter(m=>m.visible).map(m=>m.material).filter(m=>!m.transparent).map(m=>m.color.getHexString()))];
 const heat=['h3','h2','h1'].map(n=>lin(P(n)).getHexString());
 ok(heat.every(h=>hc.includes(h)),'exercise heat: prime / synergist / stabiliser materials have exactly the legend colours ('+heat.map(h=>'#'+h).join(' ')+')');
 // volume: a plan, then the heatmap bands match the legend
 x.localStorage.setItem('aom.plan.v3',JSON.stringify({days:[{name:'',items:[{n:'Back squat',sets:10,v:['']},{n:'Barbell bench press',sets:3,v:['']}]}]}));
 const y=boot({store:{'aom.plan.v3':x.localStorage.getItem('aom.plan.v3')}}),yd=y.document;
 await waitFor(()=>!yd.getElementById('loading'),60000,'palette volume instance');
 yd.getElementById('tVol').checked=true;yd.getElementById('tVol').dispatchEvent(new y.Event('change',{bubbles:true}));
 const yl=h=>new y.THREE.Color(h).convertSRGBToLinear().getHexString(),yP=n=>yd.documentElement.style.getPropertyValue('--m-'+n);
 const vc=new Set();y.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind==='muscle'&&o.visible&&!o.material.transparent)vc.add(o.material.color.getHexString());});
 const bands=['v0','v1','v2','v3'].map(n=>yl(yP(n)));
 ok([...vc].filter(h=>bands.includes(h)).length>=2,'volume heatmap: trained muscles use the legend band colours ('+[...vc].filter(h=>bands.includes(h)).map(h=>'#'+h).join(' ')+')');
 {const VER=fs.readFileSync(path.join(ROOT,'tools','version.txt'),'utf8').trim(),ve=VER.replace(/\./g,'\\.');ok(new RegExp('^v'+ve+' · [0-9a-f]{7}$').test(xq('#ver').textContent)&&new RegExp('version '+ve+' ').test(xq('#ver').title),'version shows v'+VER+' from tools/version.txt ('+xq('#ver').textContent+')');}
}
// ---- schematic nerves: data, Nerves layer, picking-independent selection flows, deep link, LOD rebuild ----
async function nerveRun(){
 const NV=META.nv,ND=META.nd,has=(id,k)=>(NV[id]||[]).includes(k);
 ok(Array.isArray(ND)&&ND.length>=40&&NV&&ND.every(n=>Array.isArray(NV[n.id])&&n.w.length>=1&&n.n&&n.r&&n.x),'META.nd lists the nerves ('+ND.length+') and META.nv has a muscle list for each');
 ok(['phrenic','dscap','lthor','sscap','latpec','medpec','usub','lsub','thdors','axillary','musculo','radial','pin','median','ain','ulnar','intercostal','femoral','obturator','sgluteal','igluteal','sciatic','tibial','cfibular','dfibular','sfibular','pudendal','facial','v3','accessory'].every(id=>ND.some(n=>n.id===id)),'all required nerves exist');
 ok(has('median','pronator teres')&&has('median','flexor digitorum superficialis')&&has('radial','triceps brachii')&&['rectus femoris','vastus lateralis','vastus medialis','vastus intermedius'].every(k=>has('femoral',k))&&has('tibial','semitendinosus')&&has('phrenic','diaphragm')&&has('axillary','deltoid')&&has('ulnar','flexor carpi ulnaris'),'nerve to muscle mapping: median -> pronator teres + FDS, radial -> triceps, femoral -> quadriceps, tibial -> semitendinosus, ...');
 ok(has('pin','extensor digitorum')&&!has('radial','extensor digitorum')&&NV.sciatic.length===0&&has('cfibular','biceps femoris')&&has('tibial','biceps femoris'),'most specific nerve wins (extensor digitorum is PIN, not radial); sciatic is a trunk; biceps femoris has both parts');
 ok(ND.every(n=>NV[n.id].every(k=>META.db[k]))&&ND.every(n=>!n.p||ND.findIndex(m=>m.id===n.p)>=0),'every listed muscle exists, every parent exists');
 const x=boot({store:{}}),xd=x.document,xq=s=>xd.querySelector(s),xqa=s=>[...xd.querySelectorAll(s)],ex=(el,t)=>el.dispatchEvent(new x.Event(t,{bubbles:true}));
 await waitFor(()=>!xd.getElementById('loading'),60000,'nerve test instance');
 const nm=()=>{const a=[];x.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind==='nerve'&&!o.userData.owner)a.push(o);});return a;};
 const XC=()=>xd.getElementById('card').textContent.replace(/\s+/g,' ');
 const bodyMesh=(kind,k)=>{let r=null;x.__scene.traverse(o=>{if(!r&&o.isMesh&&o.userData.kind===kind&&o.userData.key===k)r=o;});return r;};
 ok(xq('#popLayers').contains(xq('#tNerves'))&&!xq('#tNerves').checked&&nm().length===0,'Nerves toggle is in the Layers popover, off by default, and nothing is built yet');
 ok(xq('#opM').value==='100'&&x.localStorage.getItem('aom.nerves.v1')===null,'muscles are opaque, nothing stored');
 xq('#tNerves').checked=true;ex(xq('#tNerves'),'change');
 let ns=nm();
 ok(ns.length>=2*ND.length*0.8&&ns.some(m=>m.userData.side==='L')&&ns.some(m=>m.userData.side==='R')&&ns.every(m=>m.visible),'switching Nerves on builds tube meshes for both sides ('+ns.length+')');
 ok(ns.every(m=>m.geometry.attributes.position.array.every(Number.isFinite)&&m.geometry.index.count>0),'all nerve geometry is finite');
 const mid=ns.find(m=>m.userData.key==='median'&&m.userData.side==='L'),mir=ns.find(m=>m.userData.key==='median'&&m.userData.side==='R');
 ok(mid&&mir&&mid.geometry.boundingBox.min.x>0&&mir.geometry.boundingBox.max.x<0,'median nerve runs along the left arm (+x) and its mirror along the right arm');
 ok(xq('#opM').value==='45'&&xq('#opMo').textContent==='45%'&&JSON.parse(x.localStorage.getItem('aom.nerves.v1'))===true,'opaque muscles become translucent (45%) and the choice is stored');
 xq('#tNerves').checked=false;ex(xq('#tNerves'),'change');
 ok(xq('#opM').value==='100'&&nm().every(m=>!m.visible)&&JSON.parse(x.localStorage.getItem('aom.nerves.v1'))===false,'switching off restores 100% and hides the nerves');
 xq('#tNerves').checked=true;ex(xq('#tNerves'),'change');xq('#opM').value='70';ex(xq('#opM'),'input');
 xq('#tNerves').checked=false;ex(xq('#tNerves'),'change');
 ok(xq('#opM').value==='70','a muscle opacity the user changed meanwhile is kept when Nerves goes off');
 xq('#opM').value='100';ex(xq('#opM'),'input');
 // index
 xq('#q').value='median';ex(xq('#q'),'input');
 const it=xqa('#list .item').find(b=>b.dataset.kind==='nerve'&&b.dataset.key==='median');
 ok(!!it&&it.textContent.includes('Median nerve')&&xqa('#list summary').some(s=>/Nerves/.test(s.textContent)),'the Index has a Nerves group and finds "median"');
 it.click();
 ok(xq('#card h2').textContent.includes('Median nerve')&&xq('#tNerves').checked&&nm().length>0&&x.location.hash==='#n=median','selecting a nerve switches the layer on, opens its card and sets #n=median');
 const chips=xqa('#card .chips [data-key]').map(b=>b.dataset.key);
 ok(chips.includes('pronator teres')&&chips.includes('flexor digitorum superficialis')&&/Roots C6–T1/.test(XC())&&/Branch of Brachial plexus/.test(XC())&&/Schematic: approximate course/.test(XC())&&/wrist/i.test(XC()),'nerve card: roots, parent, schematic notice, supplied-muscle chips, note');
 ok(xqa('#card [data-nerve]').some(b=>b.dataset.nerve==='ain')&&xqa('#card [data-nerve]').some(b=>b.dataset.nerve==='bplex'),'nerve card links to its branches and its parent');
 const sm=bodyMesh('muscle','pronator teres'),sm2=bodyMesh('muscle','flexor digitorum superficialis'),om=bodyMesh('muscle','biceps brachii');
 ok(sm.material===sm2.material&&sm.material!==om.material&&sm.visible,'supplied muscles are highlighted with the selection material');
 const nmed=nm().filter(m=>m.userData.key==='median'),noth=nm().find(m=>m.userData.key!=='median');
 ok(nmed.length===2&&nmed.every(m=>m.material!==noth.material),'the selected nerve (both sides) gets a highlight material');
 xqa('#card .chips [data-key]').find(b=>b.dataset.key==='pronator teres').click();
 ok(xq('#card h2').textContent==='pronator teres'&&x.location.hash==='#m=pronator%20teres','clicking a supplied-muscle chip opens that muscle');
 const link=xqa('#card dd [data-nerve]');
 ok(link.length>=1&&link[0].dataset.nerve==='median'&&nmed.some(m=>m.material!==noth.material),'muscle card: the Nerve field links to the nerve (and the nerve is highlighted)');
 link[0].click();
 ok(xq('#card h2').textContent.includes('Median nerve')&&x.location.hash==='#n=median','... and the link opens the nerve card');
 ok(xqa('#card dd').length===0&&nm().length>0,'nerve card has no muscle definition list');
 xq('#card .close').click();
 ok(!xq('#card').classList.contains('show')&&x.location.hash==='','closing the nerve card clears the selection and the hash');
 // picking: click on a point of the median nerve (seen from the front) while the muscles in front are translucent
 {
  const T=x.THREE,mm=nm().find(m=>m.userData.key==='median'&&m.userData.side==='L'),pa=mm.geometry.attributes.position,cam=x.__cam;
  let prev=cam.position.clone();for(let i=0;i<50;i++){await sleep(50);const curr=cam.position.clone();if(curr.distanceTo(prev)<0.001)break;prev=curr;} cam.updateMatrixWorld(); // let the camera settle
  const pickAt=i=>{const v=new T.Vector3(pa.getX(i),pa.getY(i),pa.getZ(i)).project(cam),px=(v.x+1)/2*1000,py=(1-v.y)/2*800,cv=xq('#vp canvas');
   const mk=(t)=>{const e=new x.Event(t,{bubbles:true});Object.assign(e,{pointerId:1,clientX:px,clientY:py,button:0,buttons:1,pointerType:'mouse'});return e;};
   cv.dispatchEvent(mk('pointerdown'));cv.dispatchEvent(mk('pointerup'));return xq('#card h2')&&xq('#card.show')?xq('#card h2').textContent:'';};
  let got='';for(const f of [0.45,0.5,0.4,0.55,0.35]){const i=Math.floor(pa.count*f);got=pickAt(i);if(/nerve/i.test(got))break;if(xq('#card.show'))xq('#card .close').click();}
  ok(/nerve|plexus/i.test(got),'clicking a nerve in the 3D view (muscles translucent) selects it: "'+got+'"');
 }
 // hide with H
 xq('#list .item[data-kind="nerve"][data-key="median"]').click();
 xd.dispatchEvent(new x.KeyboardEvent('keydown',{key:'h',bubbles:true}));
 ok(nm().filter(m=>m.userData.key==='median').every(m=>!m.visible)&&nm().filter(m=>m.userData.key==='ulnar').every(m=>m.visible),'H hides only the selected nerve');
 xq('#unhide').click();
 // LOD switch rebuilds
 const before=nm().map(m=>m.geometry);
 lodBtn(xd,'low').click();await waitFor(()=>lodOn(xd)==='low',30000,'Low in the nerve instance');await sleep(50);
 const after=nm();
 ok(after.length===before.length&&after.every(m=>!before.includes(m.geometry))&&after.every(m=>m.geometry.attributes.position.array.every(Number.isFinite)),'a mesh quality switch rebuilds the nerve tubes ('+after.length+')');
 ok(xq('#tNerves').checked&&after.every(m=>m.visible)&&xq('#opM').value==='45','nerves stay on after the switch');
 // switching off, then a quality switch, then on again builds fresh
 xq('#tNerves').checked=false;ex(xq('#tNerves'),'change');
 lodBtn(xd,'medium').click();await waitFor(()=>lodOn(xd)==='medium',30000,'Medium in the nerve instance');await sleep(50);
 ok(nm().length===0,'with Nerves off, a quality switch discards the old tubes');
 xq('#tNerves').checked=true;ex(xq('#tNerves'),'change');
 ok(nm().length===after.length,'switching on again builds them for the new mesh');
 // persisted layer + deep link
 const y=boot({url:'https://example.test/#n=median',store:{'aom.nerves.v1':'true'}}),yd=y.document;
 await waitFor(()=>!yd.getElementById('loading'),60000,'deep-link nerve instance');
 ok(!y.__fatal&&yd.querySelector('#card h2')&&yd.querySelector('#card h2').textContent.includes('Median nerve')&&yd.querySelector('#tNerves').checked,'#n=median boots straight into the nerve card with the layer on'+(y.__fatal?': '+y.__fatal:''));
 const z=boot({url:'https://example.test/#n=nonsense',store:{'aom.nerves.v1':'true'}}),zd=z.document;
 await waitFor(()=>!zd.getElementById('loading'),60000,'stored-layer instance');
 let zn=0;z.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind==='nerve'&&!o.userData.owner)zn++;});
 ok(zd.querySelector('#tNerves').checked&&zn>0&&!zd.querySelector('#card.show')&&zd.querySelector('#opM').value==='45','a stored "on" restores the layer at start-up; an unknown #n= id is ignored');
}
// ---- other start-up cases: stored choice, failed loads (network error, file://) end in a readable #loadMsg, not an exception ----
async function otherRuns(){
 const st=boot({lod:'"low"'}),sd=st.document;
 await waitFor(()=>!sd.getElementById('loading'),60000,'stored-choice instance');
 ok(lodOn(sd)==='low'&&st.__fetched.join()==='geo/low.bin','a stored "low" choice overrides the desktop default (only geo/low.bin fetched)');
 const bad=boot({lod:'"bogus"'}),bd=bad.document;
 await waitFor(()=>!bd.getElementById('loading'),60000,'invalid-choice instance');
 ok(lodOn(bd)==='medium'&&bad.__fetched.join()==='geo/medium.bin','an invalid stored value is ignored (Medium on desktop)');
 const f=boot({failFetch:true}),fd=f.document;
 await waitFor(()=>/Network error/.test(fd.getElementById('loadMsg').textContent),15000,'network error message');
 ok(/Network error/.test(fd.getElementById('loadMsg').textContent)&&!!fd.getElementById('loading')&&!f.__fatal,'failed fetch: #loadMsg explains the network error, no exception ("'+fd.getElementById('loadMsg').textContent+'")');
 const g=boot({phone:true,url:'file:///C:/atlas/index.html'}),gd=g.document;
 await waitFor(()=>/web server/.test(gd.getElementById('loadMsg').textContent),15000,'file:// message');
 ok(/web server/.test(gd.getElementById('loadMsg').textContent)&&g.__fetched.length===0&&!g.__fatal,'file:// page: #loadMsg asks for a web server and nothing is fetched');
}
// ---- training days, week overview, recovery model, planned marks (main desktop instance) ----
async function weekRun(){
 const rowVal=n=>{const r=qa('#volsum tr').find(r=>r.cells[0].textContent.trim()===n);return r?parseFloat(r.cells[2].textContent):NaN;};
 const exOf=n=>META.ex.find(e=>e.n===n);
 const lvl=(n,key,part)=>Math.max(0,...exOf(n).t.filter(t=>t[0]===key&&(!t[1]||t[1]===part)).map(t=>t[2]));
 const VF={0:0,1:0,2:0.5,3:1};
 const ovOpen=()=>{if(q('#ov').hidden)q('#ovOpen').click();};
 const cell=(g,dd)=>q('#ovGrid tr.g[data-g="'+g+'"] .cb[data-d="'+dd+'"]'),GCHEST=1;
 const enter=()=>q('#sessIn').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 const rename=t=>{q('#sessList .scard.sel [data-sact="ren"]').click();q('#sessIn').value=t;enter();};
 const sname=i=>sess(D(i)).map(x=>x.name).join('|');
 q('[data-tab="wk"]').click();if(!q('#ov').hidden)q('#ovClose').click();clearAll();selDay(0);
 // date strip
 ok(qa('#wstrip [data-day]').length===7&&qa('#wstrip [data-day]').map(b=>b.firstChild.textContent).join()==='Mon,Tue,Wed,Thu,Fri,Sat,Sun'&&qa('#wstrip [data-day] .dd').map(b=>b.textContent).join()==='12 Oct · today,13 Oct,14 Oct,15 Oct,16 Oct,17 Oct,18 Oct','date strip: seven cards Mon 12 Oct (today) .. Sun 18 Oct');
 ok(dayBtn(0).getAttribute('aria-pressed')==='true'&&dayBtn(0).classList.contains('today')&&qa('#wstrip .rest').length===7&&/Monday 12 October/.test(q('#dayLbl').textContent)&&!/\bDay [1-7]\b/.test(q('#wstrip').textContent+q('#dayLbl').textContent),'today is selected and marked, all seven dates are rest days (dashed), no "Day N" naming');
 // adding to the selected date
 selDay(2);addEx('Barbell bench press');
 ok(names(2).join()==='Barbell bench press'&&names(0).length===0&&qa('#plan .prow').length===1&&sname(2)==='Session','with Wed 14 Oct selected, the add search puts the exercise into a new session on that date ("Session")');
 ok(!dayBtn(2).classList.contains('rest')&&dayBtn(2).textContent.includes('3 sets')&&dayBtn(0).classList.contains('rest')&&q('#qa').placeholder==='Add an exercise to Session','Wed card shows its 3 sets, Mon stays a rest day');
 q('[data-tab="ex"]').click();exItem('Barbell bench press').click();
 ok(q('[data-act="add"]').textContent==='Add again to Wed 14 Oct (3 sets planned)','exercise card button names the selected date: "'+q('[data-act="add"]').textContent+'"');
 selDay(4);
 ok(q('[data-act="add"]').textContent.startsWith('Add again to Fri 16 Oct'),'selecting another date updates the open exercise card');
 q('[data-act="add"]').click();
 ok(names(4).join()==='Barbell bench press'&&names(2).length===1,'"Add to Fri 16 Oct" on the exercise card adds to that date');
 q('#exClear').click();q('[data-tab="wk"]').click();
 // weekly table = sum over the dates of the window
 selDay(0);addEx('Back squat');selDay(5);addEx('Back squat');
 ok(rowVal('Quadriceps')===6&&rowVal('Mid and lower chest')===6,'the 7-day table sums the dates: Quadriceps 3+3, Mid and lower chest 3+3 ('+rowVal('Quadriceps')+', '+rowVal('Mid and lower chest')+')');
 ok(/3 sets in this session · 12 sets in the 7 days/.test(q('#plan').textContent),'editor footer mentions the session and the 7-day total: '+q('#plan .fine').textContent);
 // rename a session
 selDay(1);q('#addSess').click();
 ok(sname(1)==='Session'&&qa('#sessList .scard').length===1&&q('#sessList .scard').classList.contains('sel'),'"+ Add session" adds an empty session to the selected date');
 q('#sessList [data-sact="ren"]').click();
 ok(!!q('#sessIn')&&q('#sessIn').value==='Session','pencil turns the session name into an input');
 q('#sessIn').value='Push day';enter();
 ok(!q('#sessIn')&&sname(1)==='Push day'&&q('#sessList .snm').textContent==='Push day'&&q('#qa').placeholder==='Add an exercise to Push day','Enter renames the session (stored "Push day", card and add placeholder follow)');
 rename('');
 ok(sname(1)==='Push day','an empty name keeps the old one');
 rename('Legs and glutes day long extra');
 ok(sname(1)==='Legs and glutes day long'&&sname(1).length<=24,'names are cut at 24 characters ("'+sname(1)+'")');
 rename('<b>Push</b>');
 ok(!q('#sessList .snm b')&&qa('#wstrip b').length===7&&q('#sessList .snm').textContent==='<b>Push</b>'&&q('#dayLbl b')===null,'session names are escaped in the UI');
 q('#sessList [data-sact="ren"]').click();q('#sessIn').value='Pull';q('#sessIn').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 ok(!q('#sessIn')&&sname(1)!=='Pull','Escape cancels the rename');
 rename('Pull');
 ok(sname(1)==='Pull'&&/Pull/.test(dayBtn(1).textContent),'rename persisted in aom.cal.v1 and shown on the date card');
 // clear / move rows
 selDay(0);
 ok(!q('#wkClear').disabled&&q('#wkClear').textContent==='Clear session','"Clear session" is available for a session with exercises');
 q('#plan select.mv').value=D(6);ev(q('#plan select.mv'),'change');
 ok(names(6).join()==='Back squat'&&names(0).length===0&&/Monday 12 October/.test(q('#dayLbl').textContent)&&/Moved Back squat to Sun 18 Oct/.test(q('#dayMsg').textContent),'"Move to…" moves the row to Sun 18 Oct (a new session there) and stays on Mon');
 selDay(6);q('#wkClear').click();
 ok(names(6).length===0&&!dayBtn(6).classList.contains('rest')&&sess(D(6)).length===1&&q('#wkClear').disabled,'Clear session empties only that session (it stays, empty)');
 selDay(1);q('#sessList [data-sact="rm"]').click();selDay(6);q('#sessList [data-sact="rm"]').click();selDay(0);
 ok(sess(D(1)).length===0&&sess(D(6)).length===0&&dayBtn(1).classList.contains('rest')&&dayBtn(6).classList.contains('rest'),'Remove deletes a session and the date is a rest day again');
 // recovery model: bench Mon + Tue flags, Mon + Wed does not
 clearAll();selDay(0);addEx('Barbell bench press');selDay(1);
 ok(!q('#wstrip .warn'),'bench on Mon alone: no conflict');
 addEx('Barbell bench press');
 ok(dayBtn(1).classList.contains('warn')&&dayBtn(1).textContent.includes('⚠')&&!dayBtn(0).classList.contains('warn'),'bench Mon + Tue: the date strip shows ⚠ on Tue only');
 ok(/Mid and lower chest/.test(q('#plan .prow small.warn').textContent)&&/still recovering from Mon 12 Oct/.test(q('#plan .prow small.warn').textContent),'row note: "'+q('#plan .prow small.warn').textContent+'"');
 ok(!/Upper chest/.test(q('#plan .prow small.warn').textContent),'Upper chest (1.5 effective sets) is not flagged at 3 sets');
 ok(/1 exercise, 3 sets/.test(q('#plan').textContent),'singular exercise wording');
 ovOpen();
 ok(cell(GCHEST,1).dataset.c==='1'&&cell(GCHEST,1).textContent.includes('⚠')&&cell(GCHEST,1).dataset.e==='3'&&cell(GCHEST,0).dataset.c==='0','overview: Mid and lower chest on Tue is flagged (⚠), Mon is not');
 ok(/Mid and lower chest: 3 sets on Mon 12 Oct, still recovering on Tue 13 Oct/.test(cell(GCHEST,1).title),'cell tooltip: "'+cell(GCHEST,1).title+'"');
 ok(cell(GCHEST,1).dataset.f==='1.8'&&cell(GCHEST,0).dataset.f==='0','carry-over on Tue = 0.6 x 3 sets = 1.8, none on Mon');
 ok(/Recovery conflicts <b>1<\/b>/.test(q('#ovSum').innerHTML),'summary line counts the conflict: "'+q('#ovSum').textContent+'"');
 q('#ovClose').click();
 selDay(1);q('#plan [data-rm="0"]').click();selDay(2);addEx('Barbell bench press');
 ok(!q('#wstrip .warn'),'bench Mon + Wed: no conflict flagged for 3 sets');
 q('#plan [data-inc="0"]').click();selDay(0);q('#plan [data-inc="0"]').click();
 ok(!q('#wstrip .warn'),'bench Mon + Wed with 4 sets each: still no conflict');
 selDay(1);addEx('Barbell bench press');q('#plan [data-inc="0"]').click();
 ok(dayBtn(1).classList.contains('warn')&&dayBtn(2).classList.contains('warn')&&!dayBtn(0).classList.contains('warn'),'4-set bench on Mon, Tue and Wed flags Tue and Wed');
 clearAll();selDay(6);addEx('Barbell bench press');selDay(0);addEx('Barbell bench press');
 ok(!dayBtn(0).classList.contains('warn')&&!dayBtn(6).classList.contains('warn')&&!q('#wstrip .warn'),'the window does not wrap: bench on Sun and on the first date flags nothing');
 // overview open / close
 clearAll();selDay(0);addEx('Barbell bench press');addEx('Barbell row');selDay(3);addEx('Back squat');
 ok(q('#ov').hidden,'overview closed by default');
 q('#ovOpen').click();
 ok(!q('#ov').hidden&&q('#vp').contains(q('#ov'))&&d.activeElement===q('#ovClose'),'"Week overview" opens the overlay inside #vp and focuses its close button');
 ok(qa('#ovGrid tr.g').length===27&&qa('#ovGrid tr.g').every(r=>r.querySelectorAll('.cb').length===7&&r.querySelectorAll('.wb').length===1)&&qa('#ovGrid thead [data-oday]').length===7,'grid: 27 group rows x 7 date columns + a 7-day column, 7 date headers');
 ok(qa('#ovGrid thead [data-oday] .full').map(x=>x.textContent).join()==='Mon 12 Oct,Tue 13 Oct,Wed 14 Oct,Thu 15 Oct,Fri 16 Oct,Sat 17 Oct,Sun 18 Oct','the headers are the dates of the window');
 ok(qa('#ovGrid tr.sec th').map(t=>t.textContent).join()==='Upper push,Upper pull,Arms,Core,Lower body','rows grouped into Upper push / Upper pull / Arms / Core / Lower body');
 ok(qa('#ovGrid tr.g th.rl').map(t=>t.textContent).sort().join('|')===qa('#volsum tr').map(r=>r.cells[0].textContent.trim()).sort().join('|'),'overview rows are exactly the 27 weekly-table groups');
 ok(/Fatigue is a rough estimate/.test(q('#ov').textContent)&&q('#ovLeg').textContent.includes('Carried-over fatigue')&&q('#ovLeg').textContent.includes('still recovering'),'legend and note explain the fatigue overlay as an approximation');
 q('#ovClose').click();
 ok(q('#ov').hidden&&d.activeElement===q('#ovOpen'),'"Show body" closes it and returns focus to the opener');
 q('#ovOpen').click();d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 ok(q('#ov').hidden,'Escape closes the overview');
 q('#ovOpen').click();
 // cell values = e_g(d)
 const exp=(n,key,part,sets)=>sets*VF[lvl(n,key,part)];
 ok(+cell(GCHEST,0).dataset.e===exp('Barbell bench press','pectoralis major','sternocostal part',3)&&+cell(GCHEST,3).dataset.e===0,'Mid and lower chest: Mon = bench 3 sets x prime mover (3), Thu = 0');
 const rowOf=l=>qa('#ovGrid tr.g').find(r=>r.querySelector('th').textContent===l);
 ok(+rowOf('Quadriceps').querySelector('.cb[data-d="3"]').dataset.e===exp('Back squat','vastus lateralis','',3)&&+rowOf('Quadriceps').querySelector('.cb[data-d="0"]').dataset.e===0,'Quadriceps: Thu = back squat 3 sets x prime mover');
 ok(qa('#ovGrid tr.g').every(r=>{const v=rowVal(r.querySelector('th').textContent),dsum=qa('.cb',r).reduce((a,c)=>a+(+c.dataset.e),0);return Math.abs(v-(+r.querySelector('.wb').dataset.w))<1e-9&&v<=dsum+1e-9;}),'the 7-day column equals the weekly table for all 27 groups (and never exceeds the sum of the dates)');
 ok(+rowOf('Quadriceps').querySelector('.wb').dataset.w===3&&rowOf('Quadriceps').querySelector('.wb').className.includes('v0'),'the 7-day column carries the goal band class (3 of 8 sets = Low, v0)');
 ok(/Training days <b>2<\/b>/.test(q('#ovSum').innerHTML)&&/Total sets <b>9<\/b>/.test(q('#ovSum').innerHTML),'summary: 2 training days, 9 sets');
 cell(GCHEST,0).click();
 ok(/Mid and lower chest · Mon 12 Oct/.test(q('#ovDet').textContent)&&q('#ovDet').textContent.includes('Barbell bench press')&&cell(GCHEST,0).classList.contains('sel'),'clicking a cell lists the exercises that hit the group: '+q('#ovDet').textContent.slice(0,90));
 cell(GCHEST,1).click();
 ok(/not trained/.test(q('#ovDet').textContent)&&/Carry-over 1\.8 \(recovering/.test(q('#ovDet').textContent)&&/mostly from Mon 12 Oct/.test(q('#ovDet').textContent),'an untrained cell shows its carry-over: '+q('#ovDet').textContent);
 q('#ovGrid [data-oday="4"]').click();
 ok(dayBtn(4).getAttribute('aria-pressed')==='true'&&q('#dayLbl').textContent.includes('Friday 16 October'),'clicking a date header selects that date in the planner');
 selDay(1);addEx('Barbell bench press');
 ok(cell(GCHEST,1).dataset.c==='1'&&/Recovery conflicts <b>1<\/b>/.test(q('#ovSum').innerHTML),'overview updates live while open');
 q('#ovClose').click();
 // volume heatmap: 7 days / selected day
 const amberHex=new w.THREE.Color(d.documentElement.style.getPropertyValue('--m-fat')).convertSRGBToLinear(); // carried-over fatigue colour: the palette entry that also colours the legend swatch
 const amberOf=key=>{let n=0;w.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind==='muscle'&&(!key||o.userData.key===key)&&o.material.color&&Math.abs(o.material.color.r-amberHex.r)<1e-6&&Math.abs(o.material.color.g-amberHex.g)<1e-6)n++;});return n;};
 q('#tVol').checked=true;ev(q('#tVol'),'change');
 ok(!q('#volScope').hidden&&q('[data-vs="week"]').getAttribute('aria-pressed')==='true','volume mode shows the 7 days / Selected day toggle');
 q('[data-vs="day"]').click();selDay(1);
 ok(q('[data-vs="day"]').getAttribute('aria-pressed')==='true'&&/Still recovering/.test(q('#volLegend').textContent),'Selected day: the legend adds "Still recovering"');
 ok(amberOf('pectoralis major')===0&&amberOf()>0,'Tue trains chest: chest keeps its volume colour, other groups still recovering from Mon are amber ('+amberOf()+' meshes)');
 selDay(2);
 ok(amberOf('pectoralis major')>0,'Wed: chest (trained on Mon and Tue) shows the amber recovery material');
 q('[data-vs="week"]').click();
 ok(amberOf()===0&&!/Still recovering/.test(q('#volLegend').textContent),'7 days: no amber again');
 q('#tVol').checked=false;ev(q('#tVol'),'change');
 ok(q('#volScope').hidden,'toggle hidden when volume mode is off');
 // ---- planned exercises are marked wherever exercises are listed ----
 clearAll();selDay(0);
 q('[data-tab="ex"]').click();exItem('Back squat').click();
 qa('[data-var]').find(b=>b.textContent==='Wide').click();q('[data-act="add"]').click();
 q('[data-tab="wk"]').click();selDay(3);q('[data-tab="ex"]').click();
 qa('[data-var]').find(b=>b.textContent==='Shoulder-width').click();qa('[data-var]').find(b=>b.textContent==='Parallel').click();q('[data-act="add"]').click();
 q('[data-tab="wk"]').click();
 ok(JSON.stringify(itemsOf(0)[0].v)==='["Wide",""]'&&names(3).join()==='Back squat'&&itemsOf(3)[0].v.join('')==='','Back squat (Wide) on Mon, default Back squat on Thu');
 q('#volsum [data-key="adductor magnus"]').click();
 const xrow=t=>qa('#card .ext tbody tr').find(r=>r.querySelector('.exlink').textContent===t);
 let rb=xrow('Back squat'),rw=xrow('Back squat (Wide)');
 ok(rb&&rw,'adductor magnus card lists both the base and the Wide entry of Back squat');
 ok(rb.classList.contains('inplan')&&/In plan · Thu 15 Oct · 3 sets/.test(rb.querySelector('.pbadge').textContent),'base row marked: "'+(rb.querySelector('.pbadge')||{}).textContent+'"');
 ok(rw.classList.contains('inplan')&&/In plan · Mon 12 Oct · 3 sets/.test(rw.querySelector('.pbadge').textContent),'Wide row marked with Mon only: "'+(rw.querySelector('.pbadge')||{}).textContent+'"');
 ok(qa('#card .ext tbody tr').filter(r=>r.classList.contains('inplan')).length===2&&qa('#card .ext tbody tr').some(r=>!r.classList.contains('inplan')&&!r.querySelector('.pbadge')),'unplanned rows carry no mark');
 selDay(3);q('#plan [data-rm="0"]').click();
 rb=xrow('Back squat');rw=xrow('Back squat (Wide)');
 ok(!rb.classList.contains('inplan')&&/Planned as: Wide/.test(rb.querySelector('.pother').textContent)&&rw.classList.contains('inplan'),'only the Wide variation planned: the base row gets the subtle "Planned as: Wide", the Wide row stays marked (card re-rendered live)');
 selDay(0);q('#plan [data-inc="0"]').click();selDay(5);addEx('Back squat');
 rw=xrow('Back squat (Wide)');rb=xrow('Back squat');
 ok(/Mon 12 Oct · 4 sets/.test(rw.querySelector('.pbadge').textContent)&&/Sat 17 Oct · 3 sets/.test(rb.querySelector('.pbadge').textContent),'badges follow edits (Wide 4 sets on Mon, base on Sat)');
 selDay(5);q('#plan [data-rm="0"]').click();selDay(0);q('#plan [data-rm="0"]').click();
 ok(!qa('#card .ext tbody tr').some(r=>r.classList.contains('inplan')||r.querySelector('.pbadge')||r.querySelector('.pother')),'removing the exercises from the plan clears every mark');
 q('#card .close').click();
 selDay(1);addEx('Hip thrust');
 q('[data-tab="ex"]').click();q('#bestM').value='gluteus maximus';ev(q('#bestM'),'change');q('[data-sort="eff"]').click();
 const bl=qa('#best li').find(l=>l.querySelector('.exlink').textContent==='Hip thrust');
 ok(bl&&bl.classList.contains('inplan')&&bl.querySelector('.ptag')&&/Tue 13 Oct/.test(bl.querySelector('.ptag').title),'Best-for list marks the planned Hip thrust ("planned" tag)');
 ok(qa('#best li.inplan').every(l=>/^Hip thrust/.test(l.querySelector('.exlink').textContent)),'no other best-for entry is marked');
 ok(exItem('Hip thrust').classList.contains('inplan')&&!exItem('Back squat').classList.contains('inplan')&&/Tue 13 Oct/.test(exItem('Hip thrust').title),'exercise list marks Hip thrust only');
 q('[data-tab="wk"]').click();selDay(1);q('#plan [data-rm="0"]').click();
 ok(!exItem('Hip thrust').classList.contains('inplan')&&qa('#best li.inplan').length===0,'marks vanish when the exercise leaves the plan');
 clearAll();selDay(0);
}
// ---- gap filler: summary chips, top picks, alternatives, options, day placement ----
// ---- v1.8 / v2.0: training-session tracking (Start on a session, Today view = the session's log, progress marks, history) on a booted instance with an earlier finished session ----
async function logRun(){
 const seed={v:1,mig:1,seq:5,note:0,pattern:[],days:{'2020-01-02':[{id:'i1',name:'Old',items:[{n:'Barbell bench press',sets:2,v:[''],o:0}],ses:[],status:'done',startedAt:1,finishedAt:2,lg:{ex:[{n:'Barbell bench press',v:[''],o:0,sets:[{r:8,w:60,done:true},{r:6,w:65,done:true}]}],ses:[]}}]}};
 const w=boot({win:TODAY,store:{'aom.cal.v1':JSON.stringify(seed)}}),d=w.document,q=s=>d.querySelector(s),qa=s=>[...d.querySelectorAll(s)],ev=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
 await waitFor(()=>!d.getElementById('loading'),60000,'training log instance');
 const wk=()=>JSON.parse(w.localStorage.getItem('aom.cal.v1')||'null'),sess=dk=>((wk()||{days:{}}).days[dk]||[]).filter(x=>x.id),dayBtn=i=>q('#wstrip [data-day="'+i+'"]'),selDay=i=>dayBtn(i).click();
 const addEx=n=>{q('#qa').value=n.toLowerCase();ev(q('#qa'),'input');const b=qa('#addres [data-add]').find(b=>b.firstChild.textContent.trim()==='+ '+n);if(!ok(b,'search offers "'+n+'"')) return;b.click();};
 const tdo=()=>!q('#td').hidden,today=()=>sess(TODAY),train=()=>q('#sessList .scard.sel [data-sact="train"]');
 const prog=()=>q('#tdProg').textContent.replace(/\s+/g,' ').trim(),left=()=>q('#tdLeft').textContent.replace(/\s+/g,' ').trim();
 const blocks=()=>qa('#tdBody .tx'),setsOf=b=>[...b.querySelectorAll('.tset')],bn=b=>b.querySelector('.tn b').textContent;
 const setv=(el,v)=>{el.value=v;ev(el,'input');},esc=()=>d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 const runS=META.act.find(a=>a.id==='running').s;
 const confirms=[];let answer=true;w.confirm=m=>{confirms.push(m);return answer;};
 q('[data-tab="wk"]').click();
 ok(/1 finished/.test(q('#histSum').textContent)&&qa('#hist .hrow').length===1&&/Thu 2 Jan/.test(q('#hist .hrow').textContent),'History lists the finished session of 2 Jan 2020 ('+q('#histSum').textContent+')');
 addEx('Barbell bench press');addEx('Barbell row');q('#endOpen').click();[['#endAct','running'],['#endKind','easy'],['#endMin','45']].forEach(x=>{q(x[0]).value=x[1];ev(q(x[0]),'change');});q('#endAdd').click();
 ok(!train().disabled&&/Start/.test(train().textContent)&&today().length===1&&today()[0].status==='planned'&&!today()[0].lg,'the session card of today has a "▶ Start" button; nothing is logged yet ('+train().textContent+')');
 selDay(3);q('#addSess').click();
 ok(train().disabled,'an empty session cannot be started');
 q('#sessList [data-sact="rm"]').click();selDay(0);
 train().click();
 ok(tdo()&&q('#vp').contains(q('#td'))&&q('#td').classList.contains('ov')&&q('#ov').hidden,'Start opens the Today view over the viewport');
 ok(q('#tdTitle').textContent==='Session'&&/Today · Monday 12 October/.test(q('#tdDate').textContent)&&blocks().map(bn).join()==='Barbell bench press,Barbell row,Running','Today view: date, session name and one block per planned entry in schedule order ('+blocks().map(bn).join()+')');
 const bench=blocks()[0],row=blocks()[1],run0=blocks()[2];
 ok(setsOf(bench).length===3&&setsOf(row).length===3&&run0.classList.contains('e'),'one row per planned set (3 + 3) and an endurance block');
 const vals=b=>setsOf(b).map(r=>r.querySelector('[data-f="r"]').value+'x'+r.querySelector('[data-f="w"]').value).join(' ');
 ok(vals(bench)==='8x60 6x65 6x65'&&vals(row)==='x x x','sets are prefilled from the last finished session of the same exercise ('+vals(bench)+'), none for a new exercise ('+vals(row)+')');
 ok(prog()==='0 / 6 sets · 0 / 45 min'&&q('#tdProg').dataset.pct==='0'&&left()==='Still left: 2 exercises, 6 sets, '+runS+' 45′','progress "0 / 6 sets · 0 / 45 min", still left: "'+left()+'"');
 ok(bench.querySelector('input[data-f="r"]').getAttribute('inputmode')==='numeric'&&bench.querySelector('input[data-f="w"]').getAttribute('step')==='0.5'&&bench.querySelector('input[data-f="done"]').getAttribute('aria-label')!=='','set rows: done checkbox, numeric reps, weight with step 0.5, labelled');
 // done checkbox
 setsOf(bench)[0].querySelector('[data-f="done"]').click();
 ok(prog()==='1 / 6 sets · 0 / 45 min'&&setsOf(bench)[0].classList.contains('done')&&bench.querySelector('.tcnt').textContent==='1/3'&&q('#tdProg').dataset.pct==='11','checking a set updates the progress ('+prog()+', '+q('#tdProg').dataset.pct+' %)');
 let L=today()[0];
 ok(L&&L.lg&&L.startedAt>0&&!L.finishedAt&&L.status==='planned'&&L.lg.ex.length===2&&L.lg.ses.length===1&&L.lg.ex[0].sets[0].done===true&&L.lg.ex[0].sets[0].r===8&&L.lg.ex[0].sets[0].w===60,'saved in the session in aom.cal.v1 (date '+TODAY+'): start time, prefilled reps/weight persisted');
 // reps / weight entry marks a set done
 setv(setsOf(row)[0].querySelector('[data-f="r"]'),'10');
 ok(setsOf(row)[0].classList.contains('done')&&setsOf(row)[0].querySelector('[data-f="done"]').checked&&prog().startsWith('2 / 6'),'entering reps marks the set done');
 setv(setsOf(row)[1].querySelector('[data-f="w"]'),'42.5');
 L=today()[0];
 ok(prog().startsWith('3 / 6')&&L.lg.ex[1].sets[0].r===10&&L.lg.ex[1].sets[0].done&&L.lg.ex[1].sets[1].w===42.5&&L.lg.ex[1].sets[1].done&&L.lg.ex[1].sets[2].done===false,'entering a weight (42.5 kg) marks the set done and persists');
 // unchecking
 setsOf(row)[1].querySelector('[data-f="done"]').click();
 ok(prog().startsWith('2 / 6')&&today()[0].lg.ex[1].sets[1].done===false&&today()[0].lg.ex[1].sets[1].w===42.5,'unchecking a set keeps its values');
 // extra and fewer sets
 row.querySelector('[data-act="addset"]').click();
 ok(setsOf(blocks()[1]).length===4&&prog().startsWith('2 / 7')&&today()[0].lg.ex[1].sets.length===4&&setsOf(blocks()[1])[3].querySelector('[data-f="r"]').value==='','"+ Add set" adds a row (7 sets in total, saved)');
 setsOf(blocks()[1])[3].querySelector('[data-act="rmset"]').click();
 ok(setsOf(blocks()[1]).length===3&&prog().startsWith('2 / 6'),'remove-set drops it again');
 // skip an exercise
 blocks()[0].querySelector('[data-act="skip"]').click();
 ok(blocks()[0].classList.contains('skip')&&prog().startsWith('1 / 3 sets')&&left()==='Still left: 1 exercise, 2 sets, '+runS+' 45′'&&today()[0].lg.ex[0].skip===true,'skipping an exercise removes it from progress and "still left" ('+prog()+' | '+left()+')');
 blocks()[0].querySelector('[data-act="skip"]').click();
 ok(!blocks()[0].classList.contains('skip')&&prog().startsWith('2 / 6')&&!today()[0].lg.ex[0].skip,'skip can be undone');
 // endurance: done + actual minutes + heart rate
 const run=blocks()[2],act=run.querySelector('[data-f="act"]'),hr=run.querySelector('[data-f="hr"]');
 ok(act.placeholder==='45'&&run.querySelector('.pl')&&run.querySelector('.tzone').textContent==='','endurance block: pill, planned minutes as placeholder, no zone text yet');
 setv(act,'40');
 L=today()[0];
 ok(prog()==='2 / 6 sets · 40 / 45 min'&&run.querySelector('[data-f="done"]').checked&&L.lg.ses[0].act===40&&L.lg.ses[0].done===true&&L.lg.ses[0].min===45&&L.lg.ses[0].a==='running'&&!/Run/.test(left()),'actual minutes mark the session done ('+prog()+')');
 const hm=d.getElementById('hrMax');hm.value='190';ev(hm,'change');
 setv(hr,'150');
 ok(today()[0].lg.ses[0].hr===150&&/Z3/.test(run.querySelector('.tzone').textContent)&&/bpm/.test(run.querySelector('.tzone').textContent),'average heart rate is shown with its zone ('+run.querySelector('.tzone').textContent+')');
 // finish the strength sets so the session is complete
 qa('#tdBody .tset [data-f="done"]').filter(c=>!c.checked).forEach(c=>c.click());
 ok(prog()==='6 / 6 sets · 40 / 45 min'&&/Everything is done/.test(q('#tdLeft').textContent)&&q('#tdProg').dataset.pct==='100'&&blocks().every(b=>b.classList.contains('done')),'all done: 100 %, "Everything is done"');
 ok(q('#tdFinish').textContent==='Finish session','Finish session button while unfinished');
 q('#tdFinish').click();
 L=today()[0];
 ok(!tdo()&&L.finishedAt>0&&L.status==='done','Finish session stores finishedAt, status "done" and closes');
 const pd0=q('#wstrip [data-day="0"] .pl.se.s-done');
 ok(pd0&&/^✓\s*Session$/.test(pd0.textContent.trim())&&pd0.querySelector('u').style.width==='100%'&&/done/.test(pd0.title)&&/6\/6/.test(pd0.title),'date card shows a done chip with a full progress line: "'+(pd0&&pd0.textContent.trim())+'", '+(pd0&&pd0.title));
 ok(/View/.test(train().textContent)&&/done/.test(q('#sessList .scard.sel .schip').textContent),'the session card now says "View" and "done" ('+train().textContent+', '+q('#sessList .scard.sel .schip').textContent.trim()+')');
 ok(qa('#hist .hrow').length===2&&qa('#hist .hrow')[0].dataset.k===TODAY&&/6\/6 sets/.test(qa('#hist .hrow')[0].textContent)&&/finished/.test(qa('#hist .hrow')[0].textContent)&&/2 finished/.test(q('#histSum').textContent),'History lists today\'s session first ('+qa('#hist .hrow')[0].textContent+')');
 ok(/done/.test(dayBtn(0).title)&&dayBtn(0).classList.contains('today'),'the date card title names the session state');
 // board column: progress mark; a finished session is a line that reopens it
 q('#ovOpen').click();
 const bh=q('#ovBoard .bcol[data-d="0"] .bh3');
 ok(bh&&/^✓\s*6\/6$/.test(bh.querySelector('.bpd').textContent.trim())&&!bh.querySelector('[data-bact="train"]')&&!q('#ovBoard .bcol[data-d="3"] .bh3'),'schedule board: progress mark in the header of a finished session, no Train button for it, none on an empty date');
 q('#ovBoard .bcol[data-d="0"] .bsess').click();
 ok(tdo()&&q('#ov').hidden&&q('#tdTitle').textContent==='Session'&&q('#tdFinish').textContent==='Close'&&/Finished at/.test(q('#tdState').textContent),'the finished-session line in a board column closes the overview and reopens the log (edits still allowed)');
 q('#tdClose').click();
 ok(!tdo()&&d.activeElement&&d.activeElement.classList.contains('strain'),'Show body closes the Today view and returns focus ('+(d.activeElement&&d.activeElement.className)+')');
 // history reopens a session; Escape closes; an old session opens as well
 qa('#hist .hrow').find(b=>b.dataset.k==='2020-01-02').click();
 ok(tdo()&&q('#tdTitle').textContent==='Old'&&!/Today/.test(q('#tdDate').textContent)&&/Thursday 2 January/.test(q('#tdDate').textContent)&&prog()==='2 / 2 sets'&&blocks().length===1,'History opens an older session ('+q('#tdDate').textContent+', '+prog()+')');
 setv(setsOf(blocks()[0])[1].querySelector('[data-f="w"]'),'67.5');
 ok(sess('2020-01-02')[0].lg.ex[0].sets[1].w===67.5,'an old session is editable');
 esc();
 ok(!tdo(),'Escape closes the Today view');
 train().click();
 const ri=setsOf(blocks()[1])[0].querySelector('[data-f="r"]');ri.focus();ri.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 ok(!tdo(),'Escape also closes it while typing in a field');
 // Sync with plan: Edit on the finished session, then add an exercise to it
 selDay(0);q('#sessList .scard.sel [data-sact="edit"]').click();addEx('Back squat');
 train().click();q('#tdSync').click();
 ok(blocks().length===4&&blocks()[3].querySelector('.tn b').textContent==='Back squat'&&/Added 1/.test(q('#tdMsg').textContent)&&today()[0].lg.ex.length===3,'"Sync with plan" pulls a newly planned exercise into the log');
 q('#tdSync').click();
 ok(blocks().length===4&&/in sync/.test(q('#tdMsg').textContent),'a second sync adds nothing');
 q('#tdClose').click();
 // a log stays independent of later plan edits
 selDay(0);q('#plan [data-rm="0"]').click();
 train().click();
 ok(blocks().map(bn).includes('Barbell bench press')&&blocks().length===4,'the log keeps what was planned at start when the plan changes later');
 q('#tdClose').click();
 // several sessions on one date, each with its own log; no confirmation is needed
 q('#addSess').click();addEx('Overhead press');
 ok(qa('#sessList .scard').length===2&&sess(TODAY).length===2,'a second session on the same date');
 confirms.length=0;train().click();
 L=sess(TODAY)[1];
 ok(confirms.length===0&&tdo()&&L.lg.ex.length===1&&L.lg.ex[0].n==='Overhead press'&&!L.finishedAt&&sess(TODAY)[0].finishedAt>0&&q('#tdTitle').textContent==='Session','starting the second session of a date needs no confirm and does not touch the first one\'s log');
 q('#tdClose').click();
 ok(qa('#hist .hrow').length===2&&qa('#wstrip [data-day="0"] .pl.se').length===2&&qa('#wstrip [data-day="0"] .pl.se.s-doing').length===1,'the date card shows both sessions (one done, one in progress)');
 // garbage in storage does not break anything
 w.close();
 {
  const bad=boot({win:TODAY,store:{'aom.cal.v1':'{bad json'}}),bd=bad.document;
  await waitFor(()=>!bd.getElementById('loading'),60000,'corrupt calendar instance');
  ok(!bad.__fatal&&bd.querySelectorAll('#wstrip [data-day]').length===7&&bd.querySelectorAll('#sessList .scard').length===0,'a corrupt calendar is ignored: an empty calendar, no crash');
  bad.close();
  const cal={v:1,mig:1,seq:0,pattern:[{id:'p1',tid:'nope',wd:[0],from:'2021-02-01'},7],days:{'nope':[{id:'x'}],'2021-02-03':[{id:'a',name:'  x  ',status:'zzz',items:[{n:'Back squat',sets:3,v:[]},{n:'No such exercise',sets:3},{n:'constructor',sets:3}],ses:[{a:'running',k:'bogus',min:9999},{a:'nonexistent'}],lg:{ex:[{n:'A',sets:[{r:-3,w:'abc',done:1},{r:12}]},7,{sets:[]}],ses:[{a:'nonexistent'},{a:'running',k:'bogus',min:9999}]}},{id:'a',name:'dup'},7,{pid:'p1',status:'removed'},{status:'removed'}]}};
  const y=boot({win:'2021-02-01',store:{'aom.cal.v1':JSON.stringify(cal)}}),yd=y.document;
  await waitFor(()=>!yd.getElementById('loading'),60000,'malformed calendar instance');
  yd.querySelector('#addSess').click();   // any change writes the cleaned calendar back
  const sc=JSON.parse(y.localStorage.getItem('aom.cal.v1')),ds=sc.days['2021-02-03'];
  ok(!y.__fatal&&Object.keys(sc.days).sort().join()==='2021-02-01,2021-02-03'&&sc.pattern.length===0&&ds.filter(x=>x.id).length===2&&ds.filter(x=>x.id).every((x,i,a)=>a.findIndex(z=>z.id===x.id)===i)&&ds.some(x=>x.status==='removed'&&x.pid==='p1')&&ds.length===3,'malformed calendar entries are cleaned on load (bad date, dangling pattern row, duplicate ids, tombstone kept)');
  const A=ds.find(x=>x.name==='x');
  ok(A&&A.status==='planned'&&A.items.length===1&&A.items[0].n==='Back squat'&&A.ses.length===1&&A.ses[0].k==='easy'&&A.ses[0].min===45&&A.lg.ex.length===1&&A.lg.ex[0].sets.length===2&&A.lg.ex[0].sets[0].r===undefined&&A.lg.ex[0].sets[0].done===true&&A.lg.ses.length===1&&A.lg.ses[0].k==='easy'&&A.lg.ses[0].min===45,'... and so are the session values (unknown exercise or activity, kind and minutes fall back, set values, status)');
  y.close();
 }
}
async function sugRun(){
 const numOf=x=>parseFloat(x),rowVal=n=>{const r=qa('#volsum tr').find(r=>r.cells[0].textContent.trim()===n);return r?parseFloat(r.cells[2].textContent):NaN;};
 const exOf=n=>META.ex.find(e=>e.n===n);
 const goal=g=>{q('#goalSel').value=g;ev(q('#goalSel'),'change');};
 const chips=()=>qa('#sug [data-gap]').filter(b=>!['all','more'].includes(b.dataset.gap));
 const chip=l=>qa('#sug [data-gap]').find(b=>b.firstChild.textContent.trim()===l);
 const more=()=>{const b=q('#sug [data-gap="more"]');if(b&&/^\+/.test(b.textContent))b.click();};
 const cards=()=>qa('#sug li.sg'),nm=c=>c.querySelector('.exlink').textContent;
 const inc=s=>(s.match(/\+([\d.]+)/g)||[]).reduce((a,x)=>a+parseFloat(x.slice(1)),0);
 q('[data-tab="wk"]').click();clearAll();selDay(0);goal('maintain');
 addEx('Back squat');addEx('Barbell bench press');q('#plan [data-inc="0"]').click();
 // gap chips
 more();
 const vols=qa('#volsum tr').map(r=>[r.cells[0].textContent.trim(),parseFloat(r.cells[2].textContent)]),under=vols.filter(x=>x[1]<4);
 ok(under.length>0&&under.length<27,'maintain goal (4 sets): '+under.length+' of 27 groups are below target');
 ok(chips().map(b=>b.firstChild.textContent.trim()).sort().join('|')===under.map(x=>x[0]).sort().join('|'),'gap chips are exactly the groups under target');
 ok(chips().every(b=>{const m=b.querySelector('b').textContent.match(/^([\d.]+) \/ 4$/);return m&&Math.abs(+m[1]-rowVal(b.firstChild.textContent.trim()))<0.05;}),'each chip shows "sets / target" matching the weekly table');
 const cv=chips().map(b=>parseFloat(b.querySelector('b').textContent));
 ok(cv.every((x,k)=>!k||x>=cv[k-1]),'chips are sorted by deficit (fewest sets first)');
 ok(qa('#sug .sgt')[0].textContent==='Top picks'&&q('[data-gap="all"]').getAttribute('aria-pressed')==='true','"Top picks" heading, "All gaps" pressed');
 // top picks: day, reason, equipment
 const c0=cards()[0];
 ok(cards().length>=1&&cards().length<=3&&/^(⚠ )?[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2} · (no recovery conflict|rest day, no recovery conflict|still overlaps recovery)$/.test(c0.querySelector('.dy').textContent),'top pick shows its day and why: "'+c0.querySelector('.dy').textContent+'"');
 ok(/^(Prime mover|Synergist) for /.test(c0.querySelector('.rsn').textContent)&&/^\+ Add to [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}/.test(c0.querySelector('[data-sadd]').textContent),'top pick shows a reason ("'+c0.querySelector('.rsn').textContent+'") and "+ Add to <date>"');
 ok(q('#sugMore').open&&qa('#sugMore .alt').length===under.length&&qa('#sugMore .altr').length>=qa('#sugMore .alt').length,'"More options" is open on desktop with a block per gap group');
 // filter by a chip: only prime movers of that group
 const HAMS=['biceps femoris','semitendinosus','semimembranosus'];
 ok(!!chip('Hamstrings'),'Hamstrings is a gap');
 chip('Hamstrings').click();
 ok(q('#sug .sgt').textContent==='Best for Hamstrings'&&chip('Hamstrings').getAttribute('aria-pressed')==='true'&&cards().length>=2&&cards().length<=4,'chip filters to "Best for Hamstrings" ('+cards().map(nm).join(', ')+')');
 ok(cards().every(c=>exOf(nm(c)).t.some(t=>HAMS.includes(t[0])&&t[2]===3)),'every option trains hamstrings as prime mover');
 ok(new Set(cards().map(c=>exOf(nm(c)).eq[0])).size>=2,'options use different equipment where possible ('+cards().map(c=>exOf(nm(c)).eq[0]).join(', ')+')');
 ok(!cards().some(c=>plan().some(p=>p.n===nm(c))),'planned exercises are not offered');
 q('[data-gap="all"]').click();
 ok(q('#sug .sgt').textContent==='Top picks'&&!!q('#sugMore'),'"All gaps" resets the filter');
 // alternatives exclude planned exercises and respect the equipment filter
 ok(qa('#sugMore .altr').every(c=>!plan().some(p=>p.n===nm(c))),'alternatives exclude planned exercises');
 q('[data-eq="Barbell"]').click();
 ok(qa('#sug .exlink').length>0&&qa('#sug .exlink').every(b=>exOf(b.textContent).eq.some(c=>c!=='Barbell')),'with Barbell off, no suggestion or alternative needs a barbell');
 q('#eqAll').click();
 ok(qa('#sugMore .altr').some(c=>exOf(nm(c)).eq[0]==='Barbell'),'with all equipment on, barbell options appear again');
 // sets stepper and "+N"
 goal('hyp10');
 more();
 chip('Hamstrings').click();
 let c1=cards()[0];const n3=inc(c1.querySelector('small').textContent),name1=nm(c1);
 ok(c1.querySelector('.step span').textContent==='3 sets'&&n3>0,'default 3 sets, "+N" = '+n3);
 c1.querySelector('[data-ss$=":1"]').click();cards()[0].querySelector('[data-ss$=":1"]').click();
 c1=cards()[0];
 ok(nm(c1)===name1&&c1.querySelector('.step span').textContent==='5 sets'&&inc(c1.querySelector('small').textContent)>n3,'sets stepper 3 -> 5 raises the "+N" numbers ('+n3+' -> '+inc(c1.querySelector('small').textContent)+')');
 for(let k=0;k<5;k++) cards()[0].querySelector('[data-ss$=":1"]').click();
 ok(cards()[0].querySelector('.step span').textContent==='6 sets'&&cards()[0].querySelector('[data-ss$=":1"]').disabled,'stepper stops at 6');
 for(let k=0;k<8;k++) cards()[0].querySelector('[data-ss$=":-1"]').click();
 ok(cards()[0].querySelector('.step span').textContent==='1 sets'&&cards()[0].querySelector('[data-ss$=":-1"]').disabled,'stepper stops at 1');
 for(let k=0;k<4;k++) cards()[0].querySelector('[data-ss$=":1"]').click();
 c1=cards()[0];const sd=+c1.querySelector('[data-sadd]').dataset.sday,label=c1.querySelector('[data-sadd]').textContent;
 ok(c1.querySelector('.step span').textContent==='5 sets'&&label==='+ Add to '+dLab(D(sd)),'button names the target date: "'+label+'"');
 c1.querySelector('[data-sadd]').click();
 const it=itemsOf(sd).find(p=>p.n===name1);
 ok(it&&it.sets===5&&dayBtn(sd).getAttribute('aria-pressed')==='true','the 5-set entry landed on the shown date ('+dLab(D(sd))+'), which is now selected');
 // variation select
 let found=null;
 for(const ch of chips()){ const gl=ch.firstChild.textContent.trim(); chip(gl).click(); const c=cards().find(c=>c.querySelector('select.sv')); if(c){found=c;break;} }
 if(ok(found,'some suggestion offers a variation select')){
  const fn=nm(found),sel=found.querySelector('select.sv'),gi=+sel.dataset.sv.split(':')[1],opts=exOf(fn).v[gi][1];
  sel.value=String(opts.length-1);ev(sel,'change');
  const f2=cards().find(c=>nm(c)===fn),sd2=+f2.querySelector('[data-sadd]').dataset.sday;
  ok(f2.querySelector('select.sv').value===String(opts.length-1),'variation select keeps the choice after re-render');
  f2.querySelector('[data-sadd]').click();
  const it2=itemsOf(sd2).find(p=>p.n===fn);
  ok(it2&&it2.v[gi]===opts[opts.length-1][0],'adding stores the chosen variation: '+fn+' / '+(it2&&JSON.stringify(it2.v)));
 }
 // hover preview on the body
 q('[data-gap="all"]').click();
 const grey=()=>{let n=0;w.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind==='muscle'&&o.material.opacity<0.2)n++;});return n;};
 if(!q('#exClear').disabled) q('#exClear').click();
 const g0=grey(),sg=cards()[0];
 sg.dispatchEvent(new w.MouseEvent('mouseover',{bubbles:true}));
 ok(g0===0&&grey()>100,'hovering a suggestion previews its muscles on the body (others greyed: '+grey()+' meshes)');
 sg.dispatchEvent(new w.MouseEvent('mouseout',{bubbles:true,relatedTarget:q('#sug')}));
 ok(grey()===0,'leaving restores the previous view');
 // placement: chest trained on Mon -> chest exercises are not put on Tue (the window does not wrap, so Sun is free)
 goal('hyp8');clearAll();selDay(0);addEx('Barbell bench press');
 more();
 chip('Mid and lower chest').click();
 const days4=cards().map(c=>+c.querySelector('[data-sadd]').dataset.sday);
 ok(cards().length>=2&&days4.every(x=>x!==1),'chest options never land the day after the bench day (Tue): slots '+days4.join(','));
 ok(cards().every(c=>!/⚠|overlaps/.test(c.querySelector('.dy').textContent)),'and are shown without a recovery warning');
 cards()[0].querySelector('[data-sadd]').click();
 ok(!q('#wstrip .warn'),'adding the first chest option creates no conflict');
 // a rest day is used (and said so) when training days would overlap
 clearAll();selDay(0);addEx('Barbell bench press');selDay(1);addEx('Barbell row');selDay(2);addEx('Back squat');selDay(3);addEx('Romanian deadlift');
 q('[data-gap="all"]').click();
 chip('Mid and lower chest')&&chip('Mid and lower chest').click();
 ok(!chip('Mid and lower chest')||cards().every(c=>+c.querySelector('[data-sday]').dataset.sday!==1),'with Mon-Thu trained, chest work is not offered for Tue');
 // empty state + balance check
 clearAll();selDay(0);
 q('#goalSel').value='custom';ev(q('#goalSel'),'change');q('#goalLo').value='1';ev(q('#goalLo'),'change');q('#goalHi').value='40';ev(q('#goalHi'),'change');
 let guard=0;while(q('#sug li.sg [data-sadd]')&&guard++<40) q('#sug li.sg [data-sadd]').click();
 ok(/Every muscle group is at or above its target\./.test(q('#sug').textContent)&&!q('#sug [data-gap]'),'no gaps: "Every muscle group is at or above its target", no chips');
 selDay(0);addEx('Barbell bench press');selDay(1);addEx('Barbell bench press');
 ok(/Balance check/.test(q('#sug').textContent)&&/still recovering on Tue 13 Oct/.test(q('#sug').textContent),'with no gaps but a recovery conflict, a "Balance check" line explains it: '+(q('#sug .fine b')?q('#sug').textContent.slice(0,160):''));
 goal('hyp8');clearAll();selDay(0);
}
// ---- v2.0 calendar: migration of the 7-slot week and the log, weekly pattern (virtual sessions), edit / remove / move / skip, several sessions on a date, templates, the movable 7-day window ----
async function calRun(){
 const plan3={days:[{name:'Push',items:[{n:'Barbell bench press',sets:5,v:['']},{t:'e',a:'running',k:'easy',min:45}]},{name:'',items:[]},{name:'Legs',items:[{n:'Back squat',sets:3,v:['Wide','Deep']}]},{name:'Pull',items:[{n:'Pull-up',sets:4,v:['']}]}]};
 const log3={
  '2026-10-09':{d:3,name:'Pull',startedAt:4,ex:[{n:'Pull-up',v:[''],o:0,sets:[{done:false}]}],ses:[]},
  '2026-10-10':{d:2,name:'Legs',startedAt:5,finishedAt:9,ex:[{n:'Back squat',v:['Wide','Deep'],o:0,sets:[{r:5,w:100,done:true},{r:5,w:100,done:true},{done:false}]}],ses:[]},
  '2026-10-11':{d:0,name:'Morning run',startedAt:3,ex:[],ses:[{a:'running',k:'easy',min:30,o:0,done:true,act:28}]}};
 const P3=JSON.stringify(plan3),L3=JSON.stringify(log3);
 const w=boot({store:{'aom.plan.v3':P3,'aom.log.v1':L3}}),d=w.document,q=s=>d.querySelector(s),qa=s=>[...d.querySelectorAll(s)],ev=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
 await waitFor(()=>!d.getElementById('loading'),60000,'calendar instance');
 const wk=()=>JSON.parse(w.localStorage.getItem('aom.cal.v1')||'null'),tpls=()=>JSON.parse(w.localStorage.getItem('aom.tpl.v1')||'[]'),sess=dk=>((wk()||{days:{}}).days[dk]||[]).filter(x=>x.id),raw=dk=>(wk().days[dk]||[]);
 const card=dk=>q('#wstrip [data-date="'+dk+'"]'),dates=()=>qa('#wstrip [data-day]').map(b=>b.dataset.date),pickDate=dk=>card(dk).click();
 const rowVal=n=>{const r=qa('#volsum tr').find(r=>r.cells[0].textContent.trim()===n);return r?parseFloat(r.cells[2].textContent):NaN;};
 const sc=()=>qa('#sessList .scard'),scNames=()=>sc().map(c=>c.querySelector('.snm').textContent).join('|'),btn=(c,a)=>c.querySelector('[data-sact="'+a+'"]');
 const addEx=n=>{q('#qa').value=n.toLowerCase();ev(q('#qa'),'input');const b=qa('#addres [data-add]').find(b=>b.firstChild.textContent.trim()==='+ '+n);if(!ok(b,'search offers "'+n+'"')) return;b.click();};
 const bal=b=>q('#bal [data-b="'+b+'"]');
 const confirms=[];let answer=true;w.confirm=m=>{confirms.push(m);return answer;};
 q('[data-tab="wk"]').click();
 // ---- migration ----
 const T=tpls(),C=wk();
 ok(T.map(t=>t.name).join()==='Push,Legs,Pull'&&T[0].items.length===1&&T[0].items[0].sets===5&&T[0].ses.length===1&&T[0].ses[0].a==='running'&&JSON.stringify(T[1].items[0].v)==='["Wide","Deep"]','migration: every non-empty day of aom.plan.v3 became a template with its name (the empty Day 2 did not): '+T.map(t=>t.name+' '+t.items.length+'+'+t.ses.length).join(', '));
 ok(C.pattern.length===3&&C.pattern.map(p=>p.wd.join()).join('|')==='0|2|3'&&C.pattern.every(p=>p.from==='2026-10-12')&&C.pattern.map(p=>p.tid).join()===T.map(t=>t.id).join(),'... and a pattern maps Day 1/3/4 to Monday/Wednesday/Thursday, from the Monday of the current week (2026-10-12)');
 ok(Object.keys(C.days).sort().join()==='2026-10-09,2026-10-10,2026-10-11'&&C.mig===1&&C.note===1,'... every log entry became a stored session on its date; note=1 (one-time notice pending)');
 const lgS=C.days['2026-10-10'][0],runS=C.days['2026-10-11'][0],pullS=C.days['2026-10-09'][0];
 ok(lgS.status==='done'&&lgS.finishedAt===9&&lgS.tid===T[1].id&&lgS.name==='Legs'&&lgS.lg.ex[0].sets.length===3&&lgS.items[0].sets===3&&JSON.stringify(lgS.items[0].v)==='["Wide","Deep"]','a finished log became a "done" session linked to the template of the same name (Legs)');
 ok(runS.status==='done'&&!runS.finishedAt&&!runS.tid&&runS.lg.ses[0].act===28&&pullS.status==='planned'&&pullS.tid===T[2].id&&!pullS.finishedAt,'a log with something done is "done" (no template named "Morning run"); a started log with nothing done stays "planned"');
 ok(w.localStorage.getItem('aom.plan.v3')===P3&&w.localStorage.getItem('aom.log.v1')===L3,'the old keys aom.plan.v3 and aom.log.v1 are untouched (rollback)');
 ok(!q('#migNote').hidden&&/first day repeats every Monday/.test(q('#migNote').textContent),'the Workout tab shows the one-time notice about the Monday..Sunday mapping');
 q('#migOk').click();
 ok(q('#migNote').hidden&&wk().note===0,'"Got it" dismisses the notice for good');
 // ---- default window: the 7 days ending today; past dates show only stored sessions, today and later the pattern ----
 ok(dates().join()==='2026-10-06,2026-10-07,2026-10-08,2026-10-09,2026-10-10,2026-10-11,2026-10-12'&&q('#winDate').value==='2026-10-06'&&w.localStorage.getItem('aom.win.v1')===null&&/ending today/.test(q('#winLbl').textContent),'default window = the 7 days ending today (6..12 Oct); nothing stored in aom.win.v1');
 ok(card('2026-10-12').classList.contains('today')&&qa('#wstrip [data-day="6"] .pl.se.s-planned').length===1&&/Push/.test(card('2026-10-12').textContent)&&q('#dayLbl').textContent.includes('Monday 12 October'),'today shows the pattern session "Push" (virtual) and is selected');
 ok(card('2026-10-10').querySelector('.pl.se.s-done')&&card('2026-10-11').querySelector('.pl.se.s-doing')&&card('2026-10-09').querySelector('.pl.se.s-doing')&&['2026-10-06','2026-10-07','2026-10-08'].every(k=>card(k).classList.contains('rest')),'past dates show stored sessions only (one finished, two unfinished logs in progress); the rest are empty');
 ok(JSON.stringify(Object.keys(wk().days).sort())==='["2026-10-09","2026-10-10","2026-10-11"]','a virtual session is not stored while untouched');
 // volume of the window = done (past) + planned (today and later)
 ok(rowVal('Mid and lower chest')===5&&rowVal('Quadriceps')===2&&rowVal('Lats')===0,'window volume: today\'s planned bench 5 sets, the finished squat counts the 2 sets done (not 3), the pull-up of Fri, started but with nothing done, adds nothing ('+rowVal('Mid and lower chest')+', '+rowVal('Quadriceps')+', '+rowVal('Lats')+')');
 ok(bal('who').dataset.v==='73'&&bal('str').dataset.sets==='7','balance: done run 28 min (actual) + planned easy run 45 min = 73; strength 5 + 2 sets');
 // opening a finished session of a past date in the Today view
 pickDate('2026-10-10');
 ok(scNames()==='Legs'&&/done/.test(sc()[0].querySelector('.schip').textContent)&&/View/.test(btn(sc()[0],'train').textContent),'selecting a past date lists its session: Legs, done, "View"');
 btn(sc()[0],'train').click();
 ok(!q('#td').hidden&&/^Saturday 10 October$/.test(q('#tdDate').textContent)&&q('#tdTitle').textContent==='Legs'&&q('#tdProg').textContent.replace(/\s+/g,' ').trim()==='2 / 3 sets'&&q('#tdFinish').textContent==='Close','Today view on a past session: its own date (no "Today"), 2 / 3 sets, Close');
 q('#tdClose').click();
 // ---- the window: +-1 / +-7 days, date input, Last / Next 7 days, persistence only when moved ----
 q('[data-win="1"]').click();
 ok(dates()[0]==='2026-10-07'&&dates()[6]==='2026-10-13'&&q('#winDate').value==='2026-10-07'&&JSON.parse(w.localStorage.getItem('aom.win.v1'))==='2026-10-07'&&!/ending today/.test(q('#winLbl').textContent),'forward 1 day: 7..13 Oct, stored in aom.win.v1');
 q('[data-win="-7"]').click();
 ok(dates()[0]==='2026-09-30'&&dates()[6]==='2026-10-06'&&JSON.parse(w.localStorage.getItem('aom.win.v1'))==='2026-09-30','back 7 days: 30 Sep..6 Oct');
 ok(card('2026-10-05').classList.contains('rest')&&scNames()==='','a past Monday has no pattern session (past dates show stored sessions only); the selection stays inside the window ('+q('#dayLbl').textContent+')');
 q('#winDate').value='2026-10-01';ev(q('#winDate'),'change');
 ok(dates()[0]==='2026-10-01'&&JSON.parse(w.localStorage.getItem('aom.win.v1'))==='2026-10-01','the date input sets the first day of the window');
 q('#winDate').value='';ev(q('#winDate'),'change');
 ok(dates()[0]==='2026-10-01','an empty date is ignored');
 q('#winNext').click();
 ok(dates().join()===[0,1,2,3,4,5,6].map(k=>D(k)).join()&&JSON.parse(w.localStorage.getItem('aom.win.v1'))===TODAY&&q('#dayLbl').textContent.includes('Monday 12 October'),'"Next 7 days": the window starts today (stored), today selected');
 q('#winLast').click();
 ok(dates()[6]===TODAY&&w.localStorage.getItem('aom.win.v1')===null&&/ending today/.test(q('#winLbl').textContent),'"Last 7 days": back to the default window; the stored start is removed');
 // ---- pattern sessions on future dates are virtual until touched ----
 q('#winNext').click();
 ok(['2026-10-12','2026-10-14','2026-10-15'].every(k=>card(k).querySelector('.pl.se.s-planned'))&&/Push/.test(card('2026-10-12').textContent)&&/Legs/.test(card('2026-10-14').textContent)&&/Pull/.test(card('2026-10-15').textContent)&&!card('2026-10-13').querySelector('.pl.se'),'Next 7 days: Push on Mon, Legs on Wed, Pull on Thu (from the pattern)');
 ok(JSON.stringify(Object.keys(wk().days).sort())==='["2026-10-09","2026-10-10","2026-10-11"]','... and still nothing is stored for them');
 const patBefore=JSON.stringify(wk().pattern),tplBefore=JSON.stringify(tpls());
 pickDate('2026-10-14');
 ok(scNames()==='Legs'&&/weekly pattern/.test(sc()[0].textContent)&&qa('#plan .prow').length===1&&q('#plan .step span').textContent==='3 sets','Wed: the session "Legs" from the pattern, 3 sets');
 q('#plan [data-inc="0"]').click();
 {const S=raw('2026-10-14');
  ok(S.length===1&&S[0].id&&S[0].pid===wk().pattern[1].id&&S[0].tid===tpls()[1].id&&S[0].items[0].sets===4&&S[0].name==='Legs','editing the generated session stores it (with its pattern id): 4 sets');
  ok(JSON.stringify(wk().pattern)===patBefore&&JSON.stringify(tpls())===tplBefore&&tpls()[1].items[0].sets===3,'... and changes neither the template nor the pattern');}
 q('[data-win="7"]').click();pickDate('2026-10-21');
 ok(scNames()==='Legs'&&q('#plan .step span').textContent==='3 sets'&&raw('2026-10-21').length===0,'a week later the pattern still generates Legs with the template\'s 3 sets (virtual, not stored)');
 q('[data-win="-7"]').click();
 // removing a virtual session leaves a tombstone
 pickDate('2026-10-15');
 ok(scNames()==='Pull','Thu: Pull (virtual)');
 btn(sc()[0],'rm').click();
 {const S=raw('2026-10-15');
  ok(S.length===1&&S[0].status==='removed'&&S[0].pid===wk().pattern[2].id&&!S[0].id&&scNames()===''&&card('2026-10-15').classList.contains('rest'),'removing a pattern session stores a tombstone {pid, status:"removed"}; the date is empty');}
 q('[data-win="7"]').click();q('[data-win="-7"]').click();
 ok(scNames()===''&&raw('2026-10-15').length===1,'it does not come back when the window moves away and back');
 // moving a pattern session to another date
 pickDate('2026-10-14');
 {const I=sc()[0].querySelector('[data-sdate]');I.value='2026-10-16';ev(I,'change');}
 ok(sess('2026-10-16').length===1&&sess('2026-10-16')[0].pid===wk().pattern[1].id&&sess('2026-10-16')[0].items[0].sets===4&&raw('2026-10-14').length===1&&raw('2026-10-14')[0].status==='removed'&&/Moved Legs to Fri 16 Oct/.test(q('#dayMsg').textContent),'moving a session to another date keeps its edits and leaves a tombstone on the old date ('+q('#dayMsg').textContent+')');
 ok(card('2026-10-14').classList.contains('rest')&&/Legs/.test(card('2026-10-16').textContent),'the strip follows: Wed empty, Fri has Legs');
 // skipping a session removes it from the volume; unskip brings it back
 pickDate('2026-10-12');
 ok(rowVal('Mid and lower chest')===5,'Mon: Push (virtual) counts: bench 5 sets');
 btn(sc()[0],'skip').click();
 {const S=sess('2026-10-12');
  ok(S.length===1&&S[0].status==='skipped'&&S[0].pid&&rowVal('Mid and lower chest')===0&&card('2026-10-12').querySelector('.pl.se.s-skipped')&&card('2026-10-12').classList.contains('rest')&&/Unskip/.test(sc()[0].textContent),'Skip stores the session as skipped: it adds nothing to the 7 days, the chip is struck through, the button says Unskip');}
 btn(sc()[0],'skip').click();
 ok(sess('2026-10-12')[0].status==='planned'&&rowVal('Mid and lower chest')===5,'Unskip brings it back');
 // several sessions on one date
 q('#addTpl').value=tpls()[2].id;ev(q('#addTpl'),'change');q('#addSess').click();
 ok(sc().length===2&&scNames()==='Push|Pull'&&sess('2026-10-12').length===2&&sess('2026-10-12')[1].tid===tpls()[2].id&&sess('2026-10-12')[1].items[0].n==='Pull-up'&&!sess('2026-10-12')[1].pid,'"+ Add session" with a template adds a second session to the date (a copy of the template, no pattern id)');
 ok(rowVal('Mid and lower chest')===5&&rowVal('Lats')===4&&qa('#wstrip [data-day="0"] .pl.se').length===2,'both sessions of the date count in the 7 days (bench 5 + pull-up 4 sets) and show as two chips');
 ok(sc()[1].classList.contains('sel')&&q('#edLbl').textContent.includes('Pull'),'the new session is the one being edited');
 btn(sc()[0],'edit').click();
 ok(sc()[0].classList.contains('sel')&&q('#edLbl').textContent.includes('Push')&&q('#plan .exlink').textContent==='Barbell bench press','"Edit" switches the editor between the sessions of a date');
 addEx('Overhead press');
 ok(sess('2026-10-12')[0].items.some(p=>p.n==='Overhead press')&&!sess('2026-10-12')[1].items.some(p=>p.n==='Overhead press'),'adding an exercise goes to the session being edited');
 // ---- carry-over from the three dates before the window ----
 q('#winDate').value='2026-10-13';ev(q('#winDate'),'change');
 ok(dates()[0]==='2026-10-13'&&!card('2026-10-13').classList.contains('warn'),'window starts Tue 13 Oct: no conflict yet');
 addEx('Barbell bench press');
 ok(card('2026-10-13').classList.contains('warn')&&/Mid and lower chest/.test(q('#plan .prow small.warn').textContent)&&/still recovering from Mon 12 Oct/.test(q('#plan .prow small.warn').textContent),'bench on Tue is flagged because of the bench on Mon, the day BEFORE the window: "'+q('#plan .prow small.warn').textContent+'"');
 q('#ovOpen').click();
 ok(+q('#ovGrid tr.g[data-g="1"] .cb[data-d="0"]').dataset.f>0&&q('#ovGrid tr.g[data-g="1"] .cb[data-d="0"]').dataset.c==='1'&&/Mon 12 Oct/.test(q('#ovGrid tr.g[data-g="1"] .cb[data-d="0"]').title),'the overview carries the fatigue of Mon into the first column ('+q('#ovGrid tr.g[data-g="1"] .cb[data-d="0"]').title+')');
 q('#ovClose').click();
 // ---- save changes to template / as new template ----
 pickDate('2026-10-16');
 ok(!q('#saveTpl').disabled&&scNames()==='Legs','Fri: the moved Legs session is linked to its template, "Save changes to template" is enabled');
 q('#winNext').click();pickDate('2026-10-16');
 addEx('Leg press');
 ok(tpls()[1].items.length===1&&sess('2026-10-16')[0].items.length===2,'a session edit does not touch the template');
 q('#saveTpl').click();
 ok(tpls()[1].items.length===2&&tpls()[1].items[1].n==='Leg press'&&/Template “Legs” updated/.test(q('#dayMsg').textContent),'"Save changes to template" copies the session into the template');
 q('[data-win="7"]').click();pickDate('2026-10-21');
 ok(qa('#plan .prow').length===2&&/Leg press/.test(q('#plan').textContent)&&raw('2026-10-21').length===0,'later pattern sessions use the new template (Wed 21 Oct has Leg press), still virtual');
 q('#winNext').click();pickDate('2026-10-16');
 q('#saveNewTpl').click();
 ok(tpls().length===4&&tpls()[3].name==='Legs 2'&&tpls()[3].items.length===2&&sess('2026-10-16')[0].tid===tpls()[3].id,'"Save as new template" creates "Legs 2" and links the session to it');
 // ---- templates section ----
 ok(qa('#tplList .trow').length===4&&/Legs 2/.test(q('#tplList').textContent)&&/2 exercises, 6 sets|2 exercises/.test(q('#tplList .trow:nth-child(2) small').textContent),'template list: name and contents summary ('+q('#tplList .trow:nth-child(2) small').textContent+')');
 q('#tplNew').click();
 ok(tpls().length===5&&tpls()[4].name==='New template'&&/Editing template/.test(q('#edLbl').textContent)&&!q('#edBack').hidden&&q('#edSave').hidden&&/template/.test(q('#qa').placeholder),'"+ New template" creates one and opens it in the editor');
 addEx('Hip thrust');
 ok(tpls()[4].items.length===1&&tpls()[4].items[0].n==='Hip thrust'&&sess('2026-10-16')[0].items.length===2,'exercises added while editing a template go into the template only');
 q('#tplList .trow:nth-child(5) [data-tact="ren"]').click();q('#tplIn').value='Glutes';q('#tplIn').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 ok(tpls()[4].name==='Glutes'&&/Glutes/.test(q('#edLbl').textContent),'a template can be renamed');
 q('#edBack').click();
 ok(!/Editing template/.test(q('#edLbl').textContent),'"Done editing" returns to the session');
 q('#tplList .trow:nth-child(5) [data-tact="dup"]').click();
 ok(tpls().length===6&&tpls()[5].name==='Glutes 2'&&tpls()[5].items[0].n==='Hip thrust','duplicate: "Glutes 2"');
 q('#tplList .trow:nth-child(6) [data-tact="del"]').click();
 ok(tpls().length===5&&confirms.length===0,'deleting an unused template asks nothing');
 q('#tplList .trow:nth-child(5) [data-tact="use"]').click();
 ok(sess('2026-10-16').length===2&&sess('2026-10-16')[1].name==='Glutes'&&sess('2026-10-16')[1].tid===tpls()[4].id,'"Add to <date>" puts a copy of the template on the selected date');
 answer=false;q('#tplList .trow:nth-child(2) [data-tact="del"]').click();
 ok(tpls().length===5&&wk().pattern.length===3&&confirms.length===1&&/pattern/.test(confirms[0]),'deleting a template used by the pattern asks first ('+confirms[0]+'); "cancel" keeps everything');
 answer=true;q('#tplList .trow:nth-child(2) [data-tact="del"]').click();
 ok(tpls().length===4&&wk().pattern.length===2&&wk().pattern.every(p=>tpls().some(t=>t.id===p.tid))&&sess('2026-10-16').length===2,'after confirming, the template and its pattern rows are gone; sessions already on the calendar stay');
 // ---- weekly pattern editor ----
 ok(qa('#patList .prw').length===2&&qa('#patPrev li').length===14,'pattern editor: one row per entry, preview of 14 days');
 q('#patAdd').click();
 {const rows=qa('#patList .prw'),r=rows[rows.length-1];
  ok(rows.length===3&&r.querySelectorAll('[data-pwd]').length===7&&[...r.querySelectorAll('[data-pwd]')].every(b=>b.getAttribute('aria-pressed')==='false')&&wk().pattern[2].from===TODAY&&wk().pattern[2].wd.length===0,'"+ Add to pattern": a row with seven weekday chips, no weekday, from today');
  qa('#patList .prw')[2].querySelector('[data-pwd="1"]').click();qa('#patList .prw')[2].querySelector('[data-pwd="4"]').click();
  const p=wk().pattern[2];
  ok(p.wd.join()==='1,4'&&qa('#patList .prw')[2].querySelector('[data-pwd="1"]').getAttribute('aria-pressed')==='true','weekday chips toggle ('+p.wd.join()+')');
  const sel=qa('#patList .prw')[2].querySelector('[data-pf="tid"]');sel.value=tpls()[2].id;ev(sel,'change');
  ok(wk().pattern[2].tid===tpls()[2].id,'the template of a row can be changed');}
 {const pv=qa('#patPrev li');
  ok(pv[1].textContent.includes('Tue 13 Oct')&&/Glutes|Pull|Legs|Push/.test(pv[1].textContent)&&pv[0].classList.contains('today'),'the preview lists the pattern sessions of the next 14 days ('+pv[1].textContent+')');}
 {const r=qa('#patList .prw')[2],f=r.querySelector('[data-pf="until"]');f.value='2026-10-20';ev(f,'change');
  ok(wk().pattern[2].until==='2026-10-20','"until" is stored');
  f.value='2026-10-01';ev(f,'change');
  ok(wk().pattern[2].until==='2026-10-20','an "until" before "from" is refused');}
 // the new row (template "Legs 2", Tue + Fri, from today until Tue 20 Oct) generates virtual sessions until its end date
 q('#winNext').click();q('[data-win="7"]').click();
 {const pid=wk().pattern[2].id,nm=tpls()[2].name;
  ok(nm==='Legs 2'&&raw('2026-10-20').length===0&&card('2026-10-20').querySelector('.pl.se.s-planned')&&card('2026-10-20').textContent.includes(nm),'the new row puts its template on Tue 20 Oct (virtual, nothing stored)');
  ok(!card('2026-10-23').querySelector('.pl.se'),'... and not on Fri 23 Oct: after its "until" date it stops');
  qa('#patList .prw')[2].querySelector('[data-pact="rm"]').click();
  ok(wk().pattern.length===2&&!wk().pattern.some(p=>p.id===pid)&&!card('2026-10-20').querySelector('.pl.se'),'removing the row removes its sessions from the calendar');}
 // ---- gap filler: only dates from today on ----
 q('#winLast').click();
 {const goal=g=>{q('#goalSel').value=g;ev(q('#goalSel'),'change');};goal('maintain');
  const sd=qa('#sug li.sg [data-sadd]').map(b=>b.dataset.sday);
  ok(sd.length>=1&&sd.every(x=>x==='6'),'window ending today: suggestions can only go to today (slot 6): '+sd.join());
  q('[data-win="-7"]').click();q('[data-win="-7"]').click();
  ok(qa('#sug li.sg [data-sadd]').length>=1&&qa('#sug li.sg [data-sadd]').every(b=>b.disabled&&b.dataset.sday==='-1')&&/Move the window forward to plan ahead/.test(q('#sug').textContent),'a window in the past: "Move the window forward to plan ahead", no add button works');
  goal('hyp8');q('#winLast').click();}
 // ---- import of a backup from before the calendar drops the calendar keys so that the migration runs again ----
 {const fin=q('#importFile');let fileTxt='';Object.defineProperty(fin,'files',{configurable:true,get:()=>[{text:async()=>fileTxt}]});
  const imp=async t=>{fileTxt=t;fin.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(50);};
  await imp(JSON.stringify({app:'atlas-of-motion',format:1,data:{'aom.plan.v3':P3}}));
  ok(w.localStorage.getItem('aom.cal.v1')===null&&w.localStorage.getItem('aom.tpl.v1')===null&&w.localStorage.getItem('aom.win.v1')===null&&w.localStorage.getItem('aom.plan.v3')===P3,'importing a backup without aom.cal.v1 removes the calendar keys, so the next start migrates the old plan');
  await sleep(600);delete fin.files;}
 w.close();
}
async function migrateRun(){
 const m=boot({win:TODAY,store:{'aom.plan.v2':JSON.stringify([{n:'Back squat',sets:4,v:['Wide','']},{n:'Hip thrust',sets:2},{n:'Removed exercise',sets:3}])}}),md=m.document;
 await waitFor(()=>!md.getElementById('loading'),60000,'migration instance');
 const ls=k=>m.localStorage.getItem(k),T=JSON.parse(ls('aom.tpl.v1')||'[]'),C=JSON.parse(ls('aom.cal.v1')||'null');
 ok(T.length===1&&T[0].name==='Day 1'&&T[0].items.length===2&&T[0].items[0].n==='Back squat'&&T[0].items[0].sets===4&&JSON.stringify(T[0].items[0].v)==='["Wide",""]'&&T[0].items[1].n==='Hip thrust','aom.plan.v2 entries become the template "Day 1" (unknown exercise dropped)');
 ok(C&&C.pattern.length===1&&C.pattern[0].wd.join()==='0'&&C.pattern[0].from===TODAY&&Object.keys(C.days).length===0,'... played on Mondays from the Monday of this week');
 ok(ls('aom.plan.v2')!==null&&ls('aom.plan.v3')===null,'aom.plan.v2 stays where it was (only read), no aom.plan.v3 is written any more');
 ok(md.querySelectorAll('#plan .prow').length===2&&md.querySelector('#plan').textContent.includes('Wide')&&md.querySelector('#wstrip [data-day="0"]').textContent.includes('6 sets')&&md.querySelectorAll('#wstrip .rest').length===6,'migrated plan shows on Monday (6 sets), six rest days');
 // reload with calendar data: several templates and weekdays survive
 const w2=boot({win:TODAY,store:{'aom.tpl.v1':JSON.stringify([{id:'t1',name:'Push',items:[{n:'Barbell bench press',sets:5,v:[''],o:0}],ses:[]},{id:'t2',name:'Legs',items:[{n:'Back squat',sets:3,v:['Wide','Deep'],o:0}],ses:[]}]),'aom.cal.v1':JSON.stringify({v:1,mig:1,seq:2,pattern:[{id:'p1',tid:'t1',wd:[0],from:TODAY},{id:'p2',tid:'t2',wd:[2],from:TODAY}],days:{}})}}),d2=w2.document;
 await waitFor(()=>!d2.getElementById('loading'),60000,'calendar reload instance');
 ok(d2.querySelector('#wstrip [data-day="0"]').textContent.includes('Push')&&d2.querySelector('#wstrip [data-day="2"]').textContent.includes('Legs')&&d2.querySelectorAll('#wstrip [data-day]').length===7&&d2.querySelector('#migNote').hidden,'stored templates and pattern restored: Push on Monday, Legs on Wednesday, no notice');
 d2.querySelector('#wstrip [data-day="2"]').click();
 ok(d2.querySelector('#plan').textContent.includes('Back squat')&&d2.querySelector('#plan').textContent.includes('Wide, Deep'),'Wednesday holds Back squat (Wide, Deep)');
 // the migration only runs when aom.cal.v1 is absent
 w2.close();m.close();
}
// ---- quality levels (main desktop instance) ----
// ---- licence groundwork (Pro): offline ECDSA P-256 keys, tools/license.js CLI, the Pro & licence panel. Nothing is gated yet. Uses a TEST key pair only. ----
async function licenseRun(){
 const cp=require('child_process'),os=require('os'),crypto=require('crypto'),LIC=path.join(ROOT,'tools','license.js'),lib=require(LIC);
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aom-lic-'));
 try{
  // --- CLI round trip with a temporary key pair (never the real private key) ---
  const pem=path.join(tmp,'license-private.pem'),pubf=path.join(tmp,'pub.jwk'),revf=path.join(tmp,'revoked.txt');
  const cli=(...a)=>cp.spawnSync(process.execPath,[LIC,...a],{encoding:'utf8'});
  const kg=cli('keygen','--out',tmp,'--pub',pubf);
  ok(kg.status===0&&fs.existsSync(pem)&&fs.existsSync(pubf)&&/BACK UP/.test(kg.stdout),'license.js keygen: writes private PEM and public JWK, reminds to back up');
  const jwk=JSON.parse(fs.readFileSync(pubf,'utf8'));
  ok(jwk.kty==='EC'&&jwk.crv==='P-256'&&!('d' in jwk)&&/^-----BEGIN PRIVATE KEY-----/.test(fs.readFileSync(pem,'utf8')),'... the JWK is a public P-256 key, the PEM is PKCS8');
  ok(cli('keygen','--out',tmp,'--pub',pubf).status===1&&cli('keygen','--out',tmp,'--pub',pubf,'--force').status===0,'... refuses to overwrite an existing key unless --force');
  const jwk2=JSON.parse(fs.readFileSync(pubf,'utf8')),pem2=fs.readFileSync(pem,'utf8');
  const sg=cli('sign','--key',pem,'--name','Ana Ünï <b>','--exp','2099-12-31');
  const key=sg.stdout.trim();
  ok(sg.status===0&&/^AOM1-[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/.test(key),'license.js sign: prints an AOM1- key with a 64-byte (86 character) signature');
  const pl=lib.parseKey(key).payload;
  ok(pl.v===1&&/^[A-Z2-7]{10}$/.test(pl.id)&&pl.tier==='pro'&&/^\d{4}-\d{2}-\d{2}$/.test(pl.iat)&&pl.exp==='2099-12-31'&&pl.name==='Ana Ünï <b>'&&Object.keys(pl).length===6,'... payload: v, random base32 id, tier, iat, exp, name (no other data)');
  const v1=cli('verify',key,'--pub',pubf);
  ok(v1.status===0&&/^VALID /.test(v1.stdout)&&v1.stdout.includes(pl.id),'license.js verify: accepts the key and prints the payload');
  const parts=key.split('.');
  const tam='AOM1-'+Buffer.from(JSON.stringify(Object.assign({},pl,{exp:'2199-01-01'}))).toString('base64url')+'.'+parts[1];
  const v2=cli('verify',tam,'--pub',pubf),v3=cli('verify','nonsense','--pub',pubf);
  ok(v2.status===1&&/signature/.test(v2.stdout)&&v3.status===1&&/format/.test(v3.stdout),'... tampered payload -> signature, garbage -> format (exit code 1)');
  ok(cli('verify',key.slice(0,40)+' \n '+key.slice(40),'--pub',pubf).status===0,'... whitespace inside a pasted key is ignored');
  const old=lib.signKey(pem2,{exp:'2020-01-01',iat:'2019-01-01'});
  ok(/expired/.test(cli('verify',old,'--pub',pubf).stdout)&&cli('sign','--key',pem,'--exp','2020-01-01').status===1&&cli('sign','--key',pem,'--exp','31.12.2099').status===1&&cli('sign','--key',pem,'--name','x'.repeat(41)).status===1&&cli('sign','--key',pem,'--tier','gold').status===1,'... expired keys fail; sign rejects a past/odd exp, a name over 40 characters, an unknown tier');
  fs.writeFileSync(revf,'# comment\n\n'+pl.id+' # refunded\n');
  ok(/revoked/.test(cli('verify',key,'--pub',pubf,'--rev',revf).stdout),'... a key whose id is in the revocation file fails with "revoked"');
  ok(cli('verify',key,'--pub',path.join(ROOT,'tools','license-public.jwk')).status===1,'... a key from another key pair does not verify against the real public key');
  const realJwk=JSON.parse(fs.readFileSync(path.join(ROOT,'tools','license-public.jwk'),'utf8'));
  ok(realJwk.kty==='EC'&&realJwk.crv==='P-256'&&!('d' in realJwk)&&js.includes('LICPUB='+JSON.stringify(realJwk)),'the committed tools/license-public.jwk is a public key and is the one embedded in index.html');
  const gi=fs.readFileSync(path.join(ROOT,'.gitignore'),'utf8');
  ok(/^\*\.pem\s*$/m.test(gi)&&/^license-private\*\s*$/m.test(gi),'.gitignore keeps *.pem and license-private* out of the repository');
  // lint: revoked.txt format
  const lt=path.join(tmp,'lint');fs.mkdirSync(path.join(lt,'data'),{recursive:true});fs.copyFileSync(path.join(ROOT,'tools','template.html'),path.join(lt,'template.html'));fs.copyFileSync(path.join(ROOT,'tools','meta3.json'),path.join(lt,'meta3.json'));
  for(const f of fs.readdirSync(path.join(ROOT,'tools','data'))) fs.copyFileSync(path.join(ROOT,'tools','data',f),path.join(lt,'data',f));
  const lint=()=>cp.spawnSync('python',[path.join(ROOT,'tools','lint.py'),lt],{encoding:'utf8'});
  if(lint().error) ok(true,'lint check of revoked.txt skipped (python not available)');
  else{
   fs.writeFileSync(path.join(lt,'data','revoked.txt'),'# x\n'+pl.id+' # why\n');
   const l1=lint();ok(l1.status===0&&/1 revoked/.test(l1.stdout),'lint.py accepts a valid revoked.txt');
   fs.writeFileSync(path.join(lt,'data','revoked.txt'),'abc\n');const l2=lint();ok(l2.status===1&&/bad licence id/.test(l2.stdout),'lint.py rejects a malformed licence id');
   fs.writeFileSync(path.join(lt,'data','revoked.txt'),pl.id+'\n'+pl.id+'\n');const l3=lint();ok(l3.status===1&&/duplicate licence id/.test(l3.stdout),'lint.py rejects a duplicate licence id');
  }
  // --- the app: an instance whose embedded public key is the TEST key (and a revocation list we control) ---
  ok(/const LICPUB=\{[^}]*\}, LICREV=\[\]/.test(js)&&js.includes('//@licexport'),'index.html embeds LICPUB and an (empty) LICREV');
  const mk=(rev)=>js.replace(/const LICPUB=\{[^}]*\}/,'const LICPUB='+JSON.stringify(jwk2)).replace('LICREV=[]','LICREV='+JSON.stringify(rev||[])).replace('//@licexport','window.__lic={isPro,hasFeature,FEATURES,verifyKey};');
  const inst=async(o)=>{const x=boot(Object.assign({store:{}},o));await waitFor(()=>!x.document.getElementById('loading'),60000,'licence test instance');await waitFor(()=>x.document.documentElement.dataset.pro!==undefined,10000,'licence start-up check');return x;};
  const sign=(f)=>lib.signKey(pem2,f);
  const panel=x=>{const d=x.document,q=s=>d.querySelector(s);return {st:()=>q('#licStatus').textContent.replace(/\s+/g,' '),msg:()=>q('#licMsg').hidden?'':q('#licMsg').textContent,put:v=>{q('#licKey').value=v;},go:async()=>{q('#licAct').click();await sleep(250);},stored:()=>x.localStorage.getItem('aom.lic.v1'),q};};
  // free by default
  let x=await inst({js:mk()}),P=panel(x);
  ok(P.q('#stLic h2').textContent.startsWith('Pro & licence')&&P.q('.foot [data-stopen="lic"]')&&!P.q('.foot #lic')&&P.st()==='Free version'&&x.__lic.isPro()===false&&P.q('#licBadge').hidden&&P.q('#licDel').hidden&&P.q('#lic').dataset.pro==='0','panel "Pro & licence" is in Settings (the colophon links to it); default status "Free version", no badge, no Remove button');
  ok(/not available yet/.test(P.q('#lic .fine').textContent)&&/offline/.test(P.q('#lic .fine').textContent)&&P.q('#licKey').tagName==='TEXTAREA'&&P.q('#licAct').textContent==='Activate','... explains that Pro features are not available yet and keys are checked offline; textarea + Activate');
  const F=x.__lic.FEATURES;
  ok(Object.keys(F).length>=3&&Object.values(F).every(f=>f.pro===false&&f.label)&&Object.keys(F).every(n=>x.__lic.hasFeature(n))&&!x.__lic.hasFeature('nonexistent'),'FEATURES registry: placeholder entries are all pro:false, so hasFeature is true for them (nothing gated); unknown feature -> false');
  // empty and malformed input
  await P.go();ok(/Paste your licence key/.test(P.msg()),'Activate with an empty box asks for a key');
  for(const [bad,why] of [['hello','plain text'],['AOM1-abc.def','too short'],['AOM2-'+parts[0].slice(5)+'.'+parts[1],'wrong prefix'],[key.replace('AOM1-','AOM1-@@'),'bad characters']]){P.put(bad);await P.go();ok(/not an Atlas of Motion licence key/.test(P.msg())&&P.stored()===null&&P.st()==='Free version',`malformed key (${why}) -> format, nothing stored`);}
  // tampered / foreign signature
  P.put(tam);await P.go();ok(/signature of this key is not valid/.test(P.msg())&&P.stored()===null&&!x.__lic.isPro(),'tampered payload -> signature error, not stored, not Pro');
  const other=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'}).privateKey.export({type:'pkcs8',format:'pem'});
  P.put(lib.signKey(other,{}));await P.go();ok(/signature of this key is not valid/.test(P.msg())&&P.stored()===null,'a key signed by another private key -> signature');
  P.put(old);await P.go();ok(/expired on 2020-01-01/.test(P.msg())&&P.stored()===null&&!x.__lic.isPro(),'expired key -> expired (date shown), not stored');
  // valid key, with whitespace and an HTML-ish name
  const nm='Ana <i>Lee</i> & "Co"',vk=sign({name:nm,exp:'2099-12-31'}),vp=lib.parseKey(vk).payload;
  P.put('  '+vk.slice(0,30)+'\n'+vk.slice(30,90)+'\r\n   '+vk.slice(90)+'\n');await P.go();
  ok(/^Pro active · licensed to Ana <i>Lee<\/i> & "Co" · since \d{4}-\d{2}-\d{2} · until 2099-12-31$/.test(P.st())&&P.q('#licStatus i')===null&&P.q('#licStatus').innerHTML.includes('&lt;i&gt;Lee'),'valid key (pasted with line breaks) activates: "Pro active · licensed to <name> · since … · until …", name is escaped (no <i> element created)');
  ok(P.stored()===vk&&x.__lic.isPro()===true&&!P.q('#licBadge').hidden&&!P.q('#licDel').hidden&&P.q('#lic').dataset.pro==='1'&&x.document.documentElement.dataset.pro==='1'&&P.q('#licKey').value===''&&P.msg()==='','... stored normalised in aom.lic.v1, isPro true, Pro badge and Remove button shown, box cleared');
  ok(Object.keys(F).every(n=>x.__lic.hasFeature(n)),'... features stay available (nothing is gated)');
  P.put(tam);await P.go();
  ok(/signature of this key is not valid/.test(P.msg())&&P.stored()===vk&&x.__lic.isPro()===true&&/^Pro active/.test(P.st()),'a failed attempt while Pro keeps the current licence and its status');
  const noname=sign({});P.put(noname);await P.go();
  ok(/^Pro active · since \d{4}-\d{2}-\d{2}$/.test(P.st())&&P.stored()===noname,'a key without name/exp: "Pro active · since …"; activating a second key replaces the first');
  P.q('#licDel').click();
  ok(P.stored()===null&&!x.__lic.isPro()&&P.st()==='Free version'&&P.q('#licBadge').hidden&&P.q('#licDel').hidden&&x.document.documentElement.dataset.pro==='0','Remove licence clears aom.lic.v1 and returns to "Free version"');
  // reload with a stored key: silent re-verification at start-up
  x=await inst({js:mk(),store:{'aom.lic.v1':vk}});P=panel(x);
  await waitFor(()=>x.__lic.isPro(),5000,'stored key verified');
  ok(x.__lic.isPro()&&/^Pro active · licensed to /.test(P.st())&&P.stored()===vk&&!P.q('#licDel').hidden,'reload with a stored valid key: Pro active after the start-up check');
  x=await inst({js:mk([vp.id]),store:{'aom.lic.v1':vk}});P=panel(x);
  ok(!x.__lic.isPro()&&/^Free version\. This licence has been revoked\.$/.test(P.st())&&P.stored()===vk&&!P.q('#licDel').hidden&&P.q('#licStatus').classList.contains('bad'),'a stored key that is revoked (revocation list of this build) -> Free version with the reason; the string stays stored, Remove is offered');
  P.put(vk);await P.go();ok(/revoked/.test(P.msg())&&!x.__lic.isPro(),'activating a revoked licence id -> revoked');
  x=await inst({js:mk(),store:{'aom.lic.v1':old}});P=panel(x);
  ok(!x.__lic.isPro()&&/^Free version\. This licence expired on 2020-01-01\.$/.test(P.st())&&P.stored()===old,'a stored key that has expired -> Free version, reason shown');
  x=await inst({js:mk(),store:{'aom.lic.v1':'junk'}});P=panel(x);
  ok(!x.__lic.isPro()&&/^Free version\. That is not an Atlas of Motion licence key/.test(P.st()),'a stored garbage value -> Free version, format reason (no crash)');
  // no crypto.subtle (insecure http context)
  x=await inst({js:mk(),nosubtle:true});P=panel(x);
  P.put(vk);await P.go();
  ok(/over https:\/\/ or on localhost/.test(P.msg())&&P.stored()===null&&!x.__lic.isPro(),'without crypto.subtle: "unsupported" message mentions https or localhost; nothing stored');
  x=await inst({js:mk(),nosubtle:true,store:{'aom.lic.v1':vk}});P=panel(x);
  ok(!x.__lic.isPro()&&/^Free version\. This browser cannot check licence keys/.test(P.st())&&P.stored()===vk,'... and with a stored key: Free version + the explanation, key kept');
  const vr=await x.__lic.verifyKey('nonsense');ok(vr.ok===false&&vr.reason==='format','verifyKey() resolves {ok:false,reason} for malformed input even without crypto.subtle');
  // backup includes the licence key (all aom.* keys are exported)
  ok(/function getAomKeys[^\n]*startsWith\("aom\."\)/.test(js),'the JSON backup covers aom.lic.v1 (all aom.* keys), re-verified after an import');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
}
async function lodRun(){
 const L=META.lod,ls=k=>w.localStorage.getItem(k);
 ok(['low','medium','high'].every(l=>L[l]&&L[l].file.startsWith('geo/'+l+'.bin?v=')&&L[l].file.length===('geo/'+l+'.bin?v=').length+10&&L[l].bytes>0)&&L.low.faces<L.medium.faces&&L.medium.faces<L.high.faces,'META.lod describes three increasing levels ('+['low','medium','high'].map(l=>L[l].faces).join(' < ')+' triangles)');
 ok(qa('#segLod [data-lod]').length===3&&qa('[data-lod]').length===6&&q('#popLayers').contains(q('#segLod'))&&q('[data-lod="high"]').dataset.faces==String(L.high.faces)&&q('[data-lod="high"]').textContent.includes((L.high.bytes/1e6).toFixed(1)+' MB'),'Quality control (Low/Medium/High with sizes) lives in the Layers popover (and again in Settings)');
 ok(lodOn(d)==='medium'&&w.__fetched.join()==='geo/medium.bin','desktop with no stored choice: Medium is pressed and only geo/medium.bin was fetched');
 ok(idxCount(w)===L.medium.faces*3,'scene holds the Medium mesh ('+L.medium.faces+' triangles)');
 ok(ls('aom.lod.v1')===null,'the default level is not persisted');
 // keep the selection across a switch
 q('[data-tab="anat"]').click();const mi=qa('#list .item').find(b=>b.dataset.kind==='muscle');mi.click();const nm=q('#card h2').textContent;
 const mesh0=[];w.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind)mesh0.push(o);});const g0=mesh0[0].geometry;
 lodBtn(d,'high').click();
 ok(lodBtn(d,'high').getAttribute('aria-busy')==='true'&&lodOn(d)==='medium','while loading, High is marked busy and Medium stays pressed');
 await waitFor(()=>lodOn(d)==='high',30000,'High to finish loading');
 await sleep(50);
 ok(idxCount(w)===L.high.faces*3,'switching to High swaps all geometries ('+L.high.faces+' triangles)');
 ok(ls('aom.lod.v1')==='"high"','choice persisted in aom.lod.v1');
 ok(mesh0[0].geometry!==g0&&mesh0[0].geometry.boundingBox&&mesh0[0].geometry.boundingSphere,'mesh keeps its object, gets a new geometry with bounds');
 ok(q('#card h2')&&q('#card h2').textContent===nm,'selection survives the switch ('+nm+')');
 ok(lodBtn(d,'high').getAttribute('aria-busy')==='false'&&q('#lodNote').textContent==='','busy state cleared, no note on desktop');
 // last request wins
 lodBtn(d,'low').click();lodBtn(d,'medium').click();
 await waitFor(()=>lodOn(d)==='medium'&&!lodBtn(d,'medium').classList.contains('busy'),30000,'Medium to finish');
 await sleep(300);
 ok(lodOn(d)==='medium'&&idxCount(w)===L.medium.faces*3&&ls('aom.lod.v1')==='"medium"','Low then Medium in quick succession ends on Medium only (last request wins)');
 // failing switch keeps the current level and reports
 w.__failFetch=true;lodBtn(d,'low').click();
 await waitFor(()=>q('#lodNote').textContent!=='',5000,'error note');
 ok(/Network error/.test(q('#lodNote').textContent)&&lodOn(d)==='medium'&&idxCount(w)===L.medium.faces*3&&ls('aom.lod.v1')==='"medium"','failed switch: error note shown, Medium stays active');
 w.__failFetch=false;
 // a service worker that cannot deliver the file: the switch retries once past it with &direct=1
 Object.defineProperty(w.navigator,'serviceWorker',{value:{controller:{}},configurable:true});w.__swFail=true;w.__fetched=[];
 lodBtn(d,'low').click();
 await waitFor(()=>lodOn(d)==='low',15000,'Low via the direct retry');
 ok(lodOn(d)==='low'&&w.__fetched.length===2&&q('#lodNote').textContent==='','service worker fails: the switch retries past it (&direct=1) and succeeds');
 w.__swFail=false;delete w.navigator.serviceWorker;
 lodBtn(d,'medium').click();await waitFor(()=>lodOn(d)==='medium'&&!lodBtn(d,'medium').classList.contains('busy'),30000,'back to Medium');
}
// ---- camera: orbit pivot follows the selection; screen-space panning ----
async function camRun(){
 const T=w.THREE, cam=()=>w.__cam, settle=async()=>{let prev=cam().position.clone();for(let i=0;i<50;i++){await sleep(50);const curr=cam().position.clone();if(curr.distanceTo(prev)<0.001)return;prev=curr;}};
 const fwd=()=>{const c=cam();c.updateMatrixWorld();return new T.Vector3(0,0,-1).applyQuaternion(c.quaternion);};
 const distToRay=p=>{const c=cam(),f=fwd(),v=p.clone().sub(c.position);return v.sub(f.multiplyScalar(v.dot(f))).length();};
 const centre=(k,side)=>{const b=new T.Box3();w.__scene.traverse(o=>{if(o.isMesh&&o.userData.key===k&&(!side||o.userData.side===side))b.union(o.geometry.boundingBox);});return b.getCenter(new T.Vector3());};
 q('[data-tab="anat"]').click();q('#q').value='biceps brachii';ev(q('#q'),'input');
 qa('#list .item').find(b=>b.dataset.key==='biceps brachii').click();await settle();
 const dL=distToRay(centre('biceps brachii','L')),dR=distToRay(centre('biceps brachii','R')),dB=distToRay(centre('biceps brachii'));
 ok(Math.min(dL,dR)<0.03,'selecting a paired muscle moves the orbit pivot onto one side of it (camera looks at it, '+Math.min(dL,dR).toFixed(3)+' m off)');
 // a pick on the 3D model: pivot goes to the clicked side
 q('#card .close').click();
 const p0=cam().position.clone(),f0=fwd();
 const pe=(t,o)=>{const e=new w.Event(t,{bubbles:true});Object.assign(e,{pointerId:7,pointerType:'mouse',clientX:500,clientY:400,button:2,buttons:2},o||{});q('canvas').dispatchEvent(e);};
 pe('pointerdown');pe('pointermove',{clientX:600,clientY:400});pe('pointermove',{clientX:700,clientY:350});pe('pointerup',{clientX:700,clientY:350,buttons:0});
 await settle();
 const p1=cam().position.clone(),f1=fwd(),mv=p1.clone().sub(p0);
 ok(mv.length()>0.05&&f0.angleTo(f1)<0.01,'right-drag pans: camera moves '+mv.length().toFixed(2)+' m without rotating');
 ok(Math.abs(mv.clone().normalize().dot(f0))<0.05,'panning stays in the screen plane (no zoom component)');
 q('[data-view="reset"]').click();await settle();
 ok(distToRay(new T.Vector3(0,0.88,0))<0.01,'Reset view returns the pivot to the body centre');
}
// ---- colloquial-name search + typo tolerance ----
async function searchRun(){
 ok(META.al&&Object.keys(META.al).length>50&&Object.values(META.al).every(a=>a.every(e=>META.db[e.split(':')[0]])),'META.al holds the alias table and every alias points at an existing muscle key ('+Object.keys(META.al).length+' aliases)');
 const idx=s=>{q('#q').value=s;ev(q('#q'),'input');return qa('#list .item').map(b=>b.dataset.key);};
 const exq=s=>{q('#qe').value=s;ev(q('#qe'),'input');return exNames();};
 const addq=s=>{q('#qa').value=s;ev(q('#qa'),'input');return qa('#addres [data-add]').map(b=>b.firstChild.textContent.trim().slice(2));};
 q('[data-tab="anat"]').click();
 ok(idx('lats').includes('latissimus dorsi'),'Index: "lats" finds latissimus dorsi');
 ok(['pecs','chest'].every(s=>idx(s).includes('pectoralis major')),'Index: "pecs" and "chest" find pectoralis major');
 ok(idx('hammies').includes('semitendinosus')&&idx('hammies').includes('biceps femoris'),'Index: "hammies" finds the hamstrings');
 ok(idx('rear delts').join()==='deltoid','Index: "rear delts" finds deltoid ('+idx('rear delts').join()+')');
 ok(['gluteus maximus','gluteus medius'].every(k=>idx('butt').includes(k)),'Index: "butt" finds the gluteals');
 ok(idx('six-pack').includes('rectus abdominis')&&idx('lower back').includes('iliocostalis')&&idx('hip flexors').includes('iliacus'),'Index: "six-pack", "lower back" and "hip flexors" resolve');
 ok(idx('deltiod').includes('deltoid'),'Index: the typo "deltiod" still finds deltoid');
 ok(idx('hamstrng').includes('semitendinosus'),'Index: the typo "hamstrng" finds the hamstrings via the alias');
 ok(idx('gluteus maxmus').includes('gluteus maximus'),'Index: a typo in a multi-word name ("gluteus maxmus") works');
 ok(idx('xyzq').length===0&&/No match/.test(q('#list').textContent),'Index: nonsense gives the usual "No match" text');
 ok(idx('del').length>0&&idx('abc').length===0,'Index: queries under 4 characters get no typo fallback ("abc" finds nothing)');
 ok(idx('deltoid').join()==='deltoid'&&idx('').length>100,'Index: an exact name and the empty query behave as before');
 q('#q').value='';ev(q('#q'),'input');
 q('[data-tab="ex"]').click();
 const hasT=(e,k,p)=>e.t.some(r=>r[0]===k&&(!p||r[1]===p));
 const lat=META.ex.filter(e=>hasT(e,'latissimus dorsi')).map(e=>e.n),latR=exq('lats');
 ok(lat.length>3&&lat.every(n=>latR.includes(n))&&latR.includes('Pull-up'),'Exercises: "lats" lists the '+lat.length+' exercises that target latissimus dorsi (incl. Pull-up)');
 const rear=META.ex.filter(e=>hasT(e,'deltoid','spinal part')).map(e=>e.n),rearR=exq('rear delts');
 const frontOnly=META.ex.find(e=>hasT(e,'deltoid')&&!hasT(e,'deltoid','spinal part')&&!/rear|delt/i.test(e.n));
 ok(rear.length>0&&rear.every(n=>rearR.includes(n))&&frontOnly&&!rearR.includes(frontOnly.n),'Exercises: "rear delts" uses the deltoid spinal part (not '+(frontOnly&&frontOnly.n)+')');
 const dt=exq('deltiod');
 ok(dt.length>0&&dt.includes('Lateral raise'),'Exercises: the typo "deltiod" finds deltoid exercises ('+dt.length+')');
 ok(exq('gluts').length>0&&exq('gluts').includes('Hip thrust'),'Exercises: "gluts" (typo of glutes) finds Hip thrust');
 ok(exq('qqqq').length===0&&/No match/.test(q('#exlist').textContent),'Exercises: nonsense gives the "No match" text');
 ok(exq('barbell').length>5&&exq('').length===META.ex.length,'Exercises: plain equipment search and the empty query are unchanged');
 q('#qe').value='';ev(q('#qe'),'input');
 q('[data-tab="wk"]').click();
 const glutes=addq('glutes');
 ok(glutes.length>0&&glutes.every(n=>META.ex.find(e=>e.n===n).t.some(r=>/^gluteus/.test(r[0]))),'Add search: "glutes" offers gluteal exercises ('+glutes.slice(0,3).join(', ')+'...)');
 const gz=addq('glutez');
 ok(gz.length>0&&gz.every(n=>META.ex.find(e=>e.n===n).t.some(r=>/^gluteus/.test(r[0]))),'Add search: the typo "glutez" still offers gluteal exercises');
 ok(addq('zzzz').length===0&&/No match/.test(q('#addres').textContent),'Add search: nonsense gives "No match"');
 q('#qa').value='';ev(q('#qa'),'input');
}
// ---- Movement search: curated prime movers / assisting muscles (data/movements.txt -> META.mv) ----
async function movementRun(){
 const MV=META.mv||[],byId=id=>MV.find(m=>m.id===id)||{k:[],s:[]},all=m=>m.k.concat(m.s),has=(m,k)=>all(m).includes(k);
 const ent=m=>m.kp||m.k.map(k=>[k,'',3]).concat(m.s.map(k=>[k,'',2]));
 ok(MV.length>=50,'META.mv holds '+MV.length+' curated movements');
 const pts={};META.meshes.forEach(r=>{if(r[0]==='m'&&r[3])(pts[r[1]]=pts[r[1]]||new Set()).add(r[3]);});
 ok(MV.every(m=>m.k.length>0&&all(m).every(k=>META.db[k]&&META.db[k].g!=='Connective tissue')&&ent(m).every(r=>!r[1]||(pts[r[0]]&&pts[r[0]].has(r[1])))),'every movement has a prime mover; all keys are muscles of the atlas and every named part exists');
 const ef=byId('el_flex');
 ok(['biceps brachii','brachialis'].every(k=>ef.k.includes(k))&&!has(ef,'triceps brachii'),'Elbow flexion: prime movers include biceps brachii and brachialis, triceps is not listed');
 const ke=byId('kn_ext');
 ok(ke.k.slice().sort().join()==='rectus femoris,vastus intermedius,vastus lateralis,vastus medialis'&&!has(ke,'popliteus'),'Knee extension: the four quadriceps heads, no popliteus ('+all(ke).join(', ')+')');
 const ha=byId('hp_abd');
 ok(['gluteus medius','gluteus minimus'].every(k=>ha.k.includes(k))&&has(ha,'tensor fasciae latae')&&!has(ha,'quadratus lumborum'),'Hip abduction: gluteus medius + minimus prime, tensor fasciae latae listed, no quadratus lumborum');
 const tf=byId('toe_flex'),bad=['biceps brachii','psoas major','rectus abdominis','flexor digitorum superficialis'];
 ok(tf.k.length>0&&!bad.some(k=>has(tf,k))&&all(tf).every(k=>['Foot','Lower leg'].includes(META.db[k].g)),'Toe flexion lists only leg and foot muscles ('+all(tf).join(', ')+')');
 const sf=byId('sh_flex'),hasP=(m,k,p,l)=>ent(m).some(r=>r[0]===k&&r[1]===p&&(!l||r[2]===l));
 ok(hasP(sf,'deltoid','clavicular part',3)&&hasP(sf,'pectoralis major','clavicular part',3),'Shoulder flexion: deltoid (clavicular part) and pectoralis major (clavicular part) are prime movers');
 ok(!has(byId('sh_ext'),'biceps femoris')&&!has(byId('sh_habd'),'temporalis')&&has(byId('trk_rot'),'internal oblique')&&['adductor longus','pectineus'].every(k=>has(byId('hp_add'),k))&&!has(byId('expir'),'latissimus dorsi')&&!has(byId('th_flex'),'flexor digitorum profundus')&&!has(byId('fg_ext'),'flexor accessorius'),'regressions of the regex version are gone (shoulder extension, horizontal abduction, trunk rotation, hip adduction, expiration, thumb flexion, finger extension)');
 const hand=MV.filter(m=>['Wrist','Fingers','Thumb'].includes(m.j)),foot=MV.filter(m=>['Ankle','Foot','Toes'].includes(m.j));
 ok(hand.length>=10&&hand.every(m=>all(m).every(k=>META.db[k].g!=='Foot'&&!/\(foot\)/.test(k)))&&foot.length>=5&&foot.every(m=>all(m).every(k=>!['Hand','Forearm','Upper arm'].includes(META.db[k].g)&&!/\(hand\)/.test(k))),'hand movements name no foot muscles and foot movements no hand or arm muscles');
 // UI: Index search -> movement row -> heat on the body (prime = h3, assisting = h2), card with two chip groups; Escape restores the previous heat
 const lin=h=>new w.THREE.Color(h).convertSRGBToLinear(),Pc=n=>d.documentElement.style.getPropertyValue('--m-'+n),same=(c,h)=>{const t=lin(h);return !!c&&Math.abs(c.r-t.r)<1e-5&&Math.abs(c.g-t.g)<1e-5&&Math.abs(c.b-t.b)<1e-5;};
 const km=k=>{const a=[];w.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind==='muscle'&&o.userData.key===k)a.push(o);});return a;};
 const isH=(k,l)=>{const ms=km(k);return ms.length>0&&ms.every(m=>same(m.material.color,Pc(l)));};
 const esc=()=>d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 if(q('#tVol').checked){q('#tVol').checked=false;ev(q('#tVol'),'change');}
 esc();esc();esc();
 q('[data-tab="ex"]').click();exItem('Back squat').click();
 ok(isH('vastus lateralis','h3'),'(setup) Back squat heat is on');
 q('[data-tab="anat"]').click();q('#q').value='elbow flex';ev(q('#q'),'input');
 const row=q('#list [data-kind="movement"][data-key="el_flex"]');
 ok(row&&/Elbow flexion/.test(row.textContent)&&/\d+ muscles/.test(row.textContent),'Index: "elbow flex" shows the movement row ('+(row&&row.textContent)+')');
 if(row) row.click();
 ok(isH('biceps brachii','h3')&&isH('brachialis','h3'),'clicking it paints biceps brachii and brachialis with the prime-mover material');
 ok(isH('brachioradialis','h3')||isH('brachioradialis','h2'),'brachioradialis is prime mover or synergist');
 ok(isH('pronator teres','h2')&&!isH('triceps brachii','h3')&&!isH('triceps brachii','h2')&&!isH('vastus lateralis','h3'),'assisting muscles get the synergist material; triceps and the squat muscles are not lit');
 ok(q('#card h2')&&q('#card h2').textContent==='Elbow flexion'&&roleKeys('Prime movers ('+ef.k.length+')').join()===ef.k.join()&&roleKeys('Assisting ('+ef.s.length+')').join()===ef.s.join()&&q('#card .mchip i.sw.l3')&&q('#card .mchip i.sw.l2'),'card: "Prime movers" and "Assisting" chip groups with the legend swatches');
 ok(/^#mv=el_flex(&|$)/.test(w.location.hash)&&!q('#card [data-act="hide"]'),'deep link #mv=el_flex (the exercise stays in the hash); no Hide button on a movement card ('+w.location.hash+')');
 esc();
 ok(!q('#card h2')||q('#card h2').textContent!=='Elbow flexion','Escape closes the movement card');
 ok(!isH('biceps brachii','h3')&&isH('vastus lateralis','h3'),'... and restores the exercise heat it replaced');
 q('[data-tab="ex"]').click();esc();q('[data-tab="anat"]').click();
 ok(!isH('vastus lateralis','h3')&&!isH('biceps brachii','h3'),'with nothing selected no muscle carries heat');
 // shoulder flexion is part-aware: clavicular deltoid lit, spinal deltoid not
 w.location.hash='#mv=sh_flex';
 await waitFor(()=>q('#card h2')&&q('#card h2').textContent==='Shoulder flexion',5000,'#mv=sh_flex');
 const dp=p=>km('deltoid').filter(m=>m.userData.part===p);
 ok(dp('clavicular part').length>0&&dp('clavicular part').every(m=>same(m.material.color,Pc('h3')))&&dp('spinal part').every(m=>!same(m.material.color,Pc('h3'))&&!same(m.material.color,Pc('h2'))),'hashchange #mv=sh_flex: only the clavicular part of the deltoid is lit (part-aware)');
 esc();q('#q').value='';ev(q('#q'),'input');
}
// ---- Index group headings: eye toggles replace the old Regions chip panel ----
async function eyeRun(){
 q('[data-tab="anat"]').click();q('#q').value='';ev(q('#q'),'input');
 const eye=(gk,g)=>q('#list .geye[data-gk="'+gk+'"][data-g="'+g+'"]'),pressed=(gk,g)=>eye(gk,g).getAttribute('aria-pressed');
 const meshes=(kind,f)=>{const a=[];w.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind===kind&&f(o.userData))a.push(o);});return a;};
 const keyMeshes=k=>meshes('muscle',u=>u.key===k);
 const act=()=>{const a=q('#list .item.active');return a&&a.dataset.key;};   // a selected structure stays visible whatever the toggles say
 const all=kind=>meshes(kind,u=>u.key!==act());
 ok(!q('#groups')&&!q('#gAll')&&!q('#gNone'),'the Regions chip panel is gone');
 const sums=qa('#list details > summary');
 ok(sums.length>=26&&sums.every(s=>s.querySelectorAll('.geye').length===1&&s.firstElementChild===s.querySelector('.geye')),'every Index group heading has exactly one eye before its title ('+sums.length+')');
 ok(sums.every(s=>s.querySelector('.geye').getAttribute('aria-pressed')==='true'||s.querySelector('b').textContent.startsWith('Nerves')),'all eyes start shown except Nerves');
 // muscle group: hides its meshes, does not fold or unfold the group, shows them again
 const sh=eye('m','Shoulder'),det=sh.closest('details'),open0=det.open;
 ok(keyMeshes('deltoid').length>0&&keyMeshes('deltoid').every(m=>m.visible),'deltoid meshes start visible');
 sh.click();
 ok(pressed('m','Shoulder')==='false'&&keyMeshes('deltoid').every(m=>!m.visible||act()==='deltoid')&&det.open===open0,'Shoulder eye hides the deltoid meshes and leaves the group folded as it was');
 ok(q('#list .item[data-key="deltoid"]').classList.contains('off'),'the deltoid entry is marked off');
 sh.click();
 ok(pressed('m','Shoulder')==='true'&&keyMeshes('deltoid').every(m=>m.visible)&&det.open===open0,'Shoulder eye shows them again');
 det.open=true;sh.click();sh.click();ok(det.open===true,'an unfolded group stays unfolded');det.open=open0;
 // connective tissue: same as the #tTendons layer checkbox, both ways
 const tis='Connective tissue',tissue=()=>meshes('muscle',u=>u.tissue&&u.key!==act());
 eye('t',tis).click();
 ok(!q('#tTendons').checked&&pressed('t',tis)==='false'&&tissue().every(m=>!m.visible),'Connective tissue eye unchecks #tTendons and hides the tendons');
 q('#tTendons').checked=true;ev(q('#tTendons'),'change');
 ok(pressed('t',tis)==='true','ticking #tTendons updates the eye');
 eye('t',tis).click();eye('t',tis).click();
 ok(q('#tTendons').checked&&tissue().some(m=>m.visible),'Connective tissue eye shows the tendons again and ticks #tTendons');
 // bone group (the muscle group "Hand" has the same name, hence data-gk)
 const hand=()=>meshes('bone',u=>u.group==='Hand'),skull=()=>meshes('bone',u=>u.group==='Skull');
 ok(hand().length>0&&hand().every(m=>m.visible),'hand bones start visible');
 eye('b','Hand').click();
 ok(pressed('b','Hand')==='false'&&hand().every(m=>!m.visible||m.userData.key===act())&&skull().every(m=>m.visible)&&meshes('muscle',u=>u.group==='Hand').every(m=>m.visible),'Hand bone eye hides the hand bones only (not the skull, not the hand muscles)');
 const hk=hand()[0].userData.key,hcb=()=>q('#list .vis[data-kind="bone"][data-key="'+hk+'"]');
 ok(q('#list .item[data-kind="bone"][data-key="'+hk+'"]').classList.contains('off'),'its bone entries are marked off');
 hcb().checked=true;ev(hcb(),'change');
 ok(pressed('b','Hand')==='true'&&hand().every(m=>m.visible),'ticking one hand bone in the hidden group brings the group back');
 eye('b','Hand').click();eye('b','Hand').click();
 ok(pressed('b','Hand')==='true'&&hand().every(m=>m.visible),'Hand bone eye shows the hand bones again');
 // mixed: group shown, one entry unchecked; a click hides the group, the next one restores it and clears the entry
 const key='adductor longus',cb=()=>q('#list .vis[data-kind="muscle"][data-key="'+key+'"]'),grp=META.db[key].g;
 ok(pressed('m',grp)==='true','group of '+key+' starts shown');
 cb().checked=false;ev(cb(),'change');
 ok(pressed('m',grp)==='mixed'&&!q('#unhide').disabled,'unchecking one muscle makes its group eye "mixed"');
 eye('m',grp).click();
 ok(pressed('m',grp)==='false'&&keyMeshes(key).every(m=>!m.visible),'clicking a mixed eye hides the whole group');
 eye('m',grp).click();
 ok(pressed('m',grp)==='true'&&cb().checked&&keyMeshes(key).every(m=>m.visible)&&/\(0\)/.test(q('#unhide').textContent),'clicking a hidden eye shows the group and clears its individual hiding');
 // checking an item of a hidden group re-adds that group
 eye('m',grp).click();cb().checked=false;ev(cb(),'change');cb().checked=true;ev(cb(),'change');
 ok(pressed('m',grp)==='true','checking an item in a hidden group shows the group again');
 // Show all / Hide all
 q('#hideAll').click();
 ok(qa('#list .geye').filter(e=>e.dataset.gk!=='n').every(e=>e.getAttribute('aria-pressed')==='false')&&!q('#tTendons').checked&&all('muscle').every(m=>!m.visible)&&all('bone').every(m=>!m.visible),'Hide all: every group eye off, tendons off, no muscle or bone visible');
 ok(q('#tBones').checked&&q('#tMuscles').checked,'Hide all leaves the bones and muscles layer checkboxes alone');
 q('#tBones').checked=false;ev(q('#tBones'),'change');
 q('#showAll').click();
 ok(qa('#list .geye').filter(e=>e.dataset.gk!=='n').every(e=>e.getAttribute('aria-pressed')==='true')&&q('#tTendons').checked&&q('#tBones').checked&&all('muscle').every(m=>m.visible)&&all('bone').every(m=>m.visible),'Show all: every group eye on, tendons and bones layers on, everything visible');
 cb().checked=false;ev(cb(),'change');q('#showAll').click();
 ok(cb().checked&&q('#unhide').disabled,'Show all also clears individually hidden entries');
 // Nerves eye drives the Nerves layer checkbox, and the checkbox drives the eye
 const nv='Nerves (schematic)';
 ok(pressed('n',nv)==='false'&&!q('#tNerves').checked,'Nerves eye starts off, like the layer');
 eye('n',nv).click();
 ok(pressed('n',nv)==='true'&&q('#tNerves').checked,'Nerves eye switches the Nerves layer on');
 q('#hideAll').click();ok(q('#tNerves').checked&&pressed('n',nv)==='true','Hide all leaves the Nerves layer unchanged');
 q('#tNerves').checked=false;ev(q('#tNerves'),'change');
 ok(pressed('n',nv)==='false','unticking the Nerves layer updates its eye');
 eye('n',nv).click();eye('n',nv).click();
 ok(pressed('n',nv)==='false'&&!q('#tNerves').checked,'Nerves eye switches the layer off again');
 q('#showAll').click();
 q('#q').value='deltoid';ev(q('#q'),'input');
 ok(qa('#list details').every(d=>d.querySelectorAll('.geye').length===1),'searching keeps one eye per heading');
 q('#q').value='';ev(q('#q'),'input');
}
// ---- variations as separate entries in the ranked lists ----
async function variationRun(){
 q('[data-tab="anat"]').click();
 const open=k=>{q('#q').value=k;ev(q('#q'),'input');qa('#list .item').find(b=>b.dataset.key===k).click();q('#q').value='';ev(q('#q'),'input');};
 const rows=()=>qa('#card .ext tbody tr').map(r=>({n:r.querySelector('.exlink').textContent,tds:[...r.cells].slice(1).map(c=>c.textContent.trim()).join('|')+'|'+(r.cells[0].querySelector('small')?r.cells[0].querySelector('small').textContent:''),b:r.querySelector('.exlink')}));
 open('adductor magnus');
 const am=rows(),wideRow=am.find(r=>r.n==='Back squat (Wide)');
 ok(wideRow,'adductor magnus card lists "Back squat (Wide)" as its own row');
 const plainRow=am.find(r=>r.n==='Back squat');
 ok(!plainRow||plainRow.tds!==wideRow.tds,'... and it differs from the plain Back squat row ('+(plainRow?plainRow.tds+' vs ':'not listed vs ')+wideRow.tds+')');
 ok(new Set(am.map(r=>r.n)).size===am.length,'no duplicate rows in the adductor magnus table');
 ok(am.filter(r=>/\)$/.test(r.n)).every(r=>/\(([^()]+)\)$/.test(r.n)),'variation rows are labelled "Exercise (Option)"');
 // clicking opens the exercise with that option pressed
 wideRow.b.click();
 ok(q('#card h2').textContent==='Back squat'&&qa('[data-var]').find(b=>b.textContent==='Wide').getAttribute('aria-pressed')==='true','clicking "Back squat (Wide)" opens Back squat with Wide pressed');
 ok(roleKeys('Prime movers').includes('adductor magnus'),'... and the heat map follows (adductor magnus is a prime mover)');
 // a base entry resets earlier variation choices
 open('gluteus maximus');
 const gm=rows(),base=gm.find(r=>r.n==='Back squat');
 ok(base,'gluteus maximus card has the plain Back squat row');
 base.b.click();
 ok(q('#card h2').textContent==='Back squat'&&qa('[data-var]').filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.textContent).join()==='Shoulder-width,Parallel','opening the plain "Back squat" row selects its default variation (was Wide)');
 // dedupe: a variation row never repeats the base row's level and specificity
 const bad=[];
 qa('#bestM option').map(o=>o.value).forEach(k=>{
  open(k);const rs=rows(),by={};rs.forEach(r=>by[r.n]=r.tds);
  rs.forEach(r=>{const m=r.n.match(/^(.*) \(([^()]+)\)$/);if(m&&by[m[1]]!==undefined&&by[m[1]]===r.tds)bad.push(k+': '+r.n);});
 });
 ok(bad.length===0,'no variation row duplicates its base row for any muscle'+(bad.length?': '+bad.slice(0,4).join('; '):''));
 // Best-for: some muscle ranks a variation entry in its top 8; clicking it opens that variation
 q('[data-tab="ex"]').click();
 const withVar=qa('#bestM option').map(o=>o.value).filter(k=>{q('#bestM').value=k;ev(q('#bestM'),'change');return bestNames().some(n=>/\)$/.test(n));});
 ok(withVar.length>0,'Best-for ranks variation entries for '+withVar.length+' muscles (e.g. '+withVar.slice(0,3).join(', ')+')');
 const tfl=['tensor fasciae latae','adductor magnus'].find(k=>withVar.includes(k))||withVar[0];
 q('#bestM').value=tfl;ev(q('#bestM'),'change');q('[data-sort="eff"]').click();
 const vb=qa('#best [data-ex]').find(b=>/\)$/.test(b.textContent)),label=vb.textContent,mm=label.match(/^(.*) \((.*)\)$/);
 const pcts=bestPct();ok(pcts.length===bestNames().length,'Best-for ('+tfl+'): entry "'+label+'" shows level dots and a percentage');
 vb.click();
 ok(q('#card h2').textContent===mm[1].split(' (')[0].trim()||q('#card h2').textContent===mm[1],'Best-for: clicking "'+label+'" opens that exercise');
 const pressed=qa('[data-var][aria-pressed="true"]').map(b=>b.textContent);
 ok(pressed.join(', ').includes(mm[2]),'... with its variation pressed ('+pressed.join(' / ')+')');
 q('[data-sort="eff"]').click();
 // ordering stays level desc, then specificity desc
 const lv=(()=>{q('#bestM').value='adductor magnus';ev(q('#bestM'),'change');return qa('#best li').map(li=>({l:li.querySelectorAll('.lv i[class]').length,s:parseFloat(li.querySelector('small').textContent)}));})();
 ok(lv.every((x,i)=>!i||x.l<lv[i-1].l||(x.l===lv[i-1].l&&x.s<=lv[i-1].s)),'Best-for sort order is still level, then specificity');
 q('#exClear').click();
}
// ---- deep links ----
async function linkRun(){
 const boot1=async(hash)=>{const x=boot({url:'https://example.test/'+hash});const xd=x.document;
  const t=Date.now();while(xd.getElementById('loading')){if(x.__fatal)return {x,xd,fatal:x.__fatal};if(Date.now()-t>60000)return {x,xd,fatal:'timeout'};await sleep(100);}
  return {x,xd};};
 const C1=xd=>xd.getElementById('card').textContent.replace(/\s+/g,' ');
 const tabOn=xd=>[...xd.querySelectorAll('[data-tab]')].filter(b=>b.getAttribute('aria-selected')==='true').map(b=>b.dataset.tab).join();
 // exercise + variation
 let {x,xd,fatal}=await boot1('#ex=Back%20squat&v=Wide');
 ok(!fatal,'deep link #ex=Back%20squat&v=Wide boots'+(fatal?': '+fatal:''));
 ok(xd.querySelector('#card h2')&&xd.querySelector('#card h2').textContent==='Back squat'&&[...xd.querySelectorAll('[data-var]')].find(b=>b.textContent==='Wide').getAttribute('aria-pressed')==='true','... opens the Back squat card with Wide pressed');
 ok(tabOn(xd)==='ex'&&[...xd.querySelectorAll('#exlist .item.active')].map(b=>b.textContent).join()==='Back squat','... shows the Exercises tab with Back squat active');
 ok(x.location.hash==='#ex=Back%20squat&v=Wide&tab=ex','... and the hash is normalised ('+x.location.hash+')');
 // selecting a muscle in that instance updates the hash; closing clears the selection part
 xd.querySelector('[data-tab="anat"]').click();
 ok(x.location.hash==='#ex=Back%20squat&v=Wide','back on the Anatomy tab the tab part disappears ('+x.location.hash+')');
 xd.querySelector('#card [data-key]').click();
 const mk=xd.querySelector('#card h2').textContent;
 ok(x.location.hash==='#m='+encodeURIComponent(mk)+'&ex=Back%20squat&v=Wide','selecting the muscle "'+mk+'" from the exercise card adds m= ('+x.location.hash+')');
 xd.querySelector('#card [data-act="back"]').click();
 ok(x.location.hash==='#ex=Back%20squat&v=Wide'&&x.history.length===1,'Back removes m= again; replaceState adds no history entries ('+x.location.hash+', history '+x.history.length+')');
 // hashchange restores state
 x.location.hash='#m=biceps%20brachii';
 await waitFor(()=>xd.querySelector('#card h2')&&xd.querySelector('#card h2').textContent==='biceps brachii',5000,'hashchange');
 ok(xd.querySelector('#card h2').textContent==='biceps brachii','a hashchange to #m=biceps%20brachii selects that muscle');
 // copy link: async clipboard
 let clip=null;Object.defineProperty(x.navigator,'clipboard',{configurable:true,value:{writeText:async t=>{clip=t;}}});
 xd.querySelector('#card [data-act="copy"]').click();await sleep(30);
 ok(clip&&clip.includes('#m=biceps%20brachii')&&clip.startsWith('https://example.test/')&&xd.querySelector('#card [data-act="copy"]').textContent==='Copied','Copy link writes the full URL to the clipboard and shows "Copied" ('+clip+')');
 await waitFor(()=>xd.querySelector('#card [data-act="copy"]').textContent==='Copy link',4000,'copy button label to return');ok(xd.querySelector('#card [data-act="copy"]').textContent==='Copy link','... and the label returns to "Copy link"');
 // copy link: no clipboard API, execCommand unavailable -> link shown selected
 Object.defineProperty(x.navigator,'clipboard',{configurable:true,value:undefined});
 xd.querySelector('#card [data-act="copy"]').click();
 const cu=xd.querySelector('#card .copyurl');
 ok(cu&&cu.value.includes('#m=biceps%20brachii')&&xd.querySelector('#card [data-act="copy"]').textContent==='Select and copy','fallback: the link appears in a field for manual copy ("'+(cu&&cu.value)+'")');
 // exercise card has the button too
 xd.querySelector('[data-tab="ex"]').click();[...xd.querySelectorAll('#exlist .item')].find(b=>b.textContent==='Leg press').click();
 ok(!!xd.querySelector('#card [data-act="copy"]'),'exercise card has a Copy link button');
 // clearing everything removes the hash
 xd.querySelector('#exClear').click();
 ok(x.location.hash===''||x.location.hash==='#tab=ex','clearing the exercise clears the link ('+x.location.hash+')');
 // comparison
 ({x,xd,fatal}=await boot1('#cmp=Back%20squat:Wide|Leg%20press'));
 const h2s=[...xd.querySelectorAll('#card h2')].map(h=>h.textContent);
 ok(!fatal&&C1(xd).includes('Comparison')&&h2s.length===2&&h2s[0].includes('Back squat')&&h2s[0].includes('Wide')&&h2s[1].includes('Leg press'),'deep link #cmp=A:Wide|B opens the comparison with A (Wide) and B ('+h2s.join(' / ')+')');
 ok(x.location.hash==='#cmp=Back%20squat:Wide|Leg%20press&tab=ex'||x.location.hash==='#cmp=Back%20squat:Wide|Leg%[...]'||/^#cmp=Back%20squat:Wide\|Leg%20press/.test(x.location.hash),'comparison hash is kept ('+x.location.hash+')');
 ok(!!xd.querySelector('#card [data-act="copy"]'),'comparison card has a Copy link button');
 xd.querySelector('[data-act="swap"]').click();
 ok(/^#cmp=Leg%20press\|Back%20squat:Wide/.test(x.location.hash),'swapping A and B updates the hash ('+x.location.hash+')');
 // muscle / bone / tab
 ({x,xd,fatal}=await boot1('#m=gluteus%20maximus'));
 ok(!fatal&&xd.querySelector('#card h2').textContent==='gluteus maximus'&&x.location.hash==='#m=gluteus%20maximus','deep link #m=gluteus%20maximus selects the muscle');
 const bone=Object.keys(META.bdb)[0];
 ({x,xd,fatal}=await boot1('#b='+encodeURIComponent(bone)+'&tab=wk'));
 ok(!fatal&&xd.querySelector('#card h2').textContent===bone&&tabOn(xd)==='wk'&&!!xd.querySelector('#card [data-act="copy"]'),'deep link #b=<bone>&tab=wk selects the bone and opens the Workout tab ("'+bone+'")');
 // invalid values are ignored without throwing
 for(const bad of ['#ex=Nope&v=Wide','#m=zzz&b=&ex=&cmp=a|b&tab=bogus','#cmp=Back%20squat|','#ex=Back%20squat&v=%E0%A4%A,Nonsense','#%','#=&&=','#m=constructor&b=__proto__&ex=constructor','#ex=%E0%A4%A']){
  const r=await boot1(bad);
  ok(!r.fatal&&!r.xd.getElementById('loading'),'invalid hash "'+bad+'" starts normally');
  if(bad==='#ex=Back%20squat&v=%E0%A4%A,Nonsense') ok(r.xd.querySelector('#card h2').textContent==='Back squat'&&[...r.xd.querySelectorAll('[data-var][aria-pressed="true"]')].map(b=>b.textContent).join()==='Shoulder-width,Parallel','... a valid exercise with unknown options opens with the defaults');
  else ok(!r.xd.querySelector('#card.show'),'... and shows no card');
 }
 // main instance: selection mirrors into the hash
 q('[data-tab="anat"]').click();q('#q').value='gluteus maximus';ev(q('#q'),'input');qa('#list .item').find(b=>b.dataset.key==='gluteus maximus').click();q('#q').value='';ev(q('#q'),'input');
 ok(w.location.hash==='#m=gluteus%20maximus','selecting a muscle sets location.hash ('+w.location.hash+')');
 q('#card .close').click();
 ok(w.location.hash==='','closing the card clears the hash');
}
// ---- v2.1: collapsed session editor, "Move to…" choices, Settings page (goals, heart rate, equipment, units, display, data, licence) ----
async function settingsRun(){
 const mk=o=>boot(Object.assign({store:{}},o,{js:js.replace('//@licexport','window.__set={wFmt,wParse,wU,moveOpts,cleanSet,get SET(){return SET}};')}));
 const seed={'aom.tpl.v1':JSON.stringify([{id:'t1',name:'Push',items:[{n:'Barbell bench press',sets:3,v:[]}],ses:[]}]),'aom.cal.v1':JSON.stringify({v:1,seq:1,mig:1,note:0,pattern:[{id:'p1',tid:'t1',wd:[0],from:'2026-10-01'}],days:{}})};   // Push every Monday; "today" is Monday 12 Oct
 const x=mk({store:seed}),xd=x.document,xq=s=>xd.querySelector(s),xqa=s=>[...xd.querySelectorAll(s)],xev=(el,t)=>el.dispatchEvent(new x.Event(t,{bubbles:true}));
 const key=(el,k)=>el.dispatchEvent(new x.KeyboardEvent('keydown',{key:k,bubbles:true}));
 await waitFor(()=>!xd.getElementById('loading'),60000,'settings test instance');
 const cal=()=>JSON.parse(x.localStorage.getItem('aom.cal.v1')||'null'),setj=()=>JSON.parse(x.localStorage.getItem('aom.set.v1')||'null'),dkey=i=>addDays(TODAY,i);
 const setv=(el,v)=>{el.value=v;xev(el,'change');};
 xq('[data-tab="wk"]').click();
 // ---- the session editor is collapsed by default and opens with Edit ----
 const edit=()=>xq('#sessList [data-sact="edit"]');
 ok(xqa('#sessList .scard').length===1&&xq('#edSec').hidden&&edit().getAttribute('aria-expanded')==='false'&&edit().textContent.startsWith('Edit')&&!edit().textContent.startsWith('Editing'),'editor: collapsed by default for the selected session (hidden, Edit button not pressed)');
 edit().click();
 ok(!xq('#edSec').hidden&&edit().getAttribute('aria-expanded')==='true'&&edit().textContent.startsWith('Editing')&&/Push/.test(xq('#edLbl').textContent)&&xqa('#plan .prow').length===1&&xq('#edBack').textContent==='Done'&&!xq('#edBack').hidden,'editor: Edit opens it for that session (label, rows, Done button)');
 xq('#plan [data-inc="0"]').click();
 ok(!xq('#edSec').hidden&&xq('#plan .prow .step span').textContent==='4 sets','editor: stays open while editing that session (a change re-renders but does not collapse it)');
 xq('#edBack').click();
 ok(xq('#edSec').hidden&&edit().getAttribute('aria-expanded')==='false'&&xd.activeElement===edit(),'editor: Done collapses it and focus returns to the Edit button');
 edit().click();key(edit(),'Escape');
 ok(xq('#edSec').hidden&&xd.activeElement===edit(),'editor: Escape collapses it');
 edit().click();edit().click();
 ok(xq('#edSec').hidden,'editor: pressing Editing again is Done');
 edit().click();xq('#wstrip [data-day="5"]').click();
 ok(xq('#edSec').hidden,'editor: choosing another date collapses it');
 xq('#wstrip [data-day="6"]').click();
 // ---- "Move to…": today and the next 13 days first, then the other window dates, then "Pick a date…" ----
 edit().click();
 {const o=[...xq('#plan select.mv').options],tx=o.map(t=>t.textContent);
  ok(tx[0]==='Move to…'&&tx[1]==='Tomorrow'&&tx[2]==='Wed 14 Oct'&&tx[13]==='Sun 25 Oct'&&o[1].value===dkey(1)&&o[13].value===dkey(13),'move to: from today, the first choices are Tomorrow, Wed 14 Oct ... Sun 25 Oct (the next 13 days): '+tx.slice(0,4).join(' | '));
  ok(o[14].disabled&&/^─+$/.test(tx[14])&&tx.slice(15,21).join('|')==='Tue 6 Oct|Wed 7 Oct|Thu 8 Oct|Fri 9 Oct|Sat 10 Oct|Sun 11 Oct'&&o[15].value===dkey(-6)&&tx[21]==='Pick a date…'&&o.length===22,'... then a separator, the other (past) window dates, and "Pick a date…" last');
  const m=x.__set.moveOpts(dkey(-2)),d2=xd.createElement('select');d2.innerHTML=m;const t2=[...d2.options].map(t=>t.textContent);
  ok(t2[1]==='Today'&&t2[2]==='Tomorrow'&&!t2.includes('Sat 10 Oct')&&t2.filter(t=>t==='Mon 12 Oct').length===0,'... on a past date "Today" comes first, and the date itself is not offered');}
 xq('#edBack').click();
 // board card: the same choices; a window date and a date outside the window
 xq('#ovOpen').click();
 {const col=d=>xqa('#ovBoard .bcol[data-d="'+d+'"] .bcard'),sel=col(6)[0]&&col(6)[0].querySelector('select.bmv');
  ok(col(6).length===1&&sel&&sel.options[1].textContent==='Tomorrow'&&sel.options[1].value===dkey(1)&&sel.nextElementSibling.matches('input.mvdate')&&sel.nextElementSibling.hidden,'board card: "Move to…" offers Tomorrow first; the date input for "Pick a date…" is hidden');
  setv(sel,dkey(-4));
  ok(col(6).length===0&&col(2).length===1&&cal().days[dkey(-4)]&&cal().days[dkey(-4)][0].items[0].n==='Barbell bench press','board card: moving into the past is still possible (Thu 8 Oct)');
  const s2=col(2)[0].querySelector('select.bmv');s2.value='pick';xev(s2,'change');
  const di=col(2)[0].querySelector('input.mvdate');
  ok(!di.hidden&&s2.value===''&&col(2).length===1,'board card: "Pick a date…" reveals a date input and moves nothing yet');
  setv(di,'2026-12-01');
  ok(col(2).length===0&&cal().days['2026-12-01']&&cal().days['2026-12-01'][0].items.length===1&&/outside the 7 days/.test(xq('#ovLive').textContent),'board card: a picked date outside the window moves the card there ('+xq('#ovLive').textContent.trim()+')');}
 xq('#ovClose').click();
 // planner rows (exercise and endurance), "Pick a date…"
 xq('#wstrip [data-day="6"]').click();xq('#addTpl').value='';xq('#addSess').click();
 ok(!xq('#edSec').hidden,'an empty session added with "+ Add session" opens in the editor');
 xq('#qa').value='back squat';xev(xq('#qa'),'input');[...xqa('#addres [data-add]')].find(b=>/^\+ Back squat/.test(b.textContent)).click();
 xq('#endOpen').click();xq('#endAdd').click();
 ok(xqa('#plan .prow').length===1&&xqa('#ses .srow').length===1,'... and exercise + endurance rows can be added there');
 {const s=xq('#ses select.mv');ok(s.options[1].textContent==='Tomorrow'&&s.options[s.options.length-1].textContent==='Pick a date…','endurance row: the same "Move to…" choices');
  setv(s,dkey(1));
  ok(cal().days[dkey(1)]&&cal().days[dkey(1)].some(i=>i.ses&&i.ses.length===1)&&xqa('#ses .srow').length===0&&/Moved .* to Tue 13 Oct/.test(xq('#dayMsg').textContent),'endurance row: moving to Tomorrow works ('+xq('#dayMsg').textContent+')');}
 {const s=xq('#plan select.mv');s.value='pick';xev(s,'change');const di=xq('#plan input.mvdate');
  ok(!di.hidden&&s.value===''&&xqa('#plan .prow').length===1,'exercise row: "Pick a date…" reveals the date input');
  setv(di,'2026-11-20');
  ok(cal().days['2026-11-20']&&cal().days['2026-11-20'][0].items[0].n==='Back squat'&&xqa('#plan .prow').length===0&&/outside the 7 days shown/.test(xq('#dayMsg').textContent),'exercise row: a picked date moves it ('+xq('#dayMsg').textContent+')');}
 // ---- settings page: open / close ----
 ok(xq('#st').hidden&&xq('#stOpen')&&xq('.tabrow').contains(xq('.tabs'))&&xq('.tabrow').contains(xq('#stOpen'))&&xq('#shead').contains(xq('#stOpen'))&&xq('#stOpen').getAttribute('aria-label')==='Settings','Settings: hidden at start; the gear sits next to the tabs in the sidebar header');
 xq('#stOpen').focus();xq('#stOpen').click();
 ok(!xq('#st').hidden&&xq('#vp').contains(xq('#st'))&&xd.activeElement===xq('#stClose')&&/(^#|&)settings$/.test(x.location.hash)&&xqa('#st .sec h2').map(h=>h.firstChild.textContent.trim()).join('|')==='Training goals|Heart rate|Equipment|Units and calendar|Display|Data|Pro & licence|About','Settings: the gear opens the overlay in the viewport; sections I-VIII; hash #settings');
 key(xq('#stClose'),'Escape');
 ok(xq('#st').hidden&&!/settings/.test(x.location.hash)&&xd.activeElement===xq('#stOpen'),'Settings: Escape closes it, #settings removed from the hash, focus returns to the gear');
 xq('#stOpen').click();xq('#stClose').click();
 ok(xq('#st').hidden&&xd.activeElement===xq('#stOpen'),'Settings: "Show body" closes it');
 xq('#stOpen').click();{const i=xq('#hrMax');i.focus();key(i,'Escape');}
 ok(xq('#st').hidden,'Settings: Escape also works while typing in a field');
 xq('.foot [data-stopen=""]').click();
 ok(!xq('#st').hidden&&xd.activeElement===xq('#stClose'),'Settings: the colophon "Settings" link opens it');
 xq('#stClose').click();
 xq('.foot [data-stopen="lic"]').click();
 ok(!xq('#st').hidden&&xd.activeElement===xq('#licKey')&&xq('#stLic').contains(xq('#lic')),'Settings: the colophon "Pro & licence" link opens it at the licence section (key field focused)');
 xq('#stClose').click();
 {const e=mk({store:{},url:'https://example.test/#settings'}),ed=e.document;await waitFor(()=>!ed.getElementById('loading'),60000,'settings deep link');
  ok(!ed.getElementById('st').hidden&&/settings/.test(e.location.hash),'Settings: deep link #settings opens it at start-up');
  const e2=mk({store:{},url:'https://example.test/#settings=lic'}),ed2=e2.document;await waitFor(()=>!ed2.getElementById('loading'),60000,'settings deep link lic');
  ok(!ed2.getElementById('st').hidden&&ed2.activeElement===ed2.getElementById('licKey'),'... and #settings=lic opens it at the licence section');
  const e3=mk({store:{},url:'https://example.test/#settings=nonsense'}),ed3=e3.document;await waitFor(()=>!ed3.getElementById('loading'),60000,'settings deep link bad');
  ok(!ed3.getElementById('st').hidden,'... an unknown section still opens Settings (at the top)');}
 // ---- I: goals ----
 xq('[data-tab="wk"]').click();
 ok(!xq('#paneWk #goalSel')&&xq('#stGoals #goalSel')&&!xq('#paneWk #hrMax')&&!xq('#paneEx #eqchips')&&!xq('#paneWk #exportData')&&xq('#stData #exportData')&&xq('#stEq #eqchips'),'moved: goal, heart rate, equipment chips and backup buttons are in Settings, no longer in the Workout / Exercises tabs');
 ok(xq('#goalSum').textContent.replace(/\s+/g,' ')==='Goal: 8–12 sets per muscle group / week · Change','Workout tab: one-line goal summary ('+xq('#goalSum').textContent+')');
 xq('#goalSum [data-stopen="goals"]').click();
 ok(!xq('#st').hidden&&xd.activeElement===xq('#goalSel'),'... "Change" opens Settings at the goals');
 setv(xq('#goalSel'),'maintain');
 ok(xq('#goalSum').textContent.replace(/\s+/g,' ')==='Goal: 4–6 sets per muscle group / week · Change'&&JSON.parse(x.localStorage.getItem('aom.goal.v1')).g==='maintain'&&xqa('#volLegend span').map(s=>s.textContent).join('|')==='Under 2|2–3.5|4–6|Over 6|None','goal changed in Settings: summary, aom.goal.v1 and the volume bands/legend follow');
 setv(xq('#goalSel'),'hyp8');
 // endurance goals change the balance panel
 xq('#stClose').click();
 ok(/150–300 min/.test(xq('#bal [data-b="who"]').textContent)&&/Endurance vs WHO/.test(xq('#bal [data-b="who"] h4').textContent)&&/1–2 a week/.test(xq('#bal [data-b="vo2"]').textContent),'balance: default endurance goals are WHO 150–300 min and 1–2 VO2max-like sessions');
 xq('#stOpen').click();
 setv(xq('#endLo'),'30');setv(xq('#endHi'),'60');setv(xq('#vo2Lo'),'2');setv(xq('#vo2Hi'),'3');setv(xq('#easyMin'),'90');
 // the endurance session now sits on tomorrow, outside the window: look at the whole 7 days from tomorrow on
 xq('#stClose').click();xq('#winNext').click();
 {const who=xq('#bal [data-b="who"]'),easy=xq('#bal [data-b="split"]'),vo=xq('#bal [data-b="vo2"]');
  ok(JSON.stringify(setj().endMin)==='[30,60]'&&setj().easyMin===90&&JSON.stringify(setj().vo2)==='[2,3]','endurance goals are stored in aom.set.v1');
  ok(/of 30–60 min/.test(who.textContent)&&/Endurance vs goal/.test(who.querySelector('h4').textContent)&&/Within your range/.test(who.textContent),'balance: endurance minutes use the chosen range and wording ('+who.textContent.replace(/\s+/g,' ')+')');
  ok(/of 2–3 a week/.test(vo.textContent)&&/None yet, target 2–3 a week/.test(vo.textContent),'balance: VO2max-like sessions use the chosen target');
  ok(/On target: mostly easy/.test(easy.textContent),'balance: easy share 100 % passes a 90 % minimum');}
 xq('#stOpen').click();setv(xq('#easyMin'),'99');
 ok(setj().easyMin===95&&xq('#easyMin').value==='95','easy share is clamped to 95');
 setv(xq('#endHi'),'10');
 ok(JSON.stringify(setj().endMin)==='[30,30]'&&xq('#endHi').value==='30','minutes range: a high end below the limit is clamped and the low end never exceeds it');
 setv(xq('#endLo'),'500');
 ok(JSON.stringify(setj().endMin)==='[500,500]','... raising the low end above the high end moves the high end along');
 xq('#endReset').click();
 ok(JSON.stringify(setj().endMin)==='[150,300]'&&setj().easyMin===75&&JSON.stringify(setj().vo2)==='[1,2]'&&xq('#endReset').disabled,'"Use the defaults" restores 150–300, 75 %, 1–2');
 {const c=x.__set.cleanSet({units:'stone',weekStart:'x',theme:'blue',endMin:[300,100],easyMin:'a',vo2:[-1,2]});
  ok(c.units==='kg'&&c.weekStart==='mon'&&c.theme==='auto'&&c.endMin.join()==='150,300'&&c.easyMin===75&&c.vo2.join()==='1,2','stored values are validated on load: junk falls back to the defaults');
  const c2=x.__set.cleanSet({units:'lb',weekStart:'sun',theme:'dark',endMin:[120,240],easyMin:80,vo2:[0,3]});
  ok(c2.units==='lb'&&c2.weekStart==='sun'&&c2.theme==='dark'&&c2.endMin.join()==='120,240'&&c2.easyMin===80&&c2.vo2.join()==='0,3','... valid values are kept');}
 // ---- II: heart rate (moved) ----
 setv(xq('#hrAge'),'30');
 ok(xq('#hrMax').placeholder==='187'&&xq('#hrZones tr[data-z="2"]').lastChild.textContent==='112–131 bpm'&&JSON.stringify(JSON.parse(x.localStorage.getItem('aom.hr.v1')))==='{"max":null,"age":30,"rest":null}'&&/187 bpm max/.test(xq('#hrSum').textContent),'heart rate from Settings: age 30 -> zones and aom.hr.v1');
 setv(xq('#hrAge'),'');
 // ---- III: equipment (moved) ----
 ok(/^Equipment: 8 of 8$/.test(xq('#eqSum').textContent)&&xq('#paneEx [data-stopen="eq"]'),'Exercises tab: "Equipment: 8 of 8 · Change"');
 xq('#eqchips [data-eq="Barbell"]').click();
 {xq('[data-tab="ex"]').click();const names=xqa('#exlist .item').map(b=>b.textContent);
  ok(xq('#eqSum').textContent==='Equipment: 7 of 8'&&!names.includes('Back squat')&&JSON.parse(x.localStorage.getItem('aom.eq.v1')).length===7,'equipment chip in Settings: Barbell off -> list loses Back squat, summary "7 of 8", aom.eq.v1 updated');}
 xq('#eqAll').click();
 ok(xq('#eqSum').textContent==='Equipment: 8 of 8'&&xqa('#exlist .item').map(b=>b.textContent).includes('Back squat'),'... "All" restores everything');
 xq('#stClose').click();xq('#paneEx [data-stopen="eq"]').click();
 ok(!xq('#st').hidden&&xq('#stEq').contains(xd.activeElement),'the "Change" link in the Exercises tab opens Settings at the equipment');
 // ---- IV: units ----
 ok(x.__set.wFmt(45.359)==='45.5'&&x.__set.wFmt(100)==='100'&&x.__set.wFmt(82.6)==='82.5'&&x.__set.wFmt(undefined)===''&&Math.abs(x.__set.wParse('12.5')-12.5)<1e-9&&Number.isNaN(x.__set.wParse('abc')),'units (kg): wFmt rounds to 0.5 kg steps, wParse reads kilograms');
 xq('#stClose').click();xq('[data-tab="wk"]').click();xq('#winLast').click();xq('#wstrip [data-day="6"]').click();
 xq('#sessList [data-sact="edit"]').click();
 xq('#qa').value='back squat';xev(xq('#qa'),'input');[...xqa('#addres [data-add]')].find(b=>/^\+ Back squat/.test(b.textContent)).click();
 xq('#stOpen').click();xq('#segUnit [data-unit="lb"]').click();
 ok(setj().units==='lb'&&xq('#segUnit [data-unit="lb"]').getAttribute('aria-pressed')==='true'&&x.__set.wU()==='lb'&&x.__set.wFmt(45.359)==='100'&&Math.abs(x.__set.wParse('100')-45.36)<0.01,'units: lb is stored in aom.set.v1; wFmt(45.359 kg) = 100 lb, wParse(100) = 45.36 kg');
 xq('#stClose').click();xq('#sessList [data-sact="train"]').click();
 {const w1=()=>xq('#tdBody .tset [data-f="w"]');
  ok(!xq('#td').hidden&&w1().placeholder==='lb'&&w1().step==='1'&&/lb/.test(xq('#tdBody .tcols').textContent)&&!/kg/.test(xq('#tdBody .tcols').textContent)&&/pounds/.test(w1().getAttribute('aria-label')),'Today view in lb: column header, placeholder, step and label use pounds');
  w1().value='100';xev(w1(),'input');
  const lg=()=>{const d=cal().days;let r=null;Object.keys(d).forEach(k=>d[k].forEach(i=>{if(i.lg&&i.lg.ex.some(e=>e.n==='Back squat'))r=i.lg.ex.find(e=>e.n==='Back squat');}));return r;};
  ok(lg()&&Math.abs(lg().sets[0].w-45.36)<0.1,'entering 100 lb stores ~45.4 kg ('+(lg()&&lg().sets[0].w)+')');
  xq('#td [data-act="addset"]').click();
  ok(xqa('#tdBody .tset [data-f="w"]').length===4&&xqa('#tdBody .tset [data-f="w"]')[0].value==='100','after a re-render (+ Add set) the stored 45.36 kg is shown back as 100 lb');
  xq('#stOpen').click();xq('#segUnit [data-unit="kg"]').click();
  ok(!xq('#td').hidden&&xqa('#tdBody .tset [data-f="w"]')[0].value==='45.5'&&xqa('#tdBody .tset [data-f="w"]')[0].placeholder==='kg'&&/kg/.test(xq('#tdBody .tcols').textContent),'switching back to kg re-renders the open Today view: 45.36 kg shows as 45.5 (0.5 kg steps), header kg');
  xq('#stClose').click();
  w1().value='60';xev(w1(),'input');
  ok(Math.abs(lg().sets[0].w-60)<1e-9,'kg input is stored as typed');
  xq('#tdClose').click();}
 // week start
 xq('#paneWk #patAdd').click();
 ok(xqa('#patList .prw:last-child .wdc .chip').map(c=>c.textContent).join()==='Mon,Tue,Wed,Thu,Fri,Sat,Sun','weekday chips of the pattern editor start on Monday by default');
 xq('#stOpen').click();xq('#segWeek [data-ws="sun"]').click();
 ok(setj().weekStart==='sun'&&xqa('#patList .prw:last-child .wdc .chip').map(c=>c.textContent).join()==='Sun,Mon,Tue,Wed,Thu,Fri,Sat'&&xq('#patList .prw:last-child [data-pwd="6"]').textContent==='Sun','first day Sunday: pattern chips start on Sun (data keeps 0 = Monday)');
 xq('#stClose').click();xq('#winWeek').click();
 ok(xq('#winDate').value==='2026-10-11'&&xqa('#wstrip .dbtn').length===7&&xqa('#wstrip .dbtn')[0].dataset.date==='2026-10-11'&&/Sun 11 Oct/.test(xq('#winLbl').textContent),'"This week" with Sunday as first day: the window starts on Sun 11 Oct');
 xq('#stOpen').click();xq('#segWeek [data-ws="mon"]').click();xq('#stClose').click();xq('#winWeek').click();
 ok(xq('#winDate').value==='2026-10-12'&&xqa('#wstrip .dbtn')[0].dataset.date==='2026-10-12','... and with Monday as first day: Mon 12 Oct');
 // ---- V: display ----
 xq('#stOpen').click();
 ok(!xd.documentElement.hasAttribute('data-theme')&&xq('#segTheme [data-th="auto"]').getAttribute('aria-pressed')==='true','theme: Auto by default (no data-theme attribute)');
 xq('#segTheme [data-th="dark"]').click();
 ok(xd.documentElement.getAttribute('data-theme')==='dark'&&setj().theme==='dark'&&xq('#segTheme [data-th="dark"]').getAttribute('aria-pressed')==='true','theme Dark: data-theme="dark" on <html>, stored');
 xq('#segTheme [data-th="light"]').click();
 ok(xd.documentElement.getAttribute('data-theme')==='light'&&setj().theme==='light','theme Light');
 xq('#segTheme [data-th="auto"]').click();
 ok(!xd.documentElement.hasAttribute('data-theme')&&setj().theme==='auto','theme Auto removes the attribute again');
 {const css=html0.slice(html0.indexOf('<style>'),html0.indexOf('</style>')),oc=re=>{const m=css.match(re);return m?m[1]:null;},oL=oc(/:root\{[^}]*--ochre:(#[0-9A-Fa-f]{6})/),oD=oc(/:root\[data-theme="dark"\]\{[^}]*--ochre:(#[0-9A-Fa-f]{6})/);
  const t=mk({store:{},url:'https://example.test/#m=deltoid'}),td=t.document;await waitFor(()=>!td.getElementById('loading'),60000,'theme instance');
  const lin=h=>new t.THREE.Color(h).convertSRGBToLinear(),same=(c,h)=>{const l=lin(h);return Math.abs(c.r-l.r)<1e-5&&Math.abs(c.g-l.g)<1e-5&&Math.abs(c.b-l.b)<1e-5;};
  const selMat=()=>{let m=null;t.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind==='muscle'&&o.userData.key==='deltoid')m=o.material;});return m;};
  ok(same(selMat().color,oL),'theme: Auto (light system theme) shows the light --ochre on the selection');
  td.querySelector('#segTheme [data-th="dark"]').click();await sleep(60);
  ok(same(selMat().color,oD)&&td.documentElement.style.getPropertyValue('--m-sel').toLowerCase()===oD.toLowerCase(),'theme: choosing Dark in Settings re-colours the selection material to the dark --ochre ('+oD+')');
  td.querySelector('#segTheme [data-th="light"]').click();await sleep(60);
  ok(same(selMat().color,oL),'... and Light returns to the light --ochre');
  const t2=mk({store:{'aom.set.v1':JSON.stringify({theme:'dark'})},url:'https://example.test/#m=deltoid'}),t2d=t2.document;await waitFor(()=>!t2d.getElementById('loading'),60000,'stored theme instance');
  let m2=null;t2.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind==='muscle'&&o.userData.key==='deltoid')m2=o.material;});const l2=new t2.THREE.Color(oD).convertSRGBToLinear();
  ok(t2d.documentElement.getAttribute('data-theme')==='dark'&&Math.abs(m2.color.r-l2.r)<1e-5,'a stored theme is applied at start-up (data-theme and materials)');}
 // mesh quality: both controls in sync
 ok(xqa('[data-lod]').length===6&&xq('#popLayers').contains(xq('#segLod'))&&xq('#stDisp').contains(xq('#segLod2'))&&lodOn(xd)==='medium'&&xqa('#segLod2 [data-lod]').filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.lod).join()==='medium','mesh quality: a control in Settings and one in the Layers popover, both on Medium');
 xq('#segLod2 [data-lod="low"]').click();
 await waitFor(()=>lodOn(xd)==='low'&&!xq('#segLod2 [data-lod="low"]').classList.contains('busy'),30000,'Low from Settings');
 ok(xq('#segLod [data-lod="low"]').getAttribute('aria-pressed')==='true'&&xq('#segLod2 [data-lod="low"]').getAttribute('aria-pressed')==='true'&&x.localStorage.getItem('aom.lod.v1')==='"low"'&&idxCount(x)===META.lod.low.faces*3,'mesh quality: Low chosen in Settings loads Low, the Layers control follows, aom.lod.v1 stored');
 xq('#segLod [data-lod="medium"]').click();
 await waitFor(()=>lodOn(xd)==='medium'&&!xq('#segLod [data-lod="medium"]').classList.contains('busy'),30000,'Medium from the popover');
 ok(xq('#segLod2 [data-lod="medium"]').getAttribute('aria-pressed')==='true','... and the Layers control drives the Settings one');
 // ---- VI: data ----
 {const keys=()=>{const a=[];for(let i=0;i<x.localStorage.length;i++){const k=x.localStorage.key(i);if(k&&k.startsWith('aom.'))a.push(k);}return a;};
  x.localStorage.setItem('other.key','keep');
  ok(keys().length>=5&&xq('#delAll')&&xq('#stData').contains(xq('#delAll')),'Data: "Delete all data" is in the Data section ('+keys().length+' aom.* keys stored)');
  const oc=x.confirm;let n=0;
  x.confirm=()=>{n++;return n!==2;};   // yes to the first question, no to the second
  xq('#delAll').click();
  ok(n===2&&keys().length>=5,'Delete all data: asks twice; saying no to the second question keeps everything');
  n=0;x.confirm=()=>{n++;return false;};xq('#delAll').click();
  ok(n===1&&keys().length>=5,'... saying no to the first question stops after one question');
  n=0;x.confirm=()=>{n++;return true;};xq('#delAll').click();
  ok(n===2&&keys().length===0&&x.localStorage.getItem('other.key')==='keep'&&/deleted/.test(xq('#dataMsg').textContent),'... confirming twice removes every aom.* key (and nothing else)');
  x.confirm=oc;await sleep(400);}
 // ---- VII / VIII ----
 ok(/version \d+\.\d+ \(build [0-9a-f]{7}\)/.test(xq('#stVer').textContent)&&xq('#stAbout').contains(xq('#stCredits'))&&[...xqa('#stAbout a')].some(a=>/credits-and-licensing/.test(a.href))&&[...xqa('#stAbout a')].every(a=>a.rel.includes('noopener')),'About: version and build id, a credits link and links to the licence notes in the README');
 xq('#stCredits').click();
 ok(xq('#st').hidden,'About: the credits link closes Settings (and scrolls to the colophon)');
 // ---- phone ----
 {const p=boot({phone:true}),pd=p.document,pq=s=>pd.querySelector(s);await waitFor(()=>!pd.getElementById('loading'),60000,'phone settings instance');
  const css=html0.slice(html0.indexOf('<style>'),html0.indexOf('</style>')),ph=css.slice(css.indexOf('@media (max-width:760px)'));
  ok(pq('#shead').contains(pq('#stOpen'))&&/\.tabrow\{margin:0 -16px/.test(ph)&&/\.ov\{/.test(ph),'phone: the gear is in the sheet header; overlays are full screen on phones');
  pq('#stOpen').click();
  ok(!pq('#st').hidden&&pq('#vp').contains(pq('#st'))&&/settings/.test(p.location.hash),'phone: the gear opens Settings');
  pq('#segUnit [data-unit="lb"]').click();pq('#segTheme [data-th="dark"]').click();
  const sel=pq('#goalSel');sel.value='strength';sel.dispatchEvent(new p.Event('change',{bubbles:true}));
  ok(JSON.parse(p.localStorage.getItem('aom.set.v1')).units==='lb'&&pd.documentElement.getAttribute('data-theme')==='dark'&&JSON.parse(p.localStorage.getItem('aom.goal.v1')).g==='strength','phone: units, theme and goal can be changed in Settings');
  pq('#stClose').click();
  ok(pq('#st').hidden,'phone: Show body closes Settings');}
}
// ---- phone instance: matchMedia reports max-width:760px and a coarse pointer ----
// ---- statistics (v2.2): what was actually trained. Fixed "today" Monday 2026-10-12, weeks start on Monday. ----
// ---- moving a stored PAST pattern session leaves a tombstone, so the statistics do not count its old date as missed ----
async function pastMoveRun(){
 const tpl=[{id:'t1',name:'Push',items:[{n:'Barbell bench press',sets:3,v:[]}],ses:[]}];
 const cal={v:1,pattern:[{id:'p1',tid:'t1',wd:[0],from:'2026-09-28'}],days:{'2026-10-05':[{id:'i9',tid:'t1',pid:'p1',name:'Push',items:[{n:'Barbell bench press',sets:3,v:[]}],ses:[],status:'planned'}]}};
 const x=boot({store:{'aom.tpl.v1':JSON.stringify(tpl),'aom.cal.v1':JSON.stringify(cal)},win:'2026-10-03'}),xd=x.document,xq=s=>xd.querySelector(s);
 await waitFor(()=>!xd.getElementById('loading'),60000,'past-move instance');
 xq('[data-tab="wk"]').click();
 xq('#wstrip [data-date="2026-10-05"]').click();
 const I=xd.querySelector('#sessList .scard [data-sdate]');
 ok(!!I,'past pattern session on Mon 5 Oct has a date input');
 I.value='2026-10-07';I.dispatchEvent(new x.Event('change',{bubbles:true}));
 const d=JSON.parse(x.localStorage.getItem('aom.cal.v1')).days;
 ok((d['2026-10-05']||[]).some(t=>t.pid==='p1'&&t.status==='removed'&&!t.id)&&(d['2026-10-07']||[]).some(t=>t.id==='i9'),'moving a past pattern session leaves a tombstone on its old date (so statistics do not count it as missed)');
 x.close();
}
async function statsRun(){
 const lg=(ex,ses)=>({ex:ex.map((e,i)=>({n:e[0],v:[],o:i,sets:e[1].map(s=>({r:s[0],w:s[1],done:s[2]!==false}))})),ses:ses||[]});
 const S=(id,o)=>Object.assign({id:id,name:'Push',items:[],ses:[],status:'done'},o);
 const run45=[{t:'e',a:'running',k:'easy',min:45,o:0}];
 const mkDays=extra=>Object.assign({
  '2026-07-01':[S('i1',{lg:lg([['Barbell bench press',[[5,70]]]])})],                                                                   // outside 8 weeks
  '2026-08-26':[S('i2',{name:'Legs',lg:lg([['Back squat',[[5,90]]]])})],                                                               // week of 24 Aug (inside 8 weeks)
  '2026-09-21':[S('i3',{tid:'t1',pid:'p1',lg:lg([['Barbell bench press',[[5,80],[5,80],[5,85]]],['Barbell row',[[8,60],[8,60]]]])})],     // Mon: done (pattern session stored)
  '2026-09-28':[S('i4',{tid:'t1',pid:'p1',lg:lg([['Barbell bench press',[[5,85],[5,85],[5,90]]]])})],                                    // Mon: done, heavier (a record)
  '2026-10-01':[{pid:'p1',status:'removed'}],                                                                                           // Thu: tombstone, not planned
  '2026-10-03':[S('i5',{name:'Run',tid:'t2',pid:'p2',ses:run45,lg:{ex:[],ses:[{a:'running',k:'easy',min:45,o:0,done:true,act:40,hr:140}]}})], // Sat: easy run, 40 of 45 min
  '2026-10-05':[S('i6',{tid:'t1',pid:'p1',status:'skipped'})],                                                                          // Mon: skipped
  '2026-10-07':[S('i7',{name:'Legs',lg:lg([['Back squat',[[5,100],[5,100],[3,110],[5,100,false]]]])})],                                  // Wed: manual, 3 done sets + 1 not done
  '2026-10-09':[S('i8',{name:'Intervals',lg:{ex:[],ses:[{a:'running',k:'vo2',min:40,o:0,done:true,act:40,n:4,len:4,rec:3}]}})],          // Fri: VO2max intervals
  '2026-10-10':[S('i9',{name:'Run',tid:'t2',pid:'p2',status:'planned',ses:run45})],                                                    // Sat: planned, never started = missed
  '2026-10-12':[S('i10',{tid:'t1',pid:'p1',status:'planned',startedAt:1,lg:lg([['Barbell bench press',[[5,90],[5,90],[5,90,false]]]])})] // today: in progress, 2 done sets
 },extra||{});
 // Thu 24 Sep, Sat 26 Sep and Thu 8 Oct are pattern sessions that were never stored: missed
 const tpl=[{id:'t1',name:'Push',items:[{n:'Barbell bench press',sets:3,v:[''],o:0}],ses:[]},{id:'t2',name:'Run',items:[],ses:run45}];
 const store=extra=>({'aom.tpl.v1':JSON.stringify(tpl),'aom.goal.v1':JSON.stringify({g:'custom',lo:2,hi:2}),
  'aom.cal.v1':JSON.stringify({v:1,mig:1,seq:30,note:0,pattern:[{id:'p1',tid:'t1',wd:[0,3],from:'2026-09-21'},{id:'p2',tid:'t2',wd:[5],from:'2026-09-21'}],days:mkDays(extra)})});
 const x=boot({store:store()}),xd=x.document,xq=s=>xd.querySelector(s),xqa=s=>[...xd.querySelectorAll(s)];
 await waitFor(()=>!xd.getElementById('loading'),60000,'statistics instance');
 const key=k=>{xd.dispatchEvent(new x.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));},ev=(el,t)=>el.dispatchEvent(new x.Event(t,{bubbles:true}));
 const card=k=>xq('#sxSum [data-k="'+k+'"]'),cv=k=>card(k).dataset.v,ctext=k=>card(k).textContent.replace(/\s+/g,' ');
 const rowOf=nm=>xqa('#sxGridT tbody tr[data-g]').find(r=>r.querySelector('th.rl button').textContent===nm);
 const cells=nm=>[...rowOf(nm).querySelectorAll('td.c')];
 const buckets=()=>xqa('#sxGridT thead th').length-2;
 const range=r=>xq('#sxRange [data-sxr="'+r+'"]').click();
 const cell=dk=>xq('#sxDays [data-d="'+dk+'"]');
 const rowsOf=sel=>xqa(sel+' tbody tr').map(r=>[...r.children].map(c=>c.textContent.trim()));
 ok(xq('#sxOpen')&&xq('#sxOpen').parentNode===xq('#ovOpen').parentNode&&xq('#paneWk').contains(xq('#sxOpen'))&&xq('#sx').hidden&&xq('#vp').contains(xq('#sx')),'Statistics: a button next to "Week overview" in the Workout tab; the overlay #sx lives in #vp and starts hidden');
 // open / close
 xq('#sxOpen').click();
 ok(!xq('#sx').hidden&&xd.activeElement===xq('#sxClose')&&x.location.hash==='#stats'&&xq('#sxRange [aria-pressed="true"]').dataset.sxr==='8','Statistics: opens with focus on "Show body", #stats in the address, default range 8 weeks');
 xq('#sxClose').click();
 ok(xq('#sx').hidden&&x.location.hash===''&&xd.activeElement===xq('#sxOpen'),'Statistics: "Show body" closes it, removes #stats and returns focus to the button');
 xq('#sxOpen').click();key('Escape');
 ok(xq('#sx').hidden&&xd.activeElement===xq('#sxOpen'),'Statistics: Escape closes it');
 xq('#sxOpen').click();
 // ranges and buckets
 ok(buckets()===8&&xqa('#sxDays .sxd').length===56&&/Last 8 weeks/.test(xq('#sxSub').textContent)&&/24 Aug – 12 Oct/.test(xq('#sxSub').textContent)&&/partial \(1 of 7 days\)/.test(xq('#sxSub').textContent),'Range 8 weeks: 8 weekly buckets (24 Aug – 12 Oct), 56 calendar squares, the current week is labelled partial ('+xq('#sxSub').textContent.replace(/\s+/g,' ')+')');
 range(4);
 ok(buckets()===4&&xqa('#sxDays .sxd').length===28&&xq('#sxRange [aria-pressed="true"]').dataset.sxr==='4'&&/21 Sep – 12 Oct/.test(xq('#sxSub').textContent),'Range 4 weeks: 4 buckets, 28 squares');
 // summary numbers (4 weeks): 5 of 10 planned sessions, 6 training days, 13 sets, 5715 kg, 80 endurance minutes
 ok(cv('sessions')==='5'&&/of 10 planned/.test(ctext('sessions'))&&/1 skipped, 4 missed/.test(ctext('sessions')),'Summary: 5 sessions done of 10 planned, 1 skipped, 4 missed ('+ctext('sessions')+')');
 ok(cv('adh')==='50'&&card('adh').classList.contains('mid')&&/50 %/.test(ctext('adh')),'Adherence 50 %: 2 of the 4 missed sessions are pattern sessions that were never stored (Thu 24 Sep, Sat 26 Sep, Thu 8 Oct = 3 virtual; Sat 10 Oct stored but never started) and the Thu 1 Oct tombstone is not counted');
 ok(cv('days')==='6'&&cv('sets')==='13'&&cv('vol')==='5715'&&/5\.7 t/.test(ctext('vol')),'Summary: 6 training days (today\'s unfinished session counts its done sets), 13 strength sets, volume load 5715 kg shown as 5.7 t ('+ctext('vol')+')');
 ok(cv('end')==='80'&&/WHO-equivalent 31 min a week/.test(ctext('end'))&&/goal 150–300/.test(ctext('end'))&&card('end').classList.contains('low'),'Summary: 80 endurance minutes (actual 40 + VO2max 40), WHO-equivalent 31 min a week against the goal 150–300 ('+ctext('end')+')');
 // consistency grid
 const tod=xq('#sxDays .tod');
 ok(tod&&tod.dataset.d==='2026-10-12'&&xqa('#sxDays .fut').length===6&&xqa('#sxDays .fut').every(b=>b.disabled),'Consistency: today is marked, the 6 later days of the week are inert');
 ok(cell('2026-09-21').dataset.u==='5'&&cell('2026-09-21').dataset.l==='1'&&cell('2026-09-28').dataset.u==='3'&&cell('2026-10-03').dataset.u==='2.7'&&cell('2026-10-09').dataset.u==='2.7'&&cell('2026-10-12').dataset.u==='2'&&cell('2026-09-22').dataset.l==='0','Consistency: square intensity = sets + endurance minutes / 15 (21 Sep 5, 28 Sep 3, 3 Oct 2.7, today 2)');
 ok(['2026-09-24','2026-09-26','2026-10-08','2026-10-10'].every(k=>cell(k).classList.contains('miss'))&&!cell('2026-10-01').classList.contains('miss')&&cell('2026-10-05').classList.contains('skip')&&!cell('2026-10-05').classList.contains('miss'),'Consistency: the 4 missed planned days are outlined, the tombstone day is not, the skipped day has its own outline');
 cell('2026-10-07').click();
 ok(cell('2026-10-07').classList.contains('sel')&&/Wednesday 7 October/.test(xq('#sxDay').textContent)&&/Legs/.test(xq('#sxDay').textContent)&&/3 sets/.test(xq('#sxDay').textContent)&&xq('#sxDay [data-sxlog]')&&xq('#sxDay [data-sxcal]'),'Consistency: clicking a day lists its sessions with "Open log" and "Show in the calendar"');
 cell('2026-10-08').click();
 ok(/Push/.test(xq('#sxDay').textContent)&&/missed/.test(xq('#sxDay').textContent)&&!xq('#sxDay [data-sxlog]')&&/weekly pattern/.test(xq('#sxDay').textContent),'Consistency: a day with an untouched pattern session shows it as missed (no log to open)');
 cell('2026-10-07').click();xq('#sxDay [data-sxlog]').click();
 ok(!xq('#td').hidden&&xq('#tdTitle').textContent==='Legs'&&!xq('#sx').hidden,'Consistency: "Open log" opens that session in the Today view, over the statistics');
 xq('#tdClose').click();
 ok(xq('#td').hidden&&!xq('#sx').hidden,'... closing it returns to the statistics');
 xq('#sxDay [data-sxcal]').click();
 ok(xq('#sx').hidden&&!xq('#paneWk').hidden&&/Wednesday 7 October/.test(xq('#dayLbl').textContent),'Consistency: "Show in the calendar" closes the statistics and selects that date in the Workout tab ('+xq('#dayLbl').textContent+')');
 xq('#sxOpen').click();range(4);cell('2026-09-21').click();xq('#sxDay [data-sxcal]').click();
 ok(xq('#sx').hidden&&/Sep/.test(xq('#winLbl').textContent)&&/Monday 21 September/.test(xq('#dayLbl').textContent),'... a date outside the 7-day window moves the window ('+xq('#winLbl').textContent+')');
 xq('#sxOpen').click();range(4);
 // sets per muscle group
 const mid=cells('Mid and lower chest'),up=cells('Upper chest'),quad=cells('Quadriceps');
 ok(mid.length===5&&mid.slice(0,4).map(c=>c.dataset.v).join()==='3,3,0,2'&&mid[4].dataset.avg==='2.5'&&mid.slice(0,4).map(c=>c.textContent).join()==='3,3,–,2','Sets per group: Mid and lower chest = 3, 3, none, 2 sets in the 4 weeks, average per week 2.5 (8 sets / 3.1 weeks)');
 ok(mid.map(c=>(c.className.match(/\bv\d\b|\bz\b/)||[''])[0]).join()==='v3,v3,z,v2,v3'&&up[0].classList.contains('v1')&&up[0].textContent==='1.5'&&quad[2].classList.contains('v3')&&quad[2].textContent==='3'&&mid[3].classList.contains('pt'),'Sets per group: cells follow the goal bands (custom goal 2–2: 3 = more than needed, 2 = in target, 1.5 = below target); the partial week is dashed');
 xq('#sxGrid [data-sxs="avg"]').click();
 {const first=xqa('#sxGridT tbody tr[data-g]'),av=first.map(r=>+r.querySelector('td.av').dataset.avg);
  ok(first[0].querySelector('th.rl button').textContent==='Mid and lower chest'&&av.every((v,i)=>!i||av[i-1]>=v)&&!xq('#sxGridT tr.sec')&&xq('#sxGrid [data-sxs="avg"]').getAttribute('aria-pressed')==='true','Sets per group: sorting by the average puts the biggest first, no section rows');}
 xq('#sxGrid [data-sxs="nat"]').click();
 ok(xq('#sxGridT tr.sec')&&xqa('#sxGridT tbody tr[data-g]').length===27&&xqa('#sxGridT tbody tr[data-g]')[0].querySelector('th.rl button').textContent==='Upper chest','... and "Muscle group" restores the natural order (27 rows in 5 sections)');
 ok(xq('#sxGrp').innerHTML==='','Sets per group: no chart before a group is chosen');
 rowOf('Mid and lower chest').querySelector('button.rb').click();
 ok(rowOf('Mid and lower chest').classList.contains('on')&&/Mid and lower chest/.test(xq('#sxGrp h3').textContent)&&xqa('#sxGrp svg .sxb').length===3&&xq('#sxGrp svg .band')&&xq('#sxGrp details table'),'Sets per group: clicking a row shows its weekly bars (3 trained weeks) with the goal band and a table alternative');
 // volume load
 ok(xq('#sxVol svg')&&xq('#sxVolEx').value===''&&/All exercises/.test(xq('#sxVolEx').options[0].textContent)&&[...xq('#sxVolEx').options].slice(1).map(o=>o.value).join()==='Barbell bench press,Back squat,Barbell row'&&/Total 5\.7 t/.test(xq('#sxVol').textContent),'Volume load: all exercises, 5.7 t in total; the filter lists exercises with weights, biggest first');
 xq('#sxVolEx').value='Barbell bench press';ev(xq('#sxVolEx'),'change');
 ok(/Total 3\.4 t/.test(xq('#sxVol').textContent)&&xqa('#sxVol svg rect.sxb').length===3&&/3\.4 t/.test(xq('#sxVol h3').nextElementSibling.textContent),'Volume load: filtered to Barbell bench press = 3.4 t (1225 + 1300 + 900 kg) in 3 weekly bars');
 xq('#sxVolEx').value='';ev(xq('#sxVolEx'),'change');
 // strength progress
 range(8);
 ok(xq('#sxStrEx').value==='Barbell bench press'&&[...xq('#sxStrEx').options].map(o=>o.value).join()==='Barbell bench press,Back squat,Barbell row'&&/8 sets/.test(xq('#sxStrEx').options[0].textContent),'Strength: the exercise list is ordered by logged sets (bench 8, squat 4, row 2)');
 ok(xqa('#sxStr svg circle.dot').length===3&&/best estimated 1RM 105 kg \(5 × 90 kg, 28 Sep\)/.test(xq('#sxStr').textContent)&&/heaviest set 5 × 90 kg/.test(xq('#sxStr').textContent),'Strength: bench e1RM points for 21 Sep, 28 Sep, 12 Oct; best e1RM 105 kg = 90 × (1 + 5/30)');
 {const t=rowsOf('#sxStr details table');ok(t.length===3&&t[0][0]==='Mon 21 Sep'&&t[0][1]==='99'&&t[1][1]==='105'&&t[2][0]==='Mon 12 Oct'&&t[2][1]==='105'&&t[0][2]==='5 × 85 kg','Strength: table alternative: 21 Sep e1RM 99 (5 × 85), 28 Sep 105, today 105 ('+JSON.stringify(t[0])+')');}
 xq('#sxStrEx').value='Back squat';ev(xq('#sxStrEx'),'change');
 {const t=rowsOf('#sxStr details table');ok(xqa('#sxStr svg circle.dot').length===2&&t[1][1]==='121'&&t[1][3]==='3 × 110 kg'&&t[1][2]==='3 × 110 kg','Strength: squat e1RM 121 = 110 × (1 + 3/30); the unfinished set of 7 Oct is ignored');}
 ok(xqa('#sxPR li').length===3&&/7 Oct/.test(xqa('#sxPR li')[0].textContent)&&/Back squat/.test(xqa('#sxPR li')[0].textContent)&&/121 kg/.test(xqa('#sxPR li')[0].textContent)&&/110 kg/.test(xqa('#sxPR li')[0].textContent)&&xqa('#sxPR li').map(l=>l.dataset.pr).join()==='Back squat,Barbell bench press,Barbell bench press','Personal records: 7 Oct squat, 28 Sep bench, 21 Sep bench (the first session of an exercise is a baseline; today\'s bench 5 × 90 does not beat 28 Sep)');
 range(26);xq('#sxStrEx').value='Barbell bench press';ev(xq('#sxStrEx'),'change');
 ok(xqa('#sxStr svg circle.dot').length===4,'Strength: range 26 weeks adds the bench session of 1 Jul (4 points)');
 // endurance
 range(4);
 {const t=rowsOf('#sxEnd details table'),r=n=>t.find(x=>x[0]==='Week of '+n);
  ok(r('21 Sep').slice(1).join()==='0,0,0,0,0,0,0,0'&&r('28 Sep').slice(1).join()==='0,40,0,0,0,40,40,0'&&r('5 Oct').slice(1).join()==='0,24,0,0,16,40,56,1'&&/^Week of 12 Oct/.test(t[3][0]),'Endurance: minutes per zone and week (28 Sep: Z2 40; 5 Oct: Z2 24 + Z5 16 = 40 min, 56 WHO-equivalent, 1 VO2max-like)');}
 ok(xqa('#sxEnd svg rect.z2').length===2&&xqa('#sxEnd svg rect.z5').length===1&&xq('#sxEnd svg path.ln')&&xq('#sxEnd svg .band'),'Endurance: stacked zone bars, WHO-equivalent line and goal band');
 ok(xq('#sxEnd [data-b="split"]').dataset.easy==='80'&&xq('#sxEnd [data-b="split"]').dataset.hard==='20'&&/at least 75 % easy/.test(xq('#sxEnd [data-b="split"]').textContent)&&xq('#sxEnd [data-b="vo2"]').dataset.v==='1'&&/140 bpm/.test(xq('#sxEnd [data-b="hr"]').textContent),'Endurance: 80 / 0 / 20 % easy / moderate / hard against the 75 % goal, 1 VO2max-like session, average heart rate 140 bpm');
 // 8 weeks, 26 weeks, all, 52 weeks
 range(8);
 ok(cv('sessions')==='6'&&cv('adh')==='55'&&cv('sets')==='14'&&/6\.2 t/.test(ctext('vol'))&&buckets()===8,'Range 8: the squat session of 26 Aug joins (6 of 11 sessions, 55 %, 14 sets, 6.2 t)');
 range(26);
 ok(buckets()===26&&cv('sets')==='15'&&cv('sessions')==='7'&&/6\.5 t/.test(ctext('vol')),'Range 26: the session of 1 Jul joins (15 sets, 6.5 t)');
 range('all');
 ok(buckets()===16&&/All logged weeks/.test(xq('#sxSub').textContent)&&/29 Jun – 12 Oct/.test(xq('#sxSub').textContent),'Range all: starts in the week of the first logged session (16 weeks from 29 Jun)');
 range(52);
 ok(buckets()===52&&xqa('#sxDays .sxd').length===364,'Range 52 weeks: 52 buckets');
 range(8);
 // units
 range(4);xq('#segUnit [data-unit="lb"]').click();
 ok(/13k lb/.test(ctext('vol'))&&cv('vol')==='5715','Units: lb shows the volume load as 13k lb (stored value unchanged, 5715 kg)');
 range(8);xq('#sxStrEx').value='Barbell bench press';ev(xq('#sxStrEx'),'change');
 ok(/best estimated 1RM 231 lb/.test(xq('#sxStr').textContent)&&/heaviest set 5 × 198 lb/.test(xq('#sxStr').textContent)&&/lb/.test(xq('#sxPR').textContent)&&!/ kg/.test(xq('#sxPR').textContent),'Units: lb changes the strength values and the records (231 lb e1RM, 5 × 198 lb)');
 xq('#segUnit [data-unit="kg"]').click();
 ok(/6\.2 t/.test(ctext('vol')),'Units: back to kg');
 // week start Sunday: weekly buckets follow the setting
 range(4);xq('#segWeek [data-ws="sun"]').click();
 ok(buckets()===4&&/weeks start on Sunday/.test(xq('#sxSub').textContent)&&/20 Sep – 12 Oct/.test(xq('#sxSub').textContent)&&xq('#sxDays .sxd').dataset.d==='2026-09-20','Week start Sunday: buckets start on Sundays (20 Sep), the calendar rows follow ('+xq('#sxSub').textContent.replace(/\s+/g,' ')+')');
 xq('#segWeek [data-ws="mon"]').click();
 // show on body
 const meshes=(kind,k,part)=>{const a=[];x.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind===kind&&o.userData.key===k&&(part===undefined||o.userData.part===part))a.push(o);});return a;};
 const lin=h=>new x.THREE.Color(h).convertSRGBToLinear().getHexString(),P=n=>xd.documentElement.style.getPropertyValue('--m-'+n);
 range(4);
 xq('#sxShow').click();
 {const pec=meshes('muscle','pectoralis major','sternocostal part'),pc=meshes('muscle','pectoralis major','clavicular part'),del=meshes('muscle','gastrocnemius');
  ok(xq('#sx').hidden&&xq('#tVol').checked&&!xq('#sxBan').hidden&&/Average weekly sets/.test(xq('#sxBan').textContent)&&/Last 4 weeks/.test(xq('#sxBan').textContent)&&xqa('#sxBanLeg .sw').length>=4&&xq('#vp').contains(xq('#sxBan')),'Show on body: closes the overlay, switches the volume heatmap on and shows a banner with title, range and the band legend');
  ok(pec.length>0&&pec.every(m=>m.visible&&m.material.color.getHexString()===lin(P('v3')))&&pc.every(m=>m.material.color.getHexString()===lin(P('v1')))&&del.every(m=>!m.material.color||m.material.color.getHexString()!==lin(P('v3'))),'Show on body: Mid and lower chest (average 2.5 > goal 2) is painted in the "more than needed" colour, Upper chest (1.3) in "below target", untrained muscles stay grey');}
 xq('#sxBackSt').click();
 ok(!xq('#sx').hidden,'Show on body: the banner links back to the statistics');
 xq('#sxClose').click();
 xq('#sxBack').click();
 {const pec=meshes('muscle','pectoralis major','sternocostal part');
  ok(xq('#sxBan').hidden&&!xq('#tVol').checked&&pec.every(m=>m.material.color.getHexString()!==lin(P('v3'))),'Show on body: "Back to the normal view" removes the heat and the banner');}
 xq('#sxOpen').click();range(8);xq('#sxShow').click();xq('#tVol').checked=false;ev(xq('#tVol'),'change');
 ok(xq('#sxBan').hidden,'Show on body: switching the volume toggle off also removes the banner');
 xq('#tVol').checked=true;ev(xq('#tVol'),'change');
 ok(xq('#sxBan').hidden,'... and switching it on again shows the 7-day plan volume, not the statistics');
 xq('#tVol').checked=false;ev(xq('#tVol'),'change');
 x.close();
 // a later heavier set creates a record; sets without weight or reps are ignored
 {const y=boot({store:store({'2026-10-11':[S('i11',{lg:lg([['Barbell bench press',[[5,95],[10,undefined],[undefined,200]]]])})]})}),yd=y.document,yq=s=>yd.querySelector(s),yqa=s=>[...yd.querySelectorAll(s)];
  await waitFor(()=>!yd.getElementById('loading'),60000,'statistics record instance');
  yq('#sxOpen').click();
  const L=yqa('#sxPR li');
  ok(L.length===4&&L[0].dataset.pr==='Barbell bench press'&&/11 Oct/.test(L[0].textContent)&&/111 kg/.test(L[0].textContent)&&/95 kg/.test(L[0].textContent)&&!/200/.test(yq('#sxPR').textContent),'Records: a later heavier bench set (5 × 95 on 11 Oct) adds a record (e1RM 111 kg, heaviest 95 kg); the set with 200 kg but no reps and the set with reps but no weight are ignored');
  ok(yq('#sxSum [data-k="sets"]').dataset.v==='17'&&yq('#sxSum [data-k="vol"]').dataset.v==='6640','... all three sets count as strength sets (14 + 3), only the complete one adds volume (6165 + 475 = 6640 kg)');
  y.close();}
 // empty states
 {const e=boot({store:{}}),ed=e.document,eq=s=>ed.querySelector(s);
  await waitFor(()=>!ed.getElementById('loading'),60000,'statistics empty instance');
  eq('#sxOpen').click();
  ok(!eq('#sx').hidden&&!eq('#sxEmpty').hidden&&/Log a session with ▶ Start to see statistics here/.test(eq('#sxEmpty').textContent)&&eq('#sxMain').hidden&&eq('#sxShow').disabled,'Empty state: "Log a session with ▶ Start to see statistics here.", no charts, "Show on body" disabled');
  e.close();
  const o=boot({store:{'aom.tpl.v1':'[]','aom.cal.v1':JSON.stringify({v:1,mig:1,seq:3,pattern:[],days:{'2026-07-01':[S('i1',{lg:lg([['Barbell bench press',[[5,70]]]])})]}})}}),od=o.document,oq=s=>od.querySelector(s);
  await waitFor(()=>!od.getElementById('loading'),60000,'statistics old-data instance');
  oq('#sxOpen').click();
  ok(!oq('#sxEmpty').hidden&&/Nothing logged in the last 8 weeks/.test(oq('#sxEmpty').textContent),'Empty state: data outside the range explains that and suggests a longer range ('+oq('#sxEmpty').textContent+')');
  oq('#sxRange [data-sxr="all"]').click();
  ok(oq('#sxEmpty').hidden&&!oq('#sxMain').hidden&&oq('#sxSum [data-k="sets"]').dataset.v==='1'&&oq('#sxSum [data-k="adh"]').dataset.v==='100'&&oq('#sxSum [data-k="sessions"]').dataset.v==='1','Range all shows it (a manual session that was done counts as planned and done: 100 %)');
  o.close();}
 // deep link
 {const l=boot({store:store(),url:'https://example.test/#stats'}),ld=l.document;
  await waitFor(()=>!ld.getElementById('loading'),60000,'statistics deep link');
  ok(!ld.getElementById('sx').hidden&&/stats/.test(l.location.hash)&&ld.getElementById('sxSum').textContent.length>20,'Deep link: #stats opens the statistics at start-up');
  ld.dispatchEvent(new l.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  ok(ld.getElementById('sx').hidden&&!/stats/.test(l.location.hash),'... Escape closes it and clears the hash');
  l.close();}
 // phone
 {const p=boot({phone:true,store:store()}),pd=p.document,pq=s=>pd.querySelector(s),pqa=s=>[...pd.querySelectorAll(s)];
  await waitFor(()=>!pd.getElementById('loading'),60000,'statistics phone instance');
  pq('[data-tab="wk"]').click();pq('#sxOpen').click();
  ok(!pq('#sx').hidden&&pq('#vp').contains(pq('#sx'))&&pqa('#sxRange [data-sxr]').length===6&&pqa('#sxSum .sxcard').length===6&&pqa('#sxGridT tbody tr[data-g]').length===27,'Phone: the overlay opens (in the viewport, over the sheet) with range buttons, 6 summary cards and the group table');
  pq('#sxRange [data-sxr="12"]').click();
  ok(pqa('#sxGridT thead th').length-2===12&&pq('#sxCalW')&&pq('#sxCalW').classList.contains('sxcalw'),'Phone: range change works; the day squares sit in a horizontally scrollable strip');
  pq('#sxShow').click();
  ok(pq('#sx').hidden&&!pq('#sxBan').hidden&&pq('#vp').contains(pq('#sxBan')),'Phone: "Show on body" closes the overlay and shows the banner over the body');
  pq('#sxBack').click();
  ok(pq('#sxBan').hidden,'Phone: "Back to the normal view" hides it');
  p.close();}
}
async function phoneRun(){
 const p=boot({phone:true}),pd=p.document,pq=x=>pd.querySelector(x),pqa=x=>[...pd.querySelectorAll(x)];
 const t0=Date.now();
 while(pq('#loading')){ if(p.__fatal) die('phone: startup IIFE threw: '+p.__fatal); if(Date.now()-t0>60000) die('phone: startup timed out'); await sleep(100); }
 const side=pq('#side'),card=pq('#card'),sheet=()=>side.dataset.sheet,grab=pq('#grab');
 const pev=(el,t,o)=>{const e=new p.Event(t,{bubbles:true});Object.assign(e,{pointerId:1,pointerType:'touch',clientX:500,clientY:400,button:0,buttons:1},o||{});el.dispatchEvent(e);};
 const toPeek=()=>{for(let i=0;i<3&&sheet()!=='peek';i++)grab.click();};
 ok(lodOn(pd)==='low'&&p.__fetched.join()==='geo/low.bin'&&idxCount(p)===META.lod.low.faces*3,'phone: defaults to Low quality (only geo/low.bin fetched, '+META.lod.low.faces+' triangles)');
 ok(p.__dpr===1.5,'phone: renderer pixel ratio capped at 1.5 (got '+p.__dpr+')');
 ok(sheet()==='peek','phone: sheet starts in "peek"');
 ok(side.contains(card)&&card.parentNode===pq('#cslot')&&!pq('#vp').contains(card),'phone: #card lives inside the sheet, not over the viewport');
 ok(pq('#hint').textContent.includes('pinch to zoom')&&pq('#hint').textContent.includes('tap to inspect'),'phone: touch-specific hint text');
 ok(!side.classList.contains('has-card'),'phone: no card, panes visible');
 // grab handle cycles peek -> half -> full -> peek
 const seq=[];for(let i=0;i<3;i++){grab.click();seq.push(sheet());}
 ok(seq.join('>')==='half>full>peek','phone: tapping the handle cycles states ('+seq.join('>')+')');
 // dragging the header (jsdom has no layout, so only check that a drag gesture runs through the state machine and leaves a valid state)
 const hd=pq('#shead');pev(hd,'pointerdown',{clientY:700});pev(hd,'pointermove',{clientY:500});pev(hd,'pointerup',{clientY:500});
 ok(['peek','half','full'].includes(sheet())&&!side.classList.contains('dragging'),'phone: a header drag ends in a valid snap state ('+sheet()+')');
 await sleep(80); // the click that follows a drag is swallowed for a moment
 toPeek();
 // Layers popover
 const bl=pq('#btnLayers'),pl=pq('#popLayers'),bv=pq('#btnView'),pv=pq('#popView');
 ok(bl.getAttribute('aria-expanded')==='false'&&!pl.classList.contains('open'),'phone: Layers popover closed initially');
 bl.click();
 ok(bl.getAttribute('aria-expanded')==='true'&&pl.classList.contains('open'),'phone: Layers button opens the popover (aria-expanded=true)');
 bl.click();
 ok(bl.getAttribute('aria-expanded')==='false'&&!pl.classList.contains('open'),'phone: Layers button closes it again');
 bl.click();pd.dispatchEvent(new p.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 ok(bl.getAttribute('aria-expanded')==='false'&&!pl.classList.contains('open'),'phone: Escape closes the popover');
 bl.click();bv.click();
 ok(!pl.classList.contains('open')&&pv.classList.contains('open')&&bv.getAttribute('aria-expanded')==='true'&&bl.getAttribute('aria-expanded')==='false','phone: only one popover open at a time');
 pq('canvas').dispatchEvent(new p.Event('click',{bubbles:true}));
 ok(!pv.classList.contains('open')&&bv.getAttribute('aria-expanded')==='false','phone: outside click closes the popover');
 bv.click();pq('[data-view="back"]').click();
 ok(!pv.classList.contains('open'),'phone: choosing a view closes the View popover');
 // tab tap in peek opens the sheet to half
 pq('[data-tab="ex"]').click();
 ok(sheet()==='half'&&!pq('#paneEx').hidden,'phone: tapping a tab in peek opens the sheet to half and shows that pane');
 toPeek();
 // selecting an exercise shows the card in the sheet
 pqa('#exlist .item').find(b=>b.textContent==='Back squat').click();
 ok(card.classList.contains('show')&&side.contains(card)&&pq('#card h2').textContent==='Back squat','phone: selecting an exercise shows its card inside the sheet');
 ok(sheet()==='half'||sheet()==='full','phone: sheet opened to at least half (is '+sheet()+')');
 ok(side.classList.contains('has-card'),'phone: panes are hidden while the card is shown');
 // tapping a tab while a card is shown brings the panes back and collapses the card to a summary
 pq('[data-tab="anat"]').click();
 ok(!side.classList.contains('has-card')&&card.classList.contains('mini')&&card.classList.contains('show'),'phone: tab tap shows the panes, card collapses to a summary');
 card.querySelector('h2').click();
 ok(side.classList.contains('has-card')&&!card.classList.contains('mini'),'phone: tapping the summary expands the card again');
 // close returns to the panes
 pq('[data-act="exclose"]').click();
 ok(!card.classList.contains('show')&&!side.classList.contains('has-card'),'phone: closing the card shows the panes again');
 // muscle from the index
 pq('[data-tab="anat"]').click();
 const mi2=pqa('#list .item').find(b=>b.dataset.kind==='muscle');mi2.click();
 ok(card.classList.contains('show')&&side.contains(card)&&side.classList.contains('has-card')&&pq('#card h2').textContent===mi2.dataset.key,'phone: selecting a muscle from the index shows its card in the sheet');
 pq('#card .close').click();
 ok(!side.classList.contains('has-card'),'phone: closing the muscle card restores the panes');
 // touch tap: shows the name label and selects; a 7 px wobble still counts as a tap (mouse threshold is 5 px, touch 10 px)
 const cv=pq('canvas'),tip=pq('#tip');pev(cv,'pointerdown',{clientX:500,clientY:400});pev(cv,'pointermove',{clientX:507,clientY:400});pev(cv,'pointerup',{clientX:507,clientY:400,buttons:0});
 ok(tip.style.display==='block'&&tip.textContent.length>0,'phone: touch tap shows the name label ("'+tip.textContent+'")');
 ok(card.classList.contains('show')&&side.classList.contains('has-card'),'phone: touch tap on a structure also selects it (card in sheet)');
 await waitFor(()=>tip.style.display==='none',4000,'touch label to disappear');ok(tip.style.display==='none','phone: the touch label disappears after about 1.5 s');
 // viewport grows to desktop size: card returns to the viewport, sheet classes cleared
 // choosing High on a phone shows a short note about the download size, without a blocking dialog
 lodBtn(pd,'high').click();
 ok(/large download/.test(pq('#lodNote').textContent),'phone: choosing High shows a large-download note ("'+pq('#lodNote').textContent+'")');
 await waitFor(()=>lodOn(pd)==='high',30000,'phone High');
 lodBtn(pd,'low').click();await waitFor(()=>lodOn(pd)==='low',30000,'phone back to Low');
 ok(pq('#lodNote').textContent==='','phone: note cleared again on Low');
 // calendar + week overview on the phone: the overlay covers the viewport and the sheet; the gap block starts collapsed
 const psw=n=>pq('#wstrip [data-day="'+n+'"]'),pdk=n=>addDays(TODAY,n),psess=dk=>((JSON.parse(p.localStorage.getItem('aom.cal.v1')||'null')||{days:{}}).days[dk]||[]).filter(x=>x.id);
 pq('[data-tab="wk"]').click();
 ok(pqa('#wstrip [data-day]').length===7&&pq('#winbar')&&pqa('#winbar button').length===4&&pq('#winNext')&&pq('#winLast')&&pq('#addSess')&&pq('#wstrip').scrollWidth>=0,'phone: the Workout tab has the window bar (4 arrows, date input, Last/Next 7 days), the date strip and "+ Add session"');
 pq('#winNext').click();
 ok(pqa('#wstrip [data-day]').map(b=>b.dataset.date).join()===[0,1,2,3,4,5,6].map(pdk).join()&&pq('#dayLbl').textContent.includes('Monday 12 October'),'phone: "Next 7 days" starts the window today');
 pq('#qa').value='barbell bench';pq('#qa').dispatchEvent(new p.Event('input',{bubbles:true}));
 pqa('#addres [data-add]').find(b=>b.firstChild.textContent.trim()==='+ Barbell bench press').click();
 ok(pqa('#sessList .scard').length===1&&psess(pdk(0)).length===1&&pq('#sessList .strain')&&/Start/.test(pq('#sessList .strain').textContent),'phone: adding an exercise creates a session on the selected date; its card has "▶ Start"');
 psw(1).click();pq('#qa').value='barbell bench';pq('#qa').dispatchEvent(new p.Event('input',{bubbles:true}));
 pqa('#addres [data-add]').find(b=>b.firstChild.textContent.trim()==='+ Barbell bench press').click();
 ok(pqa('#wstrip [data-day]').length===7&&psw(1).classList.contains('warn'),'phone: date strip with a conflict marker on Tue');
 ok(pq('#sugMore')&&!pq('#sugMore').open,'phone: "More options" starts collapsed');
 pq('#ovOpen').click();
 ok(!pq('#ov').hidden&&pq('#vp').contains(pq('#ov'))&&pqa('#ovGrid tr.g').length===27&&pqa('#ovGrid tr.g').every(r=>r.querySelectorAll('.cb').length===7),'phone: the overview opens (full-screen overlay in the viewport) with the 27 x 7 grid');
 ok(pq('#ovGrid tr.g[data-g="1"] .cb[data-d="1"]').dataset.c==='1'&&/Recovery conflicts <b>1<\/b>/.test(pq('#ovSum').innerHTML),'phone: the conflict cell is flagged');
 // phone: the Schedule board is the default view; columns render (swipeable), the add slot and the "Move to…" fallback work
 const pcols=()=>pqa('#ovBoard .bcol'),pcards=dd=>pqa('#ovBoard .bcol[data-d="'+dd+'"] .bcard[data-d]');
 ok(!pq('#ovSch').hidden&&pq('#ovMus').hidden&&pcols().length===7&&pcards(0).length===1&&pcards(1).length===1&&pq('#ovBoard .bcol[data-d="1"] .bw'),'phone: the overview opens on the Schedule board with 7 date columns, cards and the Tue conflict marker');
 pq('#ovBoard .bslot.end[data-d="3"]').click();
 ok(!!pq('#bpq')&&pq('#ovBoard .bcol[data-d="3"] .bpick'),'phone: the add slot opens the inline picker');
 pq('#bpq').value='back squat';pq('#bpq').dispatchEvent(new p.Event('input',{bubbles:true}));
 pqa('#bpr [data-bact="pick"]').find(b=>/Back squat/.test(b.textContent)).click();
 ok(pcards(3).length===1&&pcards(3)[0].querySelector('.bnm').textContent==='Back squat'&&!pq('.bpick')&&psess(pdk(3)).length===1,'phone: picking an exercise adds it to that date (a new session)');
 const pmv=pcards(1)[0].querySelector('select.bmv');pmv.value=pdk(4);pmv.dispatchEvent(new p.Event('change',{bubbles:true}));
 ok(pcards(4).length===1&&pcards(1).length===0&&!psw(2).classList.contains('warn')&&!psw(1).classList.contains('warn'),'phone: the "Move to…" select moves a card and clears the conflict');
 pcards(4)[0].querySelector('[data-bact="rm"]').click();pcards(3)[0].querySelector('[data-bact="rm"]').click();
 pq('#ovBoard .bslot.end[data-d="1"]').click();pq('#bpq').value='bench';pq('#bpq').dispatchEvent(new p.Event('input',{bubbles:true}));
 pqa('#bpr [data-bact="pick"]').find(b=>/Barbell bench press/.test(b.textContent)).click();
 ok(pcards(1).length===1&&psw(1).classList.contains('warn'),'phone: bench back on Tue, conflict flagged again');
 // endurance on the phone: add form in the sheet, pill on the card, endurance row + balance cards in the full-screen overview
 pq('#ovClose').click();
 pq('#endOpen').click();const ps=(id,v)=>{pq(id).value=v;pq(id).dispatchEvent(new p.Event('change',{bubbles:true}));};
 ps('#endAct','muaythai');pq('#endAdd').click();
 ok(pqa('#ses .srow').length===1&&psw(1).textContent.includes('Thai 8×3′')&&pq('#endForm').hidden,'phone: Muay Thai session added through the form, pill on the Tue card');
 pq('#ovOpen').click();
 ok(pqa('#ovGrid tr.er .eb').length===7&&pq('#ovGrid tr.er .eb[data-d="1"]').dataset.m==='90'&&pq('#ovBal [data-b="vo2"]').dataset.v==='1'&&pqa('#ovBal .bc').length===4&&pq('#ovBal').closest('.ovscroll'),'phone: overview shows the endurance row (90 min on Tue) and the four balance cards');
 pq('#ovClose').click();
 pq('#ses [data-srm="0"]').click();
 ok(pqa('#ses .srow').length===0,'phone: session removed again');
 ok(pq('#ov').hidden&&sheet()!==undefined&&!!pq('#side'),'phone: "Show body" closes the overview, the sheet is untouched');
 pq('#ovOpen').click();pd.dispatchEvent(new p.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 ok(pq('#ov').hidden,'phone: Escape closes the overview');
 // a second session on the Tue date from the bottom sheet
 pq('[data-tab="wk"]').click();psw(1).click();pq('#addSess').click();
 ok(pqa('#sessList .scard').length===2&&pqa('#wstrip [data-day="1"] .pl.se').length===2,'phone: "+ Add session" adds a second session to the date, both show as chips on the card');
 pq('#sessList .scard.sel [data-sact="rm"]').click();
 // training on the phone: the Today view opens over everything, inputs are numeric, typing marks a set done and saves it
 pq('[data-tab="wk"]').click();psw(1).click();pq('#sessList .strain').click();
 const ptd=pq('#td'),tkey=pdk(1);
 ok(!ptd.hidden&&pq('#vp').contains(ptd)&&ptd.classList.contains('ov')&&pqa('#tdBody .tx').length>=1&&pqa('#tdBody .tset input[data-f="r"]').every(i=>i.getAttribute('inputmode')==='numeric')&&pqa('#tdBody .tset input[data-f="w"]').every(i=>i.getAttribute('inputmode')==='decimal'),'phone: Start opens the Today view with numeric reps/weight inputs');
 const pr=pq('#tdBody .tset input[data-f="r"]');pr.value='9';pr.dispatchEvent(new p.Event('input',{bubbles:true}));
 const plg=psess(tkey);
 ok(/^1 \/ \d+ sets/.test(pq('#tdProg').textContent.trim())&&plg.length===1&&plg[0].lg.ex[0].sets[0].r===9&&plg[0].lg.ex[0].sets[0].done===true,'phone: typing reps marks the set done and saves it in the session of that date');
 pd.dispatchEvent(new p.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 ok(ptd.hidden&&/Bench|Session/.test(psw(1).textContent)&&psw(1).querySelector('.pl.se.s-doing'),'phone: Escape closes the Today view, the Tue card shows the session in progress');
 p.__setPhone(false);
 ok(card.parentNode===pq('#vp')&&!side.classList.contains('has-card')&&!card.classList.contains('mini'),'phone->desktop: card moves back over the viewport');
 ok(pq('#hint').textContent.includes('right-drag')&&p.__dpr===2,'phone->desktop: mouse hint text restored, pixel ratio cap back to 2');
 p.__setPhone(true);
 ok(card.parentNode===pq('#cslot'),'desktop->phone: card moves into the sheet again');
}
// ---- v1.2: endurance sessions, heart-rate zones, week balance, recovery warnings, overview ----
async function endRun(){
 const cp=require('child_process'),os=require('os');
 // activity data in META + lint validation
 const A=id=>META.act.find(a=>a.id===id);
 ok(META.act.length===15&&['running','trail','cycling','spin','rowing','skierg','swimming','walking','stairs','rope','boxing','muaythai','football','basketball','other'].every(id=>A(id)),'META.act lists the 15 activities');
 ok(META.act.every(a=>a.p.every(e=>META.db[e[0]]&&e[2]>=0.2&&e[2]<=1))&&A('other').p.length===0,'every profile entry references an existing muscle with weight 0.2-1; "other" has no profile');
 const prof=(id)=>new Set(A(id).p.map(e=>e[0]));
 ok(['sternocleidomastoid','splenius capitis','psoas major','iliacus','gluteus medius','serratus anterior'].every(k=>prof('muaythai').has(k))&&['deltoid','triceps brachii','serratus anterior'].every(k=>prof('boxing').has(k))&&!prof('boxing').has('psoas major')&&['gastrocnemius','soleus','tibialis anterior','biceps femoris'].every(k=>prof('running').has(k)),'profiles: Muay Thai = boxing + hip flexors, glute med, neck; running covers calves, tibialis, hamstrings');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aom-lint-'));
 try{
  fs.mkdirSync(path.join(tmp,'data'));fs.copyFileSync(path.join(ROOT,'tools','template.html'),path.join(tmp,'template.html'));fs.copyFileSync(path.join(ROOT,'tools','meta3.json'),path.join(tmp,'meta3.json'));
  for(const f of fs.readdirSync(path.join(ROOT,'tools','data'))) fs.copyFileSync(path.join(ROOT,'tools','data',f),path.join(tmp,'data',f));
  const lint=()=>cp.spawnSync('python',[path.join(ROOT,'tools','lint.py'),tmp],{encoding:'utf8'});
  const r0=lint();
  if(r0.error) ok(true,'lint check skipped (python not available)');
  else{
   ok(r0.status===0&&/activities/.test(r0.stdout),'lint.py accepts activities.txt ('+r0.stdout.trim()+')');
   const af=path.join(tmp,'data','activities.txt'),orig=fs.readFileSync(af,'utf8');
   const bad=(t,re,msg)=>{fs.writeFileSync(af,t);const r=lint();ok(r.status===1&&re.test(r.stdout),'lint.py rejects '+msg);};
   bad(orig.replace('gastrocnemius:1,','no such muscle:1,'),/not in muscles\.txt/,'an unknown muscle key');
   bad(orig.replace('deltoid:clavicular part:.65','deltoid:wrong part:.65'),/no part 'wrong part'/,'an unknown part');
   bad(orig.replace('soleus:1,psoas','soleus:1.5,psoas'),/outside 0\.2-1/,'a weight above 1');
   bad(orig.replace('Endurance|9.8','Cardio|9.8'),/unknown activity group/,'an unknown group');
   bad(orig.replace('|easy:45\n','|rounds:45\n'),/rounds are for the Combat group/,'rounds outside combat sports');
  }
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
 // ---- UI ----
 const sel=(id,v)=>{q(id).value=v;ev(q(id),'change');};
 const addSes=(a,k,m)=>{ if(q('#endForm').hidden) q('#endOpen').click(); sel('#endAct',a); if(k) sel('#endKind',k); if(m){ sel('#endMin',m); } q('#endAdd').click(); };
 const sesOf=i=>[].concat(...sess(D(i)).map(x=>x.ses));
 const bal=b=>q('#bal [data-b="'+b+'"]'),zoneMin=z=>+q('#bal .zleg [data-z="'+z+'"]').dataset.m;
 const rowVal=n=>{const r=qa('#volsum tr').find(r=>r.cells[0].textContent.trim()===n);return r?parseFloat(r.cells[2].textContent):NaN;};
 w.localStorage.removeItem('aom.hr.v1');
 q('[data-tab="wk"]').click();clearAll();
 ok(q('#endOpen').textContent==='+ Endurance session'&&q('#endForm').hidden&&!q('#ses').textContent,'"+ Endurance session" button, form closed, no sessions yet');
 ok(bal('who').dataset.v==='0'&&bal('vo2').dataset.v==='0'&&/Add an endurance session/.test(bal('who').textContent)&&zoneMin(2)===0,'balance panel starts empty');
 // easy run, 45 min, on Day 2
 selDay(1);q('#endOpen').click();
 ok(!q('#endForm').hidden&&q('#endAct').value==='running'&&q('#endKind').value==='easy'&&q('#endMin').value==='45'&&q('#endAdd').textContent==='Add to Tue 13 Oct','form defaults: Running, Easy, 45 min, "Add to Tue 13 Oct"');
 ok([...q('#endKind').options].map(o=>o.value).join()==='easy,long,tempo,vo2,hiit','kinds for a normal activity: easy, long, tempo, vo2, hiit');
 sel('#endAct','muaythai');
 ok([...q('#endKind').options].map(o=>o.value).join()==='rounds,easy'&&q('#endKind').value==='rounds'&&q('#endMin').value==='90','Muay Thai offers rounds/easy and defaults to 90 min of rounds');
 sel('#endAct','running');
 q('#endAdd').click();
 ok(JSON.stringify(sesOf(1))==='[{"a":"running","k":"easy","min":45,"o":0}]'&&itemsOf(1).length===0&&sess(D(1)).length===1,'session stored in the date session as {a,k,min,o}: '+JSON.stringify(sesOf(1)));
 ok(q('#endForm').hidden&&/Added Running/.test(q('#dayMsg').textContent),'form closes after adding, message names the activity');
 const pill=i=>dayBtn(i).querySelector('.pl.pe,.pl.pt,.pl.ph');
 ok(pill(1)&&pill(1).textContent==='Run 45′ Z2'&&pill(1).classList.contains('pe')&&!dayBtn(1).classList.contains('rest')&&dayBtn(0).classList.contains('rest'),'Day 2 card shows a teal "Run 45′ Z2" pill; other days stay rest days');
 ok(qa('#ses .srow').length===1&&q('#ses').textContent.includes('Easy')&&/Z2 · 60–70 % HRmax/.test(q('#ses').textContent),'session row shows the zone as % HRmax while no heart rate is set: '+q('#ses .sz').textContent);
 ok(/45 min endurance in this session/.test(q('#ses').textContent)&&q('#plan').textContent.includes('rest day so far')===false,'row footer states the day total');
 ok(bal('who').dataset.v==='45'&&bal('split').dataset.easy==='100'&&bal('vo2').dataset.v==='0'&&zoneMin(2)===45&&bal('str').dataset.sets==='0','balance: 45 min Zone 2 = 45 WHO-equivalent minutes (Z2 counts as moderate), 100 % easy, no VO2max-like session');
 ok(/Below the WHO minimum/.test(bal('who').textContent)&&/Add exercises/.test(bal('str').textContent),'balance statuses: below 150, no strength yet');
 ok(/Add exercises to see your weekly volume/.test(q('#volsum').textContent)&&q('#ovBadge').textContent==='45 min','not counted as strength: the weekly table stays empty; badge "'+q('#ovBadge').textContent+'"');
 // strength unaffected by endurance
 selDay(0);addEx('Back squat');
 ok(rowVal('Quadriceps')===3&&bal('str').dataset.sets==='3'&&bal('who').dataset.v==='45'&&/^3 sets in this session/.test(q('#plan .fine').textContent.replace(/^1 exercise, /,'')),'strength table and gap filler inputs ignore endurance (Quadriceps 3 sets); WHO stays 45');
 // VO2max run on Day 3
 selDay(2);addSes('running','vo2');
 const v=sesOf(2)[0];
 ok(v&&v.k==='vo2'&&v.min===40&&v.n===4&&v.len===4&&v.rec===3,'VO2max default: 40 min, 4 x 4 min work, 3 min recoveries: '+JSON.stringify(v));
 ok(pill(2).textContent==='Run 4×4′ Z5'&&pill(2).classList.contains('ph'),'Day 3 pill "Run 4×4′ Z5" in the hard (red) style');
 ok(zoneMin(5)===16&&zoneMin(2)===45+24&&bal('who').dataset.v===String(45+24+2*16)&&bal('vo2').dataset.v==='1','VO2max run: 16 min Z5 count double (WHO eq = 45 + 24 + 2x16 = 101), 1 VO2max-like session');
 ok(bal('split').dataset.easy==='81'&&bal('split').dataset.hard==='19'&&/Aim for 75–80 % easy|On target/.test(bal('split').textContent)&&bal('split').dataset.easy>=75,'intensity split 81 % easy / 19 % hard: '+bal('split').textContent);
 // Muay Thai rounds on Day 4: 90 min, 8 x 3 min pad rounds, 1 min rest
 selDay(3);addSes('muaythai');
 const mt=sesOf(3)[0];
 ok(mt&&mt.k==='rounds'&&mt.min===90&&mt.n===8&&mt.len===3&&mt.rec===1&&mt.sp===0,'Muay Thai default: 90 min, 8 rounds x 3 min, 1 min rest: '+JSON.stringify(mt));
 ok(pill(3).textContent==='Thai 8×3′'&&pill(3).classList.contains('ph'),'pill "Thai 8×3′" (red)');
 ok(zoneMin(4)===12&&zoneMin(5)===16+12&&bal('vo2').dataset.v==='2','rounds: 24 min of work are hard (12 in Z4, 12 in Z5), so the session counts as VO2max-like (2 sessions now)');
 ok(/Technique and warm-up/.test(q('#ses').textContent)&&/Rest between rounds · <b>/.test(q('#ses').innerHTML)&&/Pad \/ bag rounds 8×3′ · <b>Z4–Z5/.test(q('#ses').innerHTML),'row lists technique, rest and round zones');
 // boxing with few rounds: below 12 hard minutes -> not VO2max-like; then raise the rounds
 selDay(4);addSes('boxing','rounds',30);
 ok(sesOf(4)[0].n===4,'boxing 30 min defaults to 4 rounds');
 q('#ses [data-sx="0"]').click();
 ok(q('#ses .sdet')&&['n','sp','len','rec'].every(f=>q('#ses .sdet [data-sf="'+f+'"]')),'"Edit rounds" expands rounds / sparring / round length / rest inputs');
 sel('#ses .sdet [data-sf="n"]','3');
 ok(sesOf(4)[0].n===3&&bal('vo2').dataset.v==='2'&&q('#ses .sdet'),'3 x 3 min = 9 hard minutes: not VO2max-like (still 2), details stay open');
 sel('#ses .sdet [data-sf="sp"]','1');
 ok(sesOf(4)[0].sp===1&&bal('vo2').dataset.v==='3'&&pill(4).textContent==='Box 4×3′','one sparring round makes 12 hard minutes: VO2max-like (3), pill counts all rounds');
 sel('#ses [data-sf="min"]','10');
 ok(sesOf(4)[0].min===10&&/structure needs 15/.test(q('#ses').textContent),'minutes shorter than the rounds: row notes what the structure needs');
 q('#ses [data-srm="0"]').click();
 ok(sesOf(4).length===0&&bal('vo2').dataset.v==='2','removing the session updates the balance');
 // card strip structure and persistence
 ok(qa('#wstrip [data-day]').length===7&&qa('#wstrip b').length===7&&q('#wstrip').scrollWidth>=0,'seven day cards, one <b> name each');
 ok(dayBtn(0).querySelector('.pl.ps').textContent==='3 sets'&&dayBtn(0).querySelector('.ld u').style.width!=='','Day 1 card: strength pill "3 sets" and a load bar');
 // heart-rate zones
 const zrow=z=>q('#hrZones tr[data-z="'+z+'"]').lastChild.textContent;
 ok(q('#hrZones').children.length===5&&zrow(2)==='–'&&/% of max|Enter your max HR/.test(q('#hrNote').textContent),'zone table lists 5 zones, no bpm until max HR or age is set');
 q('#hrAge').value='30';ev(q('#hrAge'),'change');
 ok(q('#hrMax').placeholder==='187'&&zrow(2)==='112–131 bpm'&&zrow(5)==='168–187 bpm'&&JSON.stringify(JSON.parse(w.localStorage.getItem('aom.hr.v1')))==='{"max":null,"age":30,"rest":null}','age 30 -> max 187 (208 - 0.7 x 30); Z2 = 112–131 bpm, persisted in aom.hr.v1');
 selDay(1);
 ok(/Easy · Z2 · 112–131 bpm/.test(q('#ses .sz').textContent)||/Z2 · 112–131 bpm/.test(q('#ses .sz').textContent),'session rows show bpm: '+q('#ses .sz').textContent);
 selDay(2);
 ok(/Work 4×4′ · Z5 · 168–187 bpm/.test(q('#ses').textContent),'VO2 work interval: "Work 4×4′ · Z5 · 168–187 bpm"');
 q('#hrRest').value='60';ev(q('#hrRest'),'change');
 ok(zrow(2)==='136–149 bpm'&&zrow(5)==='174–187 bpm'&&/Karvonen/.test(q('#hrNote').textContent),'resting HR 60 switches to Karvonen: Z2 = 136–149 bpm (was 112–131)');
 q('#hrMax').value='190';ev(q('#hrMax'),'change');
 ok(q('#hrMax').value==='190'&&zrow(5)==='177–190 bpm'&&/Karvonen/.test(q('#hrNote').textContent),'an entered max HR (190) wins over the age estimate');
 q('#hrRest').value='';ev(q('#hrRest'),'change');
 ok(zrow(5)==='171–190 bpm'&&/Work 4×4′ · Z5 · 171–190 bpm/.test(q('#ses').textContent),'without resting HR: Z5 = 171–190 bpm');
 q('#hrMax').value='20';ev(q('#hrMax'),'change');
 ok(q('#hrMax').value===''&&zrow(2)==='112–131 bpm','an out-of-range max HR is ignored (falls back to the age estimate)');
 q('#hrAge').value='';ev(q('#hrAge'),'change');
 // recovery warnings (warnings only)
 clearAll();
 selDay(3);addEx('Back squat');
 selDay(4);addSes('running','vo2');
 const m1=dayBtn(4);
 ok(m1.classList.contains('warn')&&m1.textContent.includes('⚠')&&/⚠ VO2max intervals: .*Quadriceps.* still recovering from Thu 15 Oct/.test(q('#ses').textContent),'heavy legs on Thu + VO2max run on Fri: warning on Fri: '+q('#ses small.warn').textContent);
 ok(!dayBtn(3).classList.contains('warn')&&/⚠ \d/.test(q('#ovBadge').textContent),'only Day 5 is flagged; the overview badge counts conflicts ('+q('#ovBadge').textContent+')');
 sel('#ses [data-sf="k"]','easy');
 ok(sesOf(4)[0].k==='easy'&&!dayBtn(4).classList.contains('warn')&&!q('#ses small.warn'),'the same run as a plain easy session: no warning');
 sel('#ses [data-sf="k"]','tempo');
 ok(sesOf(4)[0].k==='tempo'&&sesOf(4)[0].len===20&&!!q('#ses small.warn'),'tempo (Z3-4 work) is hard enough to warn again; tempo work defaults to 20 of 45 min');
 sel('#ses [data-sf="k"]','vo2');
 // a strength day after a hard endurance day is flagged on the strength row
 selDay(5);addEx('Back squat');
 ok(dayBtn(5).classList.contains('warn')&&/still recovering from Fri 16 Oct/.test(q('#plan').textContent),'squats the day after the VO2max run: the strength row warns about Fri 16 Oct');
 q('#plan [data-rm="0"]').click();
 // overview
 selDay(4);q('#ovOpen').click();
 ok(!q('#ov').hidden&&qa('#ovGrid tr.g').length===27&&qa('#ovGrid tr.er .eb').length===7&&qa('#ovGrid tr.sec th').map(t=>t.textContent).join()==='Upper push,Upper pull,Arms,Core,Lower body','overview: 27 group rows, a new Endurance row with 7 day cells, sections unchanged');
 ok(q('#ovGrid tr.er .eb[data-d="4"]').dataset.m==='40'&&q('#ovGrid tr.er .eb[data-d="4"] .zb u')&&q('#ovGrid tr.er .eb[data-d="0"]').dataset.m==='0'&&q('#ovGrid tr.er .wb').dataset.w==='40','endurance row: minutes per day with a zone-mix bar; week total 40');
 ok(q('#ovBal .bal')&&q('#ovBal [data-b="who"]').dataset.v==='56'&&q('#ovBal [data-b="vo2"]').dataset.v==='1'&&q('#ovBal .zleg [data-z="5"]').dataset.m==='16'&&q('#ovBal [data-b="str"]').dataset.sets==='3','balance cards and zone minutes also sit at the top of the overview');
 const qc=q('#ovGrid tr.g[data-g="21"] .cb[data-d="4"]');
 ok(qc.dataset.c==='1'&&qc.querySelector('.ef')&&+qc.dataset.n>=2&&qc.dataset.e==='0'&&/endurance/.test(qc.title),'Quadriceps / Day 5: conflict outline, teal endurance marker, not counted as strength sets (data-e 0, data-n '+qc.dataset.n+')');
 ok(+q('#ovGrid tr.g[data-g="21"] .cb[data-d="5"]').dataset.f>0&&+q('#ovGrid tr.g[data-g="21"] .cb[data-d="5"]').dataset.n===0,'recovery trail on Day 6 includes the endurance carry-over (f '+q('#ovGrid tr.g[data-g="21"] .cb[data-d="5"]').dataset.f+')');
 ok(/Endurance load/.test(q('#ovLeg').textContent)&&/Carried-over fatigue/.test(q('#ovLeg').textContent),'legend names the endurance marker');
 q('#ovGrid tr.er .eb[data-d="4"]').click();
 ok(/Fri 16 Oct · endurance/.test(q('#ovDet').textContent)&&/Running, vo2max intervals, 40 min/.test(q('#ovDet').textContent)&&q('#ovGrid tr.er .eb[data-d="4"]').classList.contains('sel'),'clicking an endurance cell lists its sessions: '+q('#ovDet').textContent);
 q('#ovGrid tr.g[data-g="21"] .cb[data-d="4"]').click();
 ok(/endurance: Running/.test(q('#ovDet').textContent)&&/⚠/.test(q('#ovDet').textContent)&&/Thu 15 Oct/.test(q('#ovDet').textContent),'a muscle cell lists the endurance contribution and the conflict source: '+q('#ovDet').textContent.slice(0,200));
 q('#ovClose').click();
 // 3D body: selected-day heatmap paints endurance-loaded muscles teal, strength colours win
 const tealRgb=new w.THREE.Color(d.documentElement.style.getPropertyValue('--m-end')).convertSRGBToLinear();
 const tealOf=key=>{let n=0;w.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind==='muscle'&&o.userData.key===key&&o.material.color&&Math.abs(o.material.color.r-tealRgb.r)<1e-6&&Math.abs(o.material.color.g-tealRgb.g)<1e-6)n++;});return n;};
 selDay(4);q('#tVol').click();q('[data-vs="day"]').click();
 ok(tealOf('gastrocnemius')>0&&tealOf('soleus')>0&&tealOf('gluteus maximus')>0&&tealOf('biceps')===0&&/Endurance load/.test(q('#volLegend').textContent),'volume heatmap, selected day: endurance-loaded muscles (calves, glutes) are teal; legend has "Endurance load"');
 addEx('Back squat');
 ok(tealOf('vastus lateralis')===0&&tealOf('gastrocnemius')>0,'with squats on that day too, quadriceps use the strength colours instead of teal');
 q('#tVol').click();
 // persistence: reload with the stored week (old v1.1 plan, new sessions, bad data)
 ok(sess(D(4))[0].ses.some(p=>p.a==='running'&&p.k==='vo2'&&p.min===40&&p.n===4&&p.len===4&&p.rec===3)&&sess(D(4))[0].items.some(p=>p.n==='Back squat'),'stored Fri session: strength entry plus {a:"running",k:"vo2",min:40,n:4,len:4,rec:3}');
 const r2=boot({win:TODAY,store:{'aom.plan.v3':JSON.stringify({days:[{name:'Push',items:[{n:'Barbell bench press',sets:5,v:['']}]},{name:'Run',items:[{t:'e',a:'running',k:'easy',min:45},{t:'e',a:'nonsense',k:'easy',min:30},{t:'e',a:'muaythai',k:'vo2',min:'x',n:99}]},{name:'',items:[{n:'Back squat',sets:3,v:['','']},{t:'e',a:'cycling',k:'tempo',min:60,len:90}]}]}),'aom.hr.v1':JSON.stringify({max:185,age:null,rest:55})}}),r2d=r2.document;
 await waitFor(()=>!r2d.getElementById('loading'),60000,'endurance reload instance');
 const rq=x=>r2d.querySelector(x),rqa=x=>[...r2d.querySelectorAll(x)];
 ok(rq('#wstrip [data-day="0"]').textContent.includes('Push')&&rq('#wstrip [data-day="0"]').textContent.includes('5 sets')&&!rq('#wstrip [data-day="0"] .pl.pe'),'old-format day (strength only) migrates unchanged (Day "Push" is Monday)');
 rq('#wstrip [data-day="1"]').click();
 ok(rqa('#ses .srow').length===2&&rq('#wstrip [data-day="1"]').textContent.includes('Run 45′ Z2')&&rq('#wstrip [data-day="1"]').textContent.includes('Thai 8×3′'),'sessions restored, unknown activity dropped, invalid kind/minutes fall back to the activity default (Muay Thai rounds, 90 min): '+rq('#wstrip [data-day="1"]').textContent);
 ok(/Z2 · 136–149 bpm/.test(rq('#ses').textContent)||/Z2 · 13\d–1\d\d bpm/.test(rq('#ses').textContent),'stored heart-rate settings (max 185, resting 55) apply: '+rq('#ses .sz').textContent);
 rq('#wstrip [data-day="2"]').click();
 ok(rq('#plan').textContent.includes('Back squat')&&rqa('#ses .srow').length===1&&rq('#ses [data-sf="min"]').value==='60'&&rq('#wstrip [data-day="2"]').textContent.includes('Bike 60′ Z3–4'),'mixed day: strength row and a tempo ride; tempo work clamped to the session length');
 // cleanup
 w.localStorage.removeItem('aom.hr.v1');
 clearAll();
}
// ---- schedule board in the week overview: view switch, cards, drag and drop (pointer events), keyboard moves, slot picker, steppers, persistence ----
async function boardRun(){
 const ovOpen=()=>{if(q('#ov').hidden)q('#ovOpen').click();};
 const col=dd=>q('#ovBoard .bcol[data-d="'+dd+'"]'),cards=dd=>qa('#ovBoard .bcol[data-d="'+dd+'"] .bcard[data-d]');
 const label=c=>c.querySelector('.bnm')?c.querySelector('.bnm').textContent:'E:'+c.dataset.t;
 const cn=dd=>cards(dd).map(label),keys=dd=>[].concat(...sess(D(dd)).map(x=>x.items.map(p=>({o:p.o,k:p.n})).concat(x.ses.map(p=>({o:p.o,k:'E:'+p.a}))).sort((a,b)=>a.o-b.o).map(e=>e.k)));   // combined schedule order of a date's sessions
 const live=()=>q('#ovLive').textContent.replace(/ /g,'');
 const R=(l,t,wd,h)=>({left:l,top:t,width:wd,height:h,right:l+wd,bottom:t+h,x:l,y:t});
 // jsdom has no layout: columns are 100 px wide, cards 50 px high every 60 px from y=50, the board is 700 x 600
 const gbr=w.Element.prototype.getBoundingClientRect;
 w.Element.prototype.getBoundingClientRect=function(){
  if(this.id==='ovBoard') return R(0,0,700,600);
  const c=this.classList;
  if(c&&c.contains('bcol')) return R(+this.dataset.d*100,0,100,600);
  if(c&&c.contains('bcard')&&this.dataset.d!==undefined) return R(+this.dataset.d*100,50+(+this.dataset.i)*60,100,50);
  return R(0,0,0,0);
 };
 const pev=(type,x,y,tgt,pt)=>{const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperty(e,'pointerId',{value:7});Object.defineProperty(e,'pointerType',{value:pt||'mouse'});tgt.dispatchEvent(e);return e;};
 const cx=dd=>dd*100+50,cy=i=>50+i*60+25; // centre of card slot i of day dd
 const key=(el,k,o)=>el.dispatchEvent(new w.KeyboardEvent('keydown',Object.assign({key:k,bubbles:true,cancelable:true},o||{})));
 const setv=(el,v,t)=>{el.value=v;ev(el,t||'input');};
 w.localStorage.removeItem('aom.ovview.v1');
 q('[data-tab="wk"]').click();if(!q('#ov').hidden)q('#ovClose').click();clearAll();selDay(0);
 addEx('Barbell bench press');addEx('Barbell row');selDay(1);addEx('Barbell bench press');
 ovOpen();
 // default view and layout
 ok(!q('#ovSch').hidden&&q('#ovMus').hidden&&q('#ovSw [data-ovv="sch"]').getAttribute('aria-pressed')==='true'&&q('#ovSw [data-ovv="mus"]').getAttribute('aria-pressed')==='false','overview opens on the Schedule view by default');
 ok(qa('#ovBoard .bcol').length===7&&cn(0).join()==='Barbell bench press,Barbell row'&&cn(1).join()==='Barbell bench press'&&cn(2).length===0,'board: 7 day columns with cards in plan order ('+[0,1,2].map(cn).join(' | ')+')');
 ok(col(2).classList.contains('rest')&&/Rest day/.test(col(2).querySelector('.bh2').textContent)&&col(0).querySelector('.bh2').textContent==='6 sets'&&!col(0).classList.contains('rest'),'rest days are visibly empty, busy days show their sets ("'+col(0).querySelector('.bh2').textContent+'")');
 ok(qa('#ovBoard .bslot.end').length===7&&qa('#ovBoard .bslot:not(.end)').length===qa('#ovBoard .bcard[data-d]').length,'every column has an end slot, every card has a slot before it');
 const bc=cards(0)[0];
 ok(bc.querySelector('.bst span').textContent==='3 sets'&&/Chest/.test(bc.querySelector('.bgl').textContent)&&bc.getAttribute('tabindex')==='0','strength card: name, sets stepper, muscle-group summary ("'+bc.querySelector('.bgl').textContent+'"), focusable');
 ok(col(1).querySelector('.bw')&&!col(0).querySelector('.bw')&&/still recovering/.test(cards(1)[0].querySelector('small.warn').textContent)&&!cards(0)[0].querySelector('small.warn'),'Tue header and card show the recovery conflict, Mon does not ("'+cards(1)[0].querySelector('small.warn').textContent+'")');
 // pointer drag with a mouse: Mon bench -> end of Wed
 const d0=cards(0)[0];
 pev('pointerdown',cx(0),cy(0),d0);
 pev('pointermove',cx(0)+2,cy(0)+2,d0);
 ok(!q('.bghost')&&!d0.classList.contains('dragging'),'mouse: a 3 px movement does not start a drag');
 pev('pointermove',cx(0)+30,cy(0)+20,d0);
 ok(!!q('.bghost')&&d0.classList.contains('dragging')&&/Picked up Barbell bench press/.test(live()),'mouse: after 4 px the card lifts (ghost + dimmed original, announced)');
 pev('pointermove',cx(2),300,d0);
 ok(col(2).classList.contains('dover')&&q('#ovBoard .bcol[data-d="2"] .bslot.end').classList.contains('over'),'drop target: Wed is highlighted and its end slot shows the drop indicator');
 pev('pointermove',cx(1)+5,cy(0)-20,d0);
 ok(q('#ovBoard .bcol[data-d="1"] .bslot[data-i="0"]').classList.contains('over')&&!q('#ovBoard .bslot.end.over'),'dropping above a card highlights the slot before it');
 pev('pointermove',cx(2),300,d0);
 pev('pointerup',cx(2),300,d0);
 ok(!q('.bghost')&&names(2).join()==='Barbell bench press'&&names(0).join()==='Barbell row'&&names(1).join()==='Barbell bench press','drop: bench moved from Mon to Wed (into a new session there) and persisted ('+[0,1,2].map(i=>names(i).join('+')).join(' | ')+')');
 ok(cn(2).join()==='Barbell bench press'&&cn(0).join()==='Barbell row','board re-rendered with the new order');
 ok(dayBtn(2).classList.contains('warn')&&!dayBtn(1).classList.contains('warn')&&col(2).querySelector('.bw')&&!col(1).querySelector('.bw'),'conflicts follow the move: Tue is clear, Wed (bench the day after bench) is flagged on the date card and in the board');
 ok(/Recovery conflicts <b>1<\/b>/.test(q('#ovSum').innerHTML)&&dayBtn(2).getAttribute('aria-pressed')==='true'&&qa('#plan .prow').length===1&&/Moved Barbell bench press to Wed 14 Oct, position 1 of 1/.test(live()),'summary, planner selection and live region updated ('+live()+')');
 // slot between cards 1 and 2: open the inline picker and insert at that index
 selDay(1);addEx('Back squat');addEx('Hip thrust');
 ok(cn(1).join()==='Barbell bench press,Back squat,Hip thrust','planner additions show up on the board');
 const sl=()=>q('#ovBoard .bslot[data-d="1"][data-i="1"]');
 ok(sl().getAttribute('aria-label')==='Add to Tue 13 Oct at position 2','slot between card 1 and 2 has a label ("'+sl().getAttribute('aria-label')+'")');
 sl().click();
 ok(!!q('#ovBoard .bpick')&&d.activeElement===q('#bpq')&&sl().getAttribute('aria-expanded')==='true','clicking a slot opens the picker with the search focused');
 setv(q('#bpq'),'romanian');
 ok(qa('#bpr [data-bact="pick"]').some(b=>b.firstChild.textContent==='+ Romanian deadlift'),'picker search finds exercises ("'+qa('#bpr button').map(b=>b.firstChild.textContent).join(', ')+'")');
 setv(q('#bpq'),'hammies');
 ok(qa('#bpr [data-bact="pick"]').length>0,'picker uses the alias search ("hammies")');
 q('#eqchips [data-eq="Barbell"]').click();setv(q('#bpq'),'romanian');
 ok(!!q('#bpq')&&!qa('#bpr [data-bact="pick"]').some(b=>b.firstChild.textContent==='+ Romanian deadlift')&&qa('#bpr [data-bact="pick"]').length>0,'picker respects the equipment filter (and stays open)');
 q('#eqchips [data-eq="Barbell"]').click();
 setv(q('#bpq'),'romanian');
 qa('#bpr [data-bact="pick"]').find(b=>b.firstChild.textContent==='+ Romanian deadlift').click();
 ok(names(1).join()==='Barbell bench press,Romanian deadlift,Back squat,Hip thrust'&&!q('#ovBoard .bpick'),'picked exercise is inserted at exactly index 1 and the picker closes ('+names(1).join(' | ')+')');
 ok(itemsOf(1)[1].sets===3&&cards(1)[1].querySelector('.bst span').textContent==='3 sets'&&cards(1)[1]===d.activeElement,'inserted with 3 sets and the default variation; the new card has focus');
 // reorder within a day with the pointer: Hip thrust (index 3) above Romanian deadlift (index 1)
 const th=cards(1)[3];
 pev('pointerdown',cx(1),cy(3),th);pev('pointermove',cx(1),cy(3)-30,th);pev('pointermove',cx(1),130,th);
 ok(q('#ovBoard .bcol[data-d="1"] .bslot[data-i="1"]').classList.contains('over'),'reorder: indicator line sits between card 1 and card 2');
 pev('pointerup',cx(1),130,th);
 ok(names(1).join()==='Barbell bench press,Hip thrust,Romanian deadlift,Back squat','reorder within a day: Hip thrust now second ('+names(1).join(' | ')+')');
 const t1=cards(1)[1];pev('pointerdown',cx(1),cy(1),t1);pev('pointermove',cx(1),cy(1)+8,t1);pev('pointerup',cx(1),cy(1)+8,t1);
 ok(names(1).join()==='Barbell bench press,Hip thrust,Romanian deadlift,Back squat'&&!q('.bghost'),'dropping a card where it was is a no-op');
 // Escape cancels
 const before=JSON.stringify(wk());
 const e0=cards(1)[0];pev('pointerdown',cx(1),cy(0),e0);pev('pointermove',cx(1)+40,cy(0)+10,e0);pev('pointermove',cx(4),300,e0);
 ok(!!q('.bghost'),'second drag started');
 d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 ok(!q('.bghost')&&!q('.dragging')&&!q('#ov').hidden&&/cancelled/i.test(live()),'Escape cancels the drag (overlay stays open, announced)');
 pev('pointerup',cx(4),300,e0);
 ok(JSON.stringify(wk())===before,'after Escape nothing changed, even when the button is released over another day');
 const e1=cards(1)[0];pev('pointerdown',cx(1),cy(0),e1);pev('pointermove',cx(1)+40,cy(0)+10,e1);pev('pointerup',cx(1),900,e1);
 ok(JSON.stringify(wk())===before&&!q('.bghost'),'releasing outside the board cancels the move');
 // touch: long press needed; early movement is scrolling
 const e2=cards(1)[0];pev('pointerdown',cx(1),cy(0),e2,'touch');pev('pointermove',cx(1),cy(0)+25,e2,'touch');await sleep(380);
 ok(!q('.bghost'),'touch: moving before the long press does not drag (the page may scroll)');
 pev('pointerup',cx(1),cy(0)+25,e2,'touch');
 pev('pointerdown',cx(1),cy(0),e2,'touch');await sleep(380);
 ok(!!q('.bghost')&&e2.classList.contains('dragging'),'touch: pressing for ~300 ms lifts the card');
 pev('pointermove',cx(5),cy(0),e2,'touch');pev('pointerup',cx(5),300,e2,'touch');
 ok(names(5).join()==='Barbell bench press'&&names(1).join()==='Hip thrust,Romanian deadlift,Back squat'&&!q('.bghost'),'touch: long-press drag moved the card to Sat');
 const inc=cards(5)[0].querySelector('[data-bact="inc"]');pev('pointerdown',cx(5),cy(0),inc);pev('pointermove',cx(5)+40,cy(0)+30,inc);
 ok(!q('.bghost'),'pressing the stepper button does not start a drag');pev('pointerup',cx(5)+40,cy(0)+30,inc);
 // sets stepper on a card -> plan and planner tab
 selDay(5);
 cards(5)[0].querySelector('[data-bact="inc"]').click();
 ok(itemsOf(5)[0].sets===4&&cards(5)[0].querySelector('.bst span').textContent==='4 sets'&&/4 sets/.test(q('#plan .prow .step span').textContent),'card stepper "+": 4 sets in storage, on the card and in the planner tab');
 for(let k=0;k<4;k++) cards(5)[0].querySelector('[data-bact="dec"]').click();
 ok(itemsOf(5)[0].sets===1&&cards(5)[0].querySelector('[data-bact="dec"]').getAttribute('aria-disabled')==='true'&&names(5).length===1,'"−" stops at 1 set (the × removes)');
 q('#plan [data-inc="0"]').click();
 ok(cards(5)[0].querySelector('.bst span').textContent==='2 sets','planner tab stepper updates the card');
 // endurance through a slot picker, interleaved with strength
 sl().click();
 q('#ovBoard .bpick [data-tab="en"]').click();
 ok(!!q('#bpa')&&d.activeElement===q('#bpa'),'picker "Endurance" tab shows activity, type and minutes');
 setv(q('#bpa'),'muaythai','change');
 ok(q('#bpk').value==='rounds'&&q('#bpm').value==='90','choosing Muay Thai fills the default session (rounds, 90 min)');
 setv(q('#bpm'),'75','change');
 q('#ovBoard [data-bact="padd"]').click();
 ok(keys(1).join()==='Hip thrust,E:muaythai,Romanian deadlift,Back squat'&&sesOf(1)[0].min===75,'endurance session inserted at index 1 and persisted in schedule order ('+keys(1).join(',')+')');
 const ec=cards(1)[1];
 ok(ec.classList.contains('e')&&/Thai/.test(ec.querySelector('.pl').textContent)&&ec.querySelector('.pl').classList.contains('ph')&&ec.querySelector('[data-bact="min"]').value==='75','endurance card: activity pill coloured by intensity, kind, minutes');
 ok(/75 min/.test(col(1).querySelector('.bh2').textContent),'column header shows the endurance minutes ("'+col(1).querySelector('.bh2').textContent+'")');
 setv(ec.querySelector('[data-bact="min"]'),'60','change');
 ok(sesOf(1)[0].min===60&&cards(1)[1].dataset.t==='e'&&cards(1)[1].querySelector('[data-bact="min"]').value==='60','minutes edited inline, order kept ('+keys(1).join(',')+')');
 selDay(1);
 ok(qa('#ses .srow').length===1&&q('#ses [data-sf="a"]').value==='muaythai','planner tab lists the same session');
 setv(q('#ses [data-sf="min"]'),'45','change');
 ok(sesOf(1)[0].min===45&&keys(1).join()==='Hip thrust,E:muaythai,Romanian deadlift,Back squat','editing the session in the planner keeps its place in the schedule');
 // keyboard
 let fc=cards(1)[2];fc.focus();key(fc,'ArrowRight',{altKey:true});
 ok(keys(2).join()==='Barbell bench press,Romanian deadlift'&&keys(1).join()==='Hip thrust,E:muaythai,Back squat','Alt+ArrowRight moves the focused card to the next day (same position, clamped to the end)');
 ok(d.activeElement.classList.contains('bcard')&&label(d.activeElement)==='Romanian deadlift'&&/Moved Romanian deadlift to Wed 14 Oct/.test(live()),'focus follows the moved card and the move is announced ("'+live()+'")');
 fc=d.activeElement;key(fc,'ArrowUp',{altKey:true});
 ok(keys(2).join()==='Romanian deadlift,Barbell bench press'&&label(d.activeElement)==='Romanian deadlift'&&/position 1 of 2/.test(live()),'Alt+ArrowUp moves the card up within the day');
 fc=d.activeElement;key(fc,'ArrowDown',{altKey:true});
 ok(keys(2).join()==='Barbell bench press,Romanian deadlift','Alt+ArrowDown moves it back down');
 fc=d.activeElement;key(fc,'ArrowDown',{altKey:true});
 ok(/Already last/.test(live())&&keys(2)[1]==='Romanian deadlift','Alt+ArrowDown on the last card does nothing and says so');
 selDay(0);const f0=cards(0)[0];f0.focus();const b0=JSON.stringify(wk());key(f0,'ArrowLeft',{altKey:true});
 ok(JSON.stringify(wk())===b0&&/first date/.test(live()),'Alt+ArrowLeft on the first date stays put ("'+live()+'")');
 key(cards(0)[0],'ArrowRight');
 ok(JSON.stringify(wk())===b0,'arrow keys without Alt do nothing');
 ok(qa('#ovBoard .bcard').every(c=>c.getAttribute('aria-label')&&c.getAttribute('tabindex')==='0')&&qa('#ovBoard button').every(b=>b.getAttribute('aria-label')||b.textContent.trim()),'cards are focusable and every board button has a label');
 // planner "Move to…" still works and the board follows
 selDay(5);q('#plan select.mv').value=D(4);ev(q('#plan select.mv'),'change');
 ok(names(4).join()==='Barbell bench press'&&cn(4).join()==='Barbell bench press'&&cn(5).length===0,'planner tab "Move to…" moves the row and the board reflects it');
 // remove
 const nb=cards(4).length;cards(4)[0].querySelector('[data-bact="rm"]').click();
 ok(cards(4).length===nb-1&&names(4).length===0&&/Removed Barbell bench press/.test(live()),'× removes a card');
 // picker closes on Escape
 q('#ovBoard .bslot[data-d="3"][data-i="0"]').click();
 ok(!!q('#bpq'),'end slot of an empty day opens the picker');
 key(q('#bpq'),'Escape');
 ok(!q('.bpick')&&!q('#ov').hidden,'Escape closes the picker, not the overview');
 // persisted view, muscle grid still intact
 q('#ovSw [data-ovv="mus"]').click();
 ok(!q('#ovMus').hidden&&q('#ovSch').hidden&&JSON.parse(w.localStorage.getItem('aom.ovview.v1'))==='mus'&&q('#ovSw [data-ovv="mus"]').getAttribute('aria-pressed')==='true','switch to Muscles shows the grid and stores aom.ovview.v1');
 ok(qa('#ovGrid tr.g').length===27&&qa('#ovGrid tr.g').every(r=>r.querySelectorAll('.cb').length===7)&&q('#ovGrid tr.er .eb[data-d="1"]').dataset.m==='45','the muscle grid and its endurance row follow the board edits');
 // order survives a reload; stored view is respected
 const r=boot({win:TODAY,store:{'aom.cal.v1':w.localStorage.getItem('aom.cal.v1'),'aom.tpl.v1':w.localStorage.getItem('aom.tpl.v1'),'aom.ovview.v1':'"mus"'}}),rd=r.document,rq=s=>rd.querySelector(s);
 await waitFor(()=>!rd.getElementById('loading'),60000,'reload instance');
 rq('#ovOpen').click();
 ok(!rq('#ovMus').hidden&&rq('#ovSch').hidden,'reload: the overview opens on the stored Muscles view');
 rq('#ovSw [data-ovv="sch"]').click();
 const rl=dd=>[...rd.querySelectorAll('#ovBoard .bcol[data-d="'+dd+'"] .bcard')].map(c=>c.querySelector('.bnm')?c.querySelector('.bnm').textContent:'E:'+c.querySelector('.pl').textContent.split(' ')[0]);
 ok(rl(1).join()==='Hip thrust,E:Thai,Back squat'&&rl(2).slice(-1)[0]==='Romanian deadlift'&&JSON.parse(r.localStorage.getItem('aom.ovview.v1'))==='sch','reload: interleaved order of strength and endurance is restored ('+rl(1).join(' | ')+')');
 r.close();
 // back to a clean state
 q('#ovSw [data-ovv="sch"]').click();
 q('#ovClose').click();
 w.Element.prototype.getBoundingClientRect=gbr;
 w.localStorage.removeItem('aom.ovview.v1');
 clearAll();selDay(0);
}
(async()=>{
 // startup
 const msg0=q('#loadMsg').textContent,t0=Date.now();
 while(q('#loading')){
  if(w.__fatal) die('startup IIFE threw: '+w.__fatal);
  if(q('#loadMsg')&&!/^(Loading model|Unpacking)/.test(q('#loadMsg').textContent)) die('startup error shown in #loadMsg: '+q('#loadMsg').textContent);
  if(Date.now()-t0>60000) die('startup timed out after 60 s (#loading still present, #loadMsg: "'+msg0+'")');
  await sleep(100);
 }
 ok(!w.__fatal,'startup finished, loading overlay removed in '+(Date.now()-t0)+' ms');
 ok(qa('#list .item').length>100&&q('#foot').textContent.includes('muscles in'),'anatomy index and footer built');
 // storage migration (legacy keys seeded above)
 const ls=k=>w.localStorage.getItem(k);
 ok(ls('myology.eq.v1')===null&&ls('myology.plan.v1')!==null,'legacy equipment key migrated and removed; the legacy plan key is only read (kept for rollback)');
 {const T0=tpls(),C0=wk();
  ok(T0.length===1&&T0[0].name==='Day 1'&&T0[0].items.length===2&&T0[0].items[0].n==='Back squat'&&T0[0].items[0].sets===4&&JSON.stringify(T0[0].items[0].v)==='["Wide",""]','the legacy v1 plan became the template "Day 1" in aom.tpl.v1 with option names for Back squat (Wide): '+ls('aom.tpl.v1'));
  ok(C0&&C0.v===1&&C0.mig===1&&C0.note===1&&C0.pattern.length===1&&C0.pattern[0].tid===T0[0].id&&C0.pattern[0].wd.join()==='0'&&C0.pattern[0].from===TODAY&&Object.keys(C0.days).length===0&&ls('aom.plan.v2')===null,'aom.cal.v1: one pattern row (Day 1 -> Monday, from the Monday of this week), nothing stored for dates yet (the pattern session is virtual)');
  ok(T0[0].items[1].n==='Hip thrust'&&T0[0].items[1].sets===2&&!T0[0].items.some(p=>p.n==='Removed exercise'),'entry without v kept, unknown exercise dropped');
  ok(!q('#migNote').hidden&&/weekly pattern/.test(q('#migNote').textContent),'one-time notice in the Workout tab explains the Monday..Sunday mapping');}
 ok(JSON.stringify(JSON.parse(ls('aom.eq.v1')))===JSON.stringify(OLD_EQ),'"aom.eq.v1" holds the migrated equipment list');
 ok(qa('#plan .prow').length===2&&qa('#plan .prow')[0].textContent.includes('Back squat')&&qa('#plan .prow')[0].textContent.includes('Wide'),'plan row shows the migrated variation (Wide)');
 ok(q('[data-eq="Band"]').getAttribute('aria-pressed')==='false'&&q('[data-eq="Barbell"]').getAttribute('aria-pressed')==='true','migrated equipment selection applied (Band off)');
 q('#plan [data-open="1"]').click();
 ok(q('#card h2')&&q('#card h2').textContent==='Hip thrust','opening a plan row without v selects that exercise (no throw)');
 q('#eqAll').click();
 // best exercises for a muscle
 q('[data-tab="ex"]').click();
 ok(!q('#paneEx').hidden&&q('#paneAnat').hidden,'Exercises tab is shown');
 ok(q('#bestM').value==='gluteus maximus','best-for muscle defaults to gluteus maximus');
 const eff=bestNames(),effPct=bestPct();
 ok(eff.length>0&&eff.length<=8,'best list non-empty (most effective): '+eff.slice(0,3).join(', ')+'...');
 q('[data-sort="spec"]').click();
 const spec=bestNames(),specPct=bestPct();
 ok(q('[data-sort="spec"]').getAttribute('aria-pressed')==='true','"Most specific" sort is active');
 ok(spec.length>0&&specPct.every((p,i)=>!i||p<=specPct[i-1]),'specific list non-empty and sorted by descending specificity');
 const bestFor=(m,s)=>{q('#bestM').value=m;ev(q('#bestM'),'change');q('[data-sort="'+s+'"]').click();return bestNames().join('|');};
 const diff=qa('#bestM option').map(o=>o.value).find(m=>bestFor(m,'eff')!==bestFor(m,'spec')); // gluteus maximus itself ranks identically in both
 ok(diff,'sorting by specificity changes the list for some muscle (e.g. '+diff+')');
 bestFor('gluteus maximus','eff');
 ok(bestNames().join('|')===eff.join('|'),'switching back restores the original list');
 ok(effPct.length===eff.length,'every best entry shows a percentage');
 // exercise card + variation
 const sq=exItem('Back squat');if(!ok(sq,'Back squat is listed')) return finish();
 sq.click();
 ok(C().includes('Back squat')&&C().includes('Prime movers'),'Back squat card shows name and Prime movers');
 ok(C().includes('Synergists')&&C().includes('Stabilisers'),'card lists synergists and stabilisers');
 ok(roleKeys('Prime movers').length>0,'prime movers listed as chips');
 ok(!roleKeys('Prime movers').includes('adductor magnus'),'adductor magnus is not a prime mover in the default stance');
 const wide=qa('[data-var]').find(b=>b.textContent==='Wide');if(!ok(wide,'"Wide" stance variation button exists')) return finish();
 wide.click();
 ok(roleKeys('Prime movers').includes('adductor magnus'),'Wide stance makes adductor magnus a prime mover');
 ok(qa('[data-var]').find(b=>b.textContent==='Wide').getAttribute('aria-pressed')==='true','Wide button is marked pressed');
 // add to plan
 ok(q('[data-act="add"]').textContent.includes('Add again'),'add button reads "Add again" (migrated Back squat / Wide entry is already in the plan)');
 q('[data-act="add"]').click();
 ok(plan()&&plan().length===3&&plan()[2].n==='Back squat'&&plan()[2].sets===3&&JSON.stringify(plan()[2].v)==='["Wide",""]','third plan entry (Back squat, 3 sets, Wide) stored');
 ok(q('[data-act="add"]').textContent.includes('Add again'),'add button now reads "Add again"');
 // compare
 ok(q('#cmpBanner').hidden,'comparison banner hidden before comparing');
 q('[data-act="cmp"]').click();
 ok(!q('#cmpBanner').hidden&&q('#cmpText').textContent.includes('Back squat'),'comparison banner shown and names Back squat');
 exItem('Leg press').click();
 ok(q('#cmpBanner').hidden,'banner hidden again after picking the second exercise');
 ok(C().includes('Comparison')&&C().includes('Back squat')&&C().includes('Leg press'),'comparison card shows both exercises');
 let h2=qa('#card h2');
 ok(h2.length===2&&h2[0].textContent.includes('Back squat')&&h2[1].textContent.includes('Leg press'),'A is Back squat, B is Leg press');
 ok(qa('.cmpt tbody tr').length>5,'comparison table has muscle rows');
 q('[data-act="swap"]').click();
 h2=qa('#card h2');
 ok(h2.length===2&&h2[0].textContent.includes('Leg press')&&h2[1].textContent.includes('Back squat'),'swap makes Leg press the A side');
 const mk=q('.cmpt [data-key]').dataset.key;q('.cmpt [data-key]').click();
 ok(q('#card h2')&&q('#card h2').textContent===mk&&!C().includes('Comparison')&&C().includes('Origin'),'clicking "'+mk+'" in the table opens its muscle card');
 ok(!!q('[data-act="back"]')&&/A: .*B: /.test(C()),'muscle card shows A/B roles with a Back link');
 q('[data-act="back"]').click();
 ok(C().includes('Comparison'),'Back returns to the comparison card');
 q('[data-act="cmpend"]').click();
 ok(!C().includes('Comparison')&&C().includes('Back squat'),'ending the comparison returns to the Back squat card');
 // equipment filter
 const n0=exNames().length,names0=exNames();
 ok(n0===META.ex.length,'exercise list shows all '+META.ex.length+' exercises by default (got '+n0+')');
 const barbellOnly=META.ex.filter(e=>e.eq.every(c=>c==='Barbell')).map(e=>e.n);
 ok(barbellOnly.length>5&&barbellOnly.every(n=>names0.includes(n)),'barbell-only exercises are listed ('+barbellOnly.length+')');
 q('[data-eq="Barbell"]').click();
 const n1=exNames().length;
 ok(q('[data-eq="Barbell"]').getAttribute('aria-pressed')==='false','Barbell chip is off');
 ok(n1<n0&&n1===META.ex.filter(e=>e.eq.some(c=>c!=='Barbell')).length,'disabling Barbell reduces the list ('+n0+' -> '+n1+')');
 ok(!exNames().some(n=>barbellOnly.includes(n)),'no barbell-only exercise remains');
 ok(!!exItem('Leg press'),'machine exercises remain');
 q('#eqAll').click();
 ok(exNames().length===n0&&qa('[data-eq]').every(b=>b.getAttribute('aria-pressed')==='true'),'"All" restores the full list');
 // workout plan
 q('[data-tab="wk"]').click();
 ok(!q('#paneWk').hidden,'Workout tab is shown');
 q('#wkClear').click();
 ok(qa('#plan .prow').length===0&&q('#plan .empty'),'plan cleared before the workout flow');
 addEx('Hip thrust');addEx('Pull-up');
 ok(qa('#plan .prow').length===2,'two rows in the plan');
 ok(qa('#plan .exlink').map(b=>b.textContent).join('|')==='Hip thrust|Pull-up','plan rows are Hip thrust and Pull-up');
 q('#plan [data-inc="0"]').click();
 const rows=qa('#plan .prow');
 ok(rows[0].querySelector('.step span').textContent.startsWith('4 '),'incrementing gives 4 sets on the first row');
 ok(rows[1].querySelector('.step span').textContent.startsWith('3 '),'second row stays at 3 sets');
 ok(/2 exercises, 7 sets/.test(q('#plan').textContent),'total reads "2 exercises, 7 sets"');
 ok(plan()&&plan().length===2&&plan()[0].n==='Hip thrust'&&plan()[0].sets===4,'aom.cal.v1 holds the 2 entries of the (materialised) session');
 // weekly volume
 const vrows=qa('#volsum tr'),glutes=vrows.find(r=>r.cells[0].textContent.trim()==='Glutes');
 ok(vrows.length===27,'weekly volume table has 27 rows (got '+vrows.length+')');
 ok(glutes&&parseFloat(glutes.cells[2].textContent)>0,'Glutes row has a non-zero value: '+(glutes&&glutes.cells[2].textContent.trim()));
 q('#tVol').checked=true;ev(q('#tVol'),'change');
 q('#volsum [data-key="gluteus maximus"]').click();
 ok(C().includes('Your week')&&q('#card h2').textContent==='gluteus maximus','volume mode: gluteus maximus card shows "Your week"');
 // volume toggle stays consistent with the selected exercise
 ok(q('#tVol').checked,'volume toggle is on before selecting an exercise');
 q('[data-tab="ex"]').click();exItem('Hip thrust').click();
 ok(!q('#tVol').checked&&C().includes('Hip thrust'),'selecting an exercise turns the volume toggle off');
 q('#exClear').click();
 ok(!q('#tVol').checked,'clearing the exercise leaves volume mode off');
 q('#tVol').checked=true;ev(q('#tVol'),'change');exItem('Pull-up').click();q('[data-act="cmp"]').click();exItem('Hip thrust').click();
 ok(!q('#tVol').checked&&C().includes('Comparison'),'volume toggle is off during a comparison');
 q('#exClear').click();
 // summary rows aggregate several muscles (max over members)
 q('[data-tab="wk"]').click();q('#wkClear').click();
 const rowVal=n=>{const r=qa('#volsum tr').find(r=>r.cells[0].textContent.trim()===n);return r?parseFloat(r.cells[2].textContent):NaN;};
 addEx('Copenhagen plank');
 ok(rowVal('Adductors')===3,'Adductors row counts adductor longus (prime, 3 sets) not just magnus (synergist 1.5): '+rowVal('Adductors'));
 ok(rowVal('Obliques')>0&&rowVal('Hip flexors')===0,'Copenhagen plank trains Obliques (via internal oblique too) but not Hip flexors');
 q('#wkClear').click();addEx('Wrist curl');
 ok(rowVal('Forearm flexors')===3,'Forearm flexors row counts flexor carpi radialis/ulnaris (prime, 3 sets): '+rowVal('Forearm flexors'));
 ok(q('#volsum [data-key="flexor digitorum superficialis"]'),'summary row still selects its first key');
 q('#wkClear').click();addEx('Leg extension');
 ok(rowVal('Quadriceps')===3,'Quadriceps row: '+rowVal('Quadriceps'));
 // ---- weekly-volume goal ----
 const gl=k=>w.localStorage.getItem(k),setSel=(v)=>{q('#goalSel').value=v;ev(q('#goalSel'),'change');},legend=()=>qa('#volLegend span').map(s=>s.textContent).join('|');
 const rowStat=n=>{const r=qa('#volsum tr').find(r=>r.cells[0].textContent.trim()===n);return r?r.cells[2].textContent.split('·')[1].trim():'';},rowBar=n=>{const r=qa('#volsum tr').find(r=>r.cells[0].textContent.trim()===n);return r&&r.querySelector('.vbar i')?r.querySelector('.vbar i').className:'';};
 ok(gl('aom.goal.v1')===null&&q('#goalSel').value==='hyp8'&&legend()==='Under 4|4–7.5|8–12|Over 12|None','default goal is Muscle, close to failure 8–12 with nothing stored; legend: '+legend());
 ok(qa('#goalSel option').map(o=>o.value).join()==='maintain,strength,hyp8,hyp10,custom'&&q('#goalCust').hidden,'goal select offers the four presets and Custom; custom inputs hidden');
 ok(rowStat('Quadriceps')==='Low'&&rowBar('Quadriceps')==='v0'&&qa('#volsum .vbar b').length===27,'3 sets vs 8–12: Quadriceps is "Low" (v0); every bar carries a target marker');
 setSel('maintain');
 ok(JSON.stringify(JSON.parse(gl('aom.goal.v1')))==='{"g":"maintain","lo":4,"hi":6}'&&legend()==='Under 2|2–3.5|4–6|Over 6|None','Maintain persists {g,lo,hi} to aom.goal.v1 and rewrites the legend: '+gl('aom.goal.v1')+' '+legend());
 ok(rowStat('Quadriceps')==='Below target'&&rowBar('Quadriceps')==='v1','Maintain: 3 sets is "Below target" (v1)');
 for(let k=0;k<5;k++) q('#plan [data-inc="0"]').click();
 ok(rowVal('Quadriceps')===8&&rowStat('Quadriceps')==='More than needed'&&rowBar('Quadriceps')==='v3','Maintain: 8 sets is "More than needed" (v3, not the in-target colour)');
 setSel('hyp8');
 ok(rowStat('Quadriceps')==='In target'&&rowBar('Quadriceps')==='v2'&&JSON.parse(gl('aom.goal.v1')).g==='hyp8','back to 8–12: 8 sets is "In target" (v2)');
 q('#tVol').checked=true;ev(q('#tVol'),'change');q('#volsum [data-key="vastus lateralis"]').click();
 ok(C().includes('Your week: 8 sets (in target)'),'muscle card uses the goal status: '+(C().match(/Your week[^)]*\)/)||[''])[0]);
 q('#tVol').checked=false;ev(q('#tVol'),'change');
 setSel('custom');
 ok(!q('#goalCust').hidden&&q('#goalLo').value==='8'&&q('#goalHi').value==='12'&&JSON.parse(gl('aom.goal.v1')).g==='custom','Custom shows the two inputs, starting from the current range');
 const cust=(lo,hi)=>{if(lo!==null){q('#goalLo').value=lo;ev(q('#goalLo'),'change');}if(hi!==null){q('#goalHi').value=hi;ev(q('#goalHi'),'change');}return JSON.parse(gl('aom.goal.v1'));};
 let cg=cust(6,9);
 ok(cg.g==='custom'&&cg.lo===6&&cg.hi===9&&legend()==='Under 3|3–5.5|6–9|Over 9|None','valid custom 6–9 persists and drives the legend: '+legend());
 cg=cust(null,4);
 ok(cg.lo>=1&&cg.lo<=cg.hi&&cg.hi===4&&q('#goalLo').value===String(cg.lo),'hi below lo is clamped (lo follows): '+JSON.stringify(cg));
 cg=cust(12,null);
 ok(cg.lo<=cg.hi&&cg.lo===12&&q('#goalHi').value===String(cg.hi),'lo above hi is clamped (hi follows): '+JSON.stringify(cg));
 cg=cust(0,null);cg=cust(null,99);
 ok(cg.lo===1&&cg.hi===40,'out-of-range values clamp to 1..40: '+JSON.stringify(cg));
 // ---- gap filler ----
 setSel('hyp8');q('#wkClear').click();
 const sugNames=()=>qa('#sug li .exlink').map(b=>b.textContent),sugGroups=li=>li.querySelector('small').textContent.split(' · ').slice(1).map(s=>s.replace(/ \+[\d.]+$/,''));
 ok(qa('#sug li').length===3&&/starter set/.test(q('#sug').textContent)&&new Set(sugNames()).size===3,'empty plan: three distinct starter suggestions ('+sugNames().join(', ')+')');
 addEx('Back squat');addEx('Barbell bench press');
 const sn=sugNames(),first=qa('#sug li')[0],fg=sugGroups(first),before=fg.map(rowVal);
 ok(sn.length>=1&&sn.length<=3&&!sn.some(n=>plan().some(p=>p.n===n))&&!/starter set/.test(q('#sug').textContent),'plan of squat + bench: '+sn.length+' suggestions, none already in the plan ('+sn.join(', ')+')');
 ok(fg.length>=1&&fg.length<=3&&before.every(v=>v<8),'first suggestion lists groups that are below target before adding: '+first.querySelector('small').textContent+' '+JSON.stringify(before));
 // intended behaviour of the scoring: complement the plan like a coach (a pull for squat + bench, no technical full-body lift), +N = useful sets capped at the gap to the goal's lower bound
 const exOf=n=>META.ex.find(e=>e.n===n),prime=(n,k,p)=>exOf(n).t.some(t=>t[0]===k&&(!p||!t[1]||t[1]===p)&&t[2]===3);
 ok(sn.some(n=>exOf(n).c==='Back'&&(prime(n,'latissimus dorsi')||prime(n,'trapezius','transverse part')))&&!sn.some(n=>exOf(n).c==='Full body'),'squat + bench: suggestions include a horizontal or vertical pull and no "Full body" lift ('+sn.join(', ')+')');
 const capped=qa('#sug li').every(li=>li.querySelector('small').textContent.split(' · ').slice(1).every(x=>{const m=x.match(/^(.*) \+([\d.]+)$/);return m&&+m[2]>0&&+m[2]<=8-rowVal(m[1])+1e-9;}));
 ok(capped,'each "+N" is the useful part: positive and at most the gap to 8 sets ('+qa('#sug li small').map(x=>x.textContent).join(' / ')+')');
 const added=first.querySelector('.exlink').textContent;
 first.querySelector('[data-sadd]').click();
 const pl=plan();
 ok(pl.length===3&&pl.some(p=>p.n===added&&p.sets===3),'"+ Add to <date>" adds the suggestion with 3 sets ('+added+')');
 ok(!sugNames().includes(added)&&sugNames().join()!==sn.join()&&fg.every((g,k)=>rowVal(g)>before[k]),'suggestions change after adding and the listed groups went up');
 const sx=q('#sug .exlink').textContent;q('#sug .exlink').click();
 ok(q('#card h2')&&q('#card h2').textContent===sx,'a suggestion name opens its exercise card ('+sx+')');
 q('[data-tab="wk"]').click();
 // equipment filter restricts the candidates
 const EQC=['Barbell','Dumbbells','Kettlebell','Cable','Machine','Band','Other'];
 EQC.forEach(c=>q('[data-eq="'+c+'"]').click());
 const bw=qa('#sug li .exlink').map(b=>b.textContent);
 ok(bw.length>=1&&bw.every(n=>META.ex.find(e=>e.n===n).eq.includes('Bodyweight')),'Bodyweight only: every suggestion is bodyweight-compatible ('+bw.join(', ')+')');
 q('#eqAll').click();
 // push/pull/legs plan without calf or rear-delt work: the gap filler offers one
 q('#wkClear').click();['Barbell bench press','Overhead press','Pull-up','Barbell row','Back squat','Romanian deadlift'].forEach(addEx);
 const ppl=sugNames();
 ok(ppl.some(n=>prime(n,'gastrocnemius')||prime(n,'soleus')||prime(n,'deltoid','spinal part'))&&!ppl.some(n=>exOf(n).c==='Full body'),'push/pull/legs plan: a calf or rear-delt exercise is suggested, no "Full body" lift ('+ppl.join(', ')+')');
 // when every group reaches the target the block says so (1–40 sets: add suggestions until done)
 q('#wkClear').click();cust(1,null);cg=cust(null,40);
 let guard=0;while(q('#sug [data-sadd]')&&guard++<40) q('#sug [data-sadd]').click();
 ok(/Every muscle group is at or above its target\./.test(q('#sug').textContent)&&!q('#sug [data-sadd]')&&qa('#volsum tr').every(r=>parseFloat(r.cells[2].textContent)>=1),'all 27 groups at the 1-set target after '+plan().length+' greedy additions: "Every muscle group…" shown');
 setSel('hyp8');q('#wkClear').click();
 // desktop instance: no matchMedia stub, so the phone code paths stay inactive
 ok(w.__dpr===2&&!q('#side').classList.contains('has-card')&&q('#card').parentNode===q('#vp'),'desktop: pixel ratio capped at 2, card floats in the viewport, sheet classes unused');
 ok(q('#btnLayers').getAttribute('aria-expanded')==='false'&&q('#popLayers').contains(q('#tBones'))&&q('#popLayers').contains(q('#opM')),'desktop: layer toggles and opacity sliders live in the Layers popover, closed by default');
 ok(qa('[data-view]').length===5&&q('#toolbar').contains(q('[data-view="front"]')),'desktop: view buttons are in the floating toolbar');
 // volume button
 ok(q('#btnVol')&&q('#toolbar').contains(q('#btnVol'))&&q('#btnVol').getAttribute('aria-pressed')==='false'&&q('#volToolScope').hidden,'volume button exists in toolbar, starts off (aria-pressed=false, scope hidden)');
 q('#btnVol').click();
 ok(q('#tVol').checked&&q('#btnVol').getAttribute('aria-pressed')==='true'&&!q('#volToolScope').hidden,'clicking btnVol turns volume on (#tVol checked, btnVol aria-pressed=true, scope visible)');
 ok(q('[data-vs2="week"]')&&q('[data-vs2="day"]'),'volume scope has week and day buttons');
 const prevDay=q('[data-vs="day"]').getAttribute('aria-pressed')==='true';q('[data-vs2="day"]').click();
 ok(q('[data-vs="day"]').getAttribute('aria-pressed')==='true'&&q('[data-vs2="day"]').getAttribute('aria-pressed')==='true','clicking scope day button presses both data-vs2 and data-vs day buttons');
 q('#btnVol').click();
 ok(!q('#tVol').checked&&q('#btnVol').getAttribute('aria-pressed')==='false'&&q('#volToolScope').hidden,'clicking btnVol again turns volume off (#tVol unchecked, btnVol aria-pressed=false, scope hidden)');
 if(prevDay)q('[data-vs="day"]').click();else q('[data-vs="week"]').click();
 // backup/export/import
 ok(q('#exportData')&&q('#importData')&&q('#importFile'),'backup buttons exist (export, import)');
 const oKO=w.URL.createObjectURL,oRO=w.URL.revokeObjectURL,oClick=w.HTMLAnchorElement.prototype.click,oConfirm=w.confirm,oTB=w.HTMLCanvasElement.prototype.toBlob;
 let blob=null,dl='';
 w.URL.createObjectURL=b=>{blob=b;return 'blob:mock';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){dl=this.download;};
 q('#exportData').click();
 ok(blob&&/^atlas-of-motion-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl),'export: downloads a JSON backup ('+dl+')');
 const bk=JSON.parse(await blob.text());
 ok(bk.app==='atlas-of-motion'&&bk.format===1&&bk.data&&typeof bk.data['aom.cal.v1']==='string'&&typeof bk.data['aom.tpl.v1']==='string','export: JSON has app, format and the calendar and templates (aom.cal.v1, aom.tpl.v1)');
 const fin=q('#importFile');let fileTxt='';Object.defineProperty(fin,'files',{configurable:true,get:()=>[{text:async()=>fileTxt}]});
 const imp=async t=>{fileTxt=t;fin.dispatchEvent(new w.Event('change',{bubbles:true}));await sleep(50);};
 w.confirm=()=>false; await imp(JSON.stringify({app:'atlas-of-motion',format:1,data:{'aom.test.v1':'123'}}));
 ok(w.localStorage.getItem('aom.test.v1')===null,'import: cancelling the confirm changes nothing');
 await imp(JSON.stringify({app:'wrong',format:1,data:{}}));
 ok(/Couldn't import/.test(q('#dataMsg').textContent),'import: a file from another app is rejected with a message');
 await imp('{not json');
 ok(/not valid JSON/.test(q('#dataMsg').textContent),'import: invalid JSON is rejected with a message');
 await imp(JSON.stringify({app:'atlas-of-motion',format:1,data:{'other.key':'1'}}));
 ok(/unexpected entry/.test(q('#dataMsg').textContent)&&w.localStorage.getItem('other.key')===null,'import: keys outside aom.* are refused');
 w.confirm=()=>true; await imp(JSON.stringify({app:'atlas-of-motion',format:1,data:{'aom.test.v1':'123'}}));
 ok(w.localStorage.getItem('aom.test.v1')==='123'&&/Reloading/.test(q('#dataMsg').textContent),'import: a valid backup is written to localStorage after confirming');
 w.localStorage.removeItem('aom.test.v1');await sleep(600); // let the (jsdom no-op) reload timer pass
 // save image
 dl='';w.HTMLCanvasElement.prototype.toBlob=function(cb){cb(new w.Blob(['png'],{type:'image/png'}));};
 ok(q('#saveImg'),'save image button exists');
 q('#saveImg').click();
 ok(/^atlas-of-motion-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.png$/.test(dl),'save image: downloads a PNG with a timestamp ('+dl+')');
 w.URL.createObjectURL=oKO;w.URL.revokeObjectURL=oRO;w.HTMLAnchorElement.prototype.click=oClick;w.confirm=oConfirm;w.HTMLCanvasElement.prototype.toBlob=oTB;delete fin.files;q('#dataMsg').textContent='';
 const ONLY=process.env.SMOKE_ONLY?process.env.SMOKE_ONLY.split(','):null,run=async(n,f)=>{if(!ONLY||ONLY.includes(n))await f();};   // SMOKE_ONLY=weekRun,boardRun runs just those sections (dev aid)
 await run('weekRun',weekRun);
 await run('endRun',endRun);
 await run('boardRun',boardRun);
 await run('logRun',logRun);
 await run('sugRun',sugRun);
 await run('migrateRun',migrateRun);
 await run('calRun',calRun);
 await run('settingsRun',settingsRun);
 await run('statsRun',statsRun);
 await run('pastMoveRun',pastMoveRun);
 await run('searchRun',searchRun);
 await run('movementRun',movementRun);
 await run('eyeRun',eyeRun);
 await run('variationRun',variationRun);
 await run('linkRun',linkRun);
 ok(/^v\d+\.\d+ · [0-9a-f]{7}$/.test(q('#ver').textContent)&&q('#vp').contains(q('#ver')),'version display in the viewport corner: '+q('#ver').textContent);
 await run('paletteRun',paletteRun);
 await run('camRun',camRun);
 await run('lodRun',lodRun);
 await run('nerveRun',nerveRun);
 await run('licenseRun',licenseRun);
 await run('otherRuns',otherRuns);
 await run('phoneRun',phoneRun);
 // no errors anywhere
 ok(errs.length===0,'no console errors or uncaught exceptions'+(errs.length?':\n  '+errs.slice(0,10).join('\n  '):''));
 finish();
})().catch(e=>die('test crashed: '+(e.stack||e)));
