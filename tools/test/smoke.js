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
const plan=()=>JSON.parse(w.localStorage.getItem('aom.plan.v2')||'null');
const addRes=n=>qa('#addres [data-add]').find(b=>b.firstChild.textContent.trim()==='+ '+n);
const addEx=n=>{q('#qa').value=n.toLowerCase();ev(q('#qa'),'input');const b=addRes(n);if(!ok(b,'search offers "'+n+'"')) return;b.click();};
// total triangle-index count over all body meshes in the three.js scene (captured by the stubbed renderer)
const idxCount=win=>{let n=0;win.__scene.traverse(o=>{if(o.isMesh&&o.userData.kind&&o.geometry.index)n+=o.geometry.index.count;});return n;};
const lodBtn=(doc,l)=>doc.querySelector('[data-lod="'+l+'"]'),lodOn=doc=>[...doc.querySelectorAll('[data-lod]')].filter(b=>b.getAttribute('aria-pressed')==='true').map(b=>b.dataset.lod).join(',');
async function waitFor(f,ms,what){const t=Date.now();while(!f()){if(Date.now()-t>(ms||30000)) return ok(false,'timed out waiting for '+what);await sleep(50);}return true;}
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
 const T=w.THREE, cam=()=>w.__cam, settle=()=>sleep(1500);
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
 await sleep(1900);
 ok(xd.querySelector('#card [data-act="copy"]').textContent==='Copy link','... and the label returns to "Copy link"');
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
 await sleep(1700);
 ok(tip.style.display==='none','phone: the touch label disappears after about 1.5 s');
 // viewport grows to desktop size: card returns to the viewport, sheet classes cleared
 // choosing High on a phone shows a short note about the download size, without a blocking dialog
 lodBtn(pd,'high').click();
 ok(/large download/.test(pq('#lodNote').textContent),'phone: choosing High shows a large-download note ("'+pq('#lodNote').textContent+'")');
 await waitFor(()=>lodOn(pd)==='high',30000,'phone High');
 lodBtn(pd,'low').click();await waitFor(()=>lodOn(pd)==='low',30000,'phone back to Low');
 ok(pq('#lodNote').textContent==='','phone: note cleared again on Low');
 p.__setPhone(false);
 ok(card.parentNode===pq('#vp')&&!side.classList.contains('has-card')&&!card.classList.contains('mini'),'phone->desktop: card moves back over the viewport');
 ok(pq('#hint').textContent.includes('right-drag')&&p.__dpr===2,'phone->desktop: mouse hint text restored, pixel ratio cap back to 2');
 p.__setPhone(true);
 ok(card.parentNode===pq('#cslot'),'desktop->phone: card moves into the sheet again');
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
 ok(plan()&&plan().length===2&&plan()[0].n==='Back squat'&&plan()[0].sets===4&&JSON.stringify(plan()[0].v)==='["Wide",""]','"aom.plan.v2" holds option names for Back squat (Wide), got '+ls('aom.plan.v2'));
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
 ok(plan()&&plan().length===2&&plan()[0].n==='Hip thrust'&&plan()[0].sets===4,'localStorage "aom.plan.v2" holds 2 entries');
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
 ok(pl.length===3&&pl[2].n===added&&pl[2].sets===3,'"+ Add 3 sets" appends the suggestion with 3 sets ('+added+')');
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
 await searchRun();
 await variationRun();
 await linkRun();
 await camRun();
 await lodRun();
 await otherRuns();
 await phoneRun();
 // no errors anywhere
 ok(errs.length===0,'no console errors or uncaught exceptions'+(errs.length?':\n  '+errs.slice(0,10).join('\n  '):''));
 finish();
})().catch(e=>die('test crashed: '+(e.stack||e)));
