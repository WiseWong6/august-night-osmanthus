'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
let now=0,instance,looping=true,reduced=false,draws=0,capture=null,flowTrace=null,textureWrites=0,flowerCacheClears=0,gradientCount=0;
const nodes={},events={},errors=[],sizes=[];
let soundPlaying=false,soundSettings,soundOffset,soundRate=1;
let glitterSurfaces=[],glitterJobs=[],glitterMasks=[],glitterTime,glitterDraws=0;
const glitterStub={available:true,render(time,jobs){
  glitterTime=time;glitterJobs=jobs;
  assert.equal(new Set(jobs.map(job=>job.slot)).size,jobs.length,'一个表面不能重复叠加');
  for(const job of jobs){assert(glitterSurfaces[job.slot]);for(const value of Object.values(job))assert(Number.isFinite(value));assert(job.gain>0&&job.gain<=1);}
},paint(ctx,slot){if(glitterJobs.some(job=>job.slot===slot))glitterDraws++;},
  highlights(slot){const surface=glitterSurfaces[slot];return glitterJobs.some(job=>job.slot===slot)?[{x:surface.focus?.[0]??0,y:surface.focus?.[1]??0,energy:.78,gold:surface.gold,seed:surface.seed}]:[];}};
const soundStub={enabled:true,play(time,rate=1){soundPlaying=true;soundOffset=time;soundRate=rate;},stop(){soundPlaying=false;},position(time){return time;},setEnabled(value){this.enabled=value;},finish(){soundPlaying=false;},tickStars(){}};
const document={hidden:false,querySelector(id){return nodes[id]??={value:'0',disabled:true,textContent:'',setAttribute(){},addEventListener(name,fn){this[name]=fn;}};},addEventListener(name,fn){events[name]=fn;}};
const media={get matches(){return reduced;},addEventListener(name,fn){this[name]=fn;}};
function context(){
  const stack=[];let matrix=[2,0,0,2,0,0];
  const multiply=m=>{const [a,b,c,d,e,f]=matrix;matrix=[a*m[0]+c*m[1],b*m[0]+d*m[1],a*m[2]+c*m[3],b*m[2]+d*m[3],a*m[4]+c*m[5]+e,b*m[4]+d*m[5]+f];};
  const raw={globalAlpha:1,save(){stack.push([this.globalAlpha,[...matrix]]);},restore(){assert(stack.length);[this.globalAlpha,matrix]=stack.pop();},
    getTransform(){const [a,b,c,d,e,f]=matrix;return {a,b,c,d,e,f};},
    createLinearGradient(){gradientCount++;return{addColorStop(at,color){assert(at>=0&&at<=1&&typeof color==='string');}};},
    createRadialGradient(){return this.createLinearGradient();},
    createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},
    putImageData(pixels){assert.equal(pixels.data.length,pixels.width*pixels.height*4);textureWrites++;}};
  return new Proxy(raw,{get(target,key){return target[key]??((...args)=>{if(capture)capture.push(key);if(flowTrace)flowTrace.push([key,...args]);
      if(key==='translate')multiply([1,0,0,1,...args]);
      if(key==='scale')multiply([args[0],0,0,args[1],0,0]);
      if(key==='rotate'){const c=Math.cos(args[0]),s=Math.sin(args[0]);multiply([c,s,-s,c,0,0]);}
      if(key==='transform')multiply(args);if(key==='setTransform')matrix=[...args];
      for(const n of args)if(typeof n==='number')assert(Number.isFinite(n),`${key} 必须使用有效坐标`);});},set(target,key,value){if(key==='globalAlpha')assert(value>=0&&value<=1);target[key]=value;return true;}});
}
const sandbox={NightGlitter:{create(surfaces){
  glitterSurfaces=surfaces;
  for(const surface of surfaces){
    assert(surface.bounds.every(Number.isFinite));assert(surface.bounds[2]>0&&surface.bounds[3]>0);
    flowTrace=[];surface.mask(context());glitterMasks.push(flowTrace);flowTrace=null;
  }
  return glitterStub;
}},NightTreeSound:{create(settings){soundSettings=settings;return soundStub;}},document,window:{devicePixelRatio:2},matchMedia:()=>media,performance:{now:()=>now},console:{error:e=>errors.push(e)},
  p5:function(callback){instance={drawingContext:context(),pixelDensity(n){assert(n>=2);},createCanvas(w,h){assert.equal(w/h,.75);return{parent(){}};},
    frameRate(){},createGraphics(w,h){sizes.push([w,h]);return{canvas:{},drawingContext:context(),clear(){flowerCacheClears++;},pixelDensity(n){assert(n>=2);}};},
    image(){draws++;},loop(){looping=true;},noLoop(){looping=false;}};callback(instance);}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'tree-data.js'),'utf8'),sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'moon-map.js'),'utf8'),sandbox);
const source=fs.readFileSync(path.join(root,'scene.js'),'utf8');
vm.runInContext(source.replace('new p5(p=>{','globalThis.model={GOLD_LEAVES_ONLY,SHOW_CANOPY_FLOWERS,CANOPY_FLOWER_SCALE,flowerClocks,createMoonRaster,paintMoonRaster,starLifetime,flightDepth,treeAttention,flowerAttached,curve,branchProgress,leafProgress,flowerProgress,flowerPose,fallingFlowers,toScreen,PLACEMENT,phaseAt,LEAF_START,LEAF_END,BLOOM_END,DURATION,TREE_END,MORPH_TIME,WIND,windState,leafColor,leafIsGold,visibleLeaves,moonArrivals,moonContribution,moonProgress,moonOutline,treeShake,attachedPoint,IMPACT,fallingAppearance,fallingSize,butterflySpread,butterflyWing,flowingLight,reflectionCycle,lunarPixel,GLINT,VIEW,GROUND_Y,GRAVITY,RESTITUTION,fallPhysics,groundOffset,extraFlowers,canopyFlowers,starTiming,moonTravelers,insideMoon,starStops,starAppearance,grainPixel,soundStages,surfaceLights,surfaceVector,surfaceLight,fallingSurfacePaths,canopyGlitter,leafGlitter,motionRibbon,movingLightGain};\nnew p5(p=>{').replace('  function render(t,skyTime=t){','  globalThis.drawFlowerForTest=drawFlower;globalThis.flowerBandsForTest=()=>canopy;globalThis.growthCacheForTest=()=>({settledCount,treeCacheTime});globalThis.flowerStepsForTest=FLOWER_STEPS;globalThis.drawOpticalForTest=drawOpticalGlints;globalThis.drawLeafGlitterForTest=drawGlitterLeaf;globalThis.drawSymbolForTest=drawFallingSymbol;globalThis.drawSurfaceForTest=drawSurfaceLight;globalThis.drawGlitterForTest=drawGlitterFlower;globalThis.prepareGlitterForTest=prepareGlitter;\n  function render(t,skyTime=t){globalThis.skyTimeForTest=skyTime;'),sandbox);
const {branches,leaves,flowers,moon}=sandbox.NightTreeData,m=sandbox.model;
assert.equal(branches.length,2017);assert.equal(leaves.length,4042);assert.equal(flowers.length,4202);
const original={
  branches:branches.map(b=>[b.x,b.y,b.cx,b.cy,b.dx,b.dy,b.ex,b.ey,b.width,b.endWidth,b.parent,b.start,b.duration]),
  leaves:leaves.map(l=>[l.x,l.y,l.branch,l.at,l.angle,l.length,l.breadth,l.bend,l.foreshorten,l.layer,l.start,l.duration]),
  flowers:flowers.map(f=>[f.x,f.y,f.branch,f.at,f.size,f.start,f.duration,f.budAt,f.maxOpen,f.layer])
};
assert.equal(crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'),
  '2402240c9cdcce5c0e877c28cc6a5b693ac5ba4db693a38f51c99466881a2f3f','完整原桂花的枝叶、花位、粗细和时序不能改变');
