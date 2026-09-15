
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
// 复用场景的画布替身，独立装载三版，检查真实绘图入口及同一份运动数据。
const harness=fs.readFileSync(path.join(__dirname,'scene.test.cjs'),'utf8').split('const {branches,leaves,flowers,moon}=sandbox.NightTreeData')[0];
function preview(look){
  const box={require,__dirname,console};
  const source=harness.replace('const document={hidden:false',`const document={body:{dataset:{look:${JSON.stringify(look)}}},hidden:false`);
  vm.runInNewContext(source+`
    instance.setup();assert.deepEqual(errors,[]);
    const m=sandbox.model;
    for(const t of [0,1.5,3.5,6,8,12,18,24]){nodes['#progress'].value=String(t*100);nodes['#progress'].input();instance.draw();}
    capture=[];sandbox.drawFlowerForTest(context(),m.canopyFlowers[0],m.BLOOM_END,true);const flowerDraws=capture.length;capture=null;
    const flowerSlots=new Set(m.canopyGlitter.map(l=>l.slot));
    sandbox.prepareGlitterForTest(8);
    globalThis.result={show:m.SHOW_CANOPY_FLOWERS,flowerScale:m.CANOPY_FLOWER_SCALE,
      gold:m.visibleLeaves.filter(m.leafIsGold).length,total:m.visibleLeaves.length,flowerDraws,
      colors:JSON.stringify(m.visibleLeaves.map(m.leafColor)),mapleMasks:glitterMasks.filter(mask=>mask.filter(c=>c[0]==='lineTo').length>=30).length,
      flowerJobs:glitterJobs.filter(j=>flowerSlots.has(j.slot)).length,blooms:soundSettings.stages.blooms.length,
      silver:m.fallingFlowers.filter(f=>f.metal==='silver').length,
      falling:JSON.stringify(m.fallingFlowers.map(({metal,...f})=>f)),motion:JSON.stringify(Array.from({length:193},(_,i)=>m.fallingFlowers.map(f=>m.flowerPose(f,i/8)))),
      wind:JSON.stringify(m.WIND),moon:JSON.stringify(Array.from({length:97},(_,i)=>m.moonProgress(i/4)))};
  `,box);
  return box.result;
}
const flowers=preview('flowers'),leaves=preview('gold-leaves');
assert(flowers.show&&flowers.flowerDraws>0&&flowers.flowerJobs>0);
assert(flowers.flowerScale/1.1>1.2&&flowers.flowerScale/1.1<1.3,'花直径放大约23%');
assert(flowers.gold/flowers.total>.75&&flowers.gold/flowers.total<.85,'约八成叶片为金色');
assert.equal(leaves.gold,leaves.total);assert.equal(leaves.show,false);
assert.equal(leaves.flowerDraws,0);assert.equal(leaves.flowerJobs,0);assert.equal(leaves.blooms,0,'无花版无开花音效');
for(const key of ['falling','motion','wind','moon'])assert.equal(flowers[key],leaves[key],key+' 两版一致');
assert.equal(flowers.blooms,11);
const root=path.join(__dirname,'..');
for(const name of ['index.html','gold-leaves.html','flowers.html','maple-blend.html']){
  const html=fs.readFileSync(path.join(root,name),'utf8');
  assert(html.includes('href="index.html"')&&html.includes('href="flowers.html"')&&html.includes('href="maple-blend.html"'));
  assert(!html.includes('maple-gold.html')&&!html.includes('maple-red.html'));
  for(const [,file] of html.matchAll(/(?:src|href)="([^"]+)"/g))assert(fs.existsSync(path.join(root,file)));
}
console.log('两版预览检查通过：放大金花、减少银叶；无花纯金叶且无残留花瓣闪光；112个掉落物及193个时刻的运动、风、月相完全一致。');

const maples=['maple-blend'].map(preview);
for(const maple of maples){
  assert.equal(maple.show,false);assert.equal(maple.flowerDraws,0);assert.equal(maple.flowerJobs,0);assert.equal(maple.blooms,0);
  assert.equal(maple.gold,maple.total);assert(maple.mapleMasks>0,'枫叶反光遮罩沿尖裂轮廓裁切');
  for(const key of ['falling','motion','wind','moon'])assert.equal(maple[key],leaves[key],'枫叶版保持原'+key);
}
assert.notEqual(maples[0].colors,leaves.colors,'金红渐变枫叶与纯金叶的配色不同');
console.log('通过：金红渐变枫叶配色、尖裂轮廓遮罩、无树上花，以及原有掉落、回弹、化蝶与月相一致。');

assert(leaves.silver>=10&&leaves.silver<=20,'金叶版只保留少量银色掉落物');
assert.equal(maples[0].silver,leaves.silver);assert(flowers.silver>leaves.silver*2,'金花版维持原金银比例');
assert(fs.readFileSync(path.join(root,'index.html'),'utf8').includes('data-look="gold-leaves"'),'默认入口为纯金叶');
console.log('掉落物银色数量：金花版',flowers.silver,'，金叶／枫叶版',leaves.silver);
