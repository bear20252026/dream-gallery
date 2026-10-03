# scene2-sketches.py — 画羊画板四轮线稿生成器(2026-10-03)。python scripts/gen/scene2-sketches.py → sk.json + p.html 预览;
# 把输出数组贴回 src/gate/scene2-draw.js 的 SHEEP_SICK / RAM / BOX。
import math, json
def f(v): return ('%.1f'%v).rstrip('0').rstrip('.')
def scallop(cx,cy,rx,ry,n,bulge=0.62,start=math.pi*0.92,end=None,jit=0):
    # closed cloud outline: arcs between points on ellipse, bulging outward
    pts=[]
    for i in range(n+1):
        a=start+2*math.pi*i/n
        k=1+ (0.05 if i%2 else -0.03)*jit
        pts.append((cx+rx*math.cos(a)*k, cy+ry*math.sin(a)*k))
    d='M%s,%s'%(f(pts[0][0]),f(pts[0][1]))
    for i in range(1,len(pts)):
        x0,y0=pts[i-1];x1,y1=pts[i]
        r=math.hypot(x1-x0,y1-y0)*bulge
        d+=' A%s,%s 0 0,1 %s,%s'%(f(r),f(r),f(x1),f(y1))
    return d
def curl(x,y,s=7,flip=1):
    return 'M%s,%s a%s,%s 0 1,%d %s,%s a%s,%s 0 0,%d %s,%s'%(f(x),f(y),f(s),f(s),1 if flip>0 else 0,f(s*1.4),f(-s*0.2),f(s*0.5),f(s*0.5),1 if flip>0 else 0,f(-s*0.6),f(s*0.4))
def spiral(cx,cy,r0,turns=1.6,dirn=1,steps=40,a0=0):
    pts=[]
    for i in range(steps+1):
        t=i/steps
        a=a0+dirn*2*math.pi*turns*t
        r=r0*(1-0.8*t)
        pts.append((cx+r*math.cos(a),cy+r*math.sin(a)))
    d='M%s,%s'%(f(pts[0][0]),f(pts[0][1]))
    for i in range(1,len(pts)-1,2):
        d+=' Q%s,%s %s,%s'%(f(pts[i][0]),f(pts[i][1]),f(pts[i+1][0]),f(pts[i+1][1]))
    return d
out={}
# ---- sick sheep: woolly cloud, droopy head left, closed eye
S=[]
S.append(dict(d=scallop(360,298,92,50,14,jit=1),t=1300,w=3.2))
S.append(dict(d='M272,292 C262,298 256,306 252,314',t=400,w=3))  # neck top
S.append(dict(d='M274,322 C268,328 264,334 260,338',t=350,w=3))  # neck under
S.append(dict(d='M252,314 C240,306 220,308 213,321 C206,334 214,346 229,348 C243,350 255,344 260,338',t=800,w=3))  # head
S.append(dict(d='M246,314 C237,318 233,331 239,339 C243,344 248,340 248,333',t=500,w=2.4))  # droopy ear
S.append(dict(d='M220,325 C223,328 228,328 231,325',t=300,w=2))  # closed eye
S.append(dict(d='M213,333 a1.8,1.8 0 1,0 .1,0',t=150,fill=True))  # nose
S.append(dict(d='M218,341 C221,343 224,343 227,341',t=250,w=1.6,soft=True))  # mouth
for x0,x1 in [(300,296),(326,324),(392,394),(420,424)]:
    S.append(dict(d='M%d,344 C%d,362 %d,380 %d,396'%(x0,x0-1,x1+1,x1),t=320,w=2.6))
    S.append(dict(d='M%d,396 L%d,397'%(x1-5,x1+6),t=150,w=3))
S.append(dict(d='M452,290 C466,284 470,296 462,302 C456,306 452,300 456,296',t=420,w=2.2,soft=True))  # tail
# details (delays)
dl=1250
for (x,y) in [(318,290),(352,282),(388,292),(340,312),(376,316),(408,306)]:
    S.append(dict(d=curl(x,y,6),t=320,w=1.6,soft=True,delay=dl)); dl+=110