assert.equal(m.VIEW.width/m.VIEW.height,.75);
assert.equal(m.VIEW.scale*m.VIEW.width,720);
assert.equal(m.VIEW.scale*m.VIEW.height,960);
assert.equal(m.extraFlowers.length,1470,'撤回上一版新增的850朵金花');
assert.equal(m.canopyFlowers.length,5672);
const collision=new Map(),cell=(x,y)=>`${Math.floor(x/3)}:${Math.floor(y/3)}`;
const indexFlower=f=>{const k=cell(f.x,f.y);if(!collision.has(k))collision.set(k,[]);collision.get(k).push(f);};
flowers.forEach(indexFlower);
for(const f of m.extraFlowers){
  const leaf=leaves.find(l=>l.sourceIndex===f.sourceLeaf);
  assert(leaf&&m.visibleLeaves.includes(leaf));
  assert.equal(f.anchor.x,leaf.x);assert.equal(f.anchor.y,leaf.y);
  assert.equal(f.branch,leaf.branch);assert.equal(f.node,leaf.node);
  assert(Math.hypot(f.x-leaf.x,f.y-leaf.y)<=13.00001);
  assert.equal(m.flowerProgress(f,m.flowerClocks.get(f).budAt),0);
  assert(Math.abs(m.flowerProgress(f,m.BLOOM_END)-f.maxOpen)<1e-10);
  const cx=Math.floor(f.x/3),cy=Math.floor(f.y/3);
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)
    for(const other of collision.get(`${cx+dx}:${cy+dy}`)||[])
      assert(Math.hypot(f.x-other.x,f.y-other.y)>=2.5,'新增花朵之间及与旧花之间留有间隔');
  indexFlower(f);
}
for(let layer=0;layer<5;layer++)assert(m.extraFlowers.some(f=>f.layer===layer),'各个前后层均补花');
// 取景变化后，月亮、树根与所有飞行中心仍在主画面内。
assert(moon.x+moon.r<m.VIEW.width&&moon.y-moon.r>0);
assert(m.PLACEMENT.y<m.VIEW.height*.92&&m.PLACEMENT.y>m.VIEW.height*.85);
for(const f of m.fallingFlowers)for(let t=f.release;t<=24;t+=.1){
  const q=m.toScreen(m.flowerPose(f,t));
  assert(q.x>0&&q.x<m.VIEW.width&&q.y>0&&q.y<m.VIEW.height);
}
assert.equal(m.PLACEMENT.scale,.6);
assert.equal(m.WIND.start,m.BLOOM_END,'花开完即起风，没有额外等待');
assert(m.canopyFlowers.some(f=>m.flowerProgress(f,m.LEAF_END-.4)>.22),'整树未长完时已有局部开花');
for(const f of m.canopyFlowers){const c=m.flowerClocks.get(f);assert(m.visibleLeaves.includes(c.leaf));
  const axil=m.visibleLeaves.find(l=>l.node===f.node&&l.side===f.side);
  if(axil)assert.equal(c.leaf,axil,'真实可见叶腋优先');
  else{
    const sameBranch=m.visibleLeaves.filter(l=>l.branch===f.branch);
    const candidates=sameBranch.length?sameBranch:m.visibleLeaves.filter(l=>l.volume===f.volume),anchor=f.anchor||f;
    const nearest=Math.min(...candidates.map(l=>Math.hypot(l.x-anchor.x,l.y-anchor.y)));
    assert(Math.abs(Math.hypot(c.leaf.x-anchor.x,c.leaf.y-anchor.y)-nearest)<1e-9,'疏除叶腋依次回退同枝、同枝组最近叶片');
  }
assert(c.budAt>=c.branchAt);assert(c.delay>=.04&&c.delay<=.12);const u=m.leafProgress(c.leaf,c.budAt);assert(u*u*(3-2*u)>=.95);assert(Math.abs(c.end-c.start-f.duration)<1e-12);}
assert(m.canopyFlowers.some(f=>m.flowerProgress(f,m.LEAF_END+.3)>.22),'叶片完成后紧接着展开花瓣');
assert(m.IMPACT.start-m.BLOOM_END<.2,'起风后立即带动树梢和落花');
assert(m.GLINT.radius>=20&&m.GLINT.core<=1&&m.GLINT.width<1,'白色亮核小而尖，光芒细长');
assert(m.GLINT.fadeAt+m.GLINT.fade<.3&&m.GLINT.fadeAt-m.GLINT.attack>=.04,'强峰短促，保留至少一帧峰值并渐退');
assert.equal(m.windState(m.WIND.start,200).strength,0);
assert.equal(m.windState(m.WIND.end,200).strength,0);
assert(m.windState(m.WIND.start+1.5,200,520).strength>m.windState(m.WIND.start+1.5,200,750).strength,'风由上往下经过');
assert(m.windState(11,100).centerX<m.windState(10,100).centerX,'风随下落向左偏移');
assert(m.visibleLeaves.length>2800&&m.visibleLeaves.length<2860,'显示叶片减少约三成');
for(let layer=0;layer<5;layer++){
  const ratio=m.visibleLeaves.filter(l=>l.layer===layer).length/leaves.filter(l=>l.layer===layer).length;
  assert(ratio>.68&&ratio<.72,'各层均匀疏叶');
}
for(const leaf of m.visibleLeaves){
  const rgb=m.leafColor(leaf).match(/\d+/g).map(Number);
  assert(rgb[0]>=rgb[1]&&rgb[1]>=rgb[2],'叶片统一暖色，不混蓝灰');
  assert(rgb[0]>=190&&rgb[1]>=160,'后层保持清晰亮度');
  if(m.leafIsGold(leaf))assert(rgb[0]-rgb[2]>=180&&rgb[2]<=64,'金叶保持饱和金黄色，不退成米白');
}
const goldLeafCount=m.visibleLeaves.filter(m.leafIsGold).length;
assert(goldLeafCount>m.visibleLeaves.length*.65&&goldLeafCount<m.visibleLeaves.length*.95,'多数枝组转为金色，少量保留银白');


