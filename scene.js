/* 本地 p5 画布；所有姿态由绝对时间计算，拖动和重播不会改变飞行路径。 */
'use strict';
(()=>{
const data=globalThis.NightTreeData;
const {branches,leaves,flowers,moon}=data;
// 每个前后层、枝组均匀疏叶；只筛选显示，保留原始叶位和生长时间。
const visibleLeaves=(()=>{
  const groups=new Map(),selected=new Set();
  const rank=l=>{let n=(l.sourceIndex+1)>>>0;n=Math.imul(n^(n>>>16),0x45d9f3b);return (n^(n>>>16))>>>0;};
  for(const leaf of leaves){const key=`${leaf.layer}:${leaf.volume}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(leaf);}
  for(const group of groups.values()){
    const sorted=[...group].sort((a,b)=>rank(a)-rank(b));
    for(const leaf of sorted.slice(0,Math.round(group.length*.7)))selected.add(leaf);
  }
  return leaves.filter(leaf=>selected.has(leaf));
})();
const W=720,H=960,DURATION=24,TREE_END=3,MORPH_TIME=.85;
const LEAF_START=2.35,LEAF_END=3.65,FLOWER_DELAY=.75;
const BLOOM_END=Math.max(...flowers.map(f=>f.start+f.duration))+FLOWER_DELAY;
// 只改变整棵树的显示位置和比例，内部坐标、枝叶尺寸比例与生长时间不变。
const PLACEMENT={scale:.6,x:225,y:770,rootX:360,rootY:745};
const toScreen=q=>({x:(q.x-PLACEMENT.rootX)*PLACEMENT.scale+PLACEMENT.x,y:(q.y-PLACEMENT.rootY)*PLACEMENT.scale+PLACEMENT.y});
const targetMoon={x:(moon.x-PLACEMENT.x)/PLACEMENT.scale+PLACEMENT.rootX,y:(moon.y-PLACEMENT.y)/PLACEMENT.scale+PLACEMENT.rootY};
const clamp=x=>Math.max(0,Math.min(1,x));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const button=document.querySelector('#play'),slider=document.querySelector('#progress');
const readout=document.querySelector('#time'),status=document.querySelector('#status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function curve(b,t){
  const u=1-t;
  return{x:u*u*u*b.x+3*u*u*t*b.cx+3*u*t*t*b.dx+t*t*t*b.ex,
    y:u*u*u*b.y+3*u*u*t*b.cy+3*u*t*t*b.dy+t*t*t*b.ey};
}
function direction(b,t){
  const u=1-t;
  return Math.atan2(3*u*u*(b.cy-b.y)+6*u*t*(b.dy-b.cy)+3*t*t*(b.ey-b.dy),
    3*u*u*(b.cx-b.x)+6*u*t*(b.dx-b.cx)+3*t*t*(b.ex-b.dx));
}
const branchProgress=(b,t)=>clamp((t-b.start)/b.duration);
function leafProgress(leaf,t){
  if(t<=LEAF_START)return 0;
  if(t>=LEAF_END)return 1;
  return branchProgress(leaf,mix(data.leafClockStart,data.leafClockEnd,(t-LEAF_START)/(LEAF_END-LEAF_START)));
}
function flowerProgress(f,t){
  t-=FLOWER_DELAY;
  if(t<=f.budAt)return 0;
  if(t<f.start)return .22*smooth((t-f.budAt)/(f.start-f.budAt));
  return mix(.22,f.maxOpen,branchProgress(f,t));
}
// 参考本地动作库“风吹过，蒲公英散开”的移动风锋与局部响应。
const WIND={start:8.5,end:14,speed:82,origin:405,width:145};
function windState(t,x,y=680){
  const front=WIND.origin+(t-WIND.start)*WIND.speed,centerX=300-(front-WIND.origin)*.34;
  const envelope=smooth((t-WIND.start)/.35)*(1-smooth((t-(WIND.end-.6))/.6));
  const strength=Math.exp(-(((y-front)/WIND.width)**2)-(((x-centerX)/340)**2))*envelope;
  return {front,centerX,envelope,strength};
}
const IMPACT={start:8.75,duration:.7};
function treeShake(t){
  if(t<=IMPACT.start||t>=IMPACT.start+IMPACT.duration)return 0;
  const u=(t-IMPACT.start)/IMPACT.duration;
  return -.014*Math.sin(u*Math.PI*3)*Math.sin(u*Math.PI)**2*(1-.5*u);
}
function attachedPoint(f,t){
  const a=treeShake(t),x=f.x-PLACEMENT.rootX,y=f.y-PLACEMENT.rootY;
  return {x:PLACEMENT.rootX+x*Math.cos(a)-y*Math.sin(a),y:PLACEMENT.rootY+x*Math.sin(a)+y*Math.cos(a)};
}
function windGuide(t){
  const {front,centerX,envelope}=windState(t,0);
  return {alpha:.38*envelope,x:centerX+28,y:front-72,cx:centerX+22,cy:front-47,
    dx:centerX-8,dy:front-18,ex:centerX-16,ey:front+16};
}
function leafColor(leaf){
  const rgb=leaf.tint.match(/\d+/g).map(Number),shade=clamp((rgb[0]+rgb[1]+rgb[2]-160)/360);
  const light=clamp(shade*.25+leaf.light*.55+leaf.layer/4*.2);
  const silver=[147,154,164],pale=[211,216,223],white=[255,255,255];
  const from=light<.44?silver:pale,to=light<.44?pale:white;
  const amount=light<.44?smooth(light/.44):smooth((light-.44)/.29);
  return `rgb(${from.map((v,i)=>Math.round(mix(v,to[i],amount))).join(',')})`;
}
// 飞行对象来自真实花位；落花是独立副本，树上的叶片和金花始终保留。
const fallingFlowers=Array.from({length:112},(_,i)=>{
  const sourceIndex=(i*37)%flowers.length,f=flowers[sourceIndex],source=toScreen(f);
  const landingY=675+(i%7)*6,fallDuration=(2+(landingY-source.y)/210)*.48;
  const release=IMPACT.start+i/111*3.3,morphAt=release+fallDuration;
  const windAt=release,origin=attachedPoint(f,release);
  const force=windState((windAt+morphAt)/2,source.x,(source.y+landingY)/2).strength;
  const drift=Math.max(0,Math.min((toScreen(origin).x-22)/PLACEMENT.scale,85*force));
  const end={x:origin.x-drift,y:(landingY-PLACEMENT.y)/PLACEMENT.scale+PLACEMENT.rootY};
  const sweep=Math.min(32,Math.max(2,(toScreen(end).x-10)/PLACEMENT.scale*.3));
  return {...f,sourceIndex,release,color:i%4,wingSize:13+(i%5),origin,end,fallDuration,morphAt,windAt,drift,sweep,
    carryDuration:.6+(i%9)*.095,flightDuration:4.5+(i%11)*.16};
});
function flowerMotion(f,time){
  const age=time-f.release;
  if(age<0)return{x:f.origin.x,y:f.origin.y,angle:f.rotation,morph:0,scale:1,opacity:0,flight:0};
  // 尚未化蝶时，风已改变落花的横向方向；所有偏移从零平滑开始。
  let q={x:f.origin.x-f.drift*smooth((time-f.windAt)/(f.morphAt-f.windAt)),
    y:mix(f.origin.y,f.end.y,smooth(age/f.fallDuration))},flight=0;
  const morphAge=time-f.morphAt,morph=smooth(morphAge/MORPH_TIME);
  const launch={x:f.end.x-f.sweep,y:f.end.y+17};
  const velocity={x:-f.sweep*.65,y:18};
  if(morphAge>=0){
    q=curve({x:f.end.x,y:f.end.y,cx:f.end.x,cy:f.end.y,
      dx:launch.x-velocity.x*MORPH_TIME/3,dy:launch.y-velocity.y*MORPH_TIME/3,
      ex:launch.x,ey:launch.y},clamp(morphAge/MORPH_TIME));
  }
  if(morphAge>=MORPH_TIME){
    const flyAge=morphAge-MORPH_TIME;
    const turn={x:launch.x-f.sweep*.85,y:launch.y+23+(f.sourceIndex%5)*3};
    flight=clamp(flyAge/(f.carryDuration+f.flightDuration));
    if(flyAge<f.carryDuration){
      // 蝴蝶先沿风继续往左下飞，各自转向时刻不同，不齐刷刷向上。
      q=curve({x:launch.x,y:launch.y,cx:launch.x+velocity.x*f.carryDuration/3,
        cy:launch.y+velocity.y*f.carryDuration/3,dx:turn.x,dy:turn.y,ex:turn.x,ey:turn.y},flyAge/f.carryDuration);
    }else{
      const rise=clamp((flyAge-f.carryDuration)/f.flightDuration);
      q=curve({x:turn.x,y:turn.y,cx:turn.x,cy:turn.y,
        dx:targetMoon.x-150-160*Math.sin(f.phase),dy:targetMoon.y+160+130*Math.cos(f.phase),
        ex:targetMoon.x+Math.cos(f.phase)*22,ey:targetMoon.y+Math.sin(f.phase)*19},rise);
      const envelope=Math.sin(Math.PI*rise)**2;
      q.x+=Math.sin(rise*Math.PI*6+f.phase)*14*envelope;
      q.y+=Math.cos(rise*Math.PI*4+f.phase)*9*envelope;
    }
  }
  const fallAngle=f.rotation+f.fallDuration*.7*smooth(age/f.fallDuration);
  return{x:q.x,y:q.y,angle:mix(fallAngle,-.14+Math.sin(time*1.6+f.phase)*.12,morph),
    morph,scale:1+.7*smooth(flight/.65),opacity:1,flight};
}
// 根据每只蝴蝶进入未来月面的位置求抵达区间，不用独立计时器播放月相。
const moonArrivals=new Map(fallingFlowers.map(f=>{
  const end=f.morphAt+MORPH_TIME+f.carryDuration+f.flightDuration;
  let lo=end-f.flightDuration,hi=end;
  for(let i=0;i<36;i++){
    const mid=(lo+hi)/2,q=toScreen(flowerMotion(f,mid));
    if(Math.hypot(q.x-moon.x,q.y-moon.y)>moon.r)lo=mid;else hi=mid;
  }
  return [f.sourceIndex,{start:hi,end}];
}));
function moonContribution(f,t){
  const arrival=moonArrivals.get(f.sourceIndex);
  return smooth((t-arrival.start)/(arrival.end-arrival.start));
}
function flowerPose(f,t){
  const pose=flowerMotion(f,t);
  return {...pose,opacity:pose.opacity*(1-moonContribution(f,t))};
}
function moonProgress(t){
  return fallingFlowers.reduce((sum,f)=>sum+moonContribution(f,t),0)/fallingFlowers.length;
}
// 圆盘右侧受光，明暗交界由一条椭圆弧向左推进：月牙、半月、盈月、满月。
function moonOutline(progress){
  const points=[],p=clamp(progress),steps=80;
  for(let i=0;i<=steps;i++){
    const angle=-Math.PI/2+i/steps*Math.PI;
    points.push({x:moon.r*Math.cos(angle),y:moon.r*Math.sin(angle)});
  }
  for(let i=steps;i>=0;i--){
    const angle=-Math.PI/2+i/steps*Math.PI;
    points.push({x:(1-2*p)*moon.r*Math.cos(angle),y:moon.r*Math.sin(angle)});
  }
  return points;
}
function phaseAt(t){
  const phase=moonProgress(t);
  if(phase>=1)return '满月 · 月下归静';
  if(phase>0)return phase<.5?'蝶入月光 · 月牙渐盈':'蝶入月光 · 渐成满月';
  return t===0?'夜色':t<LEAF_START?'桂树生长':t<LEAF_END?'桂叶舒展':t<BLOOM_END?'桂花开放':t<Math.min(...fallingFlowers.map(f=>f.release))?'满树桂花':t<WIND.start?'桂花飘落':t<WIND.end?'风过 · 花落成蝶':t<22?'群蝶赴月':'月下归静';
}

new p5(p=>{
  let background,treeCache,ready=false,time=0,last=null,state='ready';
  let canopy=[];
  const density=Math.min(3,Math.max(2,window.devicePixelRatio||1));
  function drawBranch(ctx,b,amount){
    if(amount<=0)return;
    const left=[],right=[],count=30;
    for(let i=0;i<=count;i++){
      const t=amount*i/count,q=curve(b,t),normal=direction(b,t)+Math.PI/2;
      const taper=amount<.999?smooth((amount-t)/Math.max(.035,amount*.13)):1;
      let settled=mix(Math.max(.12,b.width*.5),Math.max(.12,b.endWidth*.5),smooth(t));
      if(b.guided&&b.parent>=0&&b.y>540){
        const collar=Math.min(.46,20/b.length),parentRadius=Math.max(.12,branches[b.parent].endWidth*.5);
        settled+=Math.max(0,parentRadius-Math.max(.12,b.width*.5))*(1-smooth(t/collar));
      }
      const radius=Math.max(.05,settled*taper);
      left.push({x:q.x+Math.cos(normal)*radius,y:q.y+Math.sin(normal)*radius});
      right.push({x:q.x-Math.cos(normal)*radius,y:q.y-Math.sin(normal)*radius});
    }
    const trace=list=>{
      for(let i=1;i<list.length-1;i++)ctx.quadraticCurveTo(list[i].x,list[i].y,
        (list[i].x+list[i+1].x)/2,(list[i].y+list[i+1].y)/2);
      const end=list[list.length-1];ctx.lineTo(end.x,end.y);
    };
    ctx.fillStyle='#ffffff';ctx.beginPath();ctx.moveTo(left[0].x,left[0].y);trace(left);
    const tip=curve(b,amount);ctx.quadraticCurveTo(tip.x,tip.y,right[count].x,right[count].y);
    trace(right.reverse());ctx.closePath();ctx.fill();
    const parent=b.parent>=0?branches[b.parent]:null;
    const radius=(parent?parent.r1:b.r0)*smooth(amount/.15);
    ctx.beginPath();ctx.arc(b.x,b.y,Math.max(.02,radius),0,Math.PI*2);ctx.fill();
  }
  function buildBackground(){
    const ctx=background.drawingContext;
    const sky=ctx.createLinearGradient(0,0,0,H);
    sky.addColorStop(0,'#0c172b');sky.addColorStop(.62,'#15283e');sky.addColorStop(1,'#101e31');
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    const ground=ctx.createRadialGradient(225,770,2,225,770,70);
    ground.addColorStop(0,'rgba(128,159,169,.1)');ground.addColorStop(1,'rgba(128,159,169,0)');
    ctx.save();ctx.translate(0,646.8);ctx.scale(1,.16);ctx.fillStyle=ground;ctx.fillRect(145,690,160,160);ctx.restore();
  }
  function drawMoon(t){
    const progress=moonProgress(t);if(progress<=0)return;
    const ctx=p.drawingContext;ctx.save();
    const halo=ctx.createRadialGradient(moon.x,moon.y,moon.r*.8,moon.x,moon.y,moon.r*3.4);
    halo.addColorStop(0,`rgba(242,231,197,${.16*Math.sqrt(progress)})`);
    halo.addColorStop(.4,`rgba(217,223,221,${.045*progress})`);
    halo.addColorStop(1,'rgba(217,223,221,0)');
    ctx.fillStyle=halo;ctx.fillRect(moon.x-100,moon.y-100,200,200);
    ctx.translate(moon.x,moon.y);const points=moonOutline(progress);
    const light=ctx.createLinearGradient(-moon.r,-moon.r,moon.r,moon.r);
    light.addColorStop(0,'#efdcaa');light.addColorStop(.55,'#fff9df');light.addColorStop(1,'#fffcef');
    ctx.fillStyle=light;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
    ctx.closePath();ctx.fill();ctx.restore();
  }
  const wingColors=['#ead6a1','#d6e5de','#e8e1c8','#b9d9dc'];
  function leafShape(ctx,leaf){
    const n=leaf.size,w=leaf.breadth,bend=leaf.bend*n;
    ctx.beginPath();ctx.moveTo(0,0);
    ctx.bezierCurveTo(n*.20,-n*w,n*.73,-n*w+bend,n,bend);
    ctx.bezierCurveTo(n*.71,n*w+bend,n*.22,n*w*.85,0,0);ctx.fill();
  }
  function drawButterfly(ctx,leaf,t,morph){
    const n=leaf.wingSize*.64,flap=.22+.78*(.5+.5*Math.sin(t*11+leaf.phase));
    ctx.save();ctx.scale(mix(.12,flap,morph),1);
    for(const side of [-1,1]){
      ctx.save();ctx.scale(side,1);ctx.fillStyle=wingColors[leaf.color];
      ctx.beginPath();ctx.moveTo(0,0);
      ctx.bezierCurveTo(n*.15,-n*.65,n*.98,-n*.86,n,-n*.28);
      ctx.bezierCurveTo(n*1.04,n*.12,n*.43,n*.18,0,n*.08);ctx.fill();
      ctx.globalAlpha*=.8;ctx.beginPath();ctx.moveTo(0,n*.06);
      ctx.bezierCurveTo(n*.65,n*.05,n*.86,n*.57,n*.46,n*.64);
      ctx.bezierCurveTo(n*.17,n*.67,n*.06,n*.34,0,n*.06);ctx.fill();ctx.restore();
    }
    ctx.restore();ctx.strokeStyle='#e2d7b5';ctx.lineWidth=.7;
    ctx.beginPath();ctx.moveTo(0,-n*.21);ctx.quadraticCurveTo(-.7,n*.12,0,n*.43);ctx.stroke();
  }
  function drawLeaf(leaf,t,surface=p){
    const amount=smooth(leafProgress(leaf,t));if(amount<=0)return;
    const ctx=surface.drawingContext;ctx.save();ctx.translate(leaf.x,leaf.y);ctx.rotate(leaf.angle);
    ctx.scale(amount,amount*leaf.foreshorten);
    ctx.fillStyle=leafColor(leaf);
    leafShape(ctx,leaf);ctx.restore();
  }
  function flowerShape(ctx,f,progress){
    if(progress<=0)return;
    const appear=smooth(progress/.14),open=smooth((progress-.22)/.78);
    ctx.save();const scale=f.size*1.2/64*appear;ctx.scale(scale,scale);
    ctx.rotate(f.variant*.29);ctx.scale(1,[1,.82,.64,.91][f.variant]);
    ctx.fillStyle=['#ffd23f','#ffe477','#efb923'][f.palette];
    if(open<.3){ctx.save();ctx.globalAlpha*=1-open/.3;ctx.beginPath();ctx.ellipse(0,0,5,6.5,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    for(let i=0;i<4;i++){
      const unfurl=smooth((progress-.22-i*.018)/(.78-i*.018));
      if(unfurl<=0)continue;
      const n=mix(6,23,unfurl),w=mix(1,8,unfurl);ctx.save();ctx.rotate(i*Math.PI/2);
      ctx.beginPath();ctx.moveTo(1,-2);ctx.bezierCurveTo(n*.48,-w,n*.96,-w,n,0);
      ctx.bezierCurveTo(n*.96,w,n*.48,w,1,2);ctx.closePath();ctx.fill();ctx.restore();
    }
    ctx.fillStyle='#bb771b';ctx.beginPath();ctx.ellipse(0,0,2.6,2.4,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function drawFlower(ctx,f,t){
    ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.rotation);
    flowerShape(ctx,f,flowerProgress(f,t));ctx.restore();
  }
  function drawFlyingFlower(f,t){
    const pose=flowerPose(f,t);if(pose.opacity<=0)return;
    const ctx=p.drawingContext;ctx.save();ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);ctx.scale(pose.scale,pose.scale);
    if(pose.morph<1){ctx.save();ctx.globalAlpha=pose.opacity*(1-pose.morph);flowerShape(ctx,f,f.maxOpen);ctx.restore();}
    if(pose.morph>0){ctx.globalAlpha=pose.opacity*pose.morph;drawButterfly(ctx,f,t,pose.morph);}
    ctx.restore();
  }
  function buildCanopy(){
    canopy=Array.from({length:5},(_,layer)=>{
      const band={layer,leaves:visibleLeaves.filter(l=>l.layer===layer).sort((a,b)=>a.z-b.z),flowers:flowers.filter(f=>f.layer===layer).sort((a,b)=>a.z-b.z)};
      const shapes=[...band.leaves,...band.flowers];
      band.x=Math.floor(Math.min(...shapes.map(l=>l.x-l.size-3)));
      band.y=Math.floor(Math.min(...shapes.map(l=>l.y-l.size-3)));
      const width=Math.ceil(Math.max(...shapes.map(l=>l.x+l.size+3))-band.x);
      const height=Math.ceil(Math.max(...shapes.map(l=>l.y+l.size+3))-band.y);
      band.cache=p.createGraphics(width,height);band.cache.pixelDensity(density);
      band.flowerCache=p.createGraphics(width,height);band.flowerCache.pixelDensity(density);
      const ctx=band.cache.drawingContext;ctx.save();ctx.translate(-band.x,-band.y);
      for(const leaf of band.leaves)drawLeaf(leaf,LEAF_END,band.cache);ctx.restore();
      const fctx=band.flowerCache.drawingContext;fctx.save();fctx.translate(-band.x,-band.y);
      for(const f of band.flowers)drawFlower(fctx,f,BLOOM_END);fctx.restore();return band;
    });
  }
  function drawWind(t){
    const guide=windGuide(t);if(guide.alpha<=0)return;
    const ctx=p.drawingContext;ctx.save();ctx.strokeStyle='#c8cfe2';ctx.lineWidth=.95;
    ctx.lineCap='round';ctx.globalAlpha=guide.alpha;ctx.beginPath();
    ctx.moveTo(guide.x,guide.y);ctx.bezierCurveTo(guide.cx,guide.cy,guide.dx,guide.dy,guide.ex,guide.ey);
    ctx.stroke();ctx.restore();
  }
  function render(t){
    p.image(background,0,0);drawMoon(t);
    const ctx=p.drawingContext;ctx.save();ctx.translate(PLACEMENT.x,PLACEMENT.y);
    ctx.scale(PLACEMENT.scale,PLACEMENT.scale);ctx.translate(-PLACEMENT.rootX,-PLACEMENT.rootY);
    ctx.save();ctx.translate(PLACEMENT.rootX,PLACEMENT.rootY);ctx.rotate(treeShake(t));ctx.translate(-PLACEMENT.rootX,-PLACEMENT.rootY);
    if(t>=TREE_END)p.image(treeCache,0,0);
    else for(const branch of branches)drawBranch(ctx,branch,branchProgress(branch,t));
    for(const band of canopy){
      if(t>=LEAF_END)p.image(band.cache,band.x,band.y);
      else for(const leaf of band.leaves)drawLeaf(leaf,t);
      if(t>=BLOOM_END)p.image(band.flowerCache,band.x,band.y);
      else for(const f of band.flowers)drawFlower(ctx,f,t);
    }
    ctx.restore(); // 落花离枝后使用自身轨迹，不再跟随树的余震。
    for(const f of fallingFlowers)if(t>=f.release)drawFlyingFlower(f,t);
    ctx.restore();drawWind(t);
  }
  function update(){
    slider.value=String(Math.round(time*100));
    readout.textContent=`${time.toFixed(2)} / ${DURATION.toFixed(2)} 秒 · ${phaseAt(time)}`;
    slider.setAttribute('aria-valuetext',`${time.toFixed(2)} 秒，${phaseAt(time)}`);
    button.textContent=state==='playing'?'暂停片刻':time>=DURATION?'再赴一场月光':time>0?'继续这场远行':'让夜色生长';
  }
  function wake(){last=null;if(ready&&!document.hidden)p.loop();}
  p.setup=()=>{
    try{
      p.pixelDensity(density);p.createCanvas(W,H).parent('landscape');p.frameRate(30);
      background=p.createGraphics(W,H);background.pixelDensity(density);
      treeCache=p.createGraphics(W,H);treeCache.pixelDensity(density);
      buildBackground();for(const b of branches)drawBranch(treeCache.drawingContext,b,1);buildCanopy();
      ready=true;button.disabled=false;slider.disabled=false;update();
      status.textContent='夜色已准备好。点击按钮，桂树生长，花落成蝶，蝶入月光，渐成满月。';
      if(document.hidden)p.noLoop();
    }catch(error){button.textContent='画面未能加载';status.textContent='请刷新页面重试。';console.error(error);p.noLoop();}
  };
  p.draw=()=>{
    if(!ready)return;
    const now=performance.now(),dt=last===null?0:Math.max(0,(now-last)/1000);last=now;
    if(state==='playing'){
      time=Math.min(DURATION,time+dt);
      if(time===DURATION){state='finished';status.textContent='蝶群已化为满月，夜色归静。可以重新播放。';}
      update();
    }
    render(time);if(state!=='playing')p.noLoop();
  };
  button.addEventListener('click',()=>{
    if(!ready)return;
    if(reduced.matches){time=time>=DURATION?0:DURATION;state=time?'finished':'ready';status.textContent='已按减少动态效果设置切换静态画面。';}
    else if(state==='playing'){state='paused';status.textContent='已暂停。';}
    else{if(time>=DURATION)time=0;state='playing';status.textContent='桂树生长，花落成蝶，蝶入月光，渐成满月。';}
    update();wake();
  });
  slider.addEventListener('input',()=>{if(!ready)return;time=clamp(Number(slider.value)/(DURATION*100))*DURATION;state='paused';update();wake();});
  document.addEventListener('visibilitychange',()=>{last=null;if(!ready)return;if(document.hidden)p.noLoop();else wake();});
  reduced.addEventListener('change',()=>{if(reduced.matches&&state==='playing')state='paused';update();wake();});
},document.querySelector('#landscape'));
})();
