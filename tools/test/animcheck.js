// Dev helper for authoring exercise animations (docs/animation-design.md, "Checking a motion"). Not part of the app or of CI.
// Boots index.html in jsdom (real three.js, WebGL stubbed, Low meshes by default) with the motions taken FRESH from
// tools/data/animations.json (resolved by animlib.py, so no assemble.py is needed while you tune keys; template.html changes
// still need assemble.py), plays an exercise and prints per sampled frame:
//   grip    distance between each hand's grip point and its end of the held bar (mm; > 5 fails the smoke test)
//   reach   shoulder -> grip point distance / the arm's straight reach (%; ~99.5 % = elbow locked, above = out of reach)
//   elbow   elbow flexion L / R (degrees, 3D angle shoulder-elbow-wrist; the atlas pose has ~12)
//   pron    forearm rotation L / R (degrees: 0 = palms forward as in the atlas, 90 = neutral, ~160 = pronated)
//   knee    knee flexion L / R (degrees)
//   bar     bar centre height and depth (y, z in m) and the clearance between the held bar's grip section (shaft radius 14 mm) and the nearest body vertex outside the hands (mm;
//           negative = the bar is inside a muscle or bone), with that structure
//   db      the same for each dumbbell (handle and heads), outside the holding hand
//   floor   the lowest body vertex (m) and its structure (< 0 = below the floor)
//   bench   per bench: the body vertex nearest to (or deepest in) the pad's top surface (mm; < 0 = sinking in, > 0 = floating)
// Usage (from tools/test):  node animcheck.js ["Exercise name" ...] [--var Group=Option] [--frames 24] [--lod low|medium|high] [--summary] [--fast]
//   no names = every animated exercise; --summary prints one line per exercise (worst values); --fast skips the clearances and the floor
// As a module: const {bootAnim} = require('./animcheck.js'); const A = await bootAnim({lod:'low'}); A.play(name, vars); A.at(t); A.measure();
const fs=require('fs'),path=require('path'),cp=require('child_process');const {JSDOM,VirtualConsole}=require('jsdom');
const ROOT=path.join(__dirname,'..','..');
const EXPORT='window.__an={get anim(){return anim},animStart,animStop,animPose,animKeys,prepKeys,EX,exVars,skU,segPos,segQ,SEGI,SEGJ,RIG,cpuSkin,allMeshes,barC,barA,get barW(){return barW},get heldBar(){return heldBar},get props(){return props},ANIM};';
function freshAnim(){   // tools/data/animations.json resolved exactly like assemble.py does
  const r=cp.spawnSync('python',['-c','import json,sys,animlib;a,e=animlib.resolve(json.load(open("data/animations.json",encoding="utf-8")));sys.stderr.write("\\n".join(e));print(json.dumps(a))'],{cwd:path.join(ROOT,'tools'),encoding:'utf8',maxBuffer:64<<20});
  if(r.status!==0) throw new Error('animlib failed: '+r.stderr);
  if(r.stderr.trim()) console.log('animlib errors:\n'+r.stderr);
  return r.stdout.trim();
}
async function bootAnim(opts){
  opts=opts||{};
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8').replace(/<script src="[^"]+three[^"]+"><\/script>/,'');
  let js=html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('//@licexport',EXPORT);
  if(opts.fresh!==false){ const i=js.indexOf('\n',js.indexOf('const META=')); js=js.slice(0,i+1)+'META.anim='+freshAnim()+';\n'+js.slice(i+1); }
  const errs=[],vc=new VirtualConsole();vc.on('error',(...a)=>errs.push(a.join(' ')));vc.on('jsdomError',e=>{if(!/navigation/.test(e.message||''))errs.push(e.message);});
  const dom=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true,url:'https://example.test/',virtualConsole:vc}),w=dom.window,THREE=require('three');
  class FR{constructor(){this.domElement=w.document.createElement('canvas');this.capabilities={maxVertexUniforms:1024};}setPixelRatio(){}setClearColor(){}setSize(){}render(){}}
  w.THREE=Object.assign({},THREE,{WebGLRenderer:FR});w.ResizeObserver=class{observe(){}};
  w.fetch=async u=>new Response(fs.readFileSync(path.join(ROOT,String(u).split('?')[0])));
  w.DecompressionStream=DecompressionStream;w.Response=Response;w.Blob=Blob;
  w.HTMLCanvasElement.prototype.getContext=function(){return {createRadialGradient(){return{addColorStop(){}}},fillRect(){}}};
  Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return 1000}});Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return 800}});
  w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1000,height:800});
  w.localStorage.setItem('aom.lod.v1',opts.lod||'low');
  if(!w.crypto||!w.crypto.subtle) Object.defineProperty(w,'crypto',{value:require('crypto').webcrypto,configurable:true});
  w.eval(`(async()=>{try{${js.replace('(async function(){','await (async function(){')}}catch(e){window.__fatal=e.stack||String(e)}})()`);
  const t0=Date.now();while(w.document.getElementById('loading')){if(w.__fatal||Date.now()-t0>120000) throw new Error('boot failed: '+(w.__fatal||'timeout')+'\n'+errs.join('\n'));await new Promise(r=>setTimeout(r,50));}
  const X=w.__an,T=THREE,V=a=>new T.Vector3().fromArray(a);
  const J=n=>X.SEGJ[X.SEGI[n]],wp=(seg,b)=>b.clone().sub(X.SEGJ[seg]).applyQuaternion(X.segQ[seg]).add(X.segPos[seg]);   // bind point b carried by segment seg
  const reachOf=sd=>J('fore'+sd).distanceTo(J('arm'+sd))+J('hand'+sd).distanceTo(J('fore'+sd));
  const ang=(a,b,c)=>{const u=a.clone().sub(b).normalize(),v=c.clone().sub(b).normalize();return 180-Math.acos(Math.max(-1,Math.min(1,u.dot(v))))*180/Math.PI;};
  const hand=m=>m.userData.group==='Hand';
  let pos=null;
  const A={w,X,T,errs,
    play:async(name,vars)=>{   // vars: {group: option} names
      const i=X.EX.findIndex(e=>e.n===name);if(i<0||!X.ANIM[name]) throw new Error('not animated: '+name);
      X.exVars[i]=(X.EX[i].v||[]).map(g=>{const o=vars&&vars[g[0]];const k=o?g[1].findIndex(x=>x[0]===o):0;if(k<0) throw new Error('no option '+o+' in '+g[0]);return k;});
      await X.animStart(i);const t1=Date.now();while(!(X.anim&&X.anim.ready)){if(Date.now()-t1>60000) throw new Error('animation did not start: '+(X.anim&&X.anim.err));await new Promise(r=>setTimeout(r,30));}
      X.anim.playing=false;return X.anim;
    },
    at:t=>{X.anim.t=t;X.animPose();pos=null;},
    posed:()=>{ if(!pos) pos=X.allMeshes.map(m=>X.cpuSkin(m,new Float32Array(m.geometry.attributes.position.array.length))); return pos; },
    gripPt:sd=>wp(X.SEGI['hand'+sd],V(X.RIG.pt['grip'+sd])),
    elbow:sd=>ang(X.segPos[X.SEGI['arm'+sd]],X.segPos[X.SEGI['fore'+sd]],X.segPos[X.SEGI['hand'+sd]]),
    pron:sd=>{ const r=X.SEGI['rad'+sd],q=X.segQ[X.SEGI['fore'+sd]].clone().invert().multiply(X.segQ[r]),a=new T.Vector3().fromArray(X.RIG.seg[r][3]); let d=2*Math.atan2(q.x*a.x+q.y*a.y+q.z*a.z,q.w)*180/Math.PI; while(d>180) d-=360; while(d<=-180) d+=360; if(d<-60) d+=360; return d; },
    knee:sd=>ang(X.segPos[X.SEGI['thigh'+sd]],X.segPos[X.SEGI['shank'+sd]],X.segPos[X.SEGI['foot'+sd]]),
    // nearest body vertex (outside the hands and the ex points) to a capsule-like prop: axis from p0 to p1 with radius fn(u) (u = 0..1 along the axis)
    clear:(p0,p1,rad,skip,ex)=>{   // ex: points whose 8 cm surroundings are ignored (the holding hands and wrists)
      ex=ex||[];
      const P=A.posed(),ax=p1.clone().sub(p0),L2=ax.lengthSq(),pad=0.3;let best=1e9,who='';
      const lo=new T.Vector3(Math.min(p0.x,p1.x)-pad,Math.min(p0.y,p1.y)-pad,Math.min(p0.z,p1.z)-pad),hi=new T.Vector3(Math.max(p0.x,p1.x)+pad,Math.max(p0.y,p1.y)+pad,Math.max(p0.z,p1.z)+pad);
      X.allMeshes.forEach((m,mi)=>{ if(skip(m)) return; const p=P[mi];
        for(let k=0;k<p.length;k+=3){ const x=p[k],y=p[k+1],z=p[k+2]; if(x<lo.x||x>hi.x||y<lo.y||y>hi.y||z<lo.z||z>hi.z||ex.some(e=>(x-e.x)**2+(y-e.y)**2+(z-e.z)**2<0.0064)) continue;
          let u=((x-p0.x)*ax.x+(y-p0.y)*ax.y+(z-p0.z)*ax.z)/L2; u=Math.max(0,Math.min(1,u));
          const d=Math.hypot(x-p0.x-u*ax.x,y-p0.y-u*ax.y,z-p0.z-u*ax.z)-rad(u); if(d<best){best=d;who=m.userData.key+(m.userData.side?' '+m.userData.side:'');} } });
      return {d:best,who};
    },
    measure:fast=>{   // fast: skip the vertex-based numbers (clearances, floor)
      const r={t:X.anim.t,elbow:['L','R'].map(A.elbow),pron:['L','R'].map(A.pron),knee:['L','R'].map(A.knee)},k0=X.anim.K[0],hb=X.heldBar;
      if(hb){
        const gw=X.barW/2,e=sd=>X.barC.clone().addScaledVector(X.barA,(sd==='L'?1:-1)*gw);
        if(k0.ik.armL&&k0.ik.armL.bar){ r.grip=['L','R'].map(sd=>A.gripPt(sd).distanceTo(e(sd))*1000); r.reach=['L','R'].map(sd=>e(sd).distanceTo(X.segPos[X.SEGI['arm'+sd]])/(reachOf(sd)+V(X.RIG.pt['grip'+sd]).distanceTo(J('hand'+sd)))*100); }
        r.barP=[X.barC.y,X.barC.z];const half=Math.max(gw+0.06,0.3);if(!fast) r.bar=A.clear(X.barC.clone().addScaledVector(X.barA,-half),X.barC.clone().addScaledVector(X.barA,half),()=>0.014,hand,[A.gripPt('L'),A.gripPt('R')]);
      }
      r.db=fast?[]:X.props.filter(p=>p.loc&&!p.bar).map((p,k)=>{
        const def=X.anim.def.props.filter(q=>q.type==='dumbbell')[k]||{len:0.3,r:0.05},m=p.obj.matrix,c=new T.Vector3().setFromMatrixPosition(m),ay=new T.Vector3().setFromMatrixColumn(m,1).normalize(),h=def.len/2;
        return A.clear(c.clone().addScaledVector(ay,-h),c.clone().addScaledVector(ay,h),u=>Math.abs(u-0.5)*def.len>h-0.05?def.r:0.0145,hand,[c]);
      });
      r.floor={y:NaN,who:''};if(fast) return r;const P=A.posed();let lo=1e9,lw='';X.allMeshes.forEach((m,mi)=>{const p=P[mi];for(let k=1;k<p.length;k+=3) if(p[k]<lo){lo=p[k];lw=m.userData.key;}});r.floor={y:lo,who:lw};
      // benches: signed distance of body vertices over the pad to its top surface (seat, and the backrest of an inclined bench); the
      // smallest value above -8 cm = how deep the body sinks in (< 0) or how far it floats above the pad (> 0)
      r.bench=(X.anim.ps||X.anim.def.props||[]).filter(q=>q.type==='bench').map(q=>{
        const w=q.size[0],L=q.size[2],x0=q.pos[0],z0=q.pos[1],top=q.top,inc=(q.incline||0)*Math.PI/180,seat=q.incline?Math.min(L-0.2,q.seat||0.42):L,z1=z0+L/2,hz=z1-seat,Lb=L-seat,yw=-(q.yaw||0)*Math.PI/180,cy=Math.cos(yw),sy=Math.sin(yw);
        let best=1e9,who='';
        X.allMeshes.forEach((m,mi)=>{const p=P[mi];for(let k=0;k<p.length;k+=3){
          let x=p[k]-x0,y=p[k+1],z=p[k+2]-z0;const lx=cy*x+sy*z,lz=-sy*x+cy*z;x=lx;z=lz+z0;if(Math.abs(x)>w/2) continue;
          let d=1e9;
          if(z>=hz&&z<=z1) d=y-top;
          if(inc){const u=(y-top)*Math.sin(inc)-(z-hz)*Math.cos(inc);if(u>=0&&u<=Lb) d=Math.min(d,(y-top)*Math.cos(inc)+(z-hz)*Math.sin(inc));}
          if(d>-0.08&&d<best){best=d;who=m.userData.key;}}});
        return {d:best,who};
      });
      return r;
    }};
  return A;
}
module.exports={bootAnim};
if(require.main===module)(async()=>{
  const a=process.argv.slice(2),flag=(f,d)=>{const i=a.indexOf(f);if(i<0) return d;const v=a[i+1];a.splice(i,2);return v;};
  const vars={};let v;while((v=flag('--var',null))){const [g,o]=v.split('=');vars[g]=o;}
  const frames=+flag('--frames',24),lod=flag('--lod','low'),sum=a.includes('--summary'),fast=a.includes('--fast');const names=a.filter(x=>!/^--(summary|fast)$/.test(x));
  const A=await bootAnim({lod});
  const list=names.length?names:Object.keys(A.X.ANIM);
  const f1=x=>x.toFixed(1),f0=x=>Math.round(x),mm=c=>c.d>=1e8?'-':f0(c.d*1000)+' '+c.who;
  for(const n of list){
    await A.play(n,vars);const W={grip:0,reach:0,elbow:0,bar:1e9,db:1e9,floor:1e9,bench:1e9};let wb='',wd='',wf='',wbe='';
    if(!sum) console.log('\n'+n+(Object.keys(vars).length?' '+JSON.stringify(vars):'')+'\n    t   grip mm L/R   reach % L/R   elbow L/R   pron L/R    knee L/R   bar y,z  clearance mm             dumbbells mm            floor');
    for(let s=0;s<=frames;s++){
      A.at(Math.min(0.999,s/frames));const r=A.measure(fast);
      if(r.grip){W.grip=Math.max(W.grip,...r.grip);W.reach=Math.max(W.reach,...r.reach);}
      W.elbow=Math.max(W.elbow,...r.elbow);if(r.bar&&r.bar.d<W.bar){W.bar=r.bar.d;wb=r.bar.who+' @'+r.t.toFixed(2);}
      r.db.forEach(c=>{if(c.d<W.db){W.db=c.d;wd=c.who+' @'+r.t.toFixed(2);}});if(!fast&&r.floor.y<W.floor){W.floor=r.floor.y;wf=r.floor.who+' @'+r.t.toFixed(2);}(r.bench||[]).forEach(c=>{if(c.d<W.bench){W.bench=c.d;wbe=c.who+' @'+r.t.toFixed(2);}});
      if(!sum) console.log(r.t.toFixed(3).padStart(6)+'   '+(r.grip?r.grip.map(f1).join(' / '):'-').padEnd(12)+'  '+(r.reach?r.reach.map(f1).join(' / '):'-').padEnd(12)+'  '+r.elbow.map(f0).join(' / ').padEnd(10)+'  '+r.pron.map(f0).join(' / ').padEnd(10)+'  '+r.knee.map(f0).join(' / ').padEnd(9)+'  '+(r.barP?r.barP.map(v=>v.toFixed(3)).join(',')+' '+(r.bar?mm(r.bar):''):'-').padEnd(34)+'  '+(r.db.map(mm).join(', ')||'-').padEnd(22)+'  '+r.floor.y.toFixed(3)+' '+r.floor.who+(r.bench&&r.bench.length?'   bench '+r.bench.map(mm).join(', '):''));
    }
    console.log((sum?n.padEnd(30):'worst: ')+' grip '+f1(W.grip)+' mm, reach '+f1(W.reach)+' %, elbow max '+f0(W.elbow)+', bar clearance '+(W.bar<1e8?f0(W.bar*1000)+' mm ('+wb+')':'-')+', dumbbells '+(W.db<1e8?f0(W.db*1000)+' mm ('+wd+')':'-')+', lowest '+W.floor.toFixed(3)+' m ('+wf+')'+(W.bench<1e8?', bench '+f0(W.bench*1000)+' mm ('+wbe+')':''));
    A.X.animStop(true);
  }
  if(A.errs.length) console.log('page errors:\n'+A.errs.join('\n'));
  process.exit(0);
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