assert.deepEqual(JSON.parse(JSON.stringify(m.toScreen({x:360,y:745}))),{x:225,y:770});
assert.equal(branches.filter(b=>b.parent<0).length,1);
for(const b of branches){
  assert.equal(m.branchProgress(b,0),0);assert(b.start+b.duration<=2.70001);
  if(b.parent>=0){const parent=branches[b.parent];assert.equal(b.x,parent.ex);assert.equal(b.y,parent.ey);assert(b.start>=parent.start+parent.duration-.00002);}
  for(let t=0;t<=1;t+=.1){const q=m.toScreen(m.curve(b,t));assert(q.x>0&&q.x<450&&q.y>290&&q.y<=771,'完整树应置于左下方');}
}
assert(branches.some(b=>m.branchProgress(b,m.LEAF_START)<1),'叶片应在枝条仍生长时开始出现');
for(const t of [1.2,1.6,2]){
  assert(m.visibleLeaves.some(leaf=>m.leafProgress(leaf,t)>0),'树生长途中已有叶片展开');
  assert(branches.some(b=>m.branchProgress(b,t)<1),'长叶时树枝仍在延伸');
}
for(const leaf of leaves){
  const branch=branches[leaf.branch],arrival=branch.start+branch.duration*leaf.at;
  assert.equal(m.leafProgress(leaf,arrival-1e-6),0,'枝条到达叶柄之前不出现叶片');
  assert(Math.abs(m.leafProgress(leaf,arrival+leaf.duration/2)-.5)<1e-10,'叶片紧随枝条展开');
  const anchor=m.curve(branches[leaf.branch],leaf.at);
  assert(Math.hypot(anchor.x-leaf.x,anchor.y-leaf.y)<.00003);
  assert.equal(m.leafProgress(leaf,m.LEAF_START),0);assert.equal(m.leafProgress(leaf,m.LEAF_END),1);
  assert.equal(m.leafProgress(leaf,21),1,'赴月后叶子仍留在树上');
}
for(const f of flowers){
  assert.equal(m.flowerProgress(f,m.flowerClocks.get(f).budAt),0,'局部叶子长成后再开花');
  assert(Math.abs(m.flowerProgress(f,m.BLOOM_END)-f.maxOpen)<1e-12);
  assert.equal(m.flowerProgress(f,21),m.flowerProgress(f,8),'离枝不改变花朵本身的生长数据');
}
assert.equal(m.canopyFlowers.filter(f=>m.flowerAttached(f,24)).length,5560,'112 个来源花位离枝后不再留在树上');
for(const f of m.fallingFlowers){const original=flowers[f.sourceIndex];assert(m.flowerAttached(original,f.release-.001));assert(!m.flowerAttached(original,f.release));assert(m.flowerAttached(original,0),'回拖恢复来源花位');}
assert.equal(m.fallingFlowers.length,112);assert.equal(new Set(m.fallingFlowers.map(f=>f.sourceIndex)).size,112);
for(const f of m.fallingFlowers){
  const original=flowers[f.sourceIndex],anchor=f.kind==='leaf'?leaves.find(l=>l.sourceIndex===f.sourceLeaf):original;
  const index=m.fallingFlowers.indexOf(f);
  assert.equal(f.carryDuration,.6+(index%9)*.095,'下落和回弹调整不能缩短原起飞时长');
  assert.equal(f.flightDuration,4.5+(index%11)*.16,'保持原赴月飞行时长');
  assert(anchor);assert.equal(f.x,anchor.x);assert.equal(f.y,anchor.y);assert.equal(f.size,original.size);
  assert(f.release>=m.IMPACT.start&&f.release<=m.IMPACT.start+3.30001);
  assert(f.windAt-f.release<=.21,'离枝约 0.2 秒即开始受风，不等落到指定区域');
  assert(f.windAt<f.morphAt-.5,'风必须在化蝶前介入');
  assert(f.fallDuration<1.9);
  assert.equal(m.flowerPose(f,f.release-.01).opacity,0);
  const drifting=m.flowerPose(f,f.windAt+.25);
  assert(drifting.x<f.origin.x&&drifting.y>f.origin.y&&drifting.morph===0,'未到化蝶位置的桂花已向左下偏移');
  const release=m.flowerPose(f,f.release);assert.equal(release.x,m.attachedPoint(f,f.release).x);assert.equal(release.y,m.attachedPoint(f,f.release).y);assert.equal(release.morph,0);
  assert.equal(f.contactAt,f.release+f.fallDuration);
  assert.equal(f.bounceAt,f.contactAt,'碰撞后立即反弹，不统一停顿');
  assert.equal(f.morphAt,f.bounceAt+f.bounceDuration);
  const landing=m.toScreen(m.flowerPose(f,f.contactAt));
  assert(Math.abs(landing.y+f.groundRadius*m.PLACEMENT.scale-m.GROUND_Y)<1e-10,'各个轮廓的底边必须触及树根高度的地面');
  assert(landing.x>=21.999&&landing.x<=450);
  assert.equal(m.flowerPose(f,f.bounceAt).morph,0,'落地接触结束之前保持掉落物形态');
  const rebound=m.flowerPose(f,f.bounceAt+f.bounceDuration*.5);
  assert(rebound.x>f.end.x&&rebound.y<f.end.y-f.bounceHeight*.5&&rebound.morph===0,'先向右上反弹离地，再展开蝴蝶');
  assert.equal(m.flowerPose(f,f.morphAt-.0001).morph,0);
  const launchTime=f.morphAt+m.MORPH_TIME;
  const launch=m.flowerPose(f,launchTime);assert.equal(launch.morph,1);assert(launch.flight<1e-12);
  assert(m.toScreen(launch).y<m.GROUND_Y-25,'舒展蝶翼时已离开地面');
  assert(launch.x>f.end.x&&launch.y<f.end.y,'化蝶时承接反弹向右上离地');
  const carried=m.flowerPose(f,launchTime+.1);
  assert(carried.x>launch.x&&carried.y<launch.y,'刚起飞的蝴蝶延续反弹向右上飞');
  for(let age=0;age<f.fallDuration;age+=.05)assert.equal(m.flowerPose(f,f.release+age).morph,0);
  let previous=1;
  for(let t=launchTime;t<24;t+=.05){const pose=m.flowerPose(f,t);assert(pose.scale>=previous-1e-12&&pose.scale<=1.45);previous=pose.scale;}
  if(f.destination==='moon')assert.equal(m.flowerPose(f,24).scale,1.45,'赴月蝴蝶飞行中逐渐长大');
  for(const edge of [f.release,f.contactAt,f.bounceAt,f.morphAt,f.morphAt+m.MORPH_TIME,f.morphAt+m.MORPH_TIME+f.carryDuration]){
    const a=m.flowerPose(f,edge-.000001),b=m.flowerPose(f,edge+.000001);
    assert(Math.hypot(a.x-b.x,a.y-b.y)<.001,'落花、化蝶、起飞不得跳位置');
    assert(Math.abs(a.morph-b.morph)<.00001&&Math.abs(a.angle-b.angle)<.0001);
  }
  const eps=.00001;
  assert(m.flowerPose(f,f.contactAt-.01).y<f.end.y,'触地前仍向地面下降');
  assert(m.flowerPose(f,f.contactAt+.01).y<f.end.y,'触地后立即离地，不悬停或穿地');
  for(const edge of [f.morphAt,f.morphAt+m.MORPH_TIME,f.morphAt+m.MORPH_TIME+f.carryDuration]){
    const before=m.flowerPose(f,edge-eps),at=m.flowerPose(f,edge),after=m.flowerPose(f,edge+eps);
    for(const key of ['x','y'])assert(Math.abs((at[key]-before[key])/eps-(after[key]-at[key])/eps)<.03,'反弹、化蝶与飞行平滑接续');
  }
  for(let t=0;t<=24;t+=.1){
    const pose=m.flowerPose(f,t);for(const n of Object.values(pose))assert(Number.isFinite(n));
    const q=m.toScreen(pose);assert(q.x>0&&q.x<720&&q.y>0&&q.y<840,'落花和蝴蝶应在画幅内，不遮住控件');
  }
  const end=m.flowerPose(f,24),q=m.toScreen(end);
  if(f.destination==='moon'){
    assert.equal(end.opacity,0);assert.equal(end.flight,1);assert.equal(end.star,0);
    assert(Math.hypot(q.x-moon.x,q.y-moon.y)<moon.r,'赴月蝴蝶需抵达月面');
  }else{
    assert.equal(end.opacity,1);assert.equal(end.star,1);
    assert(Math.hypot(q.x-moon.x,q.y-moon.y)>moon.r+30,'途中星星不应被算入月面');
  }
}
// 从实际画面轨迹测量速度和加速度，避免只验证预先写入的物理参数。
const measuredBounces=[];
for(const f of m.fallingFlowers){
  const y=t=>m.toScreen(m.flowerPose(f,t)).y,eps=1e-5;
  const height=y(f.contactAt)-y(f.release);
  const incoming=(y(f.contactAt)-y(f.contactAt-eps))/eps;
  const outgoing=(y(f.contactAt)-y(f.contactAt+eps))/eps;
  const rebound=y(f.contactAt)-y(f.morphAt);
  assert(Math.abs(incoming-Math.sqrt(2*m.GRAVITY*height))<.005,'更高的落差必须产生更高的触地速度');
  assert(Math.abs(outgoing/incoming-m.RESTITUTION)<1e-5,'碰撞损失由相同弹性决定，不按下标轮换');
  assert(Math.abs(rebound/height-m.RESTITUTION**2)<1e-10,'回弹高度与落差成比例，碰撞后不能凭空增能');
  assert(Math.abs(height-f.dropHeight)<1e-10);
  for(const [start,duration] of [[f.release,f.fallDuration],[f.bounceAt,f.bounceDuration]]){
    const middle=start+duration*.5,dt=duration*.2;
    const acceleration=(y(middle+dt)-2*y(middle)+y(middle-dt))/(dt*dt);
    assert(Math.abs(acceleration-m.GRAVITY)<1e-7,'下落和回弹使用同一向下重力');
  }
  assert(Math.abs(m.groundOffset(f,m.flowerPose(f,f.contactAt).angle)-f.groundRadius)<1e-10,'按实际触地角度测量轮廓');
  const saved=JSON.stringify(m.flowerPose(f,f.contactAt-.12));
  m.flowerPose(f,24);m.flowerPose(f,0);
  assert.equal(JSON.stringify(m.flowerPose(f,f.contactAt-.12)),saved,'回拖后下落速度和位置可复现');
  measuredBounces.push({height,incoming,rebound,duration:f.bounceDuration});
}
measuredBounces.sort((a,b)=>a.height-b.height);
for(let i=1;i<measuredBounces.length;i++){
  const low=measuredBounces[i-1],high=measuredBounces[i];
  assert(high.incoming>low.incoming&&high.rebound>low.rebound&&high.duration>low.duration,'高处落下的物体更快撞地、弹得更高，上升时间更长');
}
assert(measuredBounces.at(-1).rebound/measuredBounces[0].rebound>2,'树冠不同高度应产生明显的回弹差异');
// 对同一个物体单独改变释放高度，排除形状、大小或序号造成的假差异。
const specimen=m.fallingFlowers[0],low=m.fallPhysics(specimen,{x:specimen.origin.x,y:645});
const high=m.fallPhysics(specimen,{x:specimen.origin.x,y:145});
assert(high.fallDuration>low.fallDuration&&high.impactSpeed>low.impactSpeed&&high.bounceHeight>low.bounceHeight);
assert(Math.abs(high.bounceHeight/low.bounceHeight-high.dropHeight/low.dropHeight)<1e-10);
console.log('通过：同一重力下加速下落、按真实落差计算触地速度、弹性碰撞与回弹高度、接触即回弹，以及回拖复现。');
// 离枝尺寸平滑变化，亮核快亮慢退；随机相位不能随播放改变。
let maxGlints=0;
for(const f of m.fallingFlowers){
  assert.equal(m.fallingAppearance(f,f.release).size,1);
  assert.equal(m.fallingAppearance(f,f.release+.31).size,m.fallingSize(f));
  const span=f.size*.55*(f.kind==='leaf'?2.35:2)*m.fallingAppearance(f,f.morphAt).size;
  const wings=f.wingSize*.64*2*m.butterflySpread(f,f.morphAt+m.MORPH_TIME);
  assert(Math.abs(span/wings-1)<1e-10,'每种掉落物的外轮廓都与刚化成的蝶翼尺寸匹配');
  for(let t=f.morphAt;t<=f.morphAt+m.MORPH_TIME;t+=.02)assert.equal(m.butterflySpread(f,t),.84);
  const edge=f.morphAt+m.MORPH_TIME;
  assert(Math.abs(m.butterflySpread(f,edge-.00001)-m.butterflySpread(f,edge+.00001))<1e-6,'化蝶后振翅平滑衔接');
  for(const side of [-1,1]){
    assert.equal(m.butterflyWing(f,edge,side).width,.84,'展开蝶翼仍匹配掉落物尺寸');
    const before=m.butterflyWing(f,edge-1e-5,side),after=m.butterflyWing(f,edge+1e-5,side);
    for(const key of ['width','lift','sheen'])assert(Math.abs(before[key]-after[key])<1e-6,'翅面翻转与受光在化形结束时连续');
    const saved=JSON.stringify(m.butterflyWing(f,edge+1,side));m.butterflyWing(f,24,side);
    assert.equal(JSON.stringify(m.butterflyWing(f,edge+1,side)),saved,'翅面受光暂停与回拖一致');
  }
  let previous=m.fallingAppearance(f,f.release),peak=0;
  for(let age=.001;age<2.5;age+=.001){
    const next=m.fallingAppearance(f,f.release+age);
    assert(next.size>=Math.min(1,m.fallingSize(f))-1e-12&&next.size<=Math.max(1,m.fallingSize(f))+1e-12);
    assert(next.glint>=0&&next.glint<=1);
    assert(Math.abs(next.glint-previous.glint)<.05,'反光不应突然跳亮或熄灭');
    assert(Math.abs(next.size-previous.size)<.009,'离枝时花朵不能跳变大小');
    peak=Math.max(peak,next.glint);previous=next;
  }
  assert(f.sourceIndex%4===0?peak>.99:peak<=.12,'只有四分之一的对象出现强闪，其余保持弱反射');
  const snapshot=JSON.stringify(m.fallingAppearance(f,f.release+.45));
  m.fallingAppearance(f,24);m.fallingAppearance(f,0);
  assert.equal(JSON.stringify(m.fallingAppearance(f,f.release+.45)),snapshot);
}
for(let t=m.WIND.start;t<=24;t+=.01){
  const active=m.fallingFlowers.filter(f=>m.flowerPose(f,t).opacity>.1&&m.fallingAppearance(f,t).glint>.5).length;
  maxGlints=Math.max(maxGlints,active);
}
assert(maxGlints>0&&maxGlints<10,'强反光应错开，不能整群同时闪烁');
reduced=true;
for(const f of m.fallingFlowers)for(let t=9;t<15;t+=.1)assert.equal(m.fallingAppearance(f,t).glint,0);
reduced=false;
// 白色闪点发生在表面亮边掠过之后，两者来自同一次反射。
for(const f of m.fallingFlowers){
  let found=false;
  for(let age=0;age<2;age+=.005){
    const t=f.release+age,glint=m.fallingAppearance(f,t).glint;
    if(glint>.95){
      found=true;assert(m.flowingLight(f,t).alpha>.7);
      assert(m.flowingLight(f,t-.12).position<m.flowingLight(f,t).position);
    }
  }
  assert.equal(found,f.sourceIndex%4===0);
}
const tones=[];
for(let y=-.9;y<=.9;y+=.03)for(let x=-.9;x<=.9;x+=.03){
  const rgba=m.lunarPixel(x,y);
  assert(rgba.every(v=>Number.isInteger(v)&&v>=0&&v<=255));
  if(x*x+y*y<.8){assert(rgba[0]>=rgba[1]&&rgba[1]>=rgba[2],'月面是暖奶油金而非冷白');tones.push(rgba[1]);}
}
assert(Math.max(...tones)-Math.min(...tones)>30,'月海与高地有可辨明暗');
assert.equal(sandbox.NightMoonMap.values.length,128*128);
// 北向上：雨海在左上、澄海在右上、危海在右侧；南部高地较亮。
for(const [x,y] of [[-.35,-.43],[.26,-.34],[.75,-.23]])
  assert(m.lunarPixel(x,y)[1]<m.lunarPixel(.3,.5)[1]-15,'真实月海位置比南部高地暗');