S.append(dict(d='M206,318 C200,312 196,306 198,298',t=360,w=1.6,soft=True,delay=dl)); dl+=120  # sigh puff
S.append(dict(d='M194,296 a4,4 0 1,0 .1,0',t=200,w=1.4,soft=True,delay=dl)); dl+=120
S.append(dict(d='M262,402 C320,410 420,410 470,402',t=600,w=2,soft=True,delay=dl))
out['SHEEP_SICK']=S
# ---- ram: woolly body, head raised right, spiral horn
R=[]
R.append(dict(d=scallop(340,300,90,50,14,start=math.pi*1.05,jit=1),t=1300,w=3.2))
R.append(dict(d='M420,280 C430,270 442,262 456,258',t=400,w=3))  # neck top
R.append(dict(d='M424,312 C432,302 442,294 452,290',t=400,w=3))  # neck under
R.append(dict(d='M456,258 C470,250 492,252 502,264 C510,274 506,288 494,290 C482,292 468,288 452,290',t=800,w=3))  # head
R.append(dict(d='M468,256 C462,238 438,238 434,256 C430,274 450,282 458,270 C463,262 455,254 449,260',t=900,w=3.4))  # curled horn
R.append(dict(d='M500,272 a1.8,1.8 0 1,0 .1,0',t=150,fill=True))  # nostril
R.append(dict(d='M484,266 a2.8,2.8 0 1,0 .1,0',t=200,fill=True))  # eye
for x0,x1 in [(282,278),(308,306),(372,374),(398,402)]:
    R.append(dict(d='M%d,346 C%d,364 %d,382 %d,398'%(x0,x0-1,x1+1,x1),t=320,w=2.6))
    R.append(dict(d='M%d,398 L%d,399'%(x1-5,x1+6),t=150,w=3))
R.append(dict(d='M252,296 C238,290 236,302 244,306',t=360,w=2.2,soft=True))  # tail
dl=1250
R.append(dict(d='M492,290 C490,300 494,308 488,316',t=360,w=1.8,delay=dl)); dl+=120  # beard
for (x,y) in [(296,290),(330,280),(366,288),(316,314),(352,318),(384,308)]:
    R.append(dict(d=curl(x,y,6),t=320,w=1.6,soft=True,delay=dl)); dl+=110
R.append(dict(d='M483,265 a1,1 0 1,0 .1,0',t=120,fill=True,hl=True,delay=dl)); dl+=110
R.append(dict(d='M248,404 C310,412 400,412 452,404',t=600,w=2,soft=True,delay=dl))
out['RAM']=R
# ---- box: hand-drawn perspective box, 3 air holes, warm glow
B=[]
B.append(dict(d='M246,272 C320,270 400,271 468,270 C469,312 470,352 469,392 C400,393 320,392 247,393 C246,352 247,312 246,272',t=1200,w=3.4))
B.append(dict(d='M246,272 C262,256 280,240 298,226 C372,225 446,226 520,224 C504,240 486,256 468,270',t=800,w=3))
B.append(dict(d='M468,270 C486,256 504,240 520,224 C521,264 521,304 520,344 C503,360 486,376 469,392',t=800,w=3))
B.append(dict(d='M300,248 C370,247 440,247 494,246',t=500,w=1.6,soft=True))  # lid seam
for x in (312,356,400):
    B.append(dict(d='M%d,318 a6,6 0 1,0 .1,0'%x,t=220,fill=True))
B.append(dict(d='M357,330 a124,70 0 1,0 .1,0',t=900,glow=True,delay=0))
dl=1250
for x in (312,356,400):
    B.append(dict(d='M%d,308 C%d,298 %d,292 %d,282'%(x,x-5,x+5,x),t=480,w=1.5,soft=True,delay=dl)); dl+=120
B.append(dict(d='M260,370 C300,366 330,368 360,364',t=420,w=1.4,soft=True,delay=dl)); dl+=110  # wood grain
B.append(dict(d='M370,378 C400,374 430,376 456,372',t=420,w=1.4,soft=True,delay=dl)); dl+=110
B.append(dict(d='M486,384 C504,370 512,356 516,350',t=380,w=1.4,soft=True,delay=dl)); dl+=110
B.append(dict(d='M236,402 C320,410 440,410 526,398',t=600,w=2,soft=True,delay=dl))
out['BOX']=B
json.dump(out,open('sk.json','w'))
# preview svg
html='<html><body style="margin:0;background:#f5ecd6">'
for k,v in out.items():
    html+='<svg viewBox="0 0 720 460" width="720" height="460" style="display:block">'
    for st in v:
        if st.get('glow'): html+='<path d="%s" fill="rgba(255,200,120,.25)"/>'%st['d']; continue
        if st.get('fill'): html+='<path d="%s" fill="%s"/>'%(st['d'],'#fff' if st.get('hl') else '#3a2f26'); continue
        html+='<path d="%s" fill="none" stroke="#3a2f26" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round" opacity="%s"/>'%(st['d'],st.get('w',3),0.7 if st.get('soft') else 1)
    html+='</svg>'
open('p.html','w').write(html+'</body></html>')
