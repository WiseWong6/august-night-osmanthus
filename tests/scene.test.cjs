'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
let now=0,instance,looping=true,reduced=false,draws=0,capture=null,textureWrites=0;
const nodes={},events={},errors=[],sizes=[];
let soundPlaying=false,soundSettings,soundOffset;
const soundStub={enabled:true,play(time){soundPlaying=true;soundOffset=time;},stop(){soundPlaying=false;},position(time){return time;},setEnabled(value){this.enabled=value;},finish(){soundPlaying=false;},tickStars(){}};
const document={hidden:false,querySelector(id){return nodes[id]??={value:'0',disabled:true,textContent:'',setAttribute(){},addEventListener(name,fn){this[name]=fn;}};},addEventListener(name,fn){events[name]=fn;}};
const media={get matches(){return reduced;},addEventListener(name,fn){this[name]=fn;}};
function context(){
  const stack=[];
  const raw={globalAlpha:1,save(){stack.push(this.globalAlpha);},restore(){assert(stack.length);this.globalAlpha=stack.pop();},
    createLinearGradient(){return{addColorStop(at,color){assert(at>=0&&at<=1&&typeof color==='string');}};},
    createRadialGradient(){return this.createLinearGradient();},
    createImageData(w,h){return {width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},
    putImageData(pixels){assert.equal(pixels.data.length,pixels.width*pixels.height*4);textureWrites++;}};
  return new Proxy(raw,{get(target,key){return target[key]??((...args)=>{if(capture)capture.push(key);for(const n of args)if(typeof n==='number')assert(Number.isFinite(n),`${key} 必须使用有效坐标`);});},set(target,key,value){if(key==='globalAlpha')assert(value>=0&&value<=1);target[key]=value;return true;}});
}
const sandbox={NightTreeSound:{create(settings){soundSettings=settings;return soundStub;}},document,window:{devicePixelRatio:2},matchMedia:()=>media,performance:{now:()=>now},console:{error:e=>errors.push(e)},
  p5:function(callback){instance={drawingContext:context(),pixelDensity(n){assert(n>=2);},createCanvas(w,h){assert.equal(w/h,.75);return{parent(){}};},
    frameRate(){},createGraphics(w,h){sizes.push([w,h]);return{drawingContext:context(),pixelDensity(n){assert(n>=2);}};},
    image(){draws++;},loop(){looping=true;},noLoop(){looping=false;}};callback(instance);}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'tree-data.js'),'utf8'),sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'moon-map.js'),'utf8'),sandbox);