assert(!source.includes('lunarNoise')&&!source.includes('lunarSeas'),'不再随机造月海或坑洞');
assert.equal(m.lunarPixel(1.1,0)[3],0,'月面缓存圆盘外透明');
const lunarSample=JSON.stringify(m.lunarPixel(-.33,.2));m.lunarPixel(.1,.7);
assert.equal(JSON.stringify(m.lunarPixel(-.33,.2)),lunarSample,'月面纹理固定，不随帧变化');
assert.equal(m.treeAttention(m.BLOOM_END),1,'盛放时保持树冠亮度');
for(const t of [4,10,18,24])assert.equal(m.treeAttention(t),1,'叶片原色不随落物和尾声变暗');
for(const f of m.fallingFlowers){
  const launch=f.morphAt+m.MORPH_TIME+f.carryDuration;
  assert.equal(m.flightDepth(f,launch).scale,1,'起飞阶段不缩小');
  let previous=1;
  for(let t=launch;t<launch+f.flightDuration;t+=.03){
    const d=m.flightDepth(f,t);assert(d.scale<=previous+1e-12&&d.scale>=.62&&d.alpha>=.8);previous=d.scale;
  }
  assert.equal(m.flightDepth(f,24).scale,f.destination==='moon'?.62:1,'只有赴月蝴蝶随远去缩小，停驻星星不变');
}
const turnTimes=m.fallingFlowers.map(f=>f.morphAt+m.MORPH_TIME+f.carryDuration);
assert(Math.max(...turnTimes)-Math.min(...turnTimes)>3,'蝶群转向时间必须错开');
let mixed=false;
for(let t=m.IMPACT.start+2;t<m.IMPACT.start+8;t+=.1){
  let up=0,down=0;
  for(const f of m.fallingFlowers){const a=m.flowerPose(f,t),b=m.flowerPose(f,t+.01);if(a.opacity<=0)continue;if(a.morph===1&&b.y<a.y-.001)up++;if(t<f.contactAt&&b.y>a.y+.001)down++;}
  if(up>8&&down>8)mixed=true;
}
assert(mixed,'部分物品还在下落，部分已反弹化蝶飞起，避免整群同时起飞');
assert.equal(Math.min(...m.fallingFlowers.map(f=>f.release)),m.IMPACT.start,'树开始震动的同时开始落花');
assert(m.fallingFlowers.filter(f=>f.release<m.IMPACT.start+m.IMPACT.duration).length>=20,'震动期间应有一批花离枝');
assert.equal(m.treeShake(0),0);assert.equal(m.treeShake(m.IMPACT.start-.01),0);
assert.equal(m.treeShake(m.IMPACT.start+m.IMPACT.duration),0);assert.equal(m.treeShake(20),0);
let largest=0;
for(let t=m.IMPACT.start;t<=m.IMPACT.start+m.IMPACT.duration;t+=.01){
  largest=Math.max(largest,Math.abs(m.treeShake(t)));
  const root=m.attachedPoint({x:360,y:745},t);assert.equal(root.x,360);assert.equal(root.y,745,'树根固定');
}
for(let t=m.IMPACT.start;t<=m.IMPACT.start+m.IMPACT.duration;t+=.005){
  for(const point of [{x:200,y:120},{x:500,y:120},{x:360,y:690}]){
    const q=m.attachedPoint(point,t);
    assert(q.x<=point.x&&q.y>=point.y,'左右枝叶都顺着风向左下偏动，不能反向乱晃');
  }
  const trunk=m.attachedPoint({x:360,y:690},t),tip=m.attachedPoint({x:360,y:120},t);
  assert(Math.hypot(trunk.x-360,trunk.y-690)<=Math.hypot(tip.x-360,tip.y-120)*.09+1e-10,'树干的偏动明显小于树梢');
}
assert(largest>.004&&largest<.014,'只有一次轻微、可见的短促震动');
const styles=new Set(m.fallingFlowers.map(f=>f.symbolStyle));
for(const name of ['five-solid','five-outline','four-solid','four-outline','cross','cross-diagonal','crescent-solid','crescent-outline','slim-solid','slim-outline','leaf-solid'])assert(styles.has(name));
for(const style of styles)for(const metal of ['gold','silver']){
  const f=m.fallingFlowers.find(f=>f.symbolStyle===style&&f.metal===metal);
  assert(f,'每种星形、月牙与树叶轮廓都应同时具有金银两种材质');
  capture=[];sandbox.drawSymbolForTest(context(),f,f.release+1.03);
  if(style.endsWith('outline')){
    assert(!capture.includes('fill'),'空心形态及其流光不能填充中间');
    assert(capture.filter(k=>k==='stroke').length>=2,'空心形态的流光沿轮廓绘制');
  }else{
    assert(capture.includes('fill')&&capture.includes('clip'),'实心物体保留填色，流光限制在实体内');
    assert(capture.filter(k=>k==='stroke').length>=2,'实心形态叠加沿轮廓或叶脉流动的短亮纹');
  }
  capture=null;
}
for(const f of m.fallingFlowers){
  let previous=m.flowingLight(f,f.release),peak=0;
  assert.equal(previous.alpha,0);
  for(let age=.01;age<7;age+=.01){
    const flow=m.flowingLight(f,f.release+age);
    assert(flow.position>=-1.7&&flow.position<=1.7);
    assert(flow.alpha>=0&&flow.alpha<=1);
    assert(Math.abs(flow.alpha-previous.alpha)<.1,'流光亮度平滑，不在循环时跳闪');
    if(flow.alpha>.01&&previous.alpha>.01)assert(flow.position>previous.position,'亮带需实际掠过表面');
    peak=Math.max(peak,flow.alpha);previous=flow;
  }
  assert.equal(peak,1);
  const snapshot=JSON.stringify(m.flowingLight(f,f.release+.6));
  m.flowingLight(f,24);m.flowingLight(f,0);
  assert.equal(JSON.stringify(m.flowingLight(f,f.release+.6)),snapshot,'流光回拖和重播一致');
}
assert(new Set(m.fallingFlowers.map(f=>m.flowingLight(f,8).position)).size>20,'流光节奏错开');
reduced=true;
for(const f of m.fallingFlowers)assert.equal(m.flowingLight(f,f.release+.6).alpha,0);
reduced=false;
instance.setup();instance.draw();assert.deepEqual(errors,[]);assert(!looping);assert(!nodes['#play'].disabled);
assert.equal(sizes.length,16,'原场景缓存、光芒与花瓣图集，加一张共享蝶翼图集');
assert.equal(glitterJobs.length,0,'空场景不出现材质反光');
assert(m.canopyGlitter.length>100&&m.canopyGlitter.length<=320);
assert.equal(glitterSurfaces.length,m.canopyGlitter.length+m.leafGlitter.length+m.fallingFlowers.length*5,'只为真实花叶、掉落物和四片蝶翼建立遮罩');
assert(glitterSurfaces.length<=880);
assert.equal(new Set(glitterSurfaces.map(surface=>surface.seed)).size,glitterSurfaces.length,'固定微片种子不重复');
assert.equal(new Set(m.canopyGlitter.map(light=>light.item)).size,m.canopyGlitter.length);
assert(m.leafGlitter.length>=70&&m.leafGlitter.length<=100,'足够多的分散银叶接入表面反光');
for(let layer=2;layer<=4;layer++)assert(m.leafGlitter.some(light=>light.item.layer===layer));
for(const light of m.leafGlitter){
  assert(m.visibleLeaves.includes(light.item));assert.equal(glitterSurfaces[light.slot].gold,m.leafIsGold(light.item)?1:0);
  assert(glitterMasks[light.slot].some(call=>call[0]==='bezierCurveTo'),'银叶使用原叶形遮罩');
  for(const other of light.occluders)assert(other!==light.item&&other.layer===light.item.layer&&other.z>=light.item.z);
}
for(const light of m.canopyGlitter){
  assert(m.canopyFlowers.includes(light.item)&&light.item.maxOpen>=.96&&light.item.layer>=2);
  assert(glitterMasks[light.slot].some(call=>call[0]==='bezierCurveTo'),'花瓣遮罩使用真正的曲线轮廓');
  for(const other of light.occluders)assert(other!==light.item&&other.layer===light.item.layer&&other.z>=light.item.z);
}
for(const [i,f] of m.fallingFlowers.entries()){
  const slot=m.canopyGlitter.length+m.leafGlitter.length+i*5,mask=glitterMasks[slot];
  assert.equal(glitterSurfaces[slot].gold,f.metal==='silver'?0:1,'反光颜色跟随材质，不跟随形状');
  if(f.symbolStyle.endsWith('outline'))assert(mask.some(call=>call[0]==='stroke')&&!mask.some(call=>call[0]==='fill'),'空心图形的反光来源只在描边');
  else assert(mask.some(call=>call[0]==='fill'));
  for(let wing=1;wing<=4;wing++){
    const path=glitterMasks[slot+wing];
    assert(path.some(call=>call[0]==='bezierCurveTo')&&path.some(call=>call[0]==='fill'),'每片蝶翼沿真实曲线提供反光来源');
    assert.equal(glitterSurfaces[slot+wing].gold,f.color%2===0?1:0);
  }
}
const canopySlots=new Map([...m.canopyGlitter,...m.leafGlitter].map(light=>[light.slot,light]));
const growingTime=1.35039;
sandbox.prepareGlitterForTest(growingTime);
const growingSilver=m.leafGlitter.find(light=>light.active&&light.occluders.some(other=>m.leafProgress(other,growingTime)===0));
assert(growingSilver,'应覆盖银叶已长成而前景叶尚未出现的真实时刻');
flowTrace=[];sandbox.drawLeafGlitterForTest(growingSilver,growingTime);const growingTrace=flowTrace;flowTrace=null;
const emerged=growingSilver.occluders.filter(other=>m.leafProgress(other,growingTime)>0);
assert.equal(growingTrace.filter(call=>call[0]==='clip').length,emerged.length,'尚未出现的叶片不能提前挡住银光');
const scales=growingTrace.filter(call=>call[0]==='scale');
for(const [i,other] of emerged.entries()){
  const progress=m.leafProgress(other,growingTime),amount=progress*progress*(3-2*progress);
  assert(Math.abs(scales[i][1]-amount)<1e-12&&Math.abs(scales[i][2]-amount*other.foreshorten)<1e-12,
    '遮光轮廓与叶片当前生长比例一致');
}
let glintWings=0;
for(let t=0;t<=24;t+=.25){
  sandbox.prepareGlitterForTest(t);assert.equal(glitterTime,t);
  for(const job of glitterJobs){
    const light=canopySlots.get(job.slot);
    if(light){if(light.kind==='flower')assert(m.flowerProgress(light.item,t)>=.96,'真实花瓣展开之后才允许反光');
      else assert(m.leafProgress(light.item,t)>.92,'叶片长成后才允许反光');}
    else{
      const offset=job.slot-m.canopyGlitter.length-m.leafGlitter.length,f=m.fallingFlowers[Math.floor(offset/5)],part=offset%5;
      const pose=m.flowerPose(f,t);
      assert(t>=f.release&&pose.opacity>.001&&pose.star<.999,'已离枝且尚未完全化星的物体才反光');
      if(part===0){assert(pose.morph<.999);assert(t>f.release+.4);assert(job.gain<=m.movingLightGain(f,t,'symbol')+1e-12);}
      else{
        assert(pose.morph>.001);assert(t>f.morphAt+m.MORPH_TIME+.15);glintWings++;
        const side=part<3?-1:1,wing=m.butterflyWing(f,t,side);
        assert.equal(job.tiltY,wing.lift);
        assert.equal(job.tiltX,side*Math.sqrt(Math.max(0,1-wing.width**2))*.72,'蝶翼翻转直接改变反射角');
      }
    }
  }
}
assert(glintWings>100,'飞行期间实际启用蝶翼反光');assert.equal(glitterJobs.length,0,'主体结束后退出材质反光');
sandbox.prepareGlitterForTest(9);const glitterSnapshot=JSON.stringify(glitterJobs);
// 同一反射点在压扁/转动的翅膀上仍定位准确，外围光芒恢复为相同画面尺度。
const opticalSlot=glitterJobs.at(-1).slot,opticalPoint=glitterStub.highlights(opticalSlot)[0];
for(const flatten of [.16,.95]){
  const ctx=context();ctx.translate(170,240);ctx.rotate(.67);ctx.scale(flatten,1.2);
  const matrix=ctx.getTransform(),x=(matrix.a*opticalPoint.x+matrix.c*opticalPoint.y+matrix.e)/2;
  const y=(matrix.b*opticalPoint.x+matrix.d*opticalPoint.y+matrix.f)/2;
  flowTrace=[];sandbox.drawOpticalForTest(ctx,opticalSlot,'wing');const trace=flowTrace;flowTrace=null;
  assert.deepEqual(trace.find(call=>call[0]==='setTransform'),['setTransform',2,0,0,2,0,0]);
  const position=trace.find(call=>call[0]==='translate');assert(Math.abs(position[1]-x)<1e-9&&Math.abs(position[2]-y)<1e-9);
  const sprite=trace.find(call=>call[0]==='drawImage');assert.equal(sprite.at(-1),sprite.at(-2),'光芒不会跟随蝶翼被压扁');
  assert(sprite.at(-1)>45,'强峰周围光芒有可见的画面尺寸');
  assert.deepEqual(ctx.getTransform(),matrix,'画完反光还原物体变换');
}
sandbox.prepareGlitterForTest(18);sandbox.prepareGlitterForTest(0);sandbox.prepareGlitterForTest(9);
assert.equal(JSON.stringify(glitterJobs),glitterSnapshot,'回拖还原反光的同一时间和角度');
const occluded=m.canopyGlitter.find(light=>light.active&&light.occluders.length);
flowTrace=[];sandbox.drawGlitterForTest(occluded);const glitterTrace=flowTrace;flowTrace=null;
assert.equal(glitterTrace.filter(call=>call[0]==='clip').length,occluded.occluders.length*5,'同层靠前花瓣与花心也遮挡反光');
reduced=true;sandbox.prepareGlitterForTest(9);assert.equal(glitterJobs.length,0);reduced=false;
sandbox.prepareGlitterForTest(9);assert.equal(JSON.stringify(glitterJobs),glitterSnapshot,'同一暂停时间切换减少动态可恢复原状态');
sandbox.prepareGlitterForTest(0);
// 光丝只能来自刚走过的运动路径：不在落地时拖穿地面，不在终点残留。
let ribbonFrames=0,maxRibbons=0;
for(let t=0;t<=24;t+=.1){
  let active=0;
  for(const f of m.fallingFlowers){
    const ribbon=m.motionRibbon(f,t);if(!ribbon.length)continue;active++;ribbonFrames++;
    assert(f.sourceIndex%5===0&&ribbon.length<=13);
    const head=m.flowerPose(f,t);
    for(const point of ribbon){
      const past=m.flowerPose(f,t-point.lag);
      assert.equal(point.x,past.x);assert.equal(point.y,past.y);
      assert(point.alpha>=0&&point.alpha<=1&&point.lag<=.48);
      assert(Math.hypot(point.x-head.x,point.y-head.y)*m.PLACEMENT.scale*m.VIEW.scale<=52);
      assert.equal(point.gold,t>=f.morphAt+m.MORPH_TIME?f.color%2===0:f.metal==='gold');
    }
  }
  maxRibbons=Math.max(maxRibbons,active);
}
assert(ribbonFrames>100&&maxRibbons<=23,'只有部分真实飞行物留下短光丝');
const ribbonSources=m.fallingFlowers.filter(f=>f.sourceIndex%5===0);
assert.equal(new Set(ribbonSources.map(f=>f.destination)).size,2,'光丝覆盖汇月与留星的既有去向');
assert.equal(new Set(ribbonSources.map(f=>f.color%2)).size,2,'金银蝶翼都能留下光丝');
for(const f of m.fallingFlowers){
  assert.equal(m.motionRibbon(f,f.contactAt).length,0);
  assert.equal(m.motionRibbon(f,24).length,0);
}
const ribbonsAtTen=JSON.stringify(m.fallingFlowers.map(f=>m.motionRibbon(f,10)));
m.fallingFlowers.forEach(f=>m.motionRibbon(f,0));
assert.equal(JSON.stringify(m.fallingFlowers.map(f=>m.motionRibbon(f,10))),ribbonsAtTen);
reduced=true;assert(m.fallingFlowers.every(f=>m.motionRibbon(f,10).length===0));reduced=false;
// 表面光沿各自的方向场移动，路径不影响花叶数据、运动轨迹或缓存数量。
for(const kind of ['leaf','flower']){
  const lights=m.surfaceLights.filter(light=>light.kind===kind);
  assert(lights.length>20&&lights.length<=(kind==='leaf'?60:168));
  assert(new Set(lights.map(light=>light.item)).size===lights.length,'同一物体不重复叠加亮纹');
  let maxActive=0;
  for(let t=0;t<=24;t+=.02)maxActive=Math.max(maxActive,lights.filter(light=>m.surfaceLight(light,t).alpha>.1).length);
  assert(maxActive>4&&maxActive<(kind==='leaf'?19:55),'只让局部花叶泛光，不同时照亮整棵树');
  for(const light of lights){
    assert((kind==='leaf'?m.visibleLeaves:m.canopyFlowers).includes(light.item));
    assert.equal(light.paths.length,kind==='leaf'?5:4);
    assert.equal(m.surfaceLight(light,kind==='leaf'?m.LEAF_END:m.flowerClocks.get(light.item).end).alpha,0,'表面长成之后才有流光');
    assert.equal(m.surfaceLight(light,24).alpha,0,'结尾退出树上流光，留给星空');
    for(const other of light.occluders)assert(other!==light.item&&other.layer===light.item.layer&&other.z>=light.item.z,'同层前方花叶阻挡亮纹');
    for(const path of light.paths){
      assert(path.points.length>10);
      for(let i=1;i<path.points.length;i++){
        const a=path.points[i-1],b=path.points[i];
        assert(b.distance>a.distance&&b.x>a.x,'沿方向场连续向叶尖或花瓣外缘前进');
        assert(Math.hypot(b.x-a.x,b.y-a.y)<.019);
      }
      if(kind==='flower')assert(Math.max(...path.points.map(q=>Math.abs(q.y)))>.13,'金光沿花瓣弧线，不能退回直线平移');
    }
    if(kind==='leaf'){
      for(const q of light.paths[0].points)
        assert(Math.abs(q.y-light.item.bend*(.76*q.x+.24*q.x*q.x))<.0001,'主光路附着于实际弯曲叶脉');
      assert(light.paths[1].points.at(-1).y<light.paths[2].points.at(-1).y,'侧脉向两侧分流');
    }
    let previous=m.surfaceLight(light,0);
    for(let t=.01;t<24;t+=.01){
      const flow=m.surfaceLight(light,t);assert(flow.alpha>=0&&flow.alpha<=1);
      assert(Math.abs(flow.alpha-previous.alpha)<.11,'亮纹出现、消退和循环都连续');previous=flow;
    }
  }
  const light=lights.find(light=>light.occluders.length)||lights[0];
  const t=(kind==='leaf'?m.LEAF_END+.12:m.flowerClocks.get(light.item).end+.08)+light.delay+.6;
  const traceAt=time=>{flowTrace=[];sandbox.drawSurfaceForTest(light,time);const result=flowTrace;flowTrace=null;return result;};
  const first=traceAt(t),later=traceAt(t+.3);
  assert.equal(first.filter(c=>c[0]==='clip').length,kind==='leaf'?1+light.occluders.length:2+light.occluders.length*5,'光先裁到自身轮廓，再被靠前物体遮挡，花瓣交叠处不得漏光');
  assert(first.some(c=>c[0]==='stroke')&&!first.some(c=>c[0]==='fillRect'),'亮纹实际绘制，不使用横向亮带');
  assert.notDeepEqual(first.filter(c=>c[0]==='lineTo'),later.filter(c=>c[0]==='lineTo'),'亮纹位置确实随时间沿表面前进');
  traceAt(24);traceAt(0);assert.deepEqual(traceAt(t),first,'暂停、跳转和回拖重现相同表面光');
  reduced=true;assert.equal(m.surfaceLight(light,t).alpha,0);assert.equal(traceAt(t).length,0);reduced=false;
}
for(const f of m.fallingFlowers){
  const paths=m.fallingSurfacePaths.get(f);assert(paths?.length);
  if(f.kind==='leaf')assert.equal(paths.length,5,'掉落银叶也沿主脉分流');
  else{
    const points=paths[0].points,first=points[0],last=points.at(-1);
    assert(Math.hypot(first.x-last.x,first.y-last.y)<1e-9,'月牙与星星的亮纹沿闭合轮廓游走');
  }
}
assert(!soundPlaying,'准备画面时不播放声音');
assert.equal(soundSettings.wind.start,m.BLOOM_END);
assert.equal(soundSettings.cues.length,19,'少量交错轻碰声，不为全部掉落物同时敲铃');
assert.equal(soundSettings.stages.wood.start,0);assert(soundSettings.stages.wood.end<=2.70001);
assert.equal(soundSettings.stages.leaves.start,m.LEAF_START);assert.equal(soundSettings.stages.leaves.end,m.LEAF_END);

