// Headless smoke test: loads index.html in jsdom with real three.js (WebGL stubbed) and exercises the main UI flows.
// Usage: cd tools/test && npm install && npm test
const fs=require('fs');const {JSDOM}=require('jsdom');
let html=fs.readFileSync(require('path').join(__dirname,'..','..','index.html'),'utf8').replace(/<script src="[^"]+three[^"]+"><\/script>/,'');
const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'https://example.test/'});const w=dom.window;const THREE=require('three');
class FR{constructor(){this.domElement=w.document.createElement('canvas');}setPixelRatio(){}setClearColor(){}setSize(){}render(s){}}
w.THREE=Object.assign({},THREE,{WebGLRenderer:FR});w.ResizeObserver=class{observe(){}};
w.DecompressionStream=DecompressionStream;w.Response=Response;w.Blob=Blob;
w.HTMLCanvasElement.prototype.getContext=function(){return {createRadialGradient(){return{addColorStop(){}}},fillRect(){}}};
Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return 1000}});Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return 800}});
w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:800});w.HTMLElement.prototype.setPointerCapture=()=>{};
const js=html.match(/<script>([\s\S]*?)<\/script>/)[1];
w.eval(`(async()=>{try{${js.replace('(async function(){','await (async function(){')}}catch(e){console.log('THROW',e.stack)}})()`);
const ev=(el,t)=>el.dispatchEvent(new w.Event(t,{bubbles:true}));
setTimeout(()=>{try{
 const d=w.document,C=()=>d.getElementById('card').textContent.replace(/\s+/g,' '),q=s=>d.querySelector(s);
 q('[data-tab="ex"]').click();
 console.log('best:',q('#best').textContent.slice(0,150));
 q('[data-sort="spec"]').click(); console.log('best spec:',q('#best').textContent.slice(0,150));
 const sq=[...d.querySelectorAll('#exlist .item')].find(b=>b.textContent==='Back squat'); sq.click();
 console.log('SQ:',C().slice(0,300));
 [...d.querySelectorAll('[data-var]')].find(b=>b.textContent==='Wide').click();
 console.log('SQ wide:',C().slice(0,420));
 q('[data-act="add"]').click(); q('[data-act="cmp"]').click(); console.log('banner:',q('#cmpBanner').hidden,q('#cmpText').textContent);
 [...d.querySelectorAll('#exlist .item')].find(b=>b.textContent==='Leg press').click();
 console.log('CMP:',C().slice(0,500));
 q('[data-act="swap"]').click(); console.log('SWAP:',C().slice(0,120));
 q('.cmpt [data-key]').click(); console.log('MUS in cmp:',C().slice(0,200));
 q('[data-act="back"]').click(); q('[data-act="cmpend"]').click(); console.log('after end:',C().slice(0,60));
 // equipment
 q('[data-eq="Barbell"]').click(); console.log('ex count w/o barbell',d.querySelectorAll('#exlist .item').length);
 q('#eqAll').click();
 // workout
 q('[data-tab="wk"]').click(); q('#qa').value='hip thrust'; ev(q('#qa'),'input'); q('#addres [data-add]').click();
 q('#qa').value='pull-up'; ev(q('#qa'),'input'); q('#addres [data-add]').click();
 q('#plan [data-inc="1"]').click();
 console.log('PLAN:',q('#plan').textContent.replace(/\s+/g,' '));
 console.log('VOL:',q('#volsum').textContent.replace(/\s+/g,' ').slice(0,500));
 q('#tVol').checked=true; ev(q('#tVol'),'change');
 q('#volsum [data-key="gluteus maximus"]').click(); console.log('MUS vol:',C().slice(0,140));
 console.log('stored',w.localStorage.getItem('myology.plan.v1'));
}catch(e){console.log('ERR',e.stack)} process.exit(0);},8000);
