import argparse, json, math
from pathlib import Path
import cv2
import numpy as np

# dev/analysis/compareSaltPlayerFrames.py
# Compare exported production geometry against held-out portions of the user reference.
# This measures trajectories, not Android pixels or frame timing on a physical device.
parser=argparse.ArgumentParser()
parser.add_argument('--reference',required=True)
parser.add_argument('--profile',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
profile=json.loads(Path(args.profile).read_text())
cap=cv2.VideoCapture(args.reference);frames=[];times=[]
while True:
    ok,frame=cap.read()
    if not ok: break
    frames.append(cv2.resize(frame,(305,664)));times.append(cap.get(cv2.CAP_PROP_POS_MSEC))
cap.release()
template=frames[41][135:391,25:281]
def measure(index):
    image=frames[index];hsv=cv2.cvtColor(image,cv2.COLOR_BGR2HSV)
    mask=cv2.inRange(hsv,(5,20,80),(40,155,245))
    _,_,stats,_=cv2.connectedComponentsWithStats(mask)
    candidates=[r for r in stats[1:] if r[4]>3000]
    panel=None
    if candidates:
        x,y,w,h,_=max(candidates,key=lambda r:r[4]);ys=np.flatnonzero(np.count_nonzero(mask,axis=1)>150)
        if len(ys): panel=[int(x),int(ys[0]),int(x+w),int(y+h)]
    # Artwork template matching is independent of source UI text and the outgoing list.
    minimum=28 if index>97 else 45
    best=(-1,None)
    cropTop=400 if index>=98 else 100
    roi=image[cropTop:654,:]
    for width in range(minimum,min(259,roi.shape[0]+1,roi.shape[1]+1)):
        result=cv2.matchTemplate(roi,cv2.resize(template,(width,width)),cv2.TM_CCOEFF_NORMED)
        _,score,_,xy=cv2.minMaxLoc(result)
        if score>best[0]:best=(score,[xy[0],xy[1]+cropTop,xy[0]+width,xy[1]+cropTop+width])
    return {'panel':panel,'cover':best[1],'confidence':best[0]}
def predicted(kind,ms):
    rows=profile[kind];return rows[max(0,min(len(rows)-1,round(ms)))]
segments=[('opening',range(10,26),range(275,307)),('closing',range(94,102),range(3085,3117))]
measurements={i:measure(i) for _,indices,_ in segments for i in indices}
report={'kind':'geometry-only-not-device-render','training':'opening #2 + closing #1','heldOut':[]}
selected=[]
for kind,indices,starts in segments:
    def errors(start):
        return [float(a-b) for i in indices for a,b in zip(measurements[i]['cover'],predicted(kind,times[i]-start)['cover'])]
    start=min(starts,key=lambda start:sum(e*e for e in errors(start)))
    values=errors(start)
    item={'kind':kind,'alignedStartMs':start,'frameCount':len(indices),'coverCoordinateRMSEPxAt305Width':math.sqrt(sum(e*e for e in values)/len(values)),
          'coverCoordinateMaxErrorPxAt305Width':max(map(abs,values))}
    report['heldOut'].append(item)
    for i in indices:
        predictedFrame=predicted(kind,times[i]-start)
        image=frames[i].copy()
        for key,color in [('panel',(255,90,0)),('cover',(0,220,0))]:
            x0,y0,x1,y1=map(round,predictedFrame[key]);cv2.rectangle(image,(x0,y0),(x1,y1),color,1)
        cv2.putText(image,f'{i}: {times[i]:.0f}ms / {kind}',(8,18),cv2.FONT_HERSHEY_SIMPLEX,.38,(0,0,0),1)
        cv2.putText(image,'GEOMETRY OVERLAY - NOT DEVICE',(8,36),cv2.FONT_HERSHEY_SIMPLEX,.32,(0,0,0),1)
        if i%2==0:selected.append(image)
(out/'held-out-comparison.json').write_text(json.dumps(report,indent=2)+'\n')
canvas=np.full((700*2,305*6,3),240,np.uint8)
for j,image in enumerate(selected[:12]):canvas[(j//6)*700:(j//6)*700+664,(j%6)*305:(j%6+1)*305]=image
cv2.imwrite(str(out/'held-out-geometry.jpg'),canvas)
print(json.dumps(report,indent=2))