assert.equal(soundSettings.stages.blooms.length,11);
for(const event of soundSettings.stages.blooms){
  assert(event.time>m.LEAF_START&&event.duration>0&&event.time+event.duration<=m.BLOOM_END+1e-9);
  const flower=flowers.find(f=>f.maxOpen>.95&&Math.abs(m.flowerClocks.get(f).start-event.time)<1e-9&&Math.abs(f.duration-event.duration)<1e-9);
  assert(flower,'声音跟随真正盛开的花瓣，不能由不绽放的花苞触发');
  assert(Math.abs(m.flowerProgress(flower,event.time)-.22)<1e-9);
  assert(m.flowerProgress(flower,event.time+event.duration)>.95);
}
assert.equal(soundSettings.stages.flights.length,3);assert.equal(soundSettings.stages.stars.length,7);
for(const [i,event] of soundSettings.stages.flights.entries()){
  assert(Math.abs(event.end-event.start-1.2)<1e-10);
  if(i)assert(event.start-soundSettings.stages.flights[i-1].end>=1.5);
  const f=m.fallingFlowers.find(f=>f.sourceIndex===event.sourceIndex);
  assert.equal(event.phase,f.phase);
  assert(event.start>=f.morphAt+m.MORPH_TIME&&event.end<=m.moonArrivals.get(f.sourceIndex).start);
  for(const [t,pan] of [[event.start,event.panFrom],[event.end,event.panTo]]){
    const q=m.toScreen(m.flowerPose(f,t));assert(Math.abs(pan-(Math.max(0,Math.min(1,q.x/m.VIEW.width))*1.4-.7))<1e-10);
  }
}
console.log('局部花苞／全花完成／起风：',Math.min(...[...m.flowerClocks.values()].map(c=>c.budAt)).toFixed(3),m.BLOOM_END.toFixed(3),m.WIND.start.toFixed(3),'秒；扑翼时段：',soundSettings.stages.flights.map(f=>[f.start.toFixed(2),f.end.toFixed(2)]));
for(const [i,star] of soundSettings.stages.stars.entries()){
  const f=m.fallingFlowers.filter(f=>f.destination==='star'&&f.starRank%4===0)[i];
  assert.equal(star.end,m.starLifetime(f).end,'星光声音与星星一起退出');
}

