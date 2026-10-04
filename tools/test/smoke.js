// Headless smoke test: loads index.html in jsdom with real three.js (WebGL stubbed), exercises the main UI flows and asserts on the result.
// Exits 1 if any assertion fails, startup fails/times out, or the page logs console errors / throws.
// Usage (Node >= 18): cd tools/test && npm install && npm test
let pass=0,fail=0;
const ok=(c,m)=>{c?pass++:fail++;console.log((c?'ok - ':'FAIL - ')+m);return !!c;};
const finish=()=>{console.log(`\n${pass} passed, ${fail} failed`);process.exit(fail?1:0);};
const die=m=>{ok(false,m);finish();};
if(typeof DecompressionStream==='undefined'||typeof Response==='undefined') die('Node >= 18 required (DecompressionStream/Response/Blob globals missing), found '+process.version);
const fs=require('fs');const {JSDOM,VirtualConsole}=require('jsdom');
let html=fs.readFileSync(require('path').join(__dirname,'..','..','index.html'),'utf8').replace(/<script src="[^"]+three[^"]+"><\/script>/,'');
const errs=[],vc=new VirtualConsole();
vc.on('error',(...a)=>errs.push('console.error: '+a.join(' ')));vc.on('jsdomError',e=>errs.push('jsdomError: '+(e.stack||e.message)));
const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'https://example.test/',virtualConsole:vc});const w=dom.window;const THREE=require('three');
w.addEventListener('error',e=>errs.push('uncaught: '+(e.message||e.error)));
class FR{constructor(){this.domElement=w.document.createElement('canvas');}setPixelRatio(){}setClearColor(){}setSize(){}render(s){}}
w.THREE=Object.assign({},THREE,{WebGLRenderer:FR});w.ResizeObserver=class{observe(){}};
w.DecompressionStream=DecompressionStream;w.Response=Response;w.Blob=Blob;
w.HTMLCanvasElement.prototype.getContext=function(){return {createRadialGradient(){return{addColorStop(){}}},fillRect(){}}};
Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return 1000}});Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return 800}});
w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:800});w.HTMLElement.prototype.setPointerCapture=()=>{};
// seed legacy (pre-rename) storage to exercise the migration: variation INDEX arrays (Back squat Stance=Wide), an entry without v, an exercise that no longer exists, equipment minus Band
const OLD_EQ=['Barbell','Dumbbells','Kettlebell','Cable','Machine','Bodyweight','Other'];
w.localStorage.setItem('myology.plan.v1',JSON.stringify([{n:'Back squat',sets:4,v:[1,0]},{n:'Hip thrust',sets:2},{n:'Removed exercise',sets:3,v:[]}]));
w.localStorage.setItem('myology.eq.v1',JSON.stringify(OLD_EQ));
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const mi=js.indexOf('const META='),META=JSON.parse(js.slice(mi+11,js.indexOf('\n',mi)).replace(/;\s*$/,'')); // embedded data, to derive expectations
w.eval(`(async()=>{try{${js.replace('(async function(){','await (async function(){')}}catch(e){window.__fatal=e.stack||String(e)}})()`);
const ev=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
const d=w.document,C=()=>d.getElementById('card').textContent.replace(/\s+/g,' '),q=s=>d.querySelector(s),qa=s=>[...d.querySelectorAll(s)];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const exItem=n=>qa('#exlist .item').find(b=>b.textContent===n),exNames=()=>qa('#exlist .item').map(b=>b.textContent);
const roleKeys=r=>{const h=qa('#card h3').find(x=>x.textContent===r);return h?[...h.nextElementSibling.querySelectorAll('[data-key]')].map(b=>b.dataset.key):[];};
const bestNames=()=>qa('#best [data-ex]').map(b=>b.textContent),bestPct=()=>qa('#best small').map(s=>parseFloat(s.textContent));
const plan=()=>JSON.parse(w.localStorage.getItem('aom.plan.v2')||'null');
const addRes=n=>qa('#addres [data-add]').find(b=>b.firstChild.textContent.trim()==='+ '+n);
const addEx=n=>{q('#qa').value=n.toLowerCase();ev(q('#qa'),'input');const b=addRes(n);if(!ok(b,'search offers "'+n+'"')) return;b.click();};
(async()=>{
 // startup
 const msg0=q('#loadMsg').textContent,t0=Date.now();
 while(q('#loading')){
  if(w.__fatal) die('startup IIFE threw: '+w.__fatal);
  if(q('#loadMsg')&&q('#loadMsg').textContent!==msg0) die('startup error shown in #loadMsg: '+q('#loadMsg').textContent);
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
 // no errors anywhere
 ok(errs.length===0,'no console errors or uncaught exceptions'+(errs.length?':\n  '+errs.slice(0,10).join('\n  '):''));
 finish();
})().catch(e=>die('test crashed: '+(e.stack||e)));
