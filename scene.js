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
// 主画面独立取景：去掉原来给控件预留的空白，再等比映射到 3:4 画布。
const VIEW={width:640,height:640*4/3,scale:720/640};
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
const readout=document.querySelector('#time'),status=document.querySelector('#status'),soundButton=document.querySelector('#sound');
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
const WIND={start:BLOOM_END,end:BLOOM_END+5.5,speed:82,origin:405,width:145};
function windState(t,x,y=680){
  const front=WIND.origin+(t-WIND.start)*WIND.speed,centerX=300-(front-WIND.origin)*.34;
  const envelope=smooth((t-WIND.start)/.35)*(1-smooth((t-(WIND.end-.6))/.6));
  const strength=Math.exp(-(((y-front)/WIND.width)**2)-(((x-centerX)/340)**2))*envelope;
  return {front,centerX,envelope,strength};
}
const IMPACT={start:WIND.start+.16,duration:.7};
function treeShake(t){
  if(t<=IMPACT.start||t>=IMPACT.start+IMPACT.duration)return 0;
  const u=(t-IMPACT.start)/IMPACT.duration;
  return .012*smooth(u/.32)*(1-smooth((u-.32)/.68));
}
function attachedPoint(f,t){
  const bend=treeShake(t),height=f.y-PLACEMENT.rootY;
  return {x:f.x+bend*height,y:f.y-bend*.55*height};
}
function leafColor(leaf){
  const rgb=leaf.tint.match(/\d+/g).map(Number),shade=clamp((rgb[0]+rgb[1]+rgb[2]-160)/360);
  const light=clamp(shade*.25+leaf.light*.55+leaf.layer/4*.2);
  // 暖白亮面、灰银背面；金花保留自己的黄色，不把整棵树染成蓝白。
  const silver=[108,119,130],pale=[205,207,199],white=[255,248,226];
  const from=light<.55?silver:pale,to=light<.55?pale:white;
  const amount=light<.55?smooth((light-.2)/.35):smooth((light-.55)/.45);
  return `rgb(${from.map((v,i)=>Math.round(mix(v,to[i],amount))).join(',')})`;
}
// 独立补花：已有枝叶、花位不动，优先使用尚未开花的真实叶腋。
const extraFlowers=(()=>{
  const target=1470,added=[],occupied=new Map(),groups=new Map();
  const key=(x,y)=>`${Math.floor(x/3)}:${Math.floor(y/3)}`;
  const insert=f=>{const k=key(f.x,f.y);if(!occupied.has(k))occupied.set(k,[]);occupied.get(k).push(f);};
  const clear=(x,y)=>{
    const cx=Math.floor(x/3),cy=Math.floor(y/3);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)
      for(const f of occupied.get(`${cx+dx}:${cy+dy}`)||[])
        if(Math.hypot(f.x-x,f.y-y)<2.5)return false;
    return true;
  };
  for(const f of flowers){insert(f);const k=`${f.layer}:${f.volume}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(f);}
  const used=new Set(flowers.map(f=>`${f.node}:${f.side}`));
  const rank=l=>(Math.imul(l.sourceIndex+1,2654435761)>>>0);
  const candidates=[...visibleLeaves].sort((a,b)=>
    Number(used.has(`${a.node}:${a.side}`))-Number(used.has(`${b.node}:${b.side}`))||rank(a)-rank(b));
  for(const leaf of candidates){
    const donors=groups.get(`${leaf.layer}:${leaf.volume}`);if(!donors)continue;
    const donor=donors[rank(leaf)%donors.length],seed=rank(leaf)/4294967296;
    for(let i=0;i<6&&added.length<target;i++){
      const angle=seed*Math.PI*2+i*2.39996,r=5+Math.sqrt(i/5)*8;
      const x=leaf.x+Math.cos(angle)*r,y=leaf.y+Math.sin(angle)*r;
      if(!clear(x,y))continue;
      const f={...donor,x,y,anchor:{x:leaf.x,y:leaf.y},node:leaf.node,side:leaf.side,
        branch:leaf.branch,at:leaf.at,layer:leaf.layer,volume:leaf.volume,z:leaf.z,
        extra:true,sourceLeaf:leaf.sourceIndex,rotation:angle,phase:seed*Math.PI*2,
        // 同一枝组使用原开花时间，补花不延长盛放时间。
        palette:i%3};
      added.push(f);insert(f);
    }
    if(added.length===target)break;
  }
  return added;
})();
const canopyFlowers=[...flowers,...extraFlowers];
// 从枝叶间落下月牙、星星和银叶副本，原树保持茂盛。
const fallingFlowers=Array.from({length:112},(_,i)=>{
  const sourceIndex=(i*37)%flowers.length,original=flowers[sourceIndex],kind=['moon','star','leaf'][i%3];
  const variantIndex=Math.floor(i/3);
  const symbolStyle=kind==='star'?['five-solid','five-outline','four-solid','four-outline','cross','cross-diagonal'][variantIndex%6]
    :kind==='moon'?['crescent-solid','crescent-outline','slim-solid','slim-outline'][variantIndex%4]:'leaf-solid';
  const sourceLeaf=kind==='leaf'?visibleLeaves.reduce((best,l)=>
    Math.hypot(l.x-original.x,l.y-original.y)<Math.hypot(best.x-original.x,best.y-original.y)?l:best):null;
  const f={...original,...(sourceLeaf?{x:sourceLeaf.x,y:sourceLeaf.y}:{} )},source=toScreen(f);
  const landingY=675+(i%7)*6,fallDuration=(2+(landingY-source.y)/210)*.48;
  const release=IMPACT.start+i/111*3.3,morphAt=release+fallDuration;
  const windAt=release,origin=attachedPoint(f,release);
  const force=windState((windAt+morphAt)/2,source.x,(source.y+landingY)/2).strength;
  const drift=Math.max(0,Math.min((toScreen(origin).x-22)/PLACEMENT.scale,105*(.3+.7*force)));
  const end={x:origin.x-drift,y:(landingY-PLACEMENT.y)/PLACEMENT.scale+PLACEMENT.rootY};
  const sweep=Math.min(32,Math.max(2,(toScreen(end).x-10)/PLACEMENT.scale*.3));
  return {...f,sourceIndex,kind,symbolStyle,sourceLeaf:sourceLeaf?.sourceIndex??null,destination:i%4===0?'star':'moon',
    starRank:Math.floor(i/4),stopFraction:.5+((i*73)%113)/113*.32,release,color:i%4,wingSize:13+(i%5),origin,end,fallDuration,morphAt,windAt,drift,sweep,
    carryDuration:.6+(i%9)*.095,flightDuration:4.5+(i%11)*.16};
});
function starTiming(f){
  const stop=f.morphAt+MORPH_TIME+f.carryDuration+f.flightDuration*f.stopFraction;
  return {brakeAt:stop-.8,settleAt:stop+.8};
}
function flowerMotion(f,time){
  if(f.destination==='star'){
    const {brakeAt,settleAt}=starTiming(f);
    if(time>brakeAt){
      const span=settleAt-brakeAt,u=clamp((time-brakeAt)/span);
      // 沿原飞行路线上逐渐减速，停在途中，不突然截断位置。
      time=brakeAt+span*(u-u*u*.5);
    }
  }
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
// 从各自飞行路线上挑停驻位置：疏密错落，避开月牙和树冠，互不扎堆。
const starStops=[];
for(const f of fallingFlowers.filter(f=>f.destination==='star')){
  const preferred=f.stopFraction;let best=preferred,bestScore=-Infinity;
  for(let i=0;i<49;i++){
    f.stopFraction=.43+i/48*.48;
    const q=toScreen(flowerMotion(f,24));
    if(q.y<105||q.y>350||q.x<140||q.x>555||Math.hypot(q.x-moon.x,q.y-moon.y)<105)continue;
    const distance=starStops.length?Math.min(...starStops.map(s=>Math.hypot(q.x-s.x,q.y-s.y))):60;
    const score=distance-Math.abs(f.stopFraction-preferred)*20;
    if(score>bestScore){bestScore=score;best=f.stopFraction;}
  }
  f.stopFraction=best;starStops.push(toScreen(flowerMotion(f,24)));
}
function starAppearance(f,t){
  const bright=f.starRank%6===0,seed=((f.sourceIndex*2654435761)>>>0)/4294967296;
  const q=starStops[f.starRank],near=1-clamp((Math.hypot(q.x-moon.x,q.y-moon.y)-100)/240);
  // 只选七颗局部星星，错开明灭；其余星位、大小和亮度固定。
  const period=3.6+seed*2.4,phase=((t-18+seed*period)%period+period)%period;
  const twinkle=reduced.matches||f.starRank%4!==0?0:
    smooth((t-18)/1.2)*smooth(phase/.45)*(1-smooth((phase-.45)/.85));
  const shimmer=f.starRank%4===0&&!reduced.matches?.64+.36*twinkle:1;
  return {radius:(bright?1.35+seed*.45:.55+seed*.5)*(1+.22*twinkle),
    alpha:(bright?.92:.3+seed*.25)*(1-.22*near*moonProgress(t))*shimmer,bright,twinkle};
}
function insideMoon(q){
  return Math.hypot(q.x-moon.x,q.y-moon.y)<=moon.r;
}
// 只放大离枝副本；短促反光使用固定相位，暂停和回拖时姿态一致。
const GLINT={attack:.035,fadeAt:.08,fade:.18,radius:22,core:.8,width:.65};
function fallingSize(f){
  const symbolSpan=f.size*.55*(f.kind==='leaf'?2.35:2);
  return f.wingSize*.64*1.68/symbolSpan;
}
function butterflySpread(f,t){
  const flap=.22+.78*(.5+.5*Math.sin(t*11+f.phase));
  // 化形时先保持相近的外轮廓，完成后再平滑进入振翅。
  return mix(.84,flap,smooth((t-f.morphAt-MORPH_TIME)/.45));
}
// 表面亮边与白色闪点共享一次反射，先掠过亮边，再达到短促峰值。
function reflectionCycle(f,t){
  const seed=((f.sourceIndex*2246822519)>>>0)/4294967296;
  const age=t-f.release-.12-seed*.26,period=2.9+seed*1.6;
  return age<0?-1:age%period;
}
function fallingAppearance(f,t){
  const phase=reflectionCycle(f,t)-.52;
  const peak=f.sourceIndex%4===0?1:.12;
  const glint=phase<0?0:peak*smooth(phase/GLINT.attack)*(1-smooth((phase-GLINT.fadeAt)/GLINT.fade));
  return {size:mix(1,fallingSize(f),smooth((t-f.release)/.3)),glint:reduced.matches?0:glint};
}
function flowingLight(f,t){
  const phase=reflectionCycle(f,t);
  const alpha=phase<0?0:smooth(phase/.16)*(1-smooth((phase-.65)/.35));
  return {position:mix(-1.7,1.7,clamp(phase)),alpha:reduced.matches?0:alpha};
}
// 月面明暗使用 NASA 正面月貌数据；满月以反射率差异为主，不叠随机坑洞阴影。
function lunarPixel(x,y){
  const rr=x*x+y*y;if(rr>=1)return [0,0,0,0];
  const map=globalThis.NightMoonMap,n=map.size;
  const px=clamp((x+1)/2)*(n-1),py=clamp((y+1)/2)*(n-1);
  const ix=Math.floor(px),iy=Math.floor(py),jx=Math.min(n-1,ix+1),jy=Math.min(n-1,iy+1);
  const at=(a,b)=>map.values[b*n+a]/255;
  const tone=mix(mix(at(ix,iy),at(jx,iy),px-ix),mix(at(ix,jy),at(jx,jy),px-ix),py-iy);
  const dark=[176,168,149],light=[255,247,218];
  return [...dark.map((v,i)=>Math.round(mix(v,light[i],tone))),Math.round(255*clamp((1-Math.sqrt(rr))*192))];
}
// 根据每只蝴蝶进入未来月面的位置求抵达区间，不用独立计时器播放月相。
const moonTravelers=fallingFlowers.filter(f=>f.destination==='moon');
const moonArrivals=new Map(moonTravelers.map(f=>{
  const end=f.morphAt+MORPH_TIME+f.carryDuration+f.flightDuration;
  let lo=end-f.flightDuration,hi=end;
  for(let i=0;i<36;i++){
    const mid=(lo+hi)/2,q=toScreen(flowerMotion(f,mid));
    if(!insideMoon(q))lo=mid;else hi=mid;
  }
  return [f.sourceIndex,{start:hi,end}];
}));
function moonContribution(f,t){
  const arrival=moonArrivals.get(f.sourceIndex);if(!arrival)return 0;
  return smooth((t-arrival.start)/(arrival.end-arrival.start));
}
function flowerPose(f,t){
  const pose=flowerMotion(f,t);
  const star=f.destination==='star'?smooth((t-starTiming(f).settleAt)/.75):0;
  return {...pose,star,angle:mix(pose.angle,0,star),opacity:pose.opacity*(1-moonContribution(f,t))};
}
function moonProgress(t){
  return moonTravelers.reduce((sum,f)=>sum+moonContribution(f,t),0)/moonTravelers.length;
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
function grainPixel(x,y){
  let n=Math.imul(x+173,374761393)^Math.imul(y+719,668265263);
  n=Math.imul(n^(n>>>13),1274126177);const grain=((n>>>0)/4294967296-.5)*22;
  return [Math.round(36+grain*.9),Math.round(79+grain*.85),Math.round(241+grain*.7),255];
}
function phaseAt(t){
  const phase=moonProgress(t);
  if(phase>=1)return '满月 · 星光留在途中';
  if(phase>0)return phase<.5?'蝶入月光 · 月牙渐盈':'蝶入月光 · 渐成满月';
  return t===0?'夜色':t<LEAF_START?'桂树生长':t<LEAF_END?'桂叶舒展':t<BLOOM_END?'桂花开放':t<Math.min(...fallingFlowers.map(f=>f.release))?'满树桂花':t<WIND.start?'桂花飘落':t<WIND.end?'风过 · 花落成蝶':t<22?'群蝶赴月':'月下归静';
}

const soundStages={
  wood:{start:0,end:Math.max(...branches.map(b=>b.start+b.duration))},
  leaves:{start:LEAF_START,end:LEAF_END},
  blooms:(()=>{
    const ordered=[...flowers].sort((a,b)=>a.start+a.duration*.4-b.start-b.duration*.4);
    return Array.from({length:11},(_,i)=>{
      const f=ordered[Math.floor(i*(ordered.length-1)/10)],q=toScreen(f);
      return {time:f.start+FLOWER_DELAY+f.duration*.4,pan:(q.x/VIEW.width-.5)*1.4};
    });
  })(),
  flights:fallingFlowers.filter((_,i)=>i%16===0).map(f=>({
    start:f.morphAt+MORPH_TIME,
    end:f.destination==='star'?starTiming(f).settleAt:moonArrivals.get(f.sourceIndex).end,
    phase:f.phase,panFrom:-.6,panTo:f.destination==='star'?.1:.65
  })),
  stars:fallingFlowers.filter(f=>f.destination==='star'&&f.starRank%4===0).map(f=>{
    const seed=((f.sourceIndex*2654435761)>>>0)/4294967296,period=3.6+seed*2.4;
    let first=18-seed*period+.45;
    while(first<Math.max(18,starTiming(f).settleAt+.75))first+=period;
    return {first,period,pan:(starStops[f.starRank].x/VIEW.width-.5)*1.4,note:f.starRank%5};
  })
};
new p5(p=>{
  let background,treeCache,moonCache,ready=false,time=0,last=null,state='ready',finaleTime=0;
  let canopy=[];
  // 轻碰声绑定正在下落的物体，留出呼吸感，不为每一朵同时敲铃。
  const sound=globalThis.NightTreeSound?.create({duration:DURATION,wind:WIND,stages:soundStages,
    cues:fallingFlowers.filter((_,i)=>i%6===0).map(f=>{
      const time=f.release+f.fallDuration*.35,q=toScreen(flowerPose(f,time));
      return {time,pan:(q.x/VIEW.width-.5)*1.4};
    }),onUnavailable:()=>{soundButton.disabled=true;soundButton.textContent='音效不可用';soundButton.setAttribute('aria-label','浏览器无法播放音效，画面仍可播放');}});
  function syncSound(){
    if(state==='playing'&&!document.hidden&&!reduced.matches)sound?.play(time);else sound?.stop();
  }
  function pauseSound(){time=sound?.position(time)??time;sound?.stop();}
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
    const normal=direction(b,0)+Math.PI/2,half=Math.max(1,b.width*.5);
    const bark=ctx.createLinearGradient(b.x-Math.cos(normal)*half,b.y-Math.sin(normal)*half,
      b.x+Math.cos(normal)*half,b.y+Math.sin(normal)*half);
    bark.addColorStop(0,'#9b9d97');bark.addColorStop(.35,'#d9d2ba');
    bark.addColorStop(.62,'#fff6dc');bark.addColorStop(1,'#b5b5ab');
    ctx.fillStyle=bark;ctx.beginPath();ctx.moveTo(left[0].x,left[0].y);trace(left);
    const tip=curve(b,amount);ctx.quadraticCurveTo(tip.x,tip.y,right[count].x,right[count].y);
    trace(right.reverse());ctx.closePath();ctx.fill();
    const parent=b.parent>=0?branches[b.parent]:null;
    const radius=(parent?parent.r1:b.r0)*smooth(amount/.15);
    ctx.beginPath();ctx.arc(b.x,b.y,Math.max(.02,radius),0,Math.PI*2);ctx.fill();
  }
  function buildBackground(){
    const ctx=background.drawingContext,w=Math.floor(W*density),h=Math.floor(H*density);
    const pixels=ctx.createImageData(w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)pixels.data.set(grainPixel(x,y),(y*w+x)*4);
    ctx.putImageData(pixels,0,0);
  }
  function buildMoon(){
    // 只在初始化生成一次；密度独立固定，缩到月面时仍保留细小明暗。
    moonCache=p.createGraphics(192,192);moonCache.pixelDensity(2);
    const ctx=moonCache.drawingContext,pixels=ctx.createImageData(384,384);
    for(let y=0;y<384;y++)for(let x=0;x<384;x++)
      pixels.data.set(lunarPixel((x+.5)/192-1,(y+.5)/192-1),(y*384+x)*4);
    ctx.putImageData(pixels,0,0);
  }
  function drawMoon(t){
    const progress=moonProgress(t);if(progress<=0)return;
    const ctx=p.drawingContext;ctx.save();ctx.translate(moon.x,moon.y);
    const points=moonOutline(progress);
    // 暗面仅是隐约的蓝灰球体，亮面仍沿月相边界展开，不以整圆淡入代替。
    const dark=ctx.createRadialGradient(-moon.r*.3,-moon.r*.3,0,0,0,moon.r);
    dark.addColorStop(0,'#283342');dark.addColorStop(1,'#141e2c');
    ctx.globalAlpha=smooth(progress/.08)*.7;ctx.fillStyle=dark;
    ctx.beginPath();ctx.arc(0,0,moon.r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.save();ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
    ctx.closePath();ctx.clip();p.image(moonCache,-moon.r,-moon.r,moon.r*2,moon.r*2);
    // 沿弯曲明暗交界逐层加深，满月时退出，避免月牙内缘像硬切纸片。
    const softness=.055*Math.sin(Math.PI*progress);
    for(let j=0;j<10;j++){
      const inner=moonOutline(Math.max(0,progress-softness*(j+1)/10));
      ctx.beginPath();ctx.moveTo(points[points.length-1].x,points[points.length-1].y);
      for(let i=points.length-1;i>=81;i--)ctx.lineTo(points[i].x,points[i].y);
      for(let i=81;i<inner.length;i++)ctx.lineTo(inner[i].x,inner[i].y);
      ctx.closePath();ctx.fillStyle='rgba(94,72,40,.045)';ctx.fill();
    }
    ctx.restore();ctx.restore();
  }
  const wingColors=['#bc862c','#8996a6','#b08a49','#a6a99f'];
  function leafShape(ctx,leaf){
    const n=leaf.size,w=leaf.breadth,bend=leaf.bend*n;
    ctx.beginPath();ctx.moveTo(0,0);
    ctx.bezierCurveTo(n*.20,-n*w,n*.73,-n*w+bend,n,bend);
    ctx.bezierCurveTo(n*.71,n*w+bend,n*.22,n*w*.85,0,0);ctx.fill();
  }
  function drawButterfly(ctx,leaf,t,morph){
    const n=leaf.wingSize*.64,flap=butterflySpread(leaf,t);
    ctx.save();ctx.scale(flap,1);
    for(const side of [-1,1]){
      ctx.save();ctx.scale(side,1);
      const reflection=ctx.createLinearGradient(0,n*.3,n,-n*.65);
      reflection.addColorStop(0,wingColors[leaf.color]);
      const sheen=.32+.34*(.5+.5*Math.sin(t*11+leaf.phase+side*.6));
      reflection.addColorStop(sheen,leaf.color%2?'#ecece1':'#f8cf65');
      reflection.addColorStop(Math.min(.94,sheen+.16),leaf.color%2?'#fff9e9':'#fff1bd');
      reflection.addColorStop(1,leaf.color%2?'#9da8b6':'#c39440');
      ctx.fillStyle=reflection;
      ctx.beginPath();ctx.moveTo(0,0);
      ctx.bezierCurveTo(n*.15,-n*.65,n*.98,-n*.86,n,-n*.28);
      ctx.bezierCurveTo(n*1.04,n*.12,n*.43,n*.18,0,n*.08);ctx.fill();paintFlow(ctx,leaf,t,n);
      ctx.globalAlpha*=.8;ctx.beginPath();ctx.moveTo(0,n*.06);
      ctx.bezierCurveTo(n*.65,n*.05,n*.86,n*.57,n*.46,n*.64);
      ctx.bezierCurveTo(n*.17,n*.67,n*.06,n*.34,0,n*.06);ctx.fill();paintFlow(ctx,leaf,t,n);ctx.restore();
    }
    ctx.restore();ctx.strokeStyle=leaf.color%2?'#e6edf6':'#f7e8bc';ctx.lineWidth=.7;
    ctx.beginPath();ctx.moveTo(0,-n*.21);ctx.quadraticCurveTo(-.7,n*.12,0,n*.43);ctx.stroke();
  }
  function drawLeaf(leaf,t,surface=p){
    const amount=smooth(leafProgress(leaf,t));if(amount<=0)return;
    const ctx=surface.drawingContext;ctx.save();ctx.translate(leaf.x,leaf.y);ctx.rotate(leaf.angle);
    ctx.scale(amount,amount*leaf.foreshorten);
    const color=leafColor(leaf),n=leaf.size;
    const fold=ctx.createLinearGradient(0,-n*leaf.breadth,0,n*leaf.breadth);
    fold.addColorStop(0,color);fold.addColorStop(.48,color);
    fold.addColorStop(.52,leaf.light>.5?'#fff3d5':'#c1c6c4');fold.addColorStop(1,color);
    ctx.fillStyle=fold;leafShape(ctx,leaf);
    ctx.globalAlpha*=.28;ctx.strokeStyle='#f9f0d8';ctx.lineWidth=.35;
    ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(n*.5,leaf.bend*n*.38,n,leaf.bend*n);ctx.stroke();ctx.restore();
  }
  function flowerShape(ctx,f,progress,falling=false){
    if(progress<=0)return;
    const appear=smooth(progress/.14),open=smooth((progress-.22)/.78);
    ctx.save();const scale=f.size*1.2/64*appear;ctx.scale(scale,scale);
    ctx.rotate(f.variant*.29);ctx.scale(1,[1,.82,.64,.91][f.variant]);
    ctx.fillStyle=['#f7bd38','#ffdb76','#dca236'][f.palette];
    if(falling){
      const gold=ctx.createLinearGradient(-18,18,18,-18);
      gold.addColorStop(0,'#dc8700');gold.addColorStop(.32,'#ffb900');
      gold.addColorStop(.72,'#ffda16');gold.addColorStop(1,'#fff078');
      ctx.fillStyle=gold;
    }
    if(open<.3){ctx.save();ctx.globalAlpha*=1-open/.3;ctx.beginPath();ctx.ellipse(0,0,5,6.5,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    for(let i=0;i<4;i++){
      const unfurl=smooth((progress-.22-i*.018)/(.78-i*.018));
      if(unfurl<=0)continue;
      const n=mix(6,23,unfurl),w=mix(1,8,unfurl);ctx.save();ctx.rotate(i*Math.PI/2);
      const gold=ctx.createLinearGradient(0,0,n,w);
      gold.addColorStop(0,'#c28a2e');gold.addColorStop(.36,['#f7bd38','#ffcf57','#eab044'][f.palette]);
      gold.addColorStop(1,(i+f.variant)%3===0?'#fff8df':'#ffe291');ctx.fillStyle=gold;
      ctx.beginPath();ctx.moveTo(1,-2);ctx.bezierCurveTo(n*.48,-w,n*.96,-w,n,0);
      ctx.bezierCurveTo(n*.96,w,n*.48,w,1,2);ctx.closePath();ctx.fill();ctx.restore();
    }
    ctx.fillStyle=falling?'#b87300':'#887044';ctx.beginPath();ctx.ellipse(0,0,2.6,2.4,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function drawFlower(ctx,f,t){
    ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.rotation);
    flowerShape(ctx,f,flowerProgress(f,t));ctx.restore();
  }
  // 细光芒从亮核向两端退去，不用厚实星形或持续光晕。
  function drawGlint(ctx,x,y,amount,scale){
    if(amount<=.001)return;
    ctx.save();ctx.translate(x,y);ctx.globalAlpha*=amount;
    // 抵消树和飞行对象的缩放，让光核保持可辨认的画布尺寸。
    const compensation=1/(VIEW.scale*PLACEMENT.scale*scale);ctx.scale(compensation,compensation);
    const reach=GLINT.radius*(.5+.5*amount);
    const halo=ctx.createRadialGradient(0,0,0,0,0,4.5);
    halo.addColorStop(0,'rgba(255,250,223,.8)');halo.addColorStop(.25,'rgba(255,230,161,.22)');halo.addColorStop(1,'rgba(255,219,133,0)');
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,4.5,0,Math.PI*2);ctx.fill();
    const ray=ctx.createLinearGradient(-reach,0,reach,0);
    ray.addColorStop(0,'rgba(255,220,110,0)');
    ray.addColorStop(.4,'rgba(255,241,185,.65)');
    ray.addColorStop(.5,'#fffdf0');
    ray.addColorStop(.6,'rgba(255,241,185,.65)');
    ray.addColorStop(1,'rgba(255,220,110,0)');
    ctx.strokeStyle=ray;ctx.lineWidth=GLINT.width;
    ctx.beginPath();ctx.moveTo(-reach,0);ctx.lineTo(reach,0);ctx.stroke();
    ctx.save();ctx.rotate(Math.PI/2);ctx.scale(.48,1);ctx.lineWidth=.55;
    ctx.beginPath();ctx.moveTo(-reach,0);ctx.lineTo(reach,0);ctx.stroke();ctx.restore();
    ctx.fillStyle='#fffdf0';ctx.beginPath();ctx.ellipse(0,0,GLINT.core,GLINT.core,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function paintFlow(ctx,f,t,r,outline=false){
    const flow=flowingLight(f,t);if(flow.alpha<=.001)return;
    const center=flow.position*r;
    const band=ctx.createLinearGradient(center-r*.18,-r*.08,center+r*.18,r*.08);
    band.addColorStop(0,'rgba(255,240,179,0)');
    band.addColorStop(.25,'rgba(255,233,141,.25)');
    band.addColorStop(.5,'#fffef4');
    band.addColorStop(.75,'rgba(255,245,207,.35)');
    band.addColorStop(1,'rgba(255,240,179,0)');
    ctx.save();ctx.globalAlpha*=flow.alpha*.9;
    // 重用轮廓绘制亮带，空心形态只照亮边缘，不把中间填满。
    if(outline){ctx.strokeStyle=band;ctx.stroke();}else{
      ctx.globalAlpha*=.5;ctx.fillStyle=band;ctx.fill();
      ctx.globalAlpha*=2;ctx.strokeStyle=band;ctx.lineWidth=Math.max(.35,r*.055);ctx.stroke();
    }
    ctx.restore();
  }
  function symbolPath(ctx,f,r){
    ctx.beginPath();
    if(f.kind==='star'){
      if(f.symbolStyle.startsWith('cross')){
        const w=r*.15;
        const points=[[-w,-r],[w,-r],[w,-w],[r,-w],[r,w],[w,w],[w,r],[-w,r],[-w,w],[-r,w],[-r,-w],[-w,-w]];
        for(let i=0;i<points.length;i++){const [x,y]=points[i];if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
      }else{
        const corners=f.symbolStyle.startsWith('four')?4:5,inner=corners===4?.2:.43;
        for(let i=0;i<corners*2;i++){
          const angle=-Math.PI/2+i*Math.PI/corners,n=i%2?r*inner:r;
          if(i===0)ctx.moveTo(Math.cos(angle)*n,Math.sin(angle)*n);else ctx.lineTo(Math.cos(angle)*n,Math.sin(angle)*n);
        }
      }
    }else if(f.kind==='moon'){
      const cut=f.symbolStyle.startsWith('slim')?1.12:.86;
      ctx.arc(0,0,r,-Math.PI/2,Math.PI/2);
      ctx.bezierCurveTo(r*cut,r*.48,r*cut,-r*.48,0,-r);
    }else{
      ctx.moveTo(0,-r*1.2);
      ctx.bezierCurveTo(r*.95,-r*.55,r*.85,r*.45,0,r);
      ctx.bezierCurveTo(-r*.85,r*.45,-r*.95,-r*.55,0,-r*1.2);
    }
    ctx.closePath();
  }
  function drawFallingSymbol(ctx,f,t){
    const r=f.size*.55,outline=f.symbolStyle.endsWith('outline');
    ctx.save();if(f.symbolStyle==='cross-diagonal')ctx.rotate(Math.PI/4);
    const fill=ctx.createLinearGradient(-r,r,r,-r);
    fill.addColorStop(0,f.kind==='leaf'?'#7f8c9e':'#af7929');
    fill.addColorStop(.45,f.kind==='leaf'?'#d4d8d2':'#f4bd46');
    fill.addColorStop(.72,f.kind==='leaf'?'#fff8e6':'#ffe5a0');
    fill.addColorStop(1,f.kind==='leaf'?'#acb6bd':'#dca847');
    ctx.fillStyle=fill;ctx.strokeStyle=fill;ctx.lineWidth=Math.max(.7,r*.16);ctx.lineJoin='round';
    // 描边向两侧扩张，略缩空心轮廓以保持与实心款相近的外尺寸。
    symbolPath(ctx,f,outline?r-ctx.lineWidth*.5:r);
    if(outline)ctx.stroke();else ctx.fill();
    paintFlow(ctx,f,t,r,outline);
    if(f.kind==='leaf'){
      ctx.strokeStyle='#8295ad';ctx.lineWidth=.45;ctx.beginPath();ctx.moveTo(0,r*1.15);
      ctx.quadraticCurveTo(r*.12,0,0,-r*.85);ctx.stroke();
    }
    ctx.restore();
  }
  function drawFlyingFlower(f,t,skyTime=t){
    const pose=flowerPose(f,t);if(pose.opacity<=0)return;
    const appearance=fallingAppearance(f,t),ctx=p.drawingContext;
    ctx.save();ctx.translate(pose.x,pose.y);ctx.rotate(pose.angle);ctx.scale(pose.scale,pose.scale);
    if(pose.morph<1){
      ctx.save();ctx.globalAlpha=pose.opacity*(1-pose.morph);
      ctx.scale(appearance.size,appearance.size);drawFallingSymbol(ctx,f,t);
      ctx.restore();
    }
    if(pose.morph>0){
      ctx.globalAlpha=pose.opacity*pose.morph*(1-pose.star);drawButterfly(ctx,f,t,pose.morph);
    }
    if(pose.star>0){
      const star=starAppearance(f,skyTime),compensation=1/(VIEW.scale*PLACEMENT.scale*pose.scale);
      ctx.save();ctx.scale(compensation,compensation);ctx.globalAlpha=pose.opacity*pose.star*star.alpha;
      ctx.fillStyle=f.starRank%3===0?'#fff0d1':'#eef3ff';
      ctx.beginPath();ctx.ellipse(0,0,star.radius,star.radius,0,0,Math.PI*2);ctx.fill();
      if(star.bright||star.twinkle>.05){
        ctx.globalAlpha*=star.bright?.35:.65*star.twinkle;ctx.strokeStyle='#fff7df';ctx.lineWidth=.55;ctx.beginPath();
        ctx.moveTo(-star.radius*2.5,0);ctx.lineTo(star.radius*2.5,0);
        ctx.moveTo(0,-star.radius*1.8);ctx.lineTo(0,star.radius*1.8);ctx.stroke();
      }
      ctx.restore();
    }
    const flap=butterflySpread(f,t),n=f.wingSize*.64;
    ctx.globalAlpha=pose.opacity;
    // 光点随花瓣过渡到蝶翼，不在化蝶的交接处一起淡没。
    drawGlint(ctx,mix(f.size*.12*appearance.size,n*.65*flap,pose.morph)*(1-pose.star),
      mix(-f.size*.16*appearance.size,-n*.3,pose.morph)*(1-pose.star),
      appearance.glint*mix(1,.7+.3*flap,pose.morph)*(1-pose.star),pose.scale);
    ctx.restore();
  }
  function buildCanopy(){
    canopy=Array.from({length:5},(_,layer)=>{
      const band={layer,leaves:visibleLeaves.filter(l=>l.layer===layer).sort((a,b)=>a.z-b.z),flowers:canopyFlowers.filter(f=>f.layer===layer).sort((a,b)=>a.z-b.z)};
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
  function render(t,skyTime=t){
    p.image(background,0,0);
    const ctx=p.drawingContext;ctx.save();ctx.scale(VIEW.scale,VIEW.scale);drawMoon(t);
    ctx.save();ctx.translate(PLACEMENT.x,PLACEMENT.y);
    ctx.scale(PLACEMENT.scale,PLACEMENT.scale);ctx.translate(-PLACEMENT.rootX,-PLACEMENT.rootY);
    ctx.save();ctx.translate(PLACEMENT.rootX,PLACEMENT.rootY);const bend=treeShake(t);ctx.transform(1,0,bend,1-bend*.55,0,0);ctx.translate(-PLACEMENT.rootX,-PLACEMENT.rootY);
    if(t>=TREE_END)p.image(treeCache,0,0);
    else for(const branch of branches)drawBranch(ctx,branch,branchProgress(branch,t));
    for(const band of canopy){
      if(t>=LEAF_END)p.image(band.cache,band.x,band.y);
      else for(const leaf of band.leaves)drawLeaf(leaf,t);
      if(t>=BLOOM_END)p.image(band.flowerCache,band.x,band.y);
      else for(const f of band.flowers)drawFlower(ctx,f,t);
    }
    ctx.restore(); // 落花离枝后使用自身轨迹，不再跟随树的余震。
    for(const f of fallingFlowers)if(t>=f.release)drawFlyingFlower(f,t,skyTime);
    ctx.restore();ctx.restore();
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
      buildBackground();buildMoon();for(const b of branches)drawBranch(treeCache.drawingContext,b,1);buildCanopy();
      ready=true;button.disabled=false;slider.disabled=false;update();
      status.textContent='夜色已准备好。点击按钮，桂树生长，月牙、星星和银叶随风落下化蝶，部分留作星光，部分汇入满月。';
      if(document.hidden)p.noLoop();
    }catch(error){button.textContent='画面未能加载';status.textContent='请刷新页面重试。';console.error(error);p.noLoop();}
  };
  p.draw=()=>{
    if(!ready)return;
    const now=performance.now(),dt=last===null?0:Math.max(0,(now-last)/1000);last=now;const wasFinished=state==='finished';
    if(state==='playing'){
      time=Math.min(DURATION,sound?.position(time+dt)??time+dt);
      if(time===DURATION){sound?.finish();finaleTime=0;state='finished';status.textContent='一部分蝴蝶留下星光，另一部分汇成满月。可以重新播放。';}
      update();
    }
    // 主动播放到结尾后只延续星光；拖动暂停、后台和减少动态时冻结。
    if(wasFinished&&state==='finished'&&!reduced.matches&&!document.hidden)finaleTime+=dt;
    if((state==='playing'||state==='finished')&&!reduced.matches&&!document.hidden)sound?.tickStars(time+finaleTime);
    render(time,time+finaleTime);
    if(state!=='playing'&&(state!=='finished'||reduced.matches||document.hidden))p.noLoop();
  };
  button.addEventListener('click',()=>{
    if(!ready)return;
    if(reduced.matches){time=time>=DURATION?0:DURATION;state=time?'finished':'ready';status.textContent='已按减少动态效果设置切换静态画面。';}
    else if(state==='playing'){pauseSound();state='paused';status.textContent='已暂停。';}
    else{if(time>=DURATION){time=0;finaleTime=0;}state='playing';status.textContent='桂树生长，月牙、星星和银叶随风落下化蝶，部分留作星光，部分汇入满月。';}
    syncSound();update();wake();
  });
  slider.addEventListener('input',()=>{if(!ready)return;time=clamp(Number(slider.value)/(DURATION*100))*DURATION;state='paused';finaleTime=0;sound?.stop();update();wake();});
  document.addEventListener('visibilitychange',()=>{last=null;if(!ready)return;if(document.hidden){pauseSound();p.noLoop();}else{syncSound();wake();}});
  reduced.addEventListener('change',()=>{if(reduced.matches){pauseSound();if(state==='playing')state='paused';}update();wake();});
  soundButton.addEventListener('click',()=>{
    if(!sound)return;sound.setEnabled(!sound.enabled);
    soundButton.textContent=sound.enabled?'音效：开':'音效：关';
    soundButton.setAttribute('aria-pressed',String(sound.enabled));
  });
  window.addEventListener?.('pagehide',()=>sound?.stop());
},document.querySelector('#landscape'));
})();