assert(soundSettings.cues.reduce((sum,cue)=>sum+cue.pan,0)<0,'掉落轻碰整体偏向树所在的左侧');
for(const [i,cue] of soundSettings.cues.entries()){
  assert.equal(cue.time,m.fallingFlowers[i*6].contactAt,'轻碰音效与真正触地同步');
  assert(cue.time>m.IMPACT.start&&cue.time<Math.max(...m.fallingFlowers.map(f=>f.morphAt)));
  assert(cue.pan>=-.8&&cue.pan<=.8,'声音方向保持在立体声范围内');
}

const button=nodes['#play'],slider=nodes['#progress'],readout=nodes['#time'];
button.click();assert(soundPlaying);assert.equal(soundOffset,0);instance.draw();now=2500;instance.draw();assert.equal(slider.value,'250');
button.click();assert(!soundPlaying);instance.draw();const paused=readout.textContent;now+=6000;instance.draw();assert.equal(readout.textContent,paused);
button.click();instance.draw();now+=1000;instance.draw();assert.equal(slider.value,'350');
document.hidden=true;events.visibilitychange();assert(!soundPlaying);now+=90000;assert(!looping);document.hidden=false;events.visibilitychange();assert(soundPlaying);assert.equal(soundOffset,3.5);instance.draw();assert.equal(slider.value,'350');
for(let step=0;step<=48;step++){
  slider.value=String(step*50);slider.input();assert(!soundPlaying,'拖动进度时不能播放残留声音');instance.draw();
  assert(readout.textContent.startsWith((step*.5).toFixed(2)),'拖动、暂停和秒数须一致');assert(!looping);
  assert.equal(glitterTime,step*.5,'真实绘制帧与反光共用进度时钟');
}
assert(glitterDraws>100,'播放过程中反光图集实际叠到二维画面');
button.click();instance.draw();assert.equal(slider.value,'0');now+=24000;instance.draw();assert.equal(slider.value,'2400');assert(looping,'播放结尾保持局部星光');
assert(flowerCacheClears>0,'落花时更新花层缓存');
const cachedClearCount=flowerCacheClears,cachedMoonWrites=textureWrites;
const endSky=sandbox.skyTimeForTest;now+=1500;instance.draw();
assert.equal(flowerCacheClears,cachedClearCount,'花量稳定后复用缓存');assert.equal(textureWrites,cachedMoonWrites,'满月尾声复用月面像素');
assert.equal(slider.value,'2400');assert(sandbox.skyTimeForTest>endSky+1,'尾声只推进星光时钟');assert(!soundPlaying);
document.hidden=true;events.visibilitychange();const frozenSky=sandbox.skyTimeForTest;now+=50000;
document.hidden=false;events.visibilitychange();instance.draw();assert.equal(sandbox.skyTimeForTest,frozenSky,'后台不累计星光时间');
slider.input();instance.draw();assert(!looping,'拖动到结尾时仍能暂停星光');
reduced=true;media.change();button.click();instance.draw();assert.equal(slider.value,'0');button.click();instance.draw();assert.equal(slider.value,'2400');assert(!looping);
assert(draws>50);assert.deepEqual(errors,[]);assert(!soundPlaying,'减少动态模式不启动音轨');
assert(soundStub.enabled,'音效默认开启，不再展示音效开关');
reduced=false;nodes['#replay'].click();assert(soundPlaying);assert.equal(soundOffset,0);instance.draw();assert.equal(slider.value,'0');
button.click();instance.draw();assert(!soundPlaying,'重播之后仍可暂停');
assert(!readout.textContent.includes('·'),'时间右侧不显示阶段说明');

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
assert(html.indexOf('src="glitter.js"')<html.indexOf('src="scene.js"'),'反光组件先于场景加载');
assert(html.indexOf('</section>')<html.indexOf('class="controls"'),'播放控件位于主场景外');
assert(!/\.controls\{[^}]*position:absolute/.test(css),'控件不能再叠在画布里');
assert(/aspect-ratio:\s*3\s*\/\s*4/.test(css),'页面容器保持 3:4，与画布比例一致');
for(const [,file] of html.matchAll(/(?:src|href)="([^"]+)"/g)){assert(!file.startsWith('..'));assert(fs.existsSync(path.join(root,file)));}
assert(!/fetch\(|XMLHttpRequest|https?:\/\/|outsideTheWindow|osmanthus\.html/.test(source+html),'新页面必须无原项目和网络依赖');
const snapshot=JSON.stringify(m.fallingFlowers.map(f=>m.flowerPose(f,9.25)));
instance.draw();assert.equal(JSON.stringify(m.fallingFlowers.map(f=>m.flowerPose(f,9.25))),snapshot);
assert(source.includes("ctx.fillStyle='#fff6dc'"),'树干统一象牙白');
assert(!source.includes('bark.addColorStop'),'去掉深色侧影');
const grainColors=[];
for(let y=0;y<64;y++)for(let x=0;x<64;x++)grainColors.push(m.grainPixel(x,y));
for(const pixel of grainColors)assert.equal(JSON.stringify(pixel),'[0,0,0,255]','背景为不透明纯黑');
assert(!/create(?:Linear|Radial)Gradient/.test(source.split('function buildBackground(){')[1].split('function buildMoon')[0]),'背景没有渐变或雾层');
assert(/\.painting\{[^}]*background:#000000/.test(css),'主场景与画布使用相同纯黑底色');
assert(textureWrites>2,'月相变化时更新局部月面，复用已有画布');
assert.equal(new Set(m.fallingFlowers.map(f=>f.kind)).size,3);
assert.equal(m.fallingFlowers.filter(f=>f.kind==='leaf').length,37);
assert.equal(m.moonTravelers.length,84);
const stopped=m.fallingFlowers.filter(f=>f.destination==='star');
assert.equal(stopped.length,28);
for(const f of stopped){
  const {brakeAt,settleAt}=m.starTiming(f);
  assert(brakeAt>f.morphAt+m.MORPH_TIME+f.carryDuration,'化蝶并飞行一段后才能减速');
  assert.equal(m.flowerPose(f,settleAt).star,0);
  assert.equal(m.flowerPose(f,settleAt+.76).star,1);
  const settled=m.flowerPose(f,settleAt);
  for(let t=settleAt;t<=24;t+=.1){
    const q=m.flowerPose(f,t);assert.equal(q.x,settled.x);assert.equal(q.y,settled.y);
    assert.equal(m.moonContribution(f,t),0,'留在途中化星的蝴蝶不推动月相');
  }
  const before=m.flowerPose(f,settleAt-.001);
  assert(Math.hypot(before.x-settled.x,before.y-settled.y)<.001,'停下前平滑减速');
  for(const edge of [brakeAt,settleAt,settleAt+.75]){
    const a=m.flowerPose(f,edge-.00001),b=m.flowerPose(f,edge+.00001);
    assert(Math.hypot(a.x-b.x,a.y-b.y)<.01&&Math.abs(a.star-b.star)<.001,'途中化星不得跳变');
  }
  const snapshot=JSON.stringify(m.flowerPose(f,settleAt+.4));
  m.flowerPose(f,24);m.flowerPose(f,0);assert.equal(JSON.stringify(m.flowerPose(f,settleAt+.4)),snapshot);
  assert.equal(m.flowerPose(f,0).star,0);assert.equal(m.flowerPose(f,0).opacity,0,'重播清空途中星星');
}
assert(html.includes('max="2400"'));assert(!html.includes('<header'));
assert(!/moon\.png|<img/.test(html),'月相完全由代码绘制，不再使用月亮贴图');
const firstArrival=Math.min(...[...m.moonArrivals.values()].map(a=>a.start));
assert.equal(m.moonProgress(0),0);assert.equal(m.moonProgress(firstArrival),0,'没有蝴蝶抵达前不能出现月亮');
assert.equal(m.moonProgress(m.DURATION),1,'赴月蝶群抵达后主月亮成为圆月');
for(const f of m.moonTravelers){
  const arrival=m.moonArrivals.get(f.sourceIndex);
  const q=m.toScreen(m.flowerPose(f,arrival.start));
  assert(Math.abs(Math.hypot(q.x-moon.x,q.y-moon.y)-moon.r)<1e-5,'进入主月亮范围后才开始消融');
  assert.equal(m.flowerPose(f,arrival.start).opacity,1);
  const mid=(arrival.start+arrival.end)/2;
  assert(Math.abs(m.moonContribution(f,mid)-.5)<1e-10);
  assert(Math.abs(m.flowerPose(f,mid).opacity-.5)<1e-10,'蝶的消融和月相增加使用同一进度');
  assert.equal(m.moonContribution(f,arrival.end),1);
}
let previousMoon=0;const stages=new Set();
for(let t=0;t<=24;t+=.02){
  const phase=m.moonProgress(t);assert(phase>=previousMoon-1e-12&&phase<=1);
  assert(phase-previousMoon<.03,'主月亮变圆进度不得跳跃');previousMoon=phase;
  if(phase>0&&phase<.2)stages.add('月牙');if(phase>.45&&phase<.55)stages.add('半月');if(phase>.8)stages.add('盈月');
}
assert.equal(stages.size,3);
const area=points=>Math.abs(points.reduce((sum,p,i)=>{const n=points[(i+1)%points.length];return sum+p.x*n.y-n.x*p.y;},0)/2);
// 对真实合成像素检查月相、圆边与透明留白，不以绘图命令代替边缘验收。
for(const density of [2,3,4]){
  const raster=m.createMoonRaster(density),n=raster.size;
  assert.equal(n%2,0);assert(Math.abs(n/raster.span-m.VIEW.scale*density*4)<1e-9);
  const bounds=pixels=>{
    let xmin=n,ymin=n,xmax=-1,ymax=-1,soft=0,area=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      const a=pixels[(y*n+x)*4+3];area+=a/255;
      if(a>0){xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y);}
      if(a>0&&a<255)soft++;
    }
    return {xmin,xmax,ymin,ymax,soft,area};
  };
  assert(m.paintMoonRaster(raster,0).every((v,i)=>i%4!==3||v===0));
  let lastArea=0;
  for(const phase of [.02,.25,.5,.75,1]){
    const pixels=m.paintMoonRaster(raster,phase),b=bounds(pixels);
    assert(b.area>lastArea);lastArea=b.area;
    assert(b.soft>n/3,'月牙、半月、盈月和满月均有连续半透明边缘');
    assert(b.xmin>=6&&b.ymin>=6&&b.xmax<n-6&&b.ymax<n-6,'透明留边避免圆周被裁掉');
    if(phase<=.5)assert.equal(pixels[(Math.floor(n/2)*n+Math.floor(n/4))*4+3],0,'未照亮部分透明，不出现蓝灰色背景圆盘');
    if(phase===1){
      assert(Math.abs((b.xmax-b.xmin)-(b.ymax-b.ymin))/4<=1,'满月宽高误差不超过一个目标像素');
      assert(Math.abs(b.area/(Math.PI*(moon.r*m.VIEW.scale*density*4)**2)-1)<.002);
      const sample=(x,y)=>{const px=Math.floor((x*moon.r/raster.span+.5)*n),py=Math.floor((y*moon.r/raster.span+.5)*n);return pixels[(py*n+px)*4+1];};
      assert(sample(-.35,-.35)<sample(.3,.5)-15,'高采样后保持月海与高地的对比');
    }
  }
}
// 相同屏幕宽度的过渡在窄窗口、宽窗口保持一致，内部月海像素不被一起模糊。
for(const width of [320,480,720]){
  const displayScale=width/720,ratio=2,r=m.createMoonRaster(2,displayScale,ratio),pixels=m.paintMoonRaster(r,1),n=r.size;
  const row=Math.floor(n/2),screenStep=r.span/n*m.VIEW.scale*displayScale*ratio;
  const crossing=level=>{
    for(let x=Math.floor(n/2);x<n-1;x++){
      const a=pixels[(row*n+x)*4+3]/255,b=pixels[(row*n+x+1)*4+3]/255;
      if(a>=level&&b<level)return (x+(a-level)/(a-b))*screenStep;
    }
    throw Error('圆边缺少连续透明过渡');
  };
  const transition=crossing(.1)-crossing(.9);
  assert(transition>.65&&transition<.95,'缩放后仍有接近一个屏幕像素的平滑边缘');
  const center=(row*n+Math.floor(n/2))*4,base=(row*n+Math.floor(n/2))*6;
  for(let c=0;c<3;c++)assert.equal(pixels[center+c],Math.round(r.base[base+c]),'只处理轮廓，内部月海不模糊或提亮');
}
assert(source.includes("f.kind==='moon'"),'掉落物保留独立的月牙绘制');
assert.equal(stopped.filter(f=>m.starAppearance(f,24).bright).length,5,'只有少数较亮星，其余为细小暗星');
for(let i=0;i<m.starStops.length;i++){
  const q=m.starStops[i];assert(q.y>=105&&q.y<=350);
  assert(Math.hypot(q.x-moon.x,q.y-moon.y)>100,'月牙附近留出较疏区域');
  for(let j=0;j<i;j++)assert(Math.hypot(q.x-m.starStops[j].x,q.y-m.starStops[j].y)>16,'途中星星分散落位');
}
// 暗星较短、亮星较长；亮点和光芒一起柔和退出，不再永久停驻。
reduced=false;
for(const f of stopped){
  const life=m.starLifetime(f),born=m.starTiming(f).settleAt+.75;
  assert(life.fadeAt-born>=(f.starRank%6===0?18:4));
  assert(life.fadeAt-born<=(f.starRank%6===0?22:6));
  assert(m.starAppearance(f,life.fadeAt).alpha>0);
  assert.equal(m.starAppearance(f,life.end).alpha,0);
  assert.equal(m.starAppearance(f,life.end+10).twinkle,0);
  let prev=m.starAppearance(f,life.fadeAt).alpha;
  for(let t=life.fadeAt+.01;t<=life.end;t+=.01){const value=m.starAppearance(f,t).alpha;assert(Math.abs(value-prev)<.06);prev=value;}
}
reduced=true;for(const f of stopped)assert.equal(m.starAppearance(f,30).twinkle,0);reduced=false;
const fullArea=area(m.moonOutline(1));assert(Math.abs(fullArea-Math.PI*moon.r**2)<2);
for(const phase of [0,.05,.25,.5,.75,1]){
  assert(Math.abs(area(m.moonOutline(phase))/fullArea-phase)<1e-10,'月牙轮廓面积应随月相参数连续变化');
}
const seekPhase=m.moonProgress(18);m.moonProgress(24);m.moonProgress(0);assert.equal(m.moonProgress(18),seekPhase);
assert.equal(m.moonProgress(0),0,'重播必须恢复无月夜空');
// 生长阶段的实际绘图工作量：花瓣复用图集，保留原始时间与落花后缓存。
reduced=false;document.hidden=false;
let greatestReduction=0;
for(const t of [1.8,2.4,2.8,3.2]){
  const before=gradientCount;nodes['#progress'].value=String(t*100);nodes['#progress'].input();instance.draw();
  const actual=gradientCount-before;
  const leafGradients=t<m.LEAF_END?m.visibleLeaves.filter(l=>m.leafProgress(l,t)>0).length:0;
  const oldFlowerGradients=m.canopyFlowers.reduce((sum,f)=>sum+[0,1,2,3].filter(i=>m.flowerProgress(f,t)>.22+i*.018).length,0);
  assert(actual<=leafGradients+10,'开花阶段不再逐朵重建花瓣渐变');
  greatestReduction=Math.max(greatestReduction,1-actual/Math.max(1,leafGradients+oldFlowerGradients));
  assert.equal(sandbox.growthCacheForTest().settledCount,branches.filter(b=>b.start+b.duration<=t).length,'枝条长完即缓存，回拖正确重建');
}
assert(greatestReduction>.8,'开花后段的渐变创建量减少至少八成');
for(const t of [24,1.6,2.4,0,24]){
  nodes['#progress'].value=String(t*100);nodes['#progress'].input();instance.draw();
  assert.equal(sandbox.growthCacheForTest().settledCount,branches.filter(b=>b.start+b.duration<=t).length);
}
console.log('生长阶段花瓣渐变创建量最多减少',Math.round(greatestReduction*100)+'%，枝干缓存回拖检查通过。');
console.log('通过：叶脉分流、花瓣曲面光路、表面亮纹实际游走、同层与前后层遮挡、局部亮纹数量及固定光路、11 种掉落形态、空心通透与轮廓流光、流光移动及暂停重播一致、掉落物与化蝶尺寸匹配、化形后平滑振翅、掉落月牙与主月亮由缺至圆、疏密与明暗分层的星空、纯黑场景、暖金月面纹理与四倍采样缓存、三种放大掉落物、28 蝶途中停驻化星、84 蝶实际入月与月相分流、独立三比四取景与外置控件、新增 1470 朵叶腋金花及间距、从右上往左下偏动与树干幅度、落花平滑放大、短促反光连续性与固定节奏、反光数量控制、原桂花完整结构与时序、左下等比缩放、银色叶片与分层疏叶、112 个真实落花来源、短促震动同步落花、离枝衔接、蝶群交错转向、落地接触、反弹后化蝶及平滑起飞、抵月消融驱动月牙变圆、月相连续与重播复位、49 个进度位置、缓存、暂停重播、后台停播、减少动态效果及本地资源。');
console.log('未启动服务器、操作浏览器或截图；视觉效果由人工刷新验收。');

