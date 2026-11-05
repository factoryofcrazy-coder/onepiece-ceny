"""Detektor rohov karty: MobileNetV3-small + malý dekodér → 4 teplotné mapy + „je tam karta“. Vstup 192×256."""
import numpy as np,cv2,torch,torch.nn as nn,torch.nn.functional as F,timm,json,time,sys,os
torch.set_num_threads(5); cv2.setNumThreads(1)
from scene import scene,VW,VH
from detnet import DetNet,softargmax,MEAN,STD
N=json.load(open('cards180.n')); cards=np.memmap('cards180.u8',np.uint8,'r',shape=(N,252,180,3))
HW,HH=VW//4,VH//4
yy,xx=np.mgrid[:HH,:HW].astype(np.float32)
def target(q):
    t=np.zeros((4,HH,HW),np.float32)
    for i,(x,y) in enumerate(q/4): t[i]=np.exp(-((xx-x)**2+(yy-y)**2)/(2*1.5**2))
    return t
class DS(torch.utils.data.IterableDataset):
    def __iter__(s):
        w=torch.utils.data.get_worker_info(); rng=np.random.default_rng((w.id if w else 0)+int(time.time()*1000)%100000)
        while True:
            im,q=scene(cards,rng)
            x=((im[:,:,::-1]/255.-MEAN)/STD).transpose(2,0,1).astype(np.float32)
            yield x,(target(q) if q is not None else np.zeros((4,HH,HW),np.float32)),(q/[VW,VH] if q is not None else np.zeros((4,2))).astype(np.float32),float(q is not None)
if __name__=='__main__':
    STEPS=int(sys.argv[1]) if len(sys.argv)>1 else 8000; BS=24
    net=DetNet(pretrained=True)
    dl=torch.utils.data.DataLoader(DS(),batch_size=BS,num_workers=3,prefetch_factor=4,persistent_workers=True)
    opt=torch.optim.AdamW(net.parameters(),lr=1e-3,weight_decay=1e-5)
    sch=torch.optim.lr_scheduler.OneCycleLR(opt,1.2e-3,total_steps=STEPS,pct_start=.08)
    t0=time.time(); it=iter(dl); L=[0,0,0]; n=0
    for step in range(STEPS):
        x,t,q,o=next(it); hm,obj=net(x); xy=softargmax(hm)
        m=o[:,None,None]
        l1=(F.smooth_l1_loss(xy,q,reduction='none',beta=.02)*m).sum()/(m.sum()*8+1e-6)
        lh=F.mse_loss(torch.sigmoid(hm),t,reduction='none').mean((2,3)); lh=(lh*o[:,None]).sum()/(o.sum()*4+1e-6)
        lo=F.binary_cross_entropy_with_logits(obj,o.float())
        loss=20*l1+50*lh+lo
        opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(net.parameters(),5); opt.step(); sch.step()
        L[0]+=l1.item();L[1]+=lh.item();L[2]+=lo.item();n+=1
        if (step+1)%100==0:
            print(f'{step+1}/{STEPS} l1 {L[0]/n:.4f} hm {L[1]/n:.4f} obj {L[2]/n:.3f} {time.time()-t0:.0f}s',flush=True); L=[0,0,0];n=0
        if (step+1)%1000==0: torch.save(net.state_dict(),'det_last.pt')
    torch.save(net.state_dict(),'det_last.pt'); print('hotovo',flush=True); os._exit(0)
