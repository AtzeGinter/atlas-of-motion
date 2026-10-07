import json,re
import bones as B
def load_db():
    db={}
    for l in open('data/muscles.txt',encoding='utf-8'):
        l=l.rstrip('\n')
        if not l: continue
        k,g,a,o,i,n=l.split('|'); db[k]={'g':g,'a':[x.strip() for x in a.split(';')],'o':o,'i':i,'n':n}
    for l in open('data/extra.txt',encoding='utf-8'):
        l=l.rstrip('\n')
        if not l: continue
        k,t,note=l.split('|'); assert k in db,k
        if t: db[k]['t']=t
        if note: db[k]['x']=note
    return db
def load_aliases(db):  # data/aliases.txt: alias|key[:part][,key[:part]...] -> {alias:[entry,...]}
    al={}
    for l in open('data/aliases.txt',encoding='utf-8'):
        l=l.rstrip('\n')
        if not l: continue
        a,ks=l.split('|'); ks=ks.split(',')
        for e in ks: assert e.partition(':')[0] in db,(a,e)
        al[a]=ks
    return al
def load_acts(db):  # data/activities.txt: id|name|group|MET|profile "key[:part]:weight,..." ("-" = none)|short|kind:minutes -> [{id,n,g,met,p:[[key,part,w]],s,d:[kind,min]}]
    out=[]
    for l in open('data/activities.txt',encoding='utf-8'):
        l=l.rstrip('\n')
        if not l: continue
        i,n,g,met,prof,s,d=l.split('|'); p=[]
        if prof!='-':
            for e in prof.split(','):
                r,w=e.rsplit(':',1); k,_,part=r.partition(':'); assert k in db,(i,k); p.append([k,part,float(w)])
        kd,mn=d.split(':'); out.append({'id':i,'n':n,'g':g,'met':float(met),'p':p,'s':s,'d':[kd,int(mn)]})
    return out
def load_nerves(db):  # data/nerves.txt: id|name|roots|kind|parent|waypoints|note|match -> (defs, nv)
    # defs: [{id,n,r,k,p,w:[anchor,...],x}] = the schematic nerve paths; nv: {id:[muscle keys]} = muscles whose nerve text (db[key]['n']) contains
    # one of the nerve's substrings (match column, ';'-separated, case-insensitive; "-" = none). A muscle that also matches a descendant of
    # that nerve is listed only under the descendant (the most specific nerve wins), e.g. extensor digitorum -> PIN, not radial.
    defs=[]
    for l in open('data/nerves.txt',encoding='utf-8'):
        l=l.rstrip('\n')
        if not l: continue
        i,n,r,k,p,w,x,m=l.split('|')
        defs.append({'id':i,'n':n,'r':r,'k':k,'p':'' if p=='-' else p,'w':w.split(';'),'x':x,'m':[] if m=='-' else [s.strip().lower() for s in m.split(';')]})
    raw={d['id']:[k for k in db if db[k]['g']!='Connective tissue' and any(s in db[k]['n'].lower() for s in d['m'])] for d in defs}
    kids={}
    for d in defs: kids.setdefault(d['p'],[]).append(d['id'])
    def desc(i): return [j for c in kids.get(i,[]) for j in [c]+desc(c)]
    nv={}
    for d in defs:
        taken={k for j in desc(d['id']) for k in raw[j]}
        nv[d['id']]=[k for k in raw[d['id']] if k not in taken]
    return [{a:b for a,b in d.items() if a!='m'} for d in defs],nv
PARTPRE=r'^(abdominal|acromial|clavicular|spinal|sternocostal|descending|ascending|transverse|orbital|palpebral|deep|superficial|oblique|straight|inferior oblique|superior oblique|vertical intermediate) part of '
HEADPRE=r'^(long|short|lateral|medial|humeral|ulnar|oblique|transverse|superior|inferior|superficial) head of '
MERGE=[(r'^(first|second|third|fourth) lumbrical \(foot\)$','lumbricals (foot)'),
 (r'^(first|second|third) plantar interosseous \(foot\)$','plantar interossei (foot)'),
 (r'^set of lumbricals \(hand\)$','lumbricals (hand)'),(r'^set of dorsal interossei \(hand\)$','dorsal interossei (hand)'),
 (r'^set of palmar interossei \(hand\)$','palmar interossei (hand)'),
 (r'^multifidus .*','multifidus'),(r'^iliocostalis .*','iliocostalis'),(r'^longissimus .*','longissimus'),
 (r'^semispinalis .*','semispinalis'),(r'^spinalis.*','spinalis'),(r'^(interspinalis|set of interspinales) .*','interspinales'),
 (r'.*intertransversari.*','intertransversarii'),(r'^set of levatores costarum .*','levatores costarum'),
 (r'^(iliococcygeus|pubococcygeus|puborectalis)$','levator ani'),(r'.* layer of thoracolumbar fascia$','thoracolumbar fascia')]