// 离枝时只更新覆盖该花的格子；每格仍包含按原遮挡顺序排列的所有相交花。
for(const band of sandbox.flowerBandsForTest()){
  for(const tile of band.flowerTiles){
    assert(Number.isInteger(tile.x)&&Number.isInteger(tile.y)&&Number.isInteger(tile.width)&&Number.isInteger(tile.height),'局部更新边界与像素对齐');
    const expected=band.flowers.filter(f=>{const r=f.size+3;return f.x+r>=tile.x&&f.x-r<tile.x+tile.width&&f.y+r>=tile.y&&f.y-r<tile.y+tile.height;});
    assert.deepEqual(tile.flowers,expected,'重画邻花时保持完整花瓣与原始遮挡顺序');
  }
  band.releases.forEach((f,i)=>{
    assert(band.releaseTiles[i].every(tile=>tile.flowers.includes(f)));
    assert.equal(band.releaseTiles[i].length,band.flowerTiles.filter(tile=>tile.flowers.includes(f)).length);
  });
}
for(const t of [4,5,6,7,5,24,4]){
  slider.value=String(t*100);slider.input();instance.draw();
  for(const band of sandbox.flowerBandsForTest())band.releases.forEach((f,i)=>assert.equal(band.attached[i],m.flowerAttached(f,t),'局部花量在离枝和回拖时均正确更新'));
}
let totalGradients=0,fullLayerGradients=0;
const releaseTimes=new Map(m.fallingFlowers.map(f=>[flowers[f.sourceIndex],f.release]));
slider.value='400';slider.input();instance.draw();
for(let frame=1;frame<=90;frame++){
  const t=Math.round((4+frame/30)*100)/100,previous=Math.round((4+(frame-1)/30)*100)/100,before=gradientCount;slider.value=String(Math.round(t*100));slider.input();instance.draw();
  totalGradients+=gradientCount-before;
  for(const band of sandbox.flowerBandsForTest())if(band.releases.some(f=>releaseTimes.get(f)>previous&&releaseTimes.get(f)<=t))
    fullLayerGradients+=band.flowers.filter(f=>m.flowerAttached(f,t)).length*4;
}
console.log('掉落回弹绘制检查：90 帧总渐变',totalGradients,'；旧式全层金花重画估算',fullLayerGradients,'。');
assert(totalGradients<fullLayerGradients*.6,'回弹期间实际渐变创建量低于仅全层金花重画开销的六成');

