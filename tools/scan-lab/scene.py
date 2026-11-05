"""Umelé scény na tréning detektora rohov: karta v albume alebo na stole, svetlo, obal, fólia, prsty, rozmazanie."""
import cv2, numpy as np
VW,VH=192,256; CW,CH=180,252
SRC=np.float32([[0,0],[CW,0],[CW,CH],[0,CH]])
def round_mask():
    m=np.zeros((CH,CW),np.uint8); r=9
    cv2.rectangle(m,(r,0),(CW-r,CH),255,-1); cv2.rectangle(m,(0,r),(CW,CH-r),255,-1)
    for c in [(r,r),(CW-r,r),(r,CH-r),(CW-r,CH-r)]: cv2.circle(m,c,r,255,-1)
    return m
RM=round_mask()
def noise(rng,sz=(VH,VW),cells=None):
    c=cells or int(rng.integers(3,40))
    return cv2.resize(rng.random((max(2,c*sz[0]//sz[1]),c)).astype(np.float32),(sz[1],sz[0]),interpolation=cv2.INTER_CUBIC)
def bg_desk(rng,cards):
    t=rng.integers(6); base=rng.uniform(10,220,3)
    if t==0: b=np.full((VH,VW,3),base,np.float32)
    elif t==1: b=base*(.6+.8*noise(rng))[...,None]                                   # látka, koberec
    elif t==2:                                                                       # drevo
        n=cv2.resize(rng.random((VH,6)).astype(np.float32),(VW,VH),interpolation=cv2.INTER_CUBIC) if rng.random()<.5 else cv2.resize(rng.random((6,VW)).astype(np.float32),(VW,VH),interpolation=cv2.INTER_CUBIC)
        b=base*(.6+.7*n)[...,None]
    elif t==3:                                                                       # veľká rozmazaná kresba (podložka, plagát)
        x=cards[rng.integers(len(cards))]; y=rng.integers(0,120); b=cv2.resize(x[y:y+120,20:160],(VW,VH)).astype(np.float32)
        b=cv2.GaussianBlur(b,(0,0),rng.uniform(.5,5))*rng.uniform(.4,1)
    elif t==4:                                                                       # vzor: pásy, káro
        k=int(rng.integers(6,40)); yy,xx=np.mgrid[:VH,:VW]; p=((xx//k+yy//k)%2).astype(np.float32) if rng.random()<.5 else ((xx//k)%2).astype(np.float32)
        b=np.where(p[...,None]>0,base,rng.uniform(10,220,3)).astype(np.float32)
    else: b=np.full((VH,VW,3),rng.uniform(3,40),np.float32)+8*noise(rng,cells=60)[...,None]   # tmavé
    return b.astype(np.float32)
def paste(img,card,quad):
    M=cv2.getPerspectiveTransform(SRC,quad.astype(np.float32))
    w=cv2.warpPerspective(card,M,(VW,VH),flags=cv2.INTER_AREA).astype(np.float32)
    a=cv2.warpPerspective(RM,M,(VW,VH)).astype(np.float32)[...,None]/255
    return img*(1-a)+w*a
def base_quad(rng,cx,cy,h,rot,persp):
    w=h*63/88; q=np.float32([[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]])
    a=np.deg2rad(rot); R=np.array([[np.cos(a),-np.sin(a)],[np.sin(a),np.cos(a)]])
    return q@R.T+[cx,cy]+rng.normal(0,persp*h,(4,2))
def scene(cards,rng):
    """Vráti (obraz BGR 192×256 uint8, rohy 4×2 v pixeloch alebo None)."""
    n=len(cards); kind=rng.random(); empty=rng.random()<.14
    cut=(not empty) and rng.random()<.06   # karta presahuje mimo záberu = zatiaľ „bez karty“
    h=rng.uniform(.34,.97)*VH
    if cut: h=rng.uniform(.6,1.2)*VH
    w=h*63/88
    mx=max(2,(VW-w)/2-2); my=max(2,(VH-h)/2-2)
    cx=VW/2+rng.uniform(-mx,mx)*(.8 if not cut else 1.9); cy=VH/2+rng.uniform(-my,my)*(.8 if not cut else 1.9)
    rot=rng.normal(0,7) if rng.random()<.9 else rng.uniform(-25,25); persp=rng.uniform(0,.035)
    q=base_quad(rng,cx,cy,h,rot,persp)
    binder=kind<.55
    if binder:
        img=np.full((VH,VW,3),rng.uniform(3,35),np.float32)+10*noise(rng,cells=80)[...,None]
        gx,gy=w*rng.uniform(1.07,1.22),h*rng.uniform(1.05,1.18); a=np.deg2rad(rot); ex=np.array([np.cos(a),np.sin(a)]); ey=np.array([-np.sin(a),np.cos(a)])
        for i in range(-2,3):
            for j in range(-2,3):
                sh=q+ex*gx*i+ey*gy*j
                if i==0 and j==0:                                                    # obal okolo karty
                    c=q.mean(0); pk=(q-c)*rng.uniform(1.03,1.09)+c
                    cv2.polylines(img,[pk.astype(np.int32)],True,tuple(float(v) for v in rng.uniform(40,130,3)),1,cv2.LINE_AA)
                    continue
                c=sh.mean(0)
                if c[0]<-w or c[0]>VW+w or c[1]<-h or c[1]>VH+h or rng.random()<.1: continue
                img=paste(img,cards[rng.integers(n)],sh+rng.normal(0,.004*h,(4,2)))
    else:
        img=bg_desk(rng,cards)
        if rng.random()<.25:                                                         # ďalšie karty voľne na stole
            for _ in range(rng.integers(1,4)):
                sh=base_quad(rng,rng.uniform(-30,VW+30),rng.uniform(-30,VH+30),h*rng.uniform(.8,1.1),rng.uniform(-40,40),.02)
                if np.linalg.norm(sh.mean(0)-q.mean(0))>h*.95: img=paste(img,cards[rng.integers(n)],sh)
    if not empty:
        card=cards[rng.integers(n)]
        # tieň pod kartou na stole
        if not binder and rng.random()<.6:
            sq=q+rng.normal(2,2,2); mk=np.zeros((VH,VW),np.float32); cv2.fillPoly(mk,[sq.astype(np.int32)],1); mk=cv2.GaussianBlur(mk,(0,0),3)
            img=img*(1-.55*mk[...,None])
        img=paste(img,card,q)
    # prsty (kartu môže držať ruka)
    if not empty and rng.random()<.22:
        col=np.array([rng.uniform(90,170),rng.uniform(120,190),rng.uniform(170,240)])
        e=int(rng.integers(4)); t=rng.uniform(.2,.8); p=q[e]*(1-t)+q[(e+1)%4]*t
        for k in range(rng.integers(1,3)):
            d=(q.mean(0)-p)/np.linalg.norm(q.mean(0)-p); b=p+rng.normal(0,6,2)-d*25; ee=p+d*rng.uniform(4,.16*h)
            cv2.line(img,tuple(b.astype(int).tolist()),tuple(ee.astype(int).tolist()),col.tolist(),int(rng.uniform(.07,.14)*h),cv2.LINE_AA)
    # obal: odlesk, pás svetla
    for _ in range(rng.integers(0,3)):
        gl=np.zeros((VH,VW),np.float32)
        cv2.ellipse(gl,(int(rng.uniform(0,VW)),int(rng.uniform(0,VH))),(int(rng.uniform(5,90)),int(rng.uniform(3,40))),rng.uniform(0,180),0,360,1,-1)
        gl=cv2.GaussianBlur(gl,(0,0),rng.uniform(2,14))*rng.uniform(.2,.9); img=img+gl[...,None]*255
    # fólia: dúhový šum
    if rng.random()<.35:
        hue=noise(rng,cells=int(rng.integers(3,14))); rb=cv2.cvtColor(np.dstack([(hue*179).astype(np.uint8),np.full((VH,VW),200,np.uint8),np.full((VH,VW),255,np.uint8)]),cv2.COLOR_HSV2BGR).astype(np.float32)
        a=rng.uniform(.05,.3); img=img*(1-a)+rb*a
    # expozícia, vyváženie bielej, gama, tieň cez záber
    img=img*rng.uniform(.35,1.3)+rng.uniform(-20,25); img=img*np.array([rng.uniform(.75,1.25),1,rng.uniform(.75,1.25)])
    if rng.random()<.35:
        g=cv2.resize(rng.random((3,3)).astype(np.float32),(VW,VH),interpolation=cv2.INTER_CUBIC); img=img*(.5+.8*g)[...,None]
    img=255*(np.clip(img,0,255)/255)**rng.uniform(.7,1.4)
    if rng.random()<.5: img=cv2.GaussianBlur(img,(0,0),rng.uniform(.4,1.8))
    if rng.random()<.15:                                                             # pohyb
        k=int(rng.integers(3,9)); K=np.zeros((k,k),np.float32); K[k//2,:]=1/k
        K=cv2.warpAffine(K,cv2.getRotationMatrix2D((k/2,k/2),rng.uniform(0,180),1),(k,k)); K/=max(K.sum(),1e-3); img=cv2.filter2D(img,-1,K)
    img=np.clip(img+rng.normal(0,rng.uniform(0,9),img.shape),0,255).astype(np.uint8)
    _,j=cv2.imencode('.jpg',img,[cv2.IMWRITE_JPEG_QUALITY,int(rng.uniform(35,92))]); img=cv2.imdecode(j,1)
    return img,(None if empty or cut else q.astype(np.float32))
