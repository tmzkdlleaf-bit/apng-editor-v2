# 2D 유체 시뮬레이션(안정 유체 + 부력 + 소용돌이 보강) → 불·연기·폭발 플립북(검은 배경)
# 사용: python3 scripts/gen-footage.py fire 64  (smoke 64 / explosion 32) → vendor/footage/*.webp
import numpy as np, sys
from scipy.ndimage import map_coordinates, gaussian_filter
from PIL import Image

FIRE = np.array([[0,0,0,0],[0.12,70,18,4],[0.22,115,32,7],[0.34,165,58,15],[0.46,208,90,25],[0.58,235,125,43],[0.7,250,165,68],[0.82,253,207,100],[0.94,253,240,168],[1,255,248,214]],float)
def fire_rgb(v):
    v=np.clip(v,0,1); out=np.zeros(v.shape+(3,))
    for c in range(3): out[...,c]=np.interp(v,FIRE[:,0],FIRE[:,c+1])
    return out

def advect(f, u, v, dt):
    H,W=f.shape; y,x=np.mgrid[0:H,0:W].astype(float)
    return map_coordinates(f,[y-v*dt, x-u*dt],order=1,mode='nearest')

def project(u,v,it=50):
    H,W=u.shape
    div=np.zeros_like(u)
    div[1:-1,1:-1]=-0.5*(u[1:-1,2:]-u[1:-1,:-2]+v[2:,1:-1]-v[:-2,1:-1])
    p=np.zeros_like(u)
    for _ in range(it):
        p[1:-1,1:-1]=(div[1:-1,1:-1]+p[1:-1,2:]+p[1:-1,:-2]+p[2:,1:-1]+p[:-2,1:-1])/4
    u[1:-1,1:-1]-=0.5*(p[1:-1,2:]-p[1:-1,:-2]); v[1:-1,1:-1]-=0.5*(p[2:,1:-1]-p[:-2,1:-1])
    return u,v

def vort(u,v,eps,dt):
    w=np.zeros_like(u); w[1:-1,1:-1]=0.5*((v[1:-1,2:]-v[1:-1,:-2])-(u[2:,1:-1]-u[:-2,1:-1]))
    a=np.abs(w); gx=np.zeros_like(u); gy=np.zeros_like(u)
    gx[1:-1,1:-1]=0.5*(a[1:-1,2:]-a[1:-1,:-2]); gy[1:-1,1:-1]=0.5*(a[2:,1:-1]-a[:-2,1:-1])
    n=np.sqrt(gx**2+gy**2)+1e-5; gx/=n; gy/=n
    u+=eps*dt*(gy*w); v+=eps*dt*(-gx*w)
    return u,v

def run(kind, W=128, H=192, frames=72, warm=90, sub=2, seed=1):
    rng=np.random.default_rng(seed)
    u=np.zeros((H,W)); v=np.zeros((H,W)); T=np.zeros((H,W)); S=np.zeros((H,W))
    out=[]; dt=0.6
    y,x=np.mgrid[0:H,0:W]
    total=warm+frames*sub
    for step in range(total):
        t=step*dt
        if kind in('fire','smoke'):
            # 바닥 연료 줄: 시간에 따라 흔들리는 덩어리 → 불 혀
            src=np.zeros((H,W))
            cx=W/2+np.sin(t*0.05)*3
            band=np.exp(-((x-cx)/(W*0.24))**2)*(y>H-12)
            noise=gaussian_filter(rng.random((H,W)),3)
            noise=(noise-noise.mean())/(noise.std()+1e-6)
            src=band*np.clip(0.6+noise*0.5,0,1)
            # 바닥 난류 주입(공기 흐름이 불을 흔든다)
            u+=0.25*np.sin(y*0.07+t*0.35+1.3)*np.sin(x*0.09-t*0.21)+0.15*np.sin(y*0.031-t*0.5)
            if kind=='fire':
                T=np.maximum(T,src*0.95)
                v-=src*0.4
            else:
                S+=src*0.025*(band>0.5); T=np.maximum(T,src*0.3*(band>0.5)); v-=src*0.3*(band>0.5)
        elif kind=='explosion' and step==warm-6:
            r=np.hypot(x-W/2,y-H*0.62)
            ball=(r<W*0.16).astype(float)
            T=np.maximum(T,ball*1.6); S+=ball*1.0
            u+=(x-W/2)/(r+1)*ball*6; v+=(y-H*0.62)/(r+1)*ball*6
        # 부력(뜨거우면 위로), 연기는 살짝 무겁다
        v-=dt*(0.55*T-0.05*S)
        if kind=='fire': u*=0.98; v*=0.95   # 공기 저항: 불길이 끝없이 빨라지지 않게
        u,v=vort(u,v,1.2 if kind=='fire' else (0.35 if kind=='explosion' else 0.25),dt)
        u,v=project(u,v)
        u=advect(u,u,v,dt); v=advect(v,u,v,dt)
        u,v=project(u,v)
        T=advect(T,u,v,dt); S=advect(S,u,v,dt)
        T=gaussian_filter(T,0.45)
        cool=0.955 if kind=='fire' else (0.97 if kind=='explosion' else 0.985)
        S+=np.clip(T*(1-cool),0,None)*(2.5 if kind=='explosion' else 0)
        T*=cool; S*=0.982
        S[:12,:]*=0.85; S[:, :4]*=0.85; S[:, -4:]*=0.85
        if step>=warm and (step-warm)%sub==0:
            out.append((T.copy(),S.copy()))
        if kind=='explosion' and len(out)>=frames: break
    return out

def render(kind, frames, scale=2):
    imgs=[]
    for T,S in frames:
        if kind=='fire':
            Tb=gaussian_filter(T,0.7)
            e=np.clip((Tb-0.16)/0.06,0,1); e=e*e*(3-2*e)       # 침식: 좁은 폭에서 끊기는 가장자리
            vv=e*(0.33+0.67*np.clip((Tb-0.16)/0.7,0,1))
            rgb=fire_rgb(vv)
        elif kind=='smoke':
            d=1-np.exp(-S*1.4)
            lit=gaussian_filter(S,3)  # 두꺼운 곳은 속이 어둡다(역광 아님, 위에서 빛)
            shade=np.clip(1-0.35*(lit/ (lit.max()+1e-6)),0.55,1)
            g=d*shade*200
            rgb=np.stack([g,g*0.99,g*1.02],-1)
        else:
            d=1-np.exp(-S*1.8)
            sm=np.stack([d*70,d*64,d*60],-1)
            fire=fire_rgb(np.clip(T*0.9,0,1))
            a=np.clip(T*1.4,0,1)[...,None]
            rgb=sm*(1-a)+fire*a
        im=Image.fromarray(np.clip(rgb,0,255).astype(np.uint8))
        im=im.resize((im.width*scale,im.height*scale),Image.LANCZOS)
        imgs.append(im)
    return imgs

def sheet(imgs, cols, path):
    w,h=imgs[0].size; rows=(len(imgs)+cols-1)//cols
    sh=Image.new('RGB',(w*cols,h*rows))
    for i,im in enumerate(imgs): sh.paste(im,((i%cols)*w,(i//cols)*h))
    sh.save(path,quality=88,method=6)
    return sh

if __name__=='__main__':
    kind=sys.argv[1]; n=int(sys.argv[2]) if len(sys.argv)>2 else 48
    fr=run(kind,frames=n)
    imgs=render(kind,fr)
    out=sys.argv[3] if len(sys.argv)>3 else f'vendor/footage/{kind}.webp'
    sheet(imgs,8,out)
    print(kind,len(imgs),imgs[0].size)
