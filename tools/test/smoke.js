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
// boot one page instance. opts.url: page URL; opts.failFetch: every fetch rejects (w.__failFetch toggles it later); opts.lod: stored "aom.lod.v1" value. opts.phone: stub matchMedia so "(max-width:760px)" and "(pointer:coarse)" match (w.__setPhone(false) flips them and fires the change listeners); otherwise matchMedia is absent (exercises the guard)
function boot(opts){
 opts=opts||{};
 const vc=new VirtualConsole();
 vc.on('error',(...a)=>errs.push('console.error: '+a.join(' ')));vc.on('jsdomError',e=>errs.push('jsdomError: '+(e.stack||e.message)));
 const dom=new JSDOM(html0,{runScripts:'outside-only',pretendToBeVisual:true,url:opts.url||'https://example.test/',virtualConsole:vc});const w=dom.window;const THREE=require('three');
 w.addEventListener('error',e=>errs.push('uncaught: '+(e.message||e.error)));
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
 } else if(opts.store){
  Object.keys(opts.store).forEach(k=>w.localStorage.setItem(k,opts.store[k]));
 } else {
  // seed legacy (pre-rename) storage to exercise the migration: variation INDEX arrays (Back squat Stance=Wide), an entry without v, an exercise that no longer exists, equipment minus Band
  w.localStorage.setItem('myology.plan.v1',JSON.stringify([{n:'Back squat',sets:4,v:[1,0]},{n:'Hip thrust',sets:2},{n:'Removed exercise',sets:3,v:[]}]));
  w.localStorage.setItem('myology.eq.v1',JSON.stringify(OLD_EQ));
 }
 if(opts.lod) w.localStorage.setItem('aom.lod.v1',opts.lod);
 w.eval(`(async()=>{try{${js.replace('(async function(){','await (async function(){')}}catch(e){window.__fatal=e.stack||String(e)}})()`);
 return w;
}
const w=boot();
const ev=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const d=w.document,C=()=>d.getElementById('card').textContent.replace(/\s+/g,' '),q=s=>d.querySelector(s),qa=s=>[...d.querySelectorAll(s)];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const exItem=n=>qa('#exlist .item').find(b=>b.textContent===n),exNames=()=>qa('#exlist .item').map(b=>b.textContent);
const roleKeys=r=>{const h=qa('#card h3').find(x=>x.textContent===r);return h?[...h.nextElementSibling.querySelectorAll('[data-key]')].map(b=>b.dataset.key):[];};
const bestNames=()=>qa('#best [data-ex]').map(b=>b.textContent),bestPct=()=>qa('#best small').map(s=>parseFloat(s.textContent));
const wk=()=>JSON.parse(w.localStorage.getItem('aom.plan.v3')||'null'),plan=()=>{const o=wk();return o?[].concat(...o.days.map(d=>d.items)):null;}; // plan(): flat list over all days of the stored week
const addRes=n=>qa('#addres [data-add]').find(b=>b.firstChild.textContent.trim()==='+ '+n);
const addEx=n=>{q('#qa').value=n.toLowerCase();ev(q('#qa'),'input');const b=addRes(n);if(!ok(b,'search offers "'+n+'"')) return;b.click();};
const days=()=>wk().days,names=i=>days()[i].items.map(p=>p.n),nameOf=i=>days()[i].name,dayBtn=i=>q('#wstrip [data-day="'+i+'"]'),selDay=i=>dayBtn(i).click();
const clearAll=()=>{for(let i=6;i>=0;i--){selDay(i);if(!q('#wkClear').disabled)q('#wkClear').click();}selDay(0);}; // empty every day
// total triangle-index count over all body meshes in the three.js scene (captured by the stubbed renderer)
const idxCount=win=>{let n=0;win.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind&&o.userData.kind!=='nerve'&&o.geometry.index)n+=o.geometry.index.count;});return n;};
const lodBtn=(doc,l)=>doc.querySelector('[data-lod="'+l+'"]'),lodOn=doc=>[...doc.querySelectorAll('[data-lod]')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.lod).join(',');
async function waitFor(f,ms,what){const t=Date.now();while(!f()){if(Date.now()-t>(ms||30000)) return ok(false,'timed out waiting for '+what);await sleep(50);}return true;}
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
 const enter=()=>q('#dayIn').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
 const rename=t=>{q('#dayRen').click();q('#dayIn').value=t;enter();};
 q('[data-tab="wk"]').click();clearAll();selDay(0);
 // week strip
 ok(qa('#wstrip [data-day]').length===7&&qa('#wstrip [data-day]').map(b=>b.firstChild.textContent).join()==='Day 1,Day 2,Day 3,Day 4,Day 5,Day 6,Day 7','week strip: seven day cards named Day 1..Day 7');
 ok(dayBtn(0).getAttribute('aria-pressed')==='true'&&qa('#wstrip .rest').length===7&&q('#dayLbl').textContent.includes('Day 1'),'Day 1 selected, all seven days are rest days (dashed)');
 // adding to the selected day
 selDay(2);addEx('Barbell bench press');
 ok(names(2).join()==='Barbell bench press'&&names(0).length===0&&qa('#plan .prow').length===1,'with Day 3 selected, the add search puts the exercise into Day 3');
 ok(!dayBtn(2).classList.contains('rest')&&dayBtn(2).textContent.includes('3')&&dayBtn(0).classList.contains('rest')&&q('#qa').placeholder==='Add an exercise to Day 3','Day 3 button shows its 3 sets, Day 1 stays a rest day');
 q('[data-tab="ex"]').click();exItem('Barbell bench press').click();
 ok(q('[data-act="add"]').textContent==='Add again to Day 3 (3 sets planned)','exercise card button names the selected day: "'+q('[data-act="add"]').textContent+'"');
 selDay(4);
 ok(q('[data-act="add"]').textContent.startsWith('Add again to Day 5'),'selecting another day updates the open exercise card');
 q('[data-act="add"]').click();
 ok(names(4).join()==='Barbell bench press'&&names(2).length===1,'"Add to Day 5" on the exercise card adds to Day 5');
 q('#exClear').click();q('[data-tab="wk"]').click();
 // weekly table = sum over the days
 selDay(0);addEx('Back squat');selDay(5);addEx('Back squat');
 ok(rowVal('Quadriceps')===6&&rowVal('Mid and lower chest')===6,'weekly table sums the days: Quadriceps 3+3, Mid and lower chest 3+3 ('+rowVal('Quadriceps')+', '+rowVal('Mid and lower chest')+')');
 ok(/3 sets on Day 6 · 12 sets in the week/.test(q('#plan').textContent),'day footer mentions the day and the week total: '+q('#plan .fine').textContent);
 // rename
 selDay(1);q('#dayRen').click();
 ok(!!q('#dayIn')&&q('#dayIn').value==='Day 2','pencil turns the day name into an input');
 q('#dayIn').value='Push day';enter();
 ok(!q('#dayIn')&&nameOf(1)==='Push day'&&dayBtn(1).firstChild.textContent==='Push day'&&q('#dayLbl').textContent.includes('Push day'),'Enter renames the day (stored "Push day", card shows the name)');
 rename('');
 ok(nameOf(1)==='Day 2'&&dayBtn(1).firstChild.textContent==='Day 2','an empty name falls back to "Day 2"');
 rename('Legs and glutes day long');
 ok(nameOf(1)==='Legs and glutes'&&nameOf(1).length<=16,'names are cut at 16 characters ("'+nameOf(1)+'")');
 rename('<b>Push</b>');
 ok(!q('#dayLbl b')&&qa('#wstrip b').length===7&&q('#dayLbl').textContent.includes('<b>Push</b>'),'day names are escaped in the UI');
 q('#dayRen').click();q('#dayIn').value='Pull';q('#dayIn').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 ok(!q('#dayIn')&&nameOf(1)!=='Pull','Escape cancels the rename');
 rename('Pull');
 ok(nameOf(1)==='Pull'&&dayBtn(1).firstChild.textContent==='Pull'&&q('#qa').placeholder==='Add an exercise to Pull','rename persisted in aom.plan.v3, used in the strip and the add placeholder');
 // copy / clear / move
 selDay(0);
 ok(!q('#dayCopy').disabled&&qa('#dayCopy option').length===7,'copy select lists the six other days');
 q('#dayCopy').value='3';ev(q('#dayCopy'),'change');
 ok(names(3).join()==='Back squat'&&names(0).join()==='Back squat'&&/Copied 1 exercise to Day 4/.test(q('#dayMsg').textContent),'Copy day to… copies the exercises ('+q('#dayMsg').textContent+')');
 q('#dayCopy').value='3';ev(q('#dayCopy'),'change');
 ok(names(3).length===1&&/already/.test(q('#dayMsg').textContent),'copying again does not duplicate');
 selDay(3);q('#wkClear').click();
 ok(names(3).length===0&&dayBtn(3).classList.contains('rest')&&names(0).length===1,'Clear day empties only the selected day');
 selDay(0);q('#plan select.mv').value='6';ev(q('#plan select.mv'),'change');
 ok(names(6).join()==='Back squat'&&names(0).length===0&&q('#dayLbl').textContent.includes('Day 1'),'"Move to…" moves the row to Day 7 and stays on Day 1');
 selDay(1);rename('');selDay(0);
 // recovery model: bench Day 1 + Day 2 flags, Day 1 + Day 3 does not
 clearAll();selDay(0);addEx('Barbell bench press');selDay(1);
 ok(!q('#wstrip .warn'),'bench on Day 1 alone: no conflict');
 addEx('Barbell bench press');
 ok(dayBtn(1).classList.contains('warn')&&dayBtn(1).textContent.includes('⚠')&&!dayBtn(0).classList.contains('warn'),'bench Day 1 + Day 2: week strip shows ⚠ on Day 2 only');
 ok(/Mid and lower chest/.test(q('#plan .prow small.warn').textContent)&&/still recovering from Day 1/.test(q('#plan .prow small.warn').textContent),'row note: "'+q('#plan .prow small.warn').textContent+'"');
 ok(!/Upper chest/.test(q('#plan .prow small.warn').textContent),'Upper chest (1.5 effective sets) is not flagged at 3 sets');
 ok(/1 exercise, 3 sets/.test(q('#plan').textContent),'singular exercise wording');
 ovOpen();
 ok(cell(GCHEST,1).dataset.c==='1'&&cell(GCHEST,1).textContent.includes('⚠')&&cell(GCHEST,1).dataset.e==='3'&&cell(GCHEST,0).dataset.c==='0','overview: Mid and lower chest on Day 2 is flagged (⚠), Day 1 is not');
 ok(/Mid and lower chest: 3 sets on Day 1, still recovering on Day 2/.test(cell(GCHEST,1).title),'cell tooltip: "'+cell(GCHEST,1).title+'"');
 ok(cell(GCHEST,1).dataset.f==='1.8'&&cell(GCHEST,0).dataset.f==='0','carry-over on Day 2 = 0.6 x 3 sets = 1.8, none on Day 1');
 ok(/Recovery conflicts <b>1<\/b>/.test(q('#ovSum').innerHTML),'summary line counts the conflict: "'+q('#ovSum').textContent+'"');
 q('#ovClose').click();
 selDay(1);q('#plan [data-rm="0"]').click();selDay(2);addEx('Barbell bench press');
 ok(!q('#wstrip .warn'),'bench Day 1 + Day 3: no conflict flagged for 3 sets');
 q('#plan [data-inc="0"]').click();selDay(0);q('#plan [data-inc="0"]').click();
 ok(!q('#wstrip .warn'),'bench Day 1 + Day 3 with 4 sets each: still no conflict');
 selDay(1);addEx('Barbell bench press');q('#plan [data-inc="0"]').click();
 ok(dayBtn(1).classList.contains('warn')&&dayBtn(2).classList.contains('warn')&&!dayBtn(0).classList.contains('warn'),'4-set bench on Days 1, 2 and 3 flags Day 2 and Day 3');
 clearAll();selDay(6);addEx('Barbell bench press');selDay(0);addEx('Barbell bench press');
 ok(dayBtn(0).classList.contains('warn')&&!dayBtn(6).classList.contains('warn'),'the week wraps: bench on Day 7 and Day 1 flags Day 1');
 // overview open / close
 clearAll();selDay(0);addEx('Barbell bench press');addEx('Barbell row');selDay(3);addEx('Back squat');
 ok(q('#ov').hidden,'overview closed by default');
 q('#ovOpen').click();
 ok(!q('#ov').hidden&&q('#vp').contains(q('#ov'))&&d.activeElement===q('#ovClose'),'"Week overview" opens the overlay inside #vp and focuses its close button');
 ok(qa('#ovGrid tr.g').length===27&&qa('#ovGrid tr.g').every(r=>r.querySelectorAll('.cb').length===7&&r.querySelectorAll('.wb').length===1)&&qa('#ovGrid thead [data-oday]').length===7,'grid: 27 group rows x 7 day columns + a week column, 7 day headers');
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
 ok(+cell(GCHEST,0).dataset.e===exp('Barbell bench press','pectoralis major','sternocostal part',3)&&+cell(GCHEST,3).dataset.e===0,'Mid and lower chest: Day 1 = bench 3 sets x prime mover (3), Day 4 = 0');
 const rowOf=l=>qa('#ovGrid tr.g').find(r=>r.querySelector('th').textContent===l);
 ok(+rowOf('Quadriceps').querySelector('.cb[data-d="3"]').dataset.e===exp('Back squat','vastus lateralis','',3)&&+rowOf('Quadriceps').querySelector('.cb[data-d="0"]').dataset.e===0,'Quadriceps: Day 4 = back squat 3 sets x prime mover');
 ok(qa('#ovGrid tr.g').every(r=>{const v=rowVal(r.querySelector('th').textContent),dsum=qa('.cb',r).reduce((a,c)=>a+(+c.dataset.e),0);return Math.abs(v-(+r.querySelector('.wb').dataset.w))<1e-9&&v<=dsum+1e-9;}),'week column equals the weekly table for all 27 groups (and never exceeds the sum of the days)');
 ok(+rowOf('Quadriceps').querySelector('.wb').dataset.w===3&&rowOf('Quadriceps').querySelector('.wb').className.includes('v0'),'week column carries the goal band class (3 of 8 sets = Low, v0)');
 ok(/Training days <b>2<\/b>/.test(q('#ovSum').innerHTML)&&/Total sets <b>9<\/b>/.test(q('#ovSum').innerHTML),'summary: 2 training days, 9 sets');
 cell(GCHEST,0).click();
 ok(/Mid and lower chest · Day 1/.test(q('#ovDet').textContent)&&q('#ovDet').textContent.includes('Barbell bench press')&&cell(GCHEST,0).classList.contains('sel'),'clicking a cell lists the exercises that hit the group: '+q('#ovDet').textContent.slice(0,90));
 cell(GCHEST,1).click();
 ok(/not trained/.test(q('#ovDet').textContent)&&/Carry-over 1\.8 \(recovering/.test(q('#ovDet').textContent),'an untrained cell shows its carry-over: '+q('#ovDet').textContent);
 q('#ovGrid [data-oday="4"]').click();
 ok(dayBtn(4).getAttribute('aria-pressed')==='true'&&q('#dayLbl').textContent.includes('Day 5'),'clicking a day header selects that day in the planner');
 selDay(1);addEx('Barbell bench press');
 ok(cell(GCHEST,1).dataset.c==='1'&&/Recovery conflicts <b>1<\/b>/.test(q('#ovSum').innerHTML),'overview updates live while open');
 q('#ovClose').click();
 // volume heatmap: whole week / selected day
 const amberHex=new w.THREE.Color(0xcfae7a).convertSRGBToLinear();
 const amberOf=key=>{let n=0;w.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind==='muscle'&&(!key||o.userData.key===key)&&o.material.color&&Math.abs(o.material.color.r-amberHex.r)<1e-6&&Math.abs(o.material.color.g-amberHex.g)<1e-6)n++;});return n;};
 q('#tVol').checked=true;ev(q('#tVol'),'change');
 ok(!q('#volScope').hidden&&q('[data-vs="week"]').getAttribute('aria-pressed')==='true','volume mode shows the Whole week / Selected day toggle');
 q('[data-vs="day"]').click();selDay(1);
 ok(q('[data-vs="day"]').getAttribute('aria-pressed')==='true'&&/Still recovering/.test(q('#volLegend').textContent),'Selected day: the legend adds "Still recovering"');
 ok(amberOf('pectoralis major')===0&&amberOf()>0,'Day 2 trains chest: chest keeps its volume colour, other groups still recovering from Day 1 are amber ('+amberOf()+' meshes)');
 selDay(2);
 ok(amberOf('pectoralis major')>0,'Day 3: chest (trained on Days 1 and 2) shows the amber recovery material');
 q('[data-vs="week"]').click();
 ok(amberOf()===0&&!/Still recovering/.test(q('#volLegend').textContent),'Whole week: no amber again');
 q('#tVol').checked=false;ev(q('#tVol'),'change');
 ok(q('#volScope').hidden,'toggle hidden when volume mode is off');
 // ---- planned exercises are marked wherever exercises are listed ----
 clearAll();selDay(0);
 q('[data-tab="ex"]').click();exItem('Back squat').click();
 qa('[data-var]').find(b=>b.textContent==='Wide').click();q('[data-act="add"]').click();
 q('[data-tab="wk"]').click();selDay(3);q('[data-tab="ex"]').click();
 qa('[data-var]').find(b=>b.textContent==='Shoulder-width').click();qa('[data-var]').find(b=>b.textContent==='Parallel').click();q('[data-act="add"]').click();
 q('[data-tab="wk"]').click();
 ok(JSON.stringify(days()[0].items[0].v)==='["Wide",""]'&&names(3).join()==='Back squat'&&days()[3].items[0].v.join('')==='','Back squat (Wide) on Day 1, default Back squat on Day 4');
 q('#volsum [data-key="adductor magnus"]').click();
 const xrow=t=>qa('#card .ext tbody tr').find(r=>r.querySelector('.exlink').textContent===t);
 let rb=xrow('Back squat'),rw=xrow('Back squat (Wide)');
 ok(rb&&rw,'adductor magnus card lists both the base and the Wide entry of Back squat');
 ok(rb.classList.contains('inplan')&&/In plan · Day 4 · 3 sets/.test(rb.querySelector('.pbadge').textContent),'base row marked: "'+(rb.querySelector('.pbadge')||{}).textContent+'"');
 ok(rw.classList.contains('inplan')&&/In plan · Day 1 · 3 sets/.test(rw.querySelector('.pbadge').textContent),'Wide row marked with Day 1 only: "'+(rw.querySelector('.pbadge')||{}).textContent+'"');
 ok(qa('#card .ext tbody tr').filter(r=>r.classList.contains('inplan')).length===2&&qa('#card .ext tbody tr').some(r=>!r.classList.contains('inplan')&&!r.querySelector('.pbadge')),'unplanned rows carry no mark');
 selDay(3);q('#plan [data-rm="0"]').click();
 rb=xrow('Back squat');rw=xrow('Back squat (Wide)');
 ok(!rb.classList.contains('inplan')&&/Planned as: Wide/.test(rb.querySelector('.pother').textContent)&&rw.classList.contains('inplan'),'only the Wide variation planned: the base row gets the subtle "Planned as: Wide", the Wide row stays marked (card re-rendered live)');
 selDay(0);q('#plan [data-inc="0"]').click();selDay(5);addEx('Back squat');
 rw=xrow('Back squat (Wide)');rb=xrow('Back squat');
 ok(/Day 1 · 4 sets/.test(rw.querySelector('.pbadge').textContent)&&/Day 6 · 3 sets/.test(rb.querySelector('.pbadge').textContent),'badges follow edits (Wide 4 sets on Day 1, base on Day 6)');
 selDay(5);q('#plan [data-rm="0"]').click();selDay(0);q('#plan [data-rm="0"]').click();
 ok(!qa('#card .ext tbody tr').some(r=>r.classList.contains('inplan')||r.querySelector('.pbadge')||r.querySelector('.pother')),'removing the exercises from the plan clears every mark');
 q('#card .close').click();
 selDay(1);addEx('Hip thrust');
 q('[data-tab="ex"]').click();q('#bestM').value='gluteus maximus';ev(q('#bestM'),'change');q('[data-sort="eff"]').click();
 const bl=qa('#best li').find(l=>l.querySelector('.exlink').textContent==='Hip thrust');
 ok(bl&&bl.classList.contains('inplan')&&bl.querySelector('.ptag')&&/Day 2/.test(bl.querySelector('.ptag').title),'Best-for list marks the planned Hip thrust ("planned" tag)');
 ok(qa('#best li.inplan').every(l=>/^Hip thrust/.test(l.querySelector('.exlink').textContent)),'no other best-for entry is marked');
 ok(exItem('Hip thrust').classList.contains('inplan')&&!exItem('Back squat').classList.contains('inplan')&&/Day 2/.test(exItem('Hip thrust').title),'exercise list marks Hip thrust only');
 q('[data-tab="wk"]').click();selDay(1);q('#plan [data-rm="0"]').click();
 ok(!exItem('Hip thrust').classList.contains('inplan')&&qa('#best li.inplan').length===0,'marks vanish when the exercise leaves the plan');
 clearAll();selDay(0);
}
// ---- gap filler: summary chips, top picks, alternatives, options, day placement ----
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
 ok(cards().length>=1&&cards().length<=3&&/^(⚠ )?Day \d · (no recovery conflict|rest day, no recovery conflict|still overlaps recovery)$/.test(c0.querySelector('.dy').textContent),'top pick shows its day and why: "'+c0.querySelector('.dy').textContent+'"');
 ok(/^(Prime mover|Synergist) for /.test(c0.querySelector('.rsn').textContent)&&/^\+ Add to Day \d/.test(c0.querySelector('[data-sadd]').textContent),'top pick shows a reason ("'+c0.querySelector('.rsn').textContent+'") and "+ Add to Day N"');
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
 ok(c1.querySelector('.step span').textContent==='5 sets'&&label==='+ Add to '+nameOf(sd),'button names the target day: "'+label+'"');
 c1.querySelector('[data-sadd]').click();
 const it=days()[sd].items.find(p=>p.n===name1);
 ok(it&&it.sets===5&&dayBtn(sd).getAttribute('aria-pressed')==='true','the 5-set entry landed on the shown day ('+nameOf(sd)+'), which is now selected');
 // variation select
 let found=null;
 for(const ch of chips()){ const gl=ch.firstChild.textContent.trim(); chip(gl).click(); const c=cards().find(c=>c.querySelector('select.sv')); if(c){found=c;break;} }
 if(ok(found,'some suggestion offers a variation select')){
  const fn=nm(found),sel=found.querySelector('select.sv'),gi=+sel.dataset.sv.split(':')[1],opts=exOf(fn).v[gi][1];
  sel.value=String(opts.length-1);ev(sel,'change');
  const f2=cards().find(c=>nm(c)===fn),sd2=+f2.querySelector('[data-sadd]').dataset.sday;
  ok(f2.querySelector('select.sv').value===String(opts.length-1),'variation select keeps the choice after re-render');
  f2.querySelector('[data-sadd]').click();
  const it2=days()[sd2].items.find(p=>p.n===fn);
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
 // placement: chest trained on Day 1 -> chest exercises are not put on Day 2 or Day 7
 goal('hyp8');clearAll();selDay(0);addEx('Barbell bench press');
 more();
 chip('Mid and lower chest').click();
 const days4=cards().map(c=>+c.querySelector('[data-sadd]').dataset.sday);
 ok(cards().length>=2&&days4.every(x=>x!==1&&x!==6),'chest options never land the day after (Day 2) or before (Day 7) the bench day: Days '+days4.map(x=>x+1).join(','));
 ok(cards().every(c=>!/⚠|overlaps/.test(c.querySelector('.dy').textContent)),'and are shown without a recovery warning');
 cards()[0].querySelector('[data-sadd]').click();
 ok(!q('#wstrip .warn'),'adding the first chest option creates no conflict');
 // a rest day is used (and said so) when training days would overlap
 clearAll();selDay(0);addEx('Barbell bench press');selDay(1);addEx('Barbell row');selDay(2);addEx('Back squat');selDay(3);addEx('Romanian deadlift');
 q('[data-gap="all"]').click();
 chip('Mid and lower chest')&&chip('Mid and lower chest').click();
 ok(!chip('Mid and lower chest')||cards().every(c=>+c.querySelector('[data-sday]').dataset.sday!==1),'with Days 1-4 trained, chest work is not offered for Day 2');
 // empty state + balance check
 clearAll();selDay(0);
 q('#goalSel').value='custom';ev(q('#goalSel'),'change');q('#goalLo').value='1';ev(q('#goalLo'),'change');q('#goalHi').value='40';ev(q('#goalHi'),'change');
 let guard=0;while(q('#sug li.sg [data-sadd]')&&guard++<40) q('#sug li.sg [data-sadd]').click();
 ok(/Every muscle group is at or above its target\./.test(q('#sug').textContent)&&!q('#sug [data-gap]'),'no gaps: "Every muscle group is at or above its target", no chips');
 selDay(0);addEx('Barbell bench press');selDay(1);addEx('Barbell bench press');
 ok(/Balance check/.test(q('#sug').textContent)&&/still recovering on Day/.test(q('#sug').textContent),'with no gaps but a recovery conflict, a "Balance check" line explains it: '+(q('#sug .fine b')?q('#sug').textContent.slice(0,160):''));
 goal('hyp8');clearAll();selDay(0);
}
async function migrateRun(){
 const m=boot({store:{'aom.plan.v2':JSON.stringify([{n:'Back squat',sets:4,v:['Wide','']},{n:'Hip thrust',sets:2},{n:'Removed exercise',sets:3}])}}),md=m.document;
 await waitFor(()=>!md.getElementById('loading'),60000,'migration instance');
 const ls=k=>m.localStorage.getItem(k),v3=JSON.parse(ls('aom.plan.v3')||'null');
 ok(v3&&v3.days.length===7&&v3.days[0].items.length===2&&v3.days[0].items[0].n==='Back squat'&&v3.days[0].items[0].sets===4&&JSON.stringify(v3.days[0].items[0].v)==='["Wide",""]'&&v3.days.slice(1).every(x=>x.items.length===0),'aom.plan.v2 entries land in Day 1 of aom.plan.v3 (unknown exercise dropped)');
 ok(ls('aom.plan.v2')===null,'aom.plan.v2 removed after migration');
 ok(md.querySelectorAll('#plan .prow').length===2&&md.querySelector('#plan').textContent.includes('Wide')&&md.querySelector('#wstrip [data-day="0"]').textContent.includes('6')&&md.querySelectorAll('#wstrip .rest').length===6,'migrated plan shows in Day 1 (6 sets), six rest days');
 // reload with the v3 data: names and several days survive
 const w2=boot({store:{'aom.plan.v3':JSON.stringify({days:[{name:'Push',items:[{n:'Barbell bench press',sets:5,v:['']}]},{name:'',items:[]},{name:'Legs',items:[{n:'Back squat',sets:3,v:['Wide','Deep']}]}]})}}),d2=w2.document;
 await waitFor(()=>!d2.getElementById('loading'),60000,'v3 reload instance');
 ok(d2.querySelector('#wstrip [data-day="0"]').textContent.startsWith('Push')&&d2.querySelector('#wstrip [data-day="1"]').textContent.startsWith('Day 2')&&d2.querySelector('#wstrip [data-day="2"]').textContent.startsWith('Legs')&&d2.querySelectorAll('#wstrip [data-day]').length===7,'stored names restored (empty -> "Day 2"), missing days padded to seven');
 d2.querySelector('#wstrip [data-day="2"]').click();
 ok(d2.querySelector('#plan').textContent.includes('Back squat')&&d2.querySelector('#plan').textContent.includes('Wide, Deep'),'Day 3 holds Back squat (Wide, Deep)');
}
// ---- quality levels (main desktop instance) ----
async function lodRun(){
 const L=META.lod,ls=k=>w.localStorage.getItem(k);
 ok(['low','medium','high'].every(l=>L[l]&&L[l].file.startsWith('geo/'+l+'.bin?v=')&&L[l].file.length===('geo/'+l+'.bin?v=').length+10&&L[l].bytes>0)&&L.low.faces<L.medium.faces&&L.medium.faces<L.high.faces,'META.lod describes three increasing levels ('+['low','medium','high'].map(l=>L[l].faces).join(' < ')+' triangles)');
 ok(qa('[data-lod]').length===3&&q('#popLayers').contains(q('#segLod'))&&q('[data-lod="high"]').dataset.faces==String(L.high.faces)&&q('[data-lod="high"]').textContent.includes((L.high.bytes/1e6).toFixed(1)+' MB'),'Quality control (Low/Medium/High with sizes) lives in the Layers popover');
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
// ---- phone instance: matchMedia reports max-width:760px and a coarse pointer ----
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
 // training days + week overview on the phone: the overlay covers the viewport and the sheet; the gap block starts collapsed
 pq('[data-tab="wk"]').click();pq('#qa').value='barbell bench';pq('#qa').dispatchEvent(new p.Event('input',{bubbles:true}));
 pqa('#addres [data-add]').find(b=>b.firstChild.textContent.trim()==='+ Barbell bench press').click();
 pq('#wstrip [data-day="1"]').click();pq('#qa').value='barbell bench';pq('#qa').dispatchEvent(new p.Event('input',{bubbles:true}));
 pqa('#addres [data-add]').find(b=>b.firstChild.textContent.trim()==='+ Barbell bench press').click();
 ok(pqa('#wstrip [data-day]').length===7&&pq('#wstrip [data-day="1"]').classList.contains('warn'),'phone: week strip with a conflict marker on Day 2');
 ok(pq('#sugMore')&&!pq('#sugMore').open,'phone: "More options" starts collapsed');
 pq('#ovOpen').click();
 ok(!pq('#ov').hidden&&pq('#vp').contains(pq('#ov'))&&pqa('#ovGrid tr.g').length===27&&pqa('#ovGrid tr.g').every(r=>r.querySelectorAll('.cb').length===7),'phone: the overview opens (full-screen overlay in the viewport) with the 27 x 7 grid');
 ok(pq('#ovGrid tr.g[data-g="1"] .cb[data-d="1"]').dataset.c==='1'&&/Recovery conflicts <b>1<\/b>/.test(pq('#ovSum').innerHTML),'phone: the conflict cell is flagged');
 // phone: the Schedule board is the default view; columns render (swipeable), the add slot and the "Move to…" fallback work
 const pcols=()=>pqa('#ovBoard .bcol'),pcards=dd=>pqa('#ovBoard .bcol[data-d="'+dd+'"] .bcard[data-d]');
 ok(!pq('#ovSch').hidden&&pq('#ovMus').hidden&&pcols().length===7&&pcards(0).length===1&&pcards(1).length===1&&pq('#ovBoard .bcol[data-d="1"] .bw'),'phone: the overview opens on the Schedule board with 7 day columns, cards and the Day 2 conflict marker');
 pq('#ovBoard .bslot.end[data-d="3"]').click();
 ok(!!pq('#bpq')&&pq('#ovBoard .bcol[data-d="3"] .bpick'),'phone: the add slot opens the inline picker');
 pq('#bpq').value='back squat';pq('#bpq').dispatchEvent(new p.Event('input',{bubbles:true}));
 pqa('#bpr [data-bact="pick"]').find(b=>/Back squat/.test(b.textContent)).click();
 ok(pcards(3).length===1&&pcards(3)[0].querySelector('.bnm').textContent==='Back squat'&&!pq('.bpick'),'phone: picking an exercise adds it to that day');
 const pmv=pcards(1)[0].querySelector('select.bmv');pmv.value='4';pmv.dispatchEvent(new p.Event('change',{bubbles:true}));
 ok(pcards(4).length===1&&pcards(1).length===0&&!pq('#wstrip [data-day="2"]').classList.contains('warn')&&!pq('#wstrip [data-day="1"]').classList.contains('warn'),'phone: the "Move to…" select moves a card and clears the conflict');
 pcards(4)[0].querySelector('[data-bact="rm"]').click();pcards(3)[0].querySelector('[data-bact="rm"]').click();
 pq('#ovBoard .bslot.end[data-d="1"]').click();pq('#bpq').value='bench';pq('#bpq').dispatchEvent(new p.Event('input',{bubbles:true}));
 pqa('#bpr [data-bact="pick"]').find(b=>/Barbell bench press/.test(b.textContent)).click();
 ok(pcards(1).length===1&&pq('#wstrip [data-day="1"]').classList.contains('warn'),'phone: bench back on Day 2, conflict flagged again');
 // endurance on the phone: add form in the sheet, pill on the card, endurance row + balance cards in the full-screen overview
 pq('#ovClose').click();
 pq('#endOpen').click();const ps=(id,v)=>{pq(id).value=v;pq(id).dispatchEvent(new p.Event('change',{bubbles:true}));};
 ps('#endAct','muaythai');pq('#endAdd').click();
 ok(pqa('#ses .srow').length===1&&pq('#wstrip [data-day="1"]').textContent.includes('Thai 8×3′')&&pq('#endForm').hidden,'phone: Muay Thai session added through the form, pill on the Day 2 card');
 pq('#ovOpen').click();
 ok(pqa('#ovGrid tr.er .eb').length===7&&pq('#ovGrid tr.er .eb[data-d="1"]').dataset.m==='90'&&pq('#ovBal [data-b="vo2"]').dataset.v==='1'&&pqa('#ovBal .bc').length===4&&pq('#ovBal').closest('.ovscroll'),'phone: overview shows the endurance row (90 min on Day 2) and the four balance cards');
 pq('#ovClose').click();
 pq('#ses [data-srm="0"]').click();
 ok(pqa('#ses .srow').length===0,'phone: session removed again');
 ok(pq('#ov').hidden&&sheet()!==undefined&&!!pq('#side'),'phone: "Show body" closes the overview, the sheet is untouched');
 pq('#ovOpen').click();pd.dispatchEvent(new p.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 ok(pq('#ov').hidden,'phone: Escape closes the overview');
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
 const sesOf=i=>days()[i].items.filter(p=>p.t==='e');
 const bal=b=>q('#bal [data-b="'+b+'"]'),zoneMin=z=>+q('#bal .zleg [data-z="'+z+'"]').dataset.m;
 const rowVal=n=>{const r=qa('#volsum tr').find(r=>r.cells[0].textContent.trim()===n);return r?parseFloat(r.cells[2].textContent):NaN;};
 w.localStorage.removeItem('aom.hr.v1');
 q('[data-tab="wk"]').click();clearAll();
 ok(q('#endOpen').textContent==='+ Endurance session'&&q('#endForm').hidden&&!q('#ses').textContent,'"+ Endurance session" button, form closed, no sessions yet');
 ok(bal('who').dataset.v==='0'&&bal('vo2').dataset.v==='0'&&/Add an endurance session/.test(bal('who').textContent)&&zoneMin(2)===0,'balance panel starts empty');
 // easy run, 45 min, on Day 2
 selDay(1);q('#endOpen').click();
 ok(!q('#endForm').hidden&&q('#endAct').value==='running'&&q('#endKind').value==='easy'&&q('#endMin').value==='45'&&q('#endAdd').textContent==='Add to Day 2','form defaults: Running, Easy, 45 min, "Add to Day 2"');
 ok([...q('#endKind').options].map(o=>o.value).join()==='easy,long,tempo,vo2,hiit','kinds for a normal activity: easy, long, tempo, vo2, hiit');
 sel('#endAct','muaythai');
 ok([...q('#endKind').options].map(o=>o.value).join()==='rounds,easy'&&q('#endKind').value==='rounds'&&q('#endMin').value==='90','Muay Thai offers rounds/easy and defaults to 90 min of rounds');
 sel('#endAct','running');
 q('#endAdd').click();
 ok(JSON.stringify(sesOf(1))==='[{"t":"e","a":"running","k":"easy","min":45}]'&&days()[1].items.length===1,'session stored in aom.plan.v3 items as {t:"e",a,k,min}: '+JSON.stringify(sesOf(1)));
 ok(q('#endForm').hidden&&/Added Running/.test(q('#dayMsg').textContent),'form closes after adding, message names the activity');
 const pill=i=>dayBtn(i).querySelector('.pl.pe,.pl.pt,.pl.ph');
 ok(pill(1)&&pill(1).textContent==='Run 45′ Z2'&&pill(1).classList.contains('pe')&&!dayBtn(1).classList.contains('rest')&&dayBtn(0).classList.contains('rest'),'Day 2 card shows a teal "Run 45′ Z2" pill; other days stay rest days');
 ok(qa('#ses .srow').length===1&&q('#ses').textContent.includes('Easy')&&/Z2 · 60–70 % HRmax/.test(q('#ses').textContent),'session row shows the zone as % HRmax while no heart rate is set: '+q('#ses .sz').textContent);
 ok(/45 min endurance on Day 2/.test(q('#ses').textContent)&&q('#plan').textContent.includes('rest day so far')===false,'row footer states the day total');
 ok(bal('who').dataset.v==='45'&&bal('split').dataset.easy==='100'&&bal('vo2').dataset.v==='0'&&zoneMin(2)===45&&bal('str').dataset.sets==='0','balance: 45 min Zone 2 = 45 WHO-equivalent minutes (Z2 counts as moderate), 100 % easy, no VO2max-like session');
 ok(/Below the WHO minimum/.test(bal('who').textContent)&&/Add exercises/.test(bal('str').textContent),'balance statuses: below 150, no strength yet');
 ok(/Add exercises to see your weekly volume/.test(q('#volsum').textContent)&&q('#ovBadge').textContent==='45 min','not counted as strength: the weekly table stays empty; badge "'+q('#ovBadge').textContent+'"');
 // strength unaffected by endurance
 selDay(0);addEx('Back squat');
 ok(rowVal('Quadriceps')===3&&bal('str').dataset.sets==='3'&&bal('who').dataset.v==='45'&&/^3 sets on Day 1/.test(q('#plan .fine').textContent.replace(/^1 exercise, /,'')),'strength table and gap filler inputs ignore endurance (Quadriceps 3 sets); WHO stays 45');
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
 q('#hrSet').open=true;q('#hrAge').value='30';ev(q('#hrAge'),'change');
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
 q('#hrAge').value='';ev(q('#hrAge'),'change');q('#hrSet').open=false;
 // recovery warnings (warnings only)
 clearAll();
 selDay(3);addEx('Back squat');
 selDay(4);addSes('running','vo2');
 const m1=dayBtn(4);
 ok(m1.classList.contains('warn')&&m1.textContent.includes('⚠')&&/⚠ VO2max intervals: .*Quadriceps.* still recovering from Day 4/.test(q('#ses').textContent),'heavy legs on Day 4 + VO2max run on Day 5: warning on Day 5: '+q('#ses small.warn').textContent);
 ok(!dayBtn(3).classList.contains('warn')&&/⚠ \d/.test(q('#ovBadge').textContent),'only Day 5 is flagged; the overview badge counts conflicts ('+q('#ovBadge').textContent+')');
 sel('#ses [data-sf="k"]','easy');
 ok(sesOf(4)[0].k==='easy'&&!dayBtn(4).classList.contains('warn')&&!q('#ses small.warn'),'the same run as a plain easy session: no warning');
 sel('#ses [data-sf="k"]','tempo');
 ok(sesOf(4)[0].k==='tempo'&&sesOf(4)[0].len===20&&!!q('#ses small.warn'),'tempo (Z3-4 work) is hard enough to warn again; tempo work defaults to 20 of 45 min');
 sel('#ses [data-sf="k"]','vo2');
 // a strength day after a hard endurance day is flagged on the strength row
 selDay(5);addEx('Back squat');
 ok(dayBtn(5).classList.contains('warn')&&/still recovering from Day 5/.test(q('#plan').textContent),'squats the day after the VO2max run: the strength row warns about Day 5');
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
 ok(/Day 5 · endurance/.test(q('#ovDet').textContent)&&/Running, vo2max intervals, 40 min/.test(q('#ovDet').textContent)&&q('#ovGrid tr.er .eb[data-d="4"]').classList.contains('sel'),'clicking an endurance cell lists its sessions: '+q('#ovDet').textContent);
 q('#ovGrid tr.g[data-g="21"] .cb[data-d="4"]').click();
 ok(/endurance: Running/.test(q('#ovDet').textContent)&&/⚠/.test(q('#ovDet').textContent)&&/Day 4/.test(q('#ovDet').textContent),'a muscle cell lists the endurance contribution and the conflict source: '+q('#ovDet').textContent.slice(0,200));
 q('#ovClose').click();
 // 3D body: selected-day heatmap paints endurance-loaded muscles teal, strength colours win
 const tealRgb=new w.THREE.Color(0x19a7b8).convertSRGBToLinear();
 const tealOf=key=>{let n=0;w.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind==='muscle'&&o.userData.key===key&&o.material.color&&Math.abs(o.material.color.r-tealRgb.r)<1e-6&&Math.abs(o.material.color.g-tealRgb.g)<1e-6)n++;});return n;};
 selDay(4);q('#tVol').click();q('[data-vs="day"]').click();
 ok(tealOf('gastrocnemius')>0&&tealOf('soleus')>0&&tealOf('gluteus maximus')>0&&tealOf('biceps')===0&&/Endurance load/.test(q('#volLegend').textContent),'volume heatmap, selected day: endurance-loaded muscles (calves, glutes) are teal; legend has "Endurance load"');
 addEx('Back squat');
 ok(tealOf('vastus lateralis')===0&&tealOf('gastrocnemius')>0,'with squats on that day too, quadriceps use the strength colours instead of teal');
 q('#tVol').click();
 // persistence: reload with the stored week (old v1.1 plan, new sessions, bad data)
 const stored=JSON.parse(w.localStorage.getItem('aom.plan.v3'));
 ok(stored.days[4].items.some(p=>p.t==='e'&&p.a==='running'&&p.k==='vo2'&&p.n===4&&p.len===4&&p.rec===3)&&stored.days[4].items.some(p=>p.n==='Back squat'),'stored Day 5: strength entry plus {t:"e",a:"running",k:"vo2",min:40,n:4,len:4,rec:3}');
 const r2=boot({store:{'aom.plan.v3':JSON.stringify({days:[{name:'Push',items:[{n:'Barbell bench press',sets:5,v:['']}]},{name:'Run',items:[{t:'e',a:'running',k:'easy',min:45},{t:'e',a:'nonsense',k:'easy',min:30},{t:'e',a:'muaythai',k:'vo2',min:'x',n:99}]},{name:'',items:[{n:'Back squat',sets:3,v:['','']},{t:'e',a:'cycling',k:'tempo',min:60,len:90}]}]}),'aom.hr.v1':JSON.stringify({max:185,age:null,rest:55})}}),r2d=r2.document;
 await waitFor(()=>!r2d.getElementById('loading'),60000,'endurance reload instance');
 const rq=x=>r2d.querySelector(x),rqa=x=>[...r2d.querySelectorAll(x)];
 ok(rq('#wstrip [data-day="0"]').textContent.startsWith('Push')&&rq('#wstrip [data-day="0"]').textContent.includes('5 sets')&&!rq('#wstrip [data-day="0"] .pl.pe'),'old-format day (strength only) loads unchanged');
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
 const cn=dd=>cards(dd).map(label),keys=dd=>days()[dd].items.map(p=>p.t==='e'?'E:'+p.a:p.n);
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
 ok(col(1).querySelector('.bw')&&!col(0).querySelector('.bw')&&/still recovering/.test(cards(1)[0].querySelector('small.warn').textContent)&&!cards(0)[0].querySelector('small.warn'),'Day 2 header and card show the recovery conflict, Day 1 does not ("'+cards(1)[0].querySelector('small.warn').textContent+'")');
 // pointer drag with a mouse: Day 1 bench -> end of Day 3
 const d0=cards(0)[0];
 pev('pointerdown',cx(0),cy(0),d0);
 pev('pointermove',cx(0)+2,cy(0)+2,d0);
 ok(!q('.bghost')&&!d0.classList.contains('dragging'),'mouse: a 3 px movement does not start a drag');
 pev('pointermove',cx(0)+30,cy(0)+20,d0);
 ok(!!q('.bghost')&&d0.classList.contains('dragging')&&/Picked up Barbell bench press/.test(live()),'mouse: after 4 px the card lifts (ghost + dimmed original, announced)');
 pev('pointermove',cx(2),300,d0);
 ok(col(2).classList.contains('dover')&&q('#ovBoard .bcol[data-d="2"] .bslot.end').classList.contains('over'),'drop target: Day 3 is highlighted and its end slot shows the drop indicator');
 pev('pointermove',cx(1)+5,cy(0)-20,d0);
 ok(q('#ovBoard .bcol[data-d="1"] .bslot[data-i="0"]').classList.contains('over')&&!q('#ovBoard .bslot.end.over'),'dropping above a card highlights the slot before it');
 pev('pointermove',cx(2),300,d0);
 pev('pointerup',cx(2),300,d0);
 ok(!q('.bghost')&&names(2).join()==='Barbell bench press'&&names(0).join()==='Barbell row'&&names(1).join()==='Barbell bench press','drop: bench moved from Day 1 to Day 3 and persisted ('+[0,1,2].map(i=>names(i).join('+')).join(' | ')+')');
 ok(cn(2).join()==='Barbell bench press'&&cn(0).join()==='Barbell row','board re-rendered with the new order');
 ok(dayBtn(2).classList.contains('warn')&&!dayBtn(1).classList.contains('warn')&&col(2).querySelector('.bw')&&!col(1).querySelector('.bw'),'conflicts follow the move: Day 2 is clear, Day 3 (bench the day after bench) is flagged on the day card and in the board');
 ok(/Recovery conflicts <b>1<\/b>/.test(q('#ovSum').innerHTML)&&dayBtn(2).getAttribute('aria-pressed')==='true'&&qa('#plan .prow').length===1&&/Moved Barbell bench press to Day 3, position 1 of 1/.test(live()),'summary, planner selection and live region updated ('+live()+')');
 // slot between cards 1 and 2: open the inline picker and insert at that index
 selDay(1);addEx('Back squat');addEx('Hip thrust');
 ok(cn(1).join()==='Barbell bench press,Back squat,Hip thrust','planner additions show up on the board');
 const sl=()=>q('#ovBoard .bslot[data-d="1"][data-i="1"]');
 ok(sl().getAttribute('aria-label')==='Add to Day 2 at position 2','slot between card 1 and 2 has a label ("'+sl().getAttribute('aria-label')+'")');
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
 ok(days()[1].items[1].sets===3&&cards(1)[1].querySelector('.bst span').textContent==='3 sets'&&cards(1)[1]===d.activeElement,'inserted with 3 sets and the default variation; the new card has focus');
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
 ok(names(5).join()==='Barbell bench press'&&names(1).join()==='Hip thrust,Romanian deadlift,Back squat'&&!q('.bghost'),'touch: long-press drag moved the card to Day 6');
 const inc=cards(5)[0].querySelector('[data-bact="inc"]');pev('pointerdown',cx(5),cy(0),inc);pev('pointermove',cx(5)+40,cy(0)+30,inc);
 ok(!q('.bghost'),'pressing the stepper button does not start a drag');pev('pointerup',cx(5)+40,cy(0)+30,inc);
 // sets stepper on a card -> plan and planner tab
 selDay(5);
 cards(5)[0].querySelector('[data-bact="inc"]').click();
 ok(days()[5].items[0].sets===4&&cards(5)[0].querySelector('.bst span').textContent==='4 sets'&&/4 sets/.test(q('#plan .prow .step span').textContent),'card stepper "+": 4 sets in storage, on the card and in the planner tab');
 for(let k=0;k<4;k++) cards(5)[0].querySelector('[data-bact="dec"]').click();
 ok(days()[5].items[0].sets===1&&cards(5)[0].querySelector('[data-bact="dec"]').getAttribute('aria-disabled')==='true'&&names(5).length===1,'"−" stops at 1 set (the × removes)');
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
 ok(keys(1).join()==='Hip thrust,E:muaythai,Romanian deadlift,Back squat'&&days()[1].items[1].min===75,'endurance session inserted at index 1 and persisted in schedule order ('+keys(1).join(',')+')');
 const ec=cards(1)[1];
 ok(ec.classList.contains('e')&&/Thai/.test(ec.querySelector('.pl').textContent)&&ec.querySelector('.pl').classList.contains('ph')&&ec.querySelector('[data-bact="min"]').value==='75','endurance card: activity pill coloured by intensity, kind, minutes');
 ok(/75 min/.test(col(1).querySelector('.bh2').textContent),'column header shows the endurance minutes ("'+col(1).querySelector('.bh2').textContent+'")');
 setv(ec.querySelector('[data-bact="min"]'),'60','change');
 ok(days()[1].items[1].min===60&&days()[1].items[1].t==='e'&&cards(1)[1].querySelector('[data-bact="min"]').value==='60','minutes edited inline, order kept ('+keys(1).join(',')+')');
 selDay(1);
 ok(qa('#ses .srow').length===1&&q('#ses [data-sf="a"]').value==='muaythai','planner tab lists the same session');
 setv(q('#ses [data-sf="min"]'),'45','change');
 ok(days()[1].items[1].min===45&&keys(1).join()==='Hip thrust,E:muaythai,Romanian deadlift,Back squat','editing the session in the planner keeps its place in the schedule');
 // keyboard
 let fc=cards(1)[2];fc.focus();key(fc,'ArrowRight',{altKey:true});
 ok(keys(2).join()==='Barbell bench press,Romanian deadlift'&&keys(1).join()==='Hip thrust,E:muaythai,Back squat','Alt+ArrowRight moves the focused card to the next day (same position, clamped to the end)');
 ok(d.activeElement.classList.contains('bcard')&&label(d.activeElement)==='Romanian deadlift'&&/Moved Romanian deadlift to Day 3/.test(live()),'focus follows the moved card and the move is announced ("'+live()+'")');
 fc=d.activeElement;key(fc,'ArrowUp',{altKey:true});
 ok(keys(2).join()==='Romanian deadlift,Barbell bench press'&&label(d.activeElement)==='Romanian deadlift'&&/position 1 of 2/.test(live()),'Alt+ArrowUp moves the card up within the day');
 fc=d.activeElement;key(fc,'ArrowDown',{altKey:true});
 ok(keys(2).join()==='Barbell bench press,Romanian deadlift','Alt+ArrowDown moves it back down');
 fc=d.activeElement;key(fc,'ArrowDown',{altKey:true});
 ok(/Already last/.test(live())&&keys(2)[1]==='Romanian deadlift','Alt+ArrowDown on the last card does nothing and says so');
 selDay(0);const f0=cards(0)[0];f0.focus();const b0=JSON.stringify(wk());key(f0,'ArrowLeft',{altKey:true});
 ok(JSON.stringify(wk())===b0&&/first day/.test(live()),'Alt+ArrowLeft on Day 1 stays put ("'+live()+'")');
 key(cards(0)[0],'ArrowRight');
 ok(JSON.stringify(wk())===b0,'arrow keys without Alt do nothing');
 ok(qa('#ovBoard .bcard').every(c=>c.getAttribute('aria-label')&&c.getAttribute('tabindex')==='0')&&qa('#ovBoard button').every(b=>b.getAttribute('aria-label')||b.textContent.trim()),'cards are focusable and every board button has a label');
 // planner "Move to…" still works and the board follows
 selDay(5);q('#plan select.mv').value='4';ev(q('#plan select.mv'),'change');
 ok(names(4).join()==='Barbell bench press'&&cn(4).join()==='Barbell bench press'&&cn(5).length===0,'planner tab "Move to…" moves the row and the board reflects it');
 // remove
 const nb=cards(4).length;cards(4)[0].querySelector('[data-bact="rm"]').click();
 ok(cards(4).length===nb-1&&names(4).length===0&&/Removed Barbell bench press/.test(live()),'× removes a card');
 // rename inline
 col(0).querySelector('.bdn').dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));
 ok(!!q('#bIn')&&d.activeElement===q('#bIn'),'double-clicking the day name opens the inline rename field');
 q('#bIn').value='Pull';key(q('#bIn'),'Enter');
 ok(nameOf(0)==='Pull'&&col(0).querySelector('.bdn').textContent==='Pull'&&dayBtn(0).textContent.includes('Pull'),'rename persisted and shown on the board and the day card');
 col(0).querySelector('[data-bact="ren"]').click();q('#bIn').value='Nope';key(q('#bIn'),'Escape');
 ok(nameOf(0)==='Pull'&&!q('#bIn')&&!q('#ov').hidden,'Escape cancels the rename without closing the overview');
 col(0).querySelector('[data-bact="ren"]').click();q('#bIn').value='';key(q('#bIn'),'Enter');
 ok(nameOf(0)==='Day 1','an empty name falls back to "Day 1"');
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
 const stored=w.localStorage.getItem('aom.plan.v3');
 const r=boot({store:{'aom.plan.v3':stored,'aom.ovview.v1':'"mus"'}}),rd=r.document,rq=s=>rd.querySelector(s);
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
 ok(ls('myology.plan.v1')===null&&ls('myology.eq.v1')===null,'legacy "myology.*" keys removed after migration');
 ok(plan()&&plan().length===2&&plan()[0].n==='Back squat'&&plan()[0].sets===4&&JSON.stringify(plan()[0].v)==='["Wide",""]','"aom.plan.v3" holds option names for Back squat (Wide), got '+ls('aom.plan.v3'));
 ok(wk().days.length===7&&wk().days[0].items.length===2&&wk().days.slice(1).every(d=>d.items.length===0)&&wk().days[0].name==='Day 1'&&ls('aom.plan.v2')===null,'legacy v1 plan migrated into Day 1 of "aom.plan.v3"; seven day slots, no v2 key');
 ok(plan()[1].n==='Hip thrust'&&plan()[1].sets===2&&!plan().some(p=>p.n==='Removed exercise'),'entry without v kept, unknown exercise dropped');
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
 ok(plan()&&plan().length===2&&plan()[0].n==='Hip thrust'&&plan()[0].sets===4,'localStorage "aom.plan.v3" holds 2 entries');
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
 ok(pl.length===3&&pl.some(p=>p.n===added&&p.sets===3),'"+ Add to Day N" adds the suggestion with 3 sets ('+added+')');
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
 await weekRun();
 await endRun();
 await boardRun();
 await sugRun();
 await migrateRun();
 await searchRun();
 await variationRun();
 await linkRun();
 ok(/^v\d+\.\d+ · [0-9a-f]{7}$/.test(q('#ver').textContent)&&q('#vp').contains(q('#ver')),'version display in the viewport corner: '+q('#ver').textContent);
 await camRun();
 await lodRun();
 await nerveRun();
 await otherRuns();
 await phoneRun();
 // no errors anywhere
 ok(errs.length===0,'no console errors or uncaught exceptions'+(errs.length?':\n  '+errs.slice(0,10).join('\n  '):''));
 finish();
})().catch(e=>die('test crashed: '+(e.stack||e)));
