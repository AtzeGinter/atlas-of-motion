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
    M['meshes']=out; M['db']=db; M['bdb']={b:B.info(b) for b in sorted(bnames)}
    json.dump(M,open('meta2.json','w',encoding='utf-8',newline='\n'),separators=(',',':'))
    from collections import Counter
    print(Counter(db[o[1]]['g'] for o in out if o[0]=='m'))
    print(len(set(o[1] for o in out if o[0]=='m')), 'keys used of', len(db))
    print(sorted(set(o[3] for o in out if o[3]))[:80])
    print(sorted(set(db)-set(o[1] for o in out if o[0]=='m')))