// 飞行阶段的绘制开销：蝶翼固定材质来自同一张小图，连续反光仍随翅膀姿态变化。
let flightGradients=0;
for(let i=0;i<90;i++){const before=gradientCount;slider.value=String(800+Math.round(i*100/30));slider.input();instance.draw();flightGradients+=gradientCount-before;}
assert(flightGradients<88438*.65,'飞行阶段渐变创建量较修改前至少降低三成五');
console.log('飞行阶段 90 帧渐变创建量：',flightGradients,'；修改前 88438。');
// 本地倍速不改变任何绝对时间的轨迹；切换时从原进度继续且声音同步。
const speed=nodes['#speed'];
if(source.includes('LOCAL_SPEED_START')){
  slider.value='800';slider.input();instance.draw();button.click();instance.draw();
  const at=Number(slider.value);speed.click();assert.equal(soundRate,1.5);assert(soundPlaying);assert.equal(Number(slider.value),at);assert.equal(readout.textContent,'5.33 / 16.00 秒','倍速切换立即更新显示时长，进度位置不变');
  now+=1000;instance.draw();assert.equal(Number(slider.value),at);now+=1000;instance.draw();assert.equal(Number(slider.value),at+150);assert.equal(readout.textContent,'6.33 / 16.00 秒');
  button.click();speed.click();assert.equal(soundPlaying,false);assert.equal(speed.textContent,'2×');assert.equal(readout.textContent,'4.75 / 12.00 秒');
  speed.click();assert.equal(speed.textContent,'0.5×');assert.equal(readout.textContent,'19.00 / 48.00 秒');speed.click();assert.equal(speed.textContent,'1×');assert.equal(readout.textContent,'9.50 / 24.00 秒');
  assert(!/\.painting\{[^}]*outline/.test(css));assert(/\.controls\{width:100%/.test(css));
  assert(html.indexOf('id="progress"')<html.indexOf('id="time"'));assert(html.indexOf('id="time"')<html.indexOf('</div>',html.indexOf('id="progress"')),'时间与进度条同一行');
}
