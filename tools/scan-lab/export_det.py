import torch,sys,onnx,numpy as np,os
import torch.nn as nn
from detnet import DetNet,softargmax
class W(nn.Module):
    def __init__(s,n): super().__init__(); s.n=n
    def forward(s,x):
        hm,o=s.n(x); return softargmax(hm).reshape(1,8),torch.sigmoid(o),torch.sigmoid(hm).amax((2,3))
n=DetNet(); n.load_state_dict(torch.load(sys.argv[1] if len(sys.argv)>1 else 'det_last.pt',map_location='cpu')); n.eval()
torch.onnx.export(W(n),torch.zeros(1,3,256,192),'out/op-det.fp32.onnx',input_names=['x'],output_names=['corners','obj','peak'],opset_version=17,dynamo=False)
from onnxconverter_common import float16
m=float16.convert_float_to_float16(onnx.load('out/op-det.fp32.onnx'),keep_io_types=True); onnx.save(m,'out/op-det.onnx')
print({f:os.path.getsize('out/'+f)/1e6 for f in ['op-det.fp32.onnx','op-det.onnx']})
