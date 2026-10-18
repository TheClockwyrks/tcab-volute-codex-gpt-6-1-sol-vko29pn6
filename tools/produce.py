"""One-time asset authoring. Generated files are committed; builds never run this."""
import json, math, subprocess, pathlib, wave, struct
ROOT=pathlib.Path(__file__).resolve().parents[1]
A=ROOT/'public/assets'; A.mkdir(parents=True,exist_ok=True)
W=ROOT/'tools/source'; W.mkdir(exist_ok=True)
def finish_loop(path):
 # Eight-millisecond cosine ramps meet at zero without inserting silent samples.
 with wave.open(str(path), 'rb') as stream:
  params=stream.getparams(); samples=list(struct.unpack('<'+'h'*params.nframes,stream.readframes(params.nframes)))
 ramp=int(params.framerate*.008)
 for i in range(ramp):
  gain=(1-math.cos(math.pi*i/(ramp-1)))/2
  samples[i]=round(samples[i]*gain);samples[-1-i]=round(samples[-1-i]*gain)
 with wave.open(str(path),'wb') as stream:
  stream.setparams(params);stream.writeframes(struct.pack('<'+'h'*len(samples),*samples))
def run(tool,config,*args):
 subprocess.run([tool,'--config',str(config),*map(str,args)],check=True,stdout=subprocess.DEVNULL,cwd=W)
def cfg(name,data):
 p=W/(name+'.json');p.write_text(json.dumps(data));return p
def sprite(name,w,h,pixel,sheet=False):
 ops=[]
 for y in range(h):
  for x in range(w):
   c=pixel(x,y)
   if c: ops.append(dict(op='set_pixel',x=x,y=y,color=c))
 log=W/(name+'.ops.json');log.write_text(json.dumps(ops))
 subprocess.run(['draw-sheet' if sheet else 'draw','render','--actions',str(log),'--out',str(A/(name+'.png')),'--width',str(w),'--height',str(h),'--no-layers'],check=True,stdout=subprocess.DEVNULL,cwd=W)
def mix(c,k):
 rgb=[int(c[i:i+2],16) for i in (1,3,5)]
 return '#'+''.join(f'{max(0,min(255,int(v*k))):02x}' for v in rgb)
colors=['#62e4ce','#ffd16a','#7cafff','#ff7588','#b5e66b']
names=['halide','sulfur','cobalt','garnet','olivine']
def core(x,y,c,i):
 dx=x-13.5;dy=y-13.5;r=math.hypot(dx,dy)
 if r>13.7:return None
 if r>12:return '#122a30'
 if r>10.8:return mix(c,.65)
 # cut mineral facets, illuminated upper left
 k= .86 if dx+dy>2 else 1.12
 if dx>3 and dy<3:k=.74
 if dy>6:k=.62
 if dx< -5 and dy<0:k=1.35
 glyph=[abs(dx)<1.5 or abs(dy)<1.5,abs(dx)+abs(dy)<5 and abs(dx)+abs(dy)>2,abs(abs(dx)-abs(dy))<1.4,abs(dx)<4 and abs(dy)<4 and (abs(dx)>2 or abs(dy)>2),abs(dx)<1.5 or (dy>0 and abs(dx+dy)<1.5)][i]
 if glyph and r<6:return '#f5ffea'
 if x in (7,8) and y in (5,6):return '#f0fff2'
 return mix(c,k)
for i,(n,c) in enumerate(zip(names,colors)):sprite('core-'+n,28,28,lambda x,y,c=c,i=i:core(x,y,c,i))
for i,n in enumerate(['choke','backflow','bore','sightline']):
 def mark(x,y,i=i):
  dx=x-7.5;dy=y-7.5
  on=[(abs(dx)<5 and abs(dy) in (2.5,3.5)) or (abs(dx)<2 and abs(dy)<6),(abs(dy)<2 and abs(dx)<6) or (dx<0 and abs(abs(dy)+dx)<2),abs(math.hypot(dx,dy)-4)<1.5 or abs(dx)<1 and abs(dy)<7,abs(dx)<1 or abs(dy)<1 or abs(math.hypot(dx,dy)-5)<1][i]
  if on:return '#ffffff'
  if abs(dx)<7 and abs(dy)<7:return '#102b33cc'
  return None
 sprite('mark-'+n,16,16,mark)
def metal(x,y,w,h):
 if x<1 or y<1 or x>=w-1 or y>=h-1:return '#102027'
 if x<3 or y<3:return '#637c7d'
 if x>w-4 or y>h-4:return '#182e35'
 return '#344c53' if (x+y)%9 else '#3b555b'
def barrel(x,y,k=0):
 if x>41-k or x<3-k or y<4 or y>15:return None
 if x>33-k:return '#e7bb70' if y in (4,5,14,15) else '#152b32'
 return metal(x+k,y-3,40,14)
sprite('injector-barrel',44,20,barrel)
def base(x,y):
 r=math.hypot(x-21.5,y-21.5)
 if r>22:return None
 if r>19:return '#17282e'
 if r>17:return '#b9935c'
 if r>13:return '#3f5c62'
 if r>11:return '#162e34'
 return '#71908b' if (x+y)%7==0 else '#2e464e'
sprite('injector-base',44,44,base)
def maw(x,y,k=0):
 dx=x-31.5;dy=y-31.5;r=math.hypot(dx,dy)
 if r>31:return None
 if r>28:return '#101c22'
 if r>25:return '#a08158'
 if r>22:return '#405158'
 if r>18+k:return '#1d3036'
 if r>13+k and ((int(math.atan2(dy,dx)*4/math.pi)%2)==0):return '#a1b2aa'
 return '#071318' if r>7 else '#281e1d'
