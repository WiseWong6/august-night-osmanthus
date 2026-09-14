'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../sound.js'),'utf8');
let contexts=0,buffers=0,context,sources=[],gains=[];
class AudioContext{
  constructor(){contexts++;context=this;this.currentTime=0;this.state='suspended';this.destination={};}
  createGain(){const node={gain:{value:1,cancelScheduledValues(){},setTargetAtTime(v){this.value=v;}},connect(){},disconnect(){this.disconnected=true;}};gains.push(node);return node;}
  createBuffer(channels,length,rate){buffers++;const data=Array.from({length:channels},()=>new Float32Array(length));return{sampleRate:rate,getChannelData:i=>data[i]};}
  createBufferSource(){const node={connect(){},disconnect(){this.disconnected=true;},start(time,offset){this.time=time;this.offset=offset;},stop(time){this.stopped=time;}};sources.push(node);return node;}
  resume(){this.state='running';return Promise.resolve();}
}
const box={AudioContext};vm.createContext(box);
vm.runInContext(code.replace('globalThis.NightTreeSound={create};','globalThis.NightTreeSound={create};globalThis.synthesize=synthesize;'),box);
const settings={duration:24,wind:{start:5.47,end:10.97},cues:[{time:6.2,pan:-.4},{time:7.1,pan:-.6},{time:8.5,pan:-.3}]};
const audio=box.NightTreeSound.create(settings);
assert.equal(contexts,0,'用户点击播放之前不创建音频设备');
audio.play(0);assert.equal(contexts,1);assert.equal(buffers,1);
const first=sources[0],pcm=first.buffer.getChannelData(0),right=first.buffer.getChannelData(1);
assert.equal(pcm.length,24*32000);
const energy=(from,to)=>{let sum=0;for(let i=Math.floor(from*32000);i<to*32000;i++)sum+=pcm[i]**2;return sum/((to-from)*32000);};
assert.equal(energy(0,5.47),0,'开花前没有风声或碰撞声');
assert(energy(5.7,6)>.000005,'风和叶片摩擦有实际波形');
assert(energy(6.2,6.45)>energy(6,6.2),'掉落轻碰增加清脆瞬态');
assert.equal(energy(15,24),0,'掉落结束后声音退净');
let peak=0,difference=0;for(let i=0;i<pcm.length;i++){assert(Number.isFinite(pcm[i]));peak=Math.max(peak,Math.abs(pcm[i]),Math.abs(right[i]));difference+=Math.abs(pcm[i]-right[i]);}
assert(peak>.05&&peak<=.8,'音效可听且留出混音余量');assert(difference>1,'风与落物具有左右空间差别');
context.currentTime=7.025;assert(Math.abs(audio.position(0)-7)<1e-10);
audio.setEnabled(false);assert.equal(audio.enabled,false);assert.equal(gains[0].gain.value,0);
context.currentTime+=1;assert(Math.abs(audio.position(0)-8)<1e-10,'静音不改变播放进度');
audio.stop();assert(first.stopped<context.currentTime+.025);assert.equal(audio.position(9),9);
first.onended();assert(first.disconnected,'停播后释放声源连接');
audio.play(6.5);assert.equal(buffers,1,'重播与拖动复用同一音轨');assert.equal(sources.at(-1).offset,6.5);
assert.deepEqual(sources.at(-1).buffer.getChannelData(0),pcm);
audio.setEnabled(true);assert.equal(gains[0].gain.value,.8);
const latest=sources.at(-1);audio.stop();audio.play(0);assert(latest.stopped!==undefined,'重新播放前停止旧声源');
audio.stop();const count=sources.length;audio.play(24);assert.equal(sources.length,count);
// 分离碰撞声检查起音和衰减，避免风声掩盖音色退化。
const bell=box.synthesize(3,{start:4,end:5},[{time:1,pan:0}]).left;
const power=(from,to)=>{let total=0;for(let i=Math.floor(from*32000);i<to*32000;i++)total+=bell[i]**2;return total/((to-from)*32000);};
assert(power(1,1.01)>.0001,'敲击瞬间迅速建立亮度');
assert(power(1.5,1.7)<power(1.02,1.12)*.025,'碰撞尾音短，不拖成低沉长铃');
let crossings=0;for(let i=32001;i<35200;i++)if(bell[i]*bell[i-1]<0)crossings++;
assert(crossings/3199>.09,'主要碰撞声保留高频清脆成分');
const repeated=box.synthesize(3,{start:4,end:5},[{time:1,pan:0}]);
assert.deepEqual(repeated.left,bell,'摩擦和敲击随机细节在回放时保持一致');
const stages={wood:{start:0,end:2.7},leaves:{start:2.35,end:3.65},
  blooms:[{time:4.2,pan:-.4}],flights:[{start:10,end:20,phase:1,panFrom:-.6,panTo:.65}],
  stars:[{first:18.45,period:4,pan:.4,note:2}]};
const full=box.synthesize(24,settings.wind,settings.cues,32000,stages);
const fullPower=(from,to)=>{let sum=0;for(let i=Math.floor(from*32000);i<to*32000;i++)sum+=full.left[i]**2;return sum/((to-from)*32000);};
for(const [from,to] of [[.4,.9],[2.9,3.3],[4.2,4.4],[15,16]])assert(fullPower(from,to)>.000001,'生长、叶片、开花与飞行各有声音');
assert.equal(fullPower(22,24),0,'星光使用独立轻响，不重放主体音轨');
const fullAudio=box.NightTreeSound.create({...settings,stages});fullAudio.play(18.4);
const mainVoice=sources.at(-1),beforeStar=sources.length;
fullAudio.tickStars(18.46);assert.equal(sources.length,beforeStar+1,'星星亮度峰值触发轻响');
const starVoice=sources.at(-1);assert(starVoice.buffer.getChannelData(0).some(v=>Math.abs(v)>.01));
fullAudio.tickStars(18.48);assert.equal(sources.length,beforeStar+1,'同一闪光不重复触发');
fullAudio.finish();assert(mainVoice.stopped!==undefined);assert.equal(starVoice.stopped,undefined,'主体结束不切断星光余音');
fullAudio.tickStars(26.4);fullAudio.tickStars(26.46);assert.equal(sources.length,beforeStar+2,'结尾星光继续响，主体音轨不重播');
fullAudio.setEnabled(false);const mutedCount=sources.length;fullAudio.tickStars(30.4);fullAudio.tickStars(30.46);assert.equal(sources.length,mutedCount);
fullAudio.setEnabled(true);fullAudio.stop();assert(starVoice.stopped!==undefined,'后台和暂停停止所有星光声音');
fullAudio.tickStars(34.46);assert.equal(sources.length,mutedCount,'暂停后不补发经过的闪光');
fullAudio.play(0);assert.equal(sources.at(-1).offset,0,'重播从树生长开始');fullAudio.stop();
let failed=0;const unsupported={};vm.createContext(unsupported);vm.runInContext(code,unsupported);
const silent=unsupported.NightTreeSound.create({...settings,onUnavailable:()=>failed++});silent.play(0);silent.play(1);
assert.equal(failed,1);assert.equal(silent.position(2),2,'不支持音频时继续以画面时间播放');
console.log('通过：点击后才启用音频、生长／长叶／开花／飞行音效、风叶声与叮当瞬态、星光峰值触发及尾声控制、立体声和峰值、末段退净、音画时钟、静音、暂停淡出、重播复用、无音频支持降级。');
