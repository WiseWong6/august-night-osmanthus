'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'glitter.js'),'utf8');
const calls=[],canvases=[],shaders=[],events={};let compile=true,support=true,record=true,reads=0;
const ring=(u,v)=>{const r=Math.hypot(u-.5,v-.5);return r>.16&&r<.36?255:0;};
let fixtures=[(u,v)=>u>.2&&u<.8&&v>.2&&v<.8?255:0,ring,()=>0,
  (u,v)=>u>.45&&u<.55&&v>.2&&v<.8?48:0];
const log=(name,...args)=>{if(record)calls.push([name,...args.map(a=>ArrayBuffer.isView(a)?Array.from(a):a)]);};
const gl=new Proxy({
  createShader(type){const s={type};shaders.push(s);return s;},shaderSource(s,text){s.source=text;},
  createProgram(){return{};},createBuffer(){return{};},createTexture(){return{};},
  getShaderParameter(){return compile;},getShaderInfoLog(){return'测试编译失败';},getProgramParameter(){return true;},
  getAttribLocation(){return 0;},getUniformLocation(p,name){return name;}
},{get(target,key){if(key in target)return target[key];if(key===key.toUpperCase())return key;
  return (...args)=>log(key,...args);}});
const ctx=new Proxy({getImageData(x,y,width,height){
  reads++;assert.equal(x,0);assert.equal(y,0);assert.equal(width,2048,'每个表面使用 64 像素，保留小亮核细节');
  const data=new Uint8ClampedArray(width*height*4);
  fixtures.forEach((coverage,slot)=>{
    const tx=slot%32*64,ty=Math.floor(slot/32)*64;
    for(let py=0;py<64;py++)for(let px=0;px<64;px++){
      const alpha=coverage((px+.5)/64,(py+.5)/64),at=((ty+py)*width+tx+px)*4;
      data[at]=data[at+1]=data[at+2]=255;data[at+3]=alpha;
    }
  });
  return {data,width,height};
}},{get(target,key){return target[key]||((...args)=>log('mask:'+key,...args));}});
const sandbox={document:{createElement(type){assert.equal(type,'canvas');const c={width:0,height:0,
  getContext(type,options){if(type==='webgl'){assert(options.alpha&&options.premultipliedAlpha&&!options.antialias);return support?gl:null;}assert.equal(type,'2d');return ctx;},
  addEventListener(name,fn){events[name]=fn;}};canvases.push(c);return c;}},console:{warn(){}}};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
const descriptors=Array.from({length:4},(_,i)=>({bounds:[-2,-3,4,6],seed:i+3,gold:i%2,grain:16,curvature:.4,
  ...(i<2?{focus:i===0?[-.5,.2]:{x:0,y:0}}:{}),mask(ctx){ctx.fillRect(-1,-1,2,2);}}));