def canon(n):
    n=n.lower(); side=''
    m=re.search(r'\b(left|right)\b',n)
    if m: side='L' if m.group(1)=='left' else 'R'
    n=re.sub(r'\b(left|right)\b ?','',n); n=re.sub(r' +',' ',n).strip()
    n=re.sub(r' of (hand|foot)$',r' (\1)',n); n=re.sub(r' \(\d\)$','',n)
    return n,side
def load_movements(db):  # data/movements.txt: id|label|joint|pattern;pattern;... -> [{id,n:label,j:joint,k:[muscle keys]}]
    out=[]
    for l in open('data/movements.txt',encoding='utf-8'):
        l=l.rstrip('\n')
        if not l: continue
        id,name,joint,pats=l.split('|',3); patterns=[p.strip() for p in pats.split(';')]
        keys=set()
        for k in db:
            if db[k]['g']=='Connective tissue': continue  # skip tendons/ligaments
            actions=db[k]['a']
            for action in actions:
                for pat in patterns:
                    if re.search(pat,action,re.IGNORECASE): keys.add(k); break
        out.append({'id':id,'n':name,'j':joint,'k':sorted(keys)})
    return out
if __name__=='__main__':
    db=load_db()
    M=json.load(open('meshes.json',encoding='utf-8'))
    out=[]; missing=set(); bnames=set()
    for kind,name in M['meshes']:
        c,side=canon(name)
        if kind=='m':
            k=re.sub(PARTPRE,'',c); k=re.sub(HEADPRE,'',k); k=re.sub(r' muscle$','',k)
            for pat,rep in MERGE:
                if re.match(pat,k): k=rep;break
            if k not in db: missing.add(k)
            c2=re.sub(r' muscle$','',c)
            part='' if (c2==k or c2.startswith('set of ')) else c2
            part=re.sub(r' of '+re.escape(k)+'$','',part) if part else ''
            out.append([kind,k,side,part])
        else:
            c=c.replace(' of foot',' (foot)'); out.append([kind,c,side,'']); bnames.add(c)
    print('missing',missing)
    al=load_aliases(db); pts={}
    for o in out:
        if o[0]=='m' and o[3]: pts.setdefault(o[1],set()).add(o[3])
    for a,ks in al.items():
        for e in ks:
            k,_,p=e.partition(':'); assert not p or p in pts.get(k,()),(a,e)
    M['al']=al; M['act']=load_acts(db)
    M['nd'],M['nv']=load_nerves(db)
    M['mv']=load_movements(db)
    nsup={k for v in M['nv'].values() for k in v}
    print('nerves:',len(M['nd']),'; muscles supplied by a drawn nerve:',len(nsup),'; nerve text matched no nerve (info):',sorted(k for k in db if db[k]['g']!='Connective tissue' and db[k]['n'] and k not in nsup))
    for a in M['act']:
        for k,p,w in a['p']: assert not p or p in pts.get(k,()),(a['id'],k,p)
    M['meshes']=out; M['db']=db; M['bdb']={b:B.info(b) for b in sorted(bnames)}
    json.dump(M,open('meta2.json','w',encoding='utf-8',newline='\n'),separators=(',',':'))
    from collections import Counter
    print(Counter(db[o[1]]['g'] for o in out if o[0]=='m'))
    print(len(set(o[1] for o in out if o[0]=='m')), 'keys used of', len(db))
    print(sorted(set(o[3] for o in out if o[3]))[:80])
    print(sorted(set(db)-set(o[1] for o in out if o[0]=='m')))
