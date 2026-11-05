import cv2,glob,numpy as np,json
from multiprocessing import get_context
def rd(f):
    im=cv2.imread(f)
    return None if im is None else cv2.resize(im,(180,252),interpolation=cv2.INTER_AREA)
if __name__=='__main__':
    fs=sorted(glob.glob('../imgs/*.jpg'))+sorted(glob.glob('../jp/*.png'))
    with get_context('fork').Pool(8) as p: R=p.map(rd,fs,chunksize=64)
    R=[r for r in R if r is not None]; A=np.memmap('cards180.u8',np.uint8,'w+',shape=(len(R),252,180,3))
    for i,r in enumerate(R): A[i]=r
    A.flush(); json.dump(len(R),open('cards180.n','w')); print(len(R))
