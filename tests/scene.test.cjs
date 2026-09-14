'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
let now=0,instance,looping=true,reduced=false,draws=0,capture=null;
const nodes={},events={},errors=[],sizes=[];
const document={hidden:false,querySelector(id){return nodes[id]??={value:'0',disabled:true,textContent:'',setAttribute(){},addEventListener(name,fn){this[name]=fn;}};},addEventListener(name,fn){events[name]=fn;}};
const media={get matches(){return reduced;},addEventListener(name,fn){this[name]=fn;}};
function context(){
  const stack=[];
  const raw={globalAlpha:1,save(){stack.push(this.globalAlpha);},restore(){assert(stack.length);this.globalAlpha=stack.pop();},
    createLinearGradient(){return{addColorStop(at,color){assert(at>=0&&at<=1&&typeof color==='string');}};},
    createRadialGradient(){return this.createLinearGradient();}};
  return new Proxy(raw,{get(target,key){return target[key]??((...args)=>{if(capture)capture.push(key);for(const n of args)if(typeof n==='number')assert(Number.isFinite(n),`${key} 必须使用有效坐标`);});},set(target,key,value){if(key==='globalAlpha')assert(value>=0&&value<=1);target[key]=value;return true;}});
}
const sandbox={document,window:{devicePixelRatio:2},matchMedia:()=>media,performance:{now:()=>now},console:{error:e=>errors.push(e)},
  p5:function(callback){instance={drawingContext:context(),pixelDensity(n){assert(n>=2);},createCanvas(w,h){assert.equal(w/h,.75);return{parent(){}};},
    frameRate(){},createGraphics(w,h){sizes.push([w,h]);return{drawingContext:context(),pixelDensity(n){assert(n>=2);}};},
    image(){draws++;},loop(){looping=true;},noLoop(){looping=false;}};callback(instance);}};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'tree-data.js'),'utf8'),sandbox);
const source=fs.readFileSync(path.join(root,'scene.js'),'utf8');
vm.runInContext(source.replace('new p5(p=>{','globalThis.model={curve,branchProgress,leafProgress,flowerProgress,flowerPose,fallingFlowers,toScreen,PLACEMENT,phaseAt,LEAF_START,LEAF_END,BLOOM_END,DURATION,TREE_END,MORPH_TIME,WIND,windState,leafColor,visibleLeaves,moonArrivals,moonContribution,moonProgress,moonOutline,treeShake,attachedPoint,IMPACT,windGuide};\nnew p5(p=>{').replace('  function render(t){','  globalThis.drawWindForTest=drawWind;\n  function render(t){'),sandbox);
const {branches,leaves,flowers,moon}=sandbox.NightTreeData,m=sandbox.model;
assert.equal(branches.length,2017);assert.equal(leaves.length,4042);assert.equal(flowers.length,4202);
const original={
  branches:branches.map(b=>[b.x,b.y,b.cx,b.cy,b.dx,b.dy,b.ex,b.ey,b.width,b.endWidth,b.parent,b.start,b.duration]),
  leaves:leaves.map(l=>[l.x,l.y,l.branch,l.at,l.angle,l.length,l.breadth,l.bend,l.foreshorten,l.layer,l.start,l.duration]),
  flowers:flowers.map(f=>[f.x,f.y,f.branch,f.at,f.size,f.start,f.duration,f.budAt,f.maxOpen,f.layer])
};
assert.equal(crypto.createHash('sha256').update(JSON.stringify(original)).digest('hex'),
  '2402240c9cdcce5c0e877c28cc6a5b693ac5ba4db693a38f51c99466881a2f3f','完整原桂花的枝叶、花位、粗细和时序不能改变');