const source=fs.readFileSync(path.join(root,'scene.js'),'utf8');
vm.runInContext(source.replace('new p5(p=>{','globalThis.model={curve,branchProgress,leafProgress,flowerProgress,flowerPose,fallingFlowers,toScreen,PLACEMENT,phaseAt,LEAF_START,LEAF_END,BLOOM_END,DURATION,TREE_END,MORPH_TIME,WIND,windState,leafColor,visibleLeaves,moonArrivals,moonContribution,moonProgress,moonOutline,treeShake,attachedPoint,IMPACT,fallingAppearance,fallingSize,butterflySpread,butterflyWing,flowingLight,reflectionCycle,lunarPixel,GLINT,VIEW,extraFlowers,canopyFlowers,starTiming,moonTravelers,insideMoon,starStops,starAppearance,grainPixel,soundStages};\nnew p5(p=>{').replace('  function render(t,skyTime=t){','  globalThis.drawSymbolForTest=drawFallingSymbol;\n  function render(t,skyTime=t){globalThis.skyTimeForTest=skyTime;'),sandbox);
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
assert.equal(m.extraFlowers.length,1470,'增加约三成半金花');
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
  assert.equal(m.flowerProgress(f,m.LEAF_END),0);
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
assert(m.canopyFlowers.some(f=>m.flowerProgress(f,m.LEAF_END+1/30)>0),'叶片长完的下一帧即出现花苞');
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
for(const leaf of m.visibleLeaves){const rgb=m.leafColor(leaf).match(/\d+/g).map(Number);assert(Math.max(...rgb)-Math.min(...rgb)<=38&&Math.min(...rgb)>=88,'银叶保留暖白亮面和灰银背面');}


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
  assert.equal(m.flowerProgress(f,m.LEAF_END),0,'叶子长成后再开花');
  assert(Math.abs(m.flowerProgress(f,m.BLOOM_END)-f.maxOpen)<1e-12);
  assert.equal(m.flowerProgress(f,21),m.flowerProgress(f,8),'落花不会改变树上花量');
}
assert.equal(m.fallingFlowers.length,112);assert.equal(new Set(m.fallingFlowers.map(f=>f.sourceIndex)).size,112);
for(const f of m.fallingFlowers){
  const original=flowers[f.sourceIndex],anchor=f.kind==='leaf'?leaves.find(l=>l.sourceIndex===f.sourceLeaf):original;
  assert(anchor);assert.equal(f.x,anchor.x);assert.equal(f.y,anchor.y);assert.equal(f.size,original.size);
  assert(f.release>=m.IMPACT.start&&f.release<=m.IMPACT.start+3.30001);
  assert(f.windAt-f.release<=.21,'离枝约 0.2 秒即开始受风，不等落到指定区域');
  assert(f.windAt<f.morphAt-.5,'风必须在化蝶前介入');
  assert(f.fallDuration<1.9);
  assert.equal(m.flowerPose(f,f.release-.01).opacity,0);
  const drifting=m.flowerPose(f,f.windAt+.25);
  assert(drifting.x<f.origin.x&&drifting.y>f.origin.y&&drifting.morph===0,'未到化蝶位置的桂花已向左下偏移');
  const release=m.flowerPose(f,f.release);assert.equal(release.x,m.attachedPoint(f,f.release).x);assert.equal(release.y,m.attachedPoint(f,f.release).y);assert.equal(release.morph,0);
  assert.equal(m.flowerPose(f,f.release+f.fallDuration-.0001).morph,0,'桂花必须落到树冠下方才化蝶');
  const landing=m.toScreen(m.flowerPose(f,f.release+f.fallDuration));
  assert(landing.y>=674.999&&landing.y<=711.001&&landing.x>=21.999&&landing.x<=450,'化蝶起点必须在树干两侧的标记区域');
  assert.equal(m.flowerPose(f,f.morphAt-.0001).morph,0);
  const launchTime=f.morphAt+m.MORPH_TIME;
  const launch=m.flowerPose(f,launchTime);assert.equal(launch.morph,1);assert(launch.flight<1e-12);
  assert(m.toScreen(launch).y<730,'舒展蝶翼期间应保持在标记区域');
  assert(launch.x<f.end.x&&launch.y>f.end.y,'化蝶时仍顺着风向左下运动');
  const carried=m.flowerPose(f,launchTime+.1);
  assert(carried.x<launch.x&&carried.y>launch.y,'刚起飞的蝴蝶继续向左下飞');
  for(let age=0;age<f.fallDuration;age+=.05)assert.equal(m.flowerPose(f,f.release+age).morph,0);
  let previous=1;
  for(let t=launchTime;t<24;t+=.05){const pose=m.flowerPose(f,t);assert(pose.scale>=previous-1e-12&&pose.scale<=1.7);previous=pose.scale;}
  if(f.destination==='moon')assert.equal(m.flowerPose(f,24).scale,1.7,'赴月蝴蝶飞行中逐渐长大');
  for(const edge of [f.release,f.release+f.fallDuration,f.morphAt,f.morphAt+m.MORPH_TIME,f.morphAt+m.MORPH_TIME+f.carryDuration]){
    const a=m.flowerPose(f,edge-.000001),b=m.flowerPose(f,edge+.000001);
    assert(Math.hypot(a.x-b.x,a.y-b.y)<.001,'落花、化蝶、起飞不得跳位置');
    assert(Math.abs(a.morph-b.morph)<.00001&&Math.abs(a.angle-b.angle)<.0001);
  }
  const edge=f.release+f.fallDuration,eps=.00001;
  const before=m.flowerPose(f,edge-eps),at=m.flowerPose(f,edge),after=m.flowerPose(f,edge+eps);
  assert(Math.abs((at.y-before.y)/eps-(after.y-at.y)/eps)<.02,'起飞应延续下落速度');
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
const turnTimes=m.fallingFlowers.map(f=>f.morphAt+m.MORPH_TIME+f.carryDuration);
assert(Math.max(...turnTimes)-Math.min(...turnTimes)>3,'蝶群转向时间必须错开');
let mixed=false;
for(let t=m.IMPACT.start+2;t<m.IMPACT.start+8;t+=.1){
  let up=0,down=0;
  for(const f of m.fallingFlowers){const a=m.flowerPose(f,t),b=m.flowerPose(f,t+.01);if(a.morph<1)continue;if(b.y<a.y-.001)up++;if(b.y>a.y+.001)down++;}
  if(up>8&&down>8)mixed=true;
}
assert(mixed,'应出现部分蝴蝶仍随风向下、部分已转向月亮的交错画面');
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
for(const style of styles){
  const f=m.fallingFlowers.find(f=>f.symbolStyle===style);
  capture=[];sandbox.drawSymbolForTest(context(),f,f.release+.65);
  if(style.endsWith('outline')){
    assert(!capture.includes('fill'),'空心形态及其流光不能填充中间');
    assert(capture.filter(k=>k==='stroke').length>=2,'空心形态的流光沿轮廓绘制');
  }else assert(capture.filter(k=>k==='fill').length>=2,'实心形态叠加移动的表面亮带');
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
assert.equal(sizes.length,13,'背景、月面、完整树与五层叶花缓存');
assert(!soundPlaying,'准备画面时不播放声音');
assert.equal(soundSettings.wind.start,m.BLOOM_END);
assert.equal(soundSettings.cues.length,19,'少量交错轻碰声，不为全部掉落物同时敲铃');
assert.equal(soundSettings.stages.wood.start,0);assert(soundSettings.stages.wood.end<=2.70001);
assert.equal(soundSettings.stages.leaves.start,m.LEAF_START);assert.equal(soundSettings.stages.leaves.end,m.LEAF_END);
for(const event of soundSettings.stages.blooms)assert(event.time>m.LEAF_END&&event.time<m.BLOOM_END);
assert.equal(soundSettings.stages.flights.length,7);assert.equal(soundSettings.stages.stars.length,7);
for(const [i,star] of soundSettings.stages.stars.entries()){
  const f=m.fallingFlowers.filter(f=>f.destination==='star'&&f.starRank%4===0)[i];
  for(let n=0;n<3;n++)assert(m.starAppearance(f,star.first+n*star.period).twinkle>(n===0?0:.99),'星光声音对齐各自亮度峰值');
}

assert(soundSettings.cues.reduce((sum,cue)=>sum+cue.pan,0)<0,'掉落轻碰整体偏向树所在的左侧');
for(const cue of soundSettings.cues){
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
}
button.click();instance.draw();assert.equal(slider.value,'0');now+=24000;instance.draw();assert.equal(slider.value,'2400');assert(looping,'播放结尾保持局部星光');
const endSky=sandbox.skyTimeForTest;now+=1500;instance.draw();
assert.equal(slider.value,'2400');assert(sandbox.skyTimeForTest>endSky+1,'尾声只推进星光时钟');assert(!soundPlaying);
document.hidden=true;events.visibilitychange();const frozenSky=sandbox.skyTimeForTest;now+=50000;
document.hidden=false;events.visibilitychange();instance.draw();assert.equal(sandbox.skyTimeForTest,frozenSky,'后台不累计星光时间');
slider.input();instance.draw();assert(!looping,'拖动到结尾时仍能暂停星光');
reduced=true;media.change();button.click();instance.draw();assert.equal(slider.value,'0');button.click();instance.draw();assert.equal(slider.value,'2400');assert(!looping);
assert(draws>50);assert.deepEqual(errors,[]);assert(!soundPlaying,'减少动态模式不启动音轨');
nodes['#sound'].click();assert(!soundStub.enabled);assert.equal(nodes['#sound'].textContent,'音效：关');
nodes['#sound'].click();assert(soundStub.enabled);assert.equal(nodes['#sound'].textContent,'音效：开');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
assert(html.indexOf('</section>')<html.indexOf('class="controls"'),'播放控件位于主场景外');
assert(!/\.controls\{[^}]*position:absolute/.test(css),'控件不能再叠在画布里');
assert(/aspect-ratio:\s*3\s*\/\s*4/.test(css),'页面容器保持 3:4，与画布比例一致');
for(const [,file] of html.matchAll(/(?:src|href)="([^"]+)"/g)){assert(!file.startsWith('..'));assert(fs.existsSync(path.join(root,file)));}
assert(!/fetch\(|XMLHttpRequest|https?:\/\/|outsideTheWindow|osmanthus\.html/.test(source+html),'新页面必须无原项目和网络依赖');
const snapshot=JSON.stringify(m.fallingFlowers.map(f=>m.flowerPose(f,9.25)));
instance.draw();assert.equal(JSON.stringify(m.fallingFlowers.map(f=>m.flowerPose(f,9.25))),snapshot);
assert(source.includes("bark.addColorStop(.62,'#fff6dc')"),'树干保留象牙白亮面');
const grainColors=[];
for(let y=0;y<64;y++)for(let x=0;x<64;x++)grainColors.push(m.grainPixel(x,y));
for(let channel=0;channel<3;channel++){
  const mean=grainColors.reduce((sum,p)=>sum+p[channel],0)/grainColors.length;
  assert(Math.abs(mean-[25,28,34][channel])<.2,'磨砂底色为略带冷色的炭灰');
}
assert(new Set(grainColors.map(p=>p[0])).size>3,'背景保留细颗粒');
for(const pixel of grainColors)assert(pixel[0]>=22&&pixel[0]<=28&&pixel[1]-pixel[0]===3&&pixel[2]-pixel[0]===9,'颗粒明暗轻微，不产生彩色噪点');
const grainSample=JSON.stringify(m.grainPixel(38,90));m.grainPixel(129,34);
assert.equal(JSON.stringify(m.grainPixel(38,90)),grainSample,'磨砂颗粒固定，不随播放跳动');
assert(!/create(?:Linear|Radial)Gradient/.test(source.split('function buildBackground(){')[1].split('function buildMoon')[0]),'背景没有渐变或雾层');
assert(/\.painting\{[^}]*background:#191c22/.test(css),'主场景与画布使用相同炭灰底色');
assert.equal(textureWrites,2,'月面与磨砂背景各生成一次，播放和回拖不重建');
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
assert(source.includes('const points=moonOutline(progress)'),'主月亮随汇入进度从月牙展开为圆月');
assert(source.includes("f.kind==='moon'"),'掉落物保留独立的月牙绘制');
assert.equal(stopped.filter(f=>m.starAppearance(f,24).bright).length,5,'只有少数较亮星，其余为细小暗星');
for(let i=0;i<m.starStops.length;i++){
  const q=m.starStops[i];assert(q.y>=105&&q.y<=350);
  assert(Math.hypot(q.x-moon.x,q.y-moon.y)>100,'月牙附近留出较疏区域');
  for(let j=0;j<i;j++)assert(Math.hypot(q.x-m.starStops[j].x,q.y-m.starStops[j].y)>16,'途中星星分散落位');
}
// 结尾只有七颗星变化，其他星恒定；相位错开，暂停可还原同一瞬间。
reduced=false;
let changing=0,maxTwinkling=0;
for(const f of stopped){
  const samples=Array.from({length:721},(_,i)=>m.starAppearance(f,24+i/60));
  const alpha=samples.map(v=>v.alpha);
  if(Math.max(...alpha)-Math.min(...alpha)>.01){
    changing++;
    assert(Math.max(...alpha)>.95&&Math.max(...alpha)-Math.min(...alpha)>.4,'局部星光的亮峰与明暗反差清楚可见');
  }
  for(let i=1;i<samples.length;i++)assert(Math.abs(samples[i].alpha-samples[i-1].alpha)<.06,'增强星光仍逐帧平滑明灭');
  const saved=JSON.stringify(m.starAppearance(f,28.4));m.starAppearance(f,60);
  assert.equal(JSON.stringify(m.starAppearance(f,28.4)),saved);
}
assert.equal(changing,7,'只让局部七颗星闪烁');
for(let t=24;t<40;t+=.05)maxTwinkling=Math.max(maxTwinkling,stopped.filter(f=>m.starAppearance(f,t).twinkle>.3).length);
assert(maxTwinkling>0&&maxTwinkling<7,'不同时闪亮');
reduced=true;for(const f of stopped)assert.equal(m.starAppearance(f,30).twinkle,0);reduced=false;
const fullArea=area(m.moonOutline(1));assert(Math.abs(fullArea-Math.PI*moon.r**2)<2);
for(const phase of [0,.05,.25,.5,.75,1]){
  assert(Math.abs(area(m.moonOutline(phase))/fullArea-phase)<1e-10,'月牙轮廓面积应随月相参数连续变化');
}
const seekPhase=m.moonProgress(18);m.moonProgress(24);m.moonProgress(0);assert.equal(m.moonProgress(18),seekPhase);
assert.equal(m.moonProgress(0),0,'重播必须恢复无月夜空');
console.log('通过：11 种掉落形态、空心通透与轮廓流光、流光移动及暂停重播一致、掉落物与化蝶尺寸匹配、化形后平滑振翅、掉落月牙与主月亮由缺至圆、疏密与明暗分层的星空、细磨砂炭灰场景、暖金月面纹理与一次缓存、三种放大掉落物、28 蝶途中停驻化星、84 蝶实际入月与月相分流、独立三比四取景与外置控件、新增 1470 朵叶腋金花及间距、从右上往左下偏动与树干幅度、落花平滑放大、短促反光连续性与固定节奏、反光数量控制、原桂花完整结构与时序、左下等比缩放、银色叶片与分层疏叶、112 个真实落花来源、短促震动同步落花、离枝衔接、蝶群交错转向、落花化蝶连续性、抵月消融驱动月牙变圆、月相连续与重播复位、49 个进度位置、缓存、暂停重播、后台停播、减少动态效果及本地资源。');
console.log('未启动服务器、操作浏览器或截图；视觉效果由人工刷新验收。');