const renderer=sandbox.NightGlitter.create(descriptors);assert(renderer.available);assert.equal(canvases.length,2,'一个显卡画布与一张静态遮罩');
assert.equal(reads,1,'整张遮罩只读取一次');assert.equal(calls.filter(c=>c[0]==='texImage2D').length,1,'遮罩只上传一次');
assert.equal(renderer.highlights(0).length,0,'尚未渲染时不能留下光芒');
const job=(slot,gain=1)=>({slot,gain,tiltX:0,tiltY:0,angle:.4});
renderer.render(5,[job(0),job(1)]);const batch=calls.filter(c=>c[0]==='bufferSubData').at(-1)[3];
assert.equal(batch.length,2*6*17);assert(batch.every(Number.isFinite));
assert.equal(calls.filter(c=>c[0]==='drawArrays').length,1,'多个表面一次批量绘制');
renderer.render(5,[job(0),job(1)]);assert.equal(calls.filter(c=>c[0]==='drawArrays').length,1,'暂停时复用相同纹理');
let painted=[];const target={globalCompositeOperation:'source-over',save(){},restore(){},drawImage(...args){painted.push(args);}};
renderer.paint(target,0);renderer.paint(target,2);assert.equal(painted.length,1,'只绘制本帧有反光的表面');
assert.equal(target.globalCompositeOperation,'screen');assert.deepEqual(painted[0].slice(-4),[-2,-3,4,6]);
const best=Array(4).fill(null);record=false;
for(let step=0;step<=720;step++){
  const time=step/30;renderer.render(time,descriptors.map((_,slot)=>job(slot)));
  for(let slot=0;slot<4;slot++)for(const highlight of renderer.highlights(slot)){
    assert(Object.values(highlight).every(Number.isFinite));assert(highlight.energy>0&&highlight.energy<=1);
    const u=(highlight.x+2)/4,v=(highlight.y+3)/6;
    assert(fixtures[slot](u,v)>0,'光芒源必须落在有覆盖的真实表面');
    assert.equal(highlight.gold,descriptors[slot].gold);assert.equal(highlight.seed,descriptors[slot].seed);
    if(!best[slot]||highlight.energy>best[slot].highlight.energy)best[slot]={time,highlight:{...highlight}};
  }
}
record=true;
assert(best[0]&&best[1]&&best[3],'实心、空心和薄描边都有可见的迎光峰');
assert(best[3].highlight.energy<=48/255,'很薄的描边按真实覆盖率贡献光芒');
assert.equal(best[2],null,'空遮罩不能产生场景光芒');
assert(Math.hypot(best[0].highlight.x+.5,best[0].highlight.y-.2)<.07,'指定焦点落在表面时仅按纹素中心微调');
const ringU=(best[1].highlight.x+2)/4,ringV=(best[1].highlight.y+3)/6;
assert(Math.hypot(ringU-.5,ringV-.5)>.16,'指定焦点落在空心孔时移到真实轮廓');
const peakTime=best[1].time;
renderer.render(peakTime,[job(1)]);
const full=JSON.stringify(renderer.highlights(1)),shared=calls.filter(c=>c[0]==='bufferSubData').at(-1)[3];
const peak=renderer.highlights(1)[0];
assert(Math.abs(shared[14]-ringU)<1e-7&&Math.abs(shared[15]-ringV)<1e-7,'上传着色器的光源与场景光源在同一位置');
assert(Math.abs(shared[16]-peak.energy)<1e-6,'着色器与场景使用同一个反射峰');
renderer.render(peakTime,[job(1,.5)]);
assert(Math.abs(renderer.highlights(1)[0].energy-peak.energy*.5)<1e-10,'场景光芒只乘一次表面强度');
renderer.render(peakTime,[job(1,0)]);assert.equal(renderer.highlights(1).length,0,'暂停时切换减少动态会立即清除光芒');
renderer.render(peakTime,[job(1)]);assert.equal(JSON.stringify(renderer.highlights(1)),full);
renderer.render(peakTime,[{...job(1),tiltX:.95}]);
assert.notEqual(JSON.stringify(renderer.highlights(1)),full,'同一时刻转动表面会改变强反光');
renderer.render(peakTime+1,[job(1)]);renderer.render(peakTime,[job(1)]);
assert.equal(JSON.stringify(renderer.highlights(1)),full,'回拖重现相同的强反光位置与能量');
renderer.render(5,[]);painted=[];renderer.paint(target,0);assert.equal(painted.length,0);
assert.equal(renderer.highlights(1).length,0,'任务清空时不能保留旧光芒');
renderer.render(5,[job(0),job(1)]);assert.deepEqual(calls.filter(c=>c[0]==='bufferSubData').at(-1)[3],batch);
assert.equal(reads,1,'动画与回拖不重新读取遮罩');
renderer.render(peakTime,[job(1)]);
let prevented=false;events.webglcontextlost({preventDefault(){prevented=true;}});assert(prevented&&!renderer.available);
assert.equal(renderer.highlights(1).length,0,'显卡上下文丢失时场景光芒也停用');
events.webglcontextrestored();assert(renderer.available);assert.equal(renderer.highlights(1).length,0);
renderer.render(peakTime,[job(1)]);assert.equal(JSON.stringify(renderer.highlights(1)),full);
assert.equal(reads,1,'显卡恢复不重新读取二维遮罩');
assert.equal(calls.filter(c=>c[0]==='texImage2D').length,2,'显卡上下文恢复后才重新上传遮罩');
assert.throws(()=>sandbox.NightGlitter.create([]));
assert.throws(()=>sandbox.NightGlitter.create(Array(1025).fill(descriptors[0])));
support=false;assert.equal(sandbox.NightGlitter.create(descriptors),null,'无 WebGL 时保留原画面');support=true;
compile=false;assert.equal(sandbox.NightGlitter.create(descriptors),null,'编译失败不阻断主动画');compile=true;

// 多个方向、种子的连续采样可发现强峰过稀、持续过长或整批同步闪烁；不依赖源码字符串。
record=false;fixtures=Array(128).fill(ring);
const population=fixtures.map((_,i)=>({...descriptors[0],seed:i*1.731+3.17,focus:undefined}));
const statsRenderer=sandbox.NightGlitter.create(population);
const jobs=population.map((_,slot)=>({...job(slot),tiltX:0,tiltY:0,angle:slot*2.399963}));
const lengths=Array(population.length).fill(0),durations=[],counts=[];
for(let frame=0;frame<=720;frame++){
  statsRenderer.render(frame/30,jobs);let count=0;
  population.forEach((_,slot)=>{
    const bright=(statsRenderer.highlights(slot)[0]?.energy||0)>.15;
    if(bright){count++;lengths[slot]++;}else if(lengths[slot]){durations.push(lengths[slot]/30);lengths[slot]=0;}
  });counts.push(count);
}
durations.sort((a,b)=>a-b);counts.sort((a,b)=>a-b);
const median=a=>a[Math.floor(a.length/2)],mean=counts.reduce((a,b)=>a+b,0)/counts.length;
assert(durations.length>100,'多表面的迎光峰应持续错落出现');
assert(mean>1&&mean<16,'强峰不能过稀或整片密集闪亮');
assert(median(durations)>=.08&&median(durations)<.5,'强峰要有可辨认的短促持续时间');
console.log(`连续反射检查：128 个不同朝向表面，24 秒 / 30 帧；强峰同时出现中位 ${median(counts)} 个、平均 ${mean.toFixed(2)} 个，持续中位 ${median(durations).toFixed(3)} 秒，共 ${durations.length} 次。`);
if(process.platform==='darwin'){
  const vertex=shaders.find(s=>s.source.includes('gl_Position')).source,fragment=shaders.find(s=>s.source.includes('gl_FragColor')).source;
  process.stdout.write(execFileSync('python3',[path.join(__dirname,'glitter-gpu.py')],{
    input:JSON.stringify({vertex,fragment,probe:{time:peakTime,material:shared.slice(6,10),pose:shared.slice(10,14),glint:shared.slice(14,17)}}),encoding:'utf8',timeout:30000}));
}else console.log('此平台未执行 macOS 原生显卡检查；浏览器显卡效果仍需人工验收。');
console.log('通过：真实覆盖选点、共享反射峰、一次遮罩读取与上传、批量绘制、暂停回拖、减少动态、显卡恢复及无显卡降级。');