assert.equal(m.PLACEMENT.scale,.6);
assert.equal(m.windState(m.WIND.start,200).strength,0);
assert.equal(m.windState(m.WIND.end,200).strength,0);
assert(m.windState(10,200,520).strength>m.windState(10,200,750).strength,'风由上往下经过');
assert(m.windState(11,100).centerX<m.windState(10,100).centerX,'风随下落向左偏移');
assert(m.visibleLeaves.length>2800&&m.visibleLeaves.length<2860,'显示叶片减少约三成');
for(let layer=0;layer<5;layer++){
  const ratio=m.visibleLeaves.filter(l=>l.layer===layer).length/leaves.filter(l=>l.layer===layer).length;
  assert(ratio>.68&&ratio<.72,'各层均匀疏叶');
}
for(const leaf of m.visibleLeaves){const rgb=m.leafColor(leaf).match(/\d+/g).map(Number);assert(Math.max(...rgb)-Math.min(...rgb)<20&&Math.min(...rgb)>=104,'银色叶片保持低饱和与明暗');}


assert.deepEqual(JSON.parse(JSON.stringify(m.toScreen({x:360,y:745}))),{x:225,y:770});
assert.equal(branches.filter(b=>b.parent<0).length,1);
for(const b of branches){
  assert.equal(m.branchProgress(b,0),0);assert(b.start+b.duration<=2.70001);
  if(b.parent>=0){const parent=branches[b.parent];assert.equal(b.x,parent.ex);assert.equal(b.y,parent.ey);assert(b.start>=parent.start+parent.duration-.00002);}
  for(let t=0;t<=1;t+=.1){const q=m.toScreen(m.curve(b,t));assert(q.x>0&&q.x<450&&q.y>290&&q.y<=771,'完整树应置于左下方');}
}
assert(branches.some(b=>m.branchProgress(b,m.LEAF_START)<1),'叶片应在树枝接近长成时开始出现');
for(const leaf of leaves){
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
  const original=flowers[f.sourceIndex];assert.equal(f.x,original.x);assert.equal(f.y,original.y);assert.equal(f.size,original.size);
  assert(f.release>=8&&f.release<=12.1);
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
  assert.equal(m.flowerPose(f,24).scale,1.7,'蝴蝶飞行中逐渐长大');
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
  const end=m.flowerPose(f,24),q=m.toScreen(end);assert.equal(end.opacity,0);assert.equal(end.flight,1);
  assert(Math.hypot(q.x-moon.x,q.y-moon.y)<moon.r,'移动树后，蝴蝶仍需抵达月面');
}
const turnTimes=m.fallingFlowers.map(f=>f.morphAt+m.MORPH_TIME+f.carryDuration);
assert(Math.max(...turnTimes)-Math.min(...turnTimes)>3,'蝶群转向时间必须错开');
let mixed=false;
for(let t=11;t<16;t+=.1){
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
assert(largest>.004&&largest<.014,'只有一次轻微、可见的短促震动');
capture=[];sandbox.drawWindForTest(9);
assert.equal(capture.filter(n=>n==='moveTo').length,1);assert.equal(capture.filter(n=>n==='bezierCurveTo').length,1);assert.equal(capture.filter(n=>n==='stroke').length,1,'风只画一条指示线');capture=null;
instance.setup();instance.draw();assert.deepEqual(errors,[]);assert(!looping);assert(!nodes['#play'].disabled);
assert.equal(sizes.length,12,'背景、完整树与五层叶花缓存');
const button=nodes['#play'],slider=nodes['#progress'],readout=nodes['#time'];
button.click();instance.draw();now=2500;instance.draw();assert.equal(slider.value,'250');
button.click();instance.draw();const paused=readout.textContent;now+=6000;instance.draw();assert.equal(readout.textContent,paused);
button.click();instance.draw();now+=1000;instance.draw();assert.equal(slider.value,'350');
document.hidden=true;events.visibilitychange();now+=90000;assert(!looping);document.hidden=false;events.visibilitychange();instance.draw();assert.equal(slider.value,'350');
for(let step=0;step<=48;step++){
  slider.value=String(step*50);slider.input();instance.draw();
  assert(readout.textContent.startsWith((step*.5).toFixed(2)),'拖动、暂停和秒数须一致');assert(!looping);
}
button.click();instance.draw();assert.equal(slider.value,'0');now+=24000;instance.draw();assert.equal(slider.value,'2400');assert(!looping);
reduced=true;media.change();button.click();instance.draw();assert.equal(slider.value,'0');button.click();instance.draw();assert.equal(slider.value,'2400');assert(!looping);
assert(draws>50);assert.deepEqual(errors,[]);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const [,file] of html.matchAll(/(?:src|href)="([^"]+)"/g)){assert(!file.startsWith('..'));assert(fs.existsSync(path.join(root,file)));}
assert(!/fetch\(|XMLHttpRequest|https?:\/\/|outsideTheWindow|osmanthus\.html/.test(source+html),'新页面必须无原项目和网络依赖');
const snapshot=JSON.stringify(m.fallingFlowers.map(f=>m.flowerPose(f,9.25)));
instance.draw();assert.equal(JSON.stringify(m.fallingFlowers.map(f=>m.flowerPose(f,9.25))),snapshot);
assert(source.includes("ctx.fillStyle='#ffffff'"),'树干和枝条使用纯白');
assert(!/叶落成蝶|leafPose|leaf\.release/.test(source+html),'叶片不再参与脱落和化蝶');
assert(html.includes('max="2400"'));assert(!html.includes('<header'));
assert(!/moon\.png|<img/.test(html),'月相完全由代码绘制，不再使用月亮贴图');
const firstArrival=Math.min(...[...m.moonArrivals.values()].map(a=>a.start));
assert.equal(m.moonProgress(0),0);assert.equal(m.moonProgress(firstArrival),0,'没有蝴蝶抵达前不能出现月亮');
assert.equal(m.moonProgress(m.DURATION),1,'蝶群全部抵达后必须成为满月');
for(const f of m.fallingFlowers){
  const arrival=m.moonArrivals.get(f.sourceIndex);
  const q=m.toScreen(m.flowerPose(f,arrival.start));
  assert(Math.abs(Math.hypot(q.x-moon.x,q.y-moon.y)-moon.r)<1e-5,'蝶群实际进入月面后才开始化光');
  assert.equal(m.flowerPose(f,arrival.start).opacity,1);
  const mid=(arrival.start+arrival.end)/2;
  assert(Math.abs(m.moonContribution(f,mid)-.5)<1e-10);
  assert(Math.abs(m.flowerPose(f,mid).opacity-.5)<1e-10,'蝶的消融和月相增加使用同一进度');
  assert.equal(m.moonContribution(f,arrival.end),1);
}
let previousMoon=0;const stages=new Set();
for(let t=0;t<=24;t+=.02){
  const phase=m.moonProgress(t);assert(phase>=previousMoon-1e-12&&phase<=1);
  assert(phase-previousMoon<.03,'月相变化不得跳跃');previousMoon=phase;
  if(phase>0&&phase<.2)stages.add('月牙');if(phase>.45&&phase<.55)stages.add('半月');if(phase>.8)stages.add('盈月');
}
assert.equal(stages.size,3);
const area=points=>Math.abs(points.reduce((sum,p,i)=>{const n=points[(i+1)%points.length];return sum+p.x*n.y-n.x*p.y;},0)/2);
const fullArea=area(m.moonOutline(1));assert(Math.abs(fullArea-Math.PI*moon.r**2)<2);
for(const phase of [0,.05,.25,.5,.75,1]){
  assert(Math.abs(area(m.moonOutline(phase))/fullArea-phase)<1e-10,'月牙到满月应通过明暗交界展开，不能整圆淡入');
}
const seekPhase=m.moonProgress(18);m.moonProgress(24);m.moonProgress(0);assert.equal(m.moonProgress(18),seekPhase);
assert.equal(m.moonProgress(0),0,'重播必须恢复无月夜空');
console.log('通过：原桂花完整结构与时序、左下等比缩放、银色叶片与分层疏叶、112 个真实落花来源、单条风线、短促震动同步落花、离枝衔接、蝶群交错转向、落花化蝶连续性、抵月消融驱动月牙至满月、月相连续与重播复位、49 个进度位置、缓存、暂停重播、后台停播、减少动态效果及本地资源。');
console.log('未启动服务器、操作浏览器或截图；视觉效果由人工刷新验收。');
