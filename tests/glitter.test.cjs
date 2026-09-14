'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'glitter.js'),'utf8');
const calls=[],canvases=[],shaders=[],events={};let compile=true,support=true;
const gl=new Proxy({
  createShader(type){const s={type};shaders.push(s);return s;},shaderSource(s,text){s.source=text;},
  createProgram(){return{};},createBuffer(){return{};},createTexture(){return{};},
  getShaderParameter(){return compile;},getShaderInfoLog(){return'测试编译失败';},getProgramParameter(){return true;},
  getAttribLocation(){return 0;},getUniformLocation(p,name){return name;}
},{get(target,key){if(key in target)return target[key];if(key===key.toUpperCase())return key;
  return (...args)=>calls.push([key,...args.map(a=>ArrayBuffer.isView(a)?Array.from(a):a)]);}});
const ctx=new Proxy({},{get:(_,key)=>(...args)=>calls.push(['mask:'+key,...args])});
const sandbox={document:{createElement(type){assert.equal(type,'canvas');const c={width:0,height:0,
  getContext(type,options){if(type==='webgl'){assert(options.alpha&&options.premultipliedAlpha&&!options.antialias);return support?gl:null;}assert.equal(type,'2d');return ctx;},
  addEventListener(name,fn){events[name]=fn;}};canvases.push(c);return c;}},console:{warn(){}}};
vm.createContext(sandbox);vm.runInContext(source,sandbox);
const descriptors=Array.from({length:3},(_,i)=>({bounds:[-2,-3,4,6],seed:i+3,gold:i%2,grain:19,curvature:.4,mask(ctx){ctx.fillRect(-1,-1,2,2);}}));
const renderer=sandbox.NightGlitter.create(descriptors);assert(renderer.available);assert.equal(canvases.length,2,'一个显卡画布与一张静态遮罩');
assert.equal(calls.filter(c=>c[0]==='texImage2D').length,1,'遮罩只上传一次');
assert(shaders.some(s=>s.source.includes('pow(max(dot(normal,halfVector),0.0),exponent)')));
const job=(slot,gain=1)=>({slot,gain,tiltX:.1,tiltY:.2,angle:.4});
renderer.render(5,[job(0),job(1)]);const batch=calls.filter(c=>c[0]==='bufferSubData').at(-1)[3];
assert.equal(batch.length,2*6*14);assert(batch.every(Number.isFinite));
assert.equal(calls.filter(c=>c[0]==='drawArrays').length,1,'多个表面一次批量绘制');
renderer.render(5,[job(0),job(1)]);assert.equal(calls.filter(c=>c[0]==='drawArrays').length,1,'暂停时复用相同纹理');
let painted=[];const target={globalCompositeOperation:'source-over',save(){},restore(){},drawImage(...args){painted.push(args);}};
renderer.paint(target,0);renderer.paint(target,2);assert.equal(painted.length,1,'只绘制本帧有反光的表面');
assert.equal(target.globalCompositeOperation,'screen');assert.deepEqual(painted[0].slice(-4),[-2,-3,4,6]);
renderer.render(5,[]);painted=[];renderer.paint(target,0);assert.equal(painted.length,0,'时间冻结时切换减少动态也清除旧表面');
renderer.render(5,[job(0),job(1)]);assert.deepEqual(calls.filter(c=>c[0]==='bufferSubData').at(-1)[3],batch,'回拖重建相同朝向数据');
renderer.render(6,[job(0)]);renderer.render(5,[job(0),job(1)]);
assert.deepEqual(calls.filter(c=>c[0]==='bufferSubData').at(-1)[3],batch);
let prevented=false;events.webglcontextlost({preventDefault(){prevented=true;}});assert(prevented&&!renderer.available);
events.webglcontextrestored();assert(renderer.available);renderer.render(5,[job(0)]);
assert.equal(calls.filter(c=>c[0]==='texImage2D').length,2,'显卡上下文恢复后才重新上传遮罩');
support=false;assert.equal(sandbox.NightGlitter.create(descriptors),null,'无 WebGL 时保留原画面');support=true;
compile=false;assert.equal(sandbox.NightGlitter.create(descriptors),null,'编译失败不阻断主动画');
if(process.platform==='darwin'){
  const vertex=shaders.find(s=>s.source.includes('gl_Position')).source,fragment=shaders.find(s=>s.source.includes('gl_FragColor')).source;
  process.stdout.write(execFileSync('python3',[path.join(__dirname,'glitter-gpu.py')],{
    input:JSON.stringify({vertex,fragment}),encoding:'utf8',timeout:30000}));
}else console.log('此平台未执行 macOS 原生显卡检查；浏览器显卡效果仍需人工验收。');
console.log('通过：单一显卡画布、真实轮廓遮罩、一次上传与批量绘制、暂停回拖、退出清理、显卡恢复及无显卡降级。');
