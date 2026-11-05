import numpy as np,torch,torch.nn as nn,torch.nn.functional as F,timm
MEAN=np.array([.485,.456,.406]); STD=np.array([.229,.224,.225])
class Up(nn.Module):
    def __init__(s,a,b,c):
        super().__init__(); s.c=nn.Sequential(nn.Conv2d(a+b,c,3,padding=1,bias=False),nn.BatchNorm2d(c),nn.ReLU(True),nn.Conv2d(c,c,3,padding=1,groups=c,bias=False),nn.Conv2d(c,c,1,bias=False),nn.BatchNorm2d(c),nn.ReLU(True))
    def forward(s,x,y): return s.c(torch.cat([F.interpolate(x,size=y.shape[2:],mode='bilinear',align_corners=False),y],1))
class DetNet(nn.Module):
    def __init__(s,pretrained=False):
        super().__init__(); s.bb=timm.create_model('mobilenetv3_small_100',pretrained=pretrained,features_only=True,out_indices=(1,2,3,4))
        ch=s.bb.feature_info.channels()
        s.u3=Up(ch[3],ch[2],64); s.u2=Up(64,ch[1],48); s.u1=Up(48,ch[0],32)
        s.hm=nn.Conv2d(32,4,1); s.obj=nn.Linear(ch[3],1)
    def forward(s,x):
        a,b,c,d=s.bb(x); y=s.u1(s.u2(s.u3(d,c),b),a)
        return s.hm(y),s.obj(d.mean((2,3))).squeeze(1)
def softargmax(hm,temp=20.):
    B,C,H,W=hm.shape; p=F.softmax(hm.reshape(B,C,-1)*temp,2).reshape(B,C,H,W)
    xs=(torch.arange(W,dtype=hm.dtype)+.5)/W; ys=(torch.arange(H,dtype=hm.dtype)+.5)/H
    return torch.stack([(p.sum(2)*xs).sum(2),(p.sum(3)*ys).sum(2)],2)
