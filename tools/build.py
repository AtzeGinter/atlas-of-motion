import trimesh, numpy as np, pyfqmr, json, gzip, base64, re, sys
MR=float(sys.argv[1]) if len(sys.argv)>1 else 0.45
BR=float(sys.argv[2]) if len(sys.argv)>2 else 0.35
A=trimesh.load('BodyExplorer/public/anatomy.glb'); S=trimesh.load('BodyExplorer/public/skeleton.glb')
mapping={e['name']:e for e in json.load(open('BodyExplorer/public/mesh_mapping.json'))}
items=[]
for kind,scn,ratio in (('m',A,MR),('b',S,BR)):
    for name,g in scn.geometry.items():
        v=np.asarray(g.vertices,dtype=np.float64); f=np.asarray(g.faces,dtype=np.int64)
        n=len(f); tgt=max(min(n,300),int(n*ratio))
        if tgt<n:
            s=pyfqmr.Simplify(); s.setMesh(v,f); s.simplify_mesh(target_count=tgt,aggressiveness=7,preserve_border=True,verbose=0)
            v,f,_=s.getMesh()
        # to scene coords (metres): x, up=z, front=-y
        P=np.stack([v[:,0],v[:,2],-v[:,1]],1)*0.001
        items.append([kind,name,P,np.asarray(f,dtype=np.int64)])
allP=np.concatenate([i[2] for i in items]); lo=allP.min(0); hi=allP.max(0)
# shift: x centred, y feet at 0, z centred
off=np.array([-(lo[0]+hi[0])/2,-lo[1],-(lo[2]+hi[2])/2]); lo2=lo+off; hi2=hi+off
span=(hi2-lo2)
meta=[];buf=[]
tot_f=0
for kind,name,P,F in items:
    P=P+off
    # reorder vertices by first use
    order=np.full(len(P),-1); cnt=0; flat=F.ravel()
    _,first=np.unique(flat,return_index=True)
    used=np.unique(flat)
    seq=used[np.argsort(first)]
    order[seq]=np.arange(len(seq))
    P=P[seq]; F=order[F]
    q=np.round((P-lo2)/span*65535).astype(np.int64)
    d=np.diff(np.concatenate([np.zeros((1,3),np.int64),q]),axis=0)
    d=((d+32768)%65536)-32768
    zz=((d<<1)^(d>>63)).astype(np.uint16)
    fi=F.ravel(); dd=np.diff(np.concatenate([[0],fi])); dd=((dd+32768)%65536)-32768; zi=((dd<<1)^(dd>>63))
    assert len(P)<65536
    buf.append(zz.T.copy().astype('<u2').tobytes()); buf.append(zi.astype('<u2').tobytes())
    meta.append([kind,name,len(P),len(F)]); tot_f+=len(F)
raw=b''.join(buf); gz=gzip.compress(raw,9)
print('faces',tot_f,'raw',len(raw),'gz',len(gz),'b64',len(base64.b64encode(gz)))
json.dump({'lo':lo2.tolist(),'span':span.tolist(),'meshes':meta},open('meta.json','w'))
open('geo.b64','w').write(base64.b64encode(gz).decode())