sprite('intake-maw',64,64,maw)
def plate(x,y):
 if y in (0,1,62,63):return '#12242a'
 if y in (3,60):return '#61716b'
 if y in (7,56):return '#243f45'
 if x in (5,58) and y in (5,58):return '#c2a06a'
 return '#263c42' if (x*13+y*7)%41 else '#31484b'
sprite('channel-plate',64,64,plate)
for n in ['cell','pressure']:
 def icon(x,y,n=n):
  if n=='cell':
   if 5<=x<=18 and 4<=y<=21:return '#9be2c2' if x in (5,18) or y in (4,21) else '#345957'
   if 9<=x<=14 and 1<=y<=3:return '#e4c68e'
  else:
   r=math.hypot(x-12,y-12)
   if 8<r<11:return '#e4c68e'
   if abs(x+y-23)<2 and x>8 and y<16:return '#ffbf63'
  return None
 sprite('hud-'+n,24,24,icon)
for f in range(4):sprite('recoil-'+str(f),44,20,lambda x,y,f=f:barrel(x,y,[5,3,1,0][f]),True)
for f in range(6):sprite('swallow-'+str(f),64,64,lambda x,y,f=f:maw(x,y,[0,3,5,3,1,0][f]),True)
for f in range(6):
 def flash(x,y,f=f):
  dx=x-23.5;dy=y-23.5;r=math.hypot(dx,dy); radius=7+f*3
  if abs(r-radius)<1.5 or ((abs(dx)<1 or abs(dy)<1) and r<radius+3 and r>radius-5):return '#fff9df'+['ff','ee','cc','99','66','33'][f]
  return None
 sprite('flash-'+str(f),48,48,flash,True)
for i,n in enumerate(['extraction','bore','swallow','pickup']):
 p=cfg(n,dict(width=960,height=540,duration_ms=1000,fps=30,seed=37+i,actions=str(W/(n+'.ops.json')),preview=str(W/(n+'.png')),system=str(A/(n+'.system.json'))))
 run('particle-2d',p,'init')
 run('particle-2d',p,'add-emitter','--name','sparks','--shape','point','--x',480,'--y',270,'--burst',[22,45,18,16][i],'--lifetime',[260,650,400,600][i],'--speed',[130,180,85,60][i],'--cone-angle',[180,180,25,30][i],'--dir-y',-1 if i==2 else 1)
 run('particle-2d',p,'set-particle','--emitter','sparks','--size-from',.22 if i!=1 else .4,'--size-to',0,'--opacity-from',1,'--opacity-to',0,'--color-gradient','#fff8da@0,#e5ab66@0.4,#488b86@1')
 run('particle-2d',p,'render','--frame',4,'--out',W/(n+'.png'))
for i,n in enumerate(['fire','seat','swap','denied','machinery','extract-1','extract-2','extract-3','extract-4','extract-5','intake','level-clear','cell-lost','hall-loop','danger-loop']):
 ismusic=i>=13; tool='music' if ismusic else ('sfx-synth' if i<5 else 'sfx-sample')
 p=cfg(n,dict(sample_rate=22050,channels='mono',max_duration_ms=8000 if ismusic else 1800,seed=42+i,sample_pack='combat-core',instrument_bank='synthwave',actions=str(W/(n+'.ops.json')),preview=str(W/(n+'.png')),wav=str(A/(n+'.wav')),mid=str(A/(n+'.mid'))))
 run(tool,p,'init')
 if ismusic:
  run(tool,p,'set-tempo','--bpm',120)
  for track,inst in [('bass','synth_bass'),('bell','fm_bell'),('beat','kick_808')]:run(tool,p,'define-track','--name',track,'--instrument',inst)
  for beat in range(16):
   run(tool,p,'add-note','--track','bass','--pitch',[38,38,41,36][beat//4],'--t',beat,'--dur',.65,'--velocity',43 if i==13 else 58)
   if beat%2==0 or i==14:run(tool,p,'add-note','--track','beat','--pitch',36,'--t',beat,'--dur',.1,'--velocity',38)
   if beat%2==0:run(tool,p,'add-note','--track','bell','--pitch',[62,69,65,72][(beat//2)%4],'--t',beat+.5,'--dur',.3,'--velocity',30)
 elif i<5:
  run(tool,p,'add-voice','--name','body','--wave',['noise','sine','triangle','square','triangle'][i],'--freq',[180,180,850,95,600][i],'--dur',[80,110,75,180,300][i],'--gain',-19)
  run(tool,p,'set-envelope','--voice','body','--env','pluck')
  if i>0:run(tool,p,'set-pitch','--voice','body','--slide-to', [100,80,1200,60,1400][i],'--over',150)
 else:
  sample='impact_metal_dry' if i<10 else ['boom_sub_rumble','clang_metal','cannon_body_heavy'][i-10]
  run(tool,p,'add-sample','--name',sample,'--t',0,'--gain',-13,'--pitch',(i-5)*3 if i<10 else -3,'--fade-out',100)
  if i==11:run(tool,p,'add-sample','--name','impact_metal_dry','--t',240,'--gain',-16,'--pitch',12)
 run(tool,p,'render')
 if ismusic:finish_loop(A/(n+'.wav'))
print('Produced sprites, animation frames, particles, cues and music.')
