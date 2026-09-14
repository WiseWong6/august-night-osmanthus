/* 本地合成生长、叶片、开花、风、轻碰、扑翼和星光；声音随画面时间播放。 */
'use strict';
(()=>{
  const clamp=x=>Math.max(0,Math.min(1,x));
  const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
  // 《风过之处》24.5～29 秒混合音轨的高频能量起伏，仅参考节奏，不复制原配乐。
  const grassReference=[.151,.154,.183,.244,.197,.183,.233,.212,.139,.138,.192,.217,.164,.164,.163,.141,.133,.122,.09,.088,.087,.114,.151,.227,.292,.318,.421,.433,.489,.543,.529,.565,.902,1,1,1,.366,.153,.215,.157,.149,.21,.17,.319,.353];
  function grassEnvelope(age){
    // 把原片末段阵风的增强位置对齐本片树梢偏动，再让叶声自然散开。
    const position=(age+2.7)*10,index=Math.min(grassReference.length-2,Math.floor(position));
    const fraction=smooth(Math.min(1,position-index));
    return (grassReference[index]*(1-fraction)+grassReference[index+1]*fraction)*Math.exp(-Math.max(0,age-1.6)*.7);
  }
  function synthesize(duration,wind,cues,rate=32000,stages={}){
    const length=Math.ceil(duration*rate),left=new Float32Array(length),right=new Float32Array(length);
    let seed=81731,low=0,mid=0,slow=0,high=0,otherMid=0;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
    for(let i=Math.floor(wind.start*rate);i<Math.min(length,Math.ceil((wind.end+.7)*rate));i++){
      const t=i/rate,age=t-wind.start,n=random(),other=random();
      low+=(n-low)*.022;mid+=(n-mid)*.16;slow+=(other-slow)*.008;
      high+=(n-high)*.73;otherMid+=(other-otherMid)*.18;
      const envelope=smooth(age/.24)*(1-smooth((t-wind.end+1.1)/1.8));
      const grass=grassEnvelope(age),gust=.17+.83*grass;
      const windSound=(low*.36+slow*.16)*envelope*gust;
      // 带限沙沙声：去掉低频轰鸣与最尖的白噪声，保留叶片擦过的细碎感。
      const texture=(high-mid),leaves=texture*envelope*(.022+.095*grass);
      const pan=.3-.65*smooth(age/3.4);
      left[i]=(windSound+leaves)*Math.sqrt((1-pan)/2);
      right[i]=(windSound+leaves*.72+(other-otherMid)*.019*envelope*grass)*Math.sqrt((1+pan)/2);
    }
    const notes=[1567.98,2093,2349.32,2637.02,3135.96];
    const strike=(time,frequency,amplitude,pan,decay)=>{
      const start=Math.floor(time*rate),count=Math.ceil(decay*7*rate);
      for(let j=0;j<count&&start+j<length;j++){
        const age=j/rate,attack=1-Math.exp(-age/.00045);
        // 薄金属的高频敲击先亮起，短余音随后消散；不使用低沉的长铃音。
        const tone=.65*Math.sin(2*Math.PI*frequency*age)*Math.exp(-age/decay)
          +.18*Math.sin(2*Math.PI*frequency*1.009*age)*Math.exp(-age/(decay*.76))
          +.44*Math.sin(2*Math.PI*frequency*2.756*age)*Math.exp(-age/(decay*.42))
          +.22*Math.sin(2*Math.PI*frequency*4.07*age)*Math.exp(-age/(decay*.18));
        const contact=random()*.22*Math.exp(-age/.003);
        const value=(tone+contact)*attack*amplitude*smooth((count-j)/(rate*.004));
        left[start+j]+=value*Math.sqrt((1-pan)/2);right[start+j]+=value*Math.sqrt((1+pan)/2);
      }
    };
    for(const [i,cue] of cues.entries()){
      const frequency=notes[(i*3)%notes.length],pan=Math.max(-.8,Math.min(.8,cue.pan));
      strike(cue.time,frequency,.108+(i%3)*.009,pan,.14+(i%4)*.025);
      if(i%3!==1)strike(cue.time+.085+(i%4)*.027,frequency*1.12,.032,pan-.05,.115);
    }
    const brush=(start,end,amplitude,kind,phase=0,panFrom=-.45,panTo=panFrom)=>{
      let fast=0,slow=0;const span=end-start;
      for(let i=Math.max(0,Math.floor(start*rate));i<Math.min(length,Math.ceil(end*rate));i++){
        const t=i/rate,age=t-start,n=random();
        fast+=(n-fast)*(kind==='wood'?.16:.64);slow+=(n-slow)*(kind==='wood'?.018:.12);
        const envelope=smooth(age/Math.min(.16,span*.22))*(1-smooth((age-span+.22)/.22));
        const pulse=kind==='flight'?(.5+.5*Math.sin(t*11+phase))**3
          :kind==='wood'?.25+.75*(.5+.5*Math.sin(age*29+Math.sin(age*13)))**5
          :.3+.7*(.5+.5*Math.sin(age*23+Math.sin(age*17)))**2;
        const value=(fast-slow)*envelope*pulse*amplitude;
        const pan=panFrom+(panTo-panFrom)*smooth(age/span);
        left[i]+=value*Math.sqrt((1-pan)/2);right[i]+=value*Math.sqrt((1+pan)/2);
      }
    };
    if(stages.wood)brush(stages.wood.start,stages.wood.end,.10,'wood');
    if(stages.leaves)brush(stages.leaves.start,stages.leaves.end,.075,'leaf');
    for(const f of stages.flights||[])brush(f.start,f.end,.029,'flight',f.phase,f.panFrom,f.panTo);
    const shimmer=(event,i,star=false)=>{
      const frequency=(star?[2637.02,3135.96,3520,2793.83,3951.07]:[1046.5,1318.51,1567.98,1760,2093])[i%5];
      const start=Math.floor(event.time*rate),decay=star?.105:.16,count=Math.ceil(decay*6*rate);
      for(let j=0;j<count&&start+j<length;j++){
        const age=j/rate,envelope=(1-Math.exp(-age/.005))*Math.exp(-age/decay)*smooth((count-j)/(rate*.008));
        const value=(Math.sin(2*Math.PI*frequency*age)+.16*Math.sin(2*Math.PI*frequency*3*age))
          *envelope*(star?.035:.031);
        left[start+j]+=value*Math.sqrt((1-event.pan)/2);right[start+j]+=value*Math.sqrt((1+event.pan)/2);
      }
    };
    (stages.blooms||[]).forEach((event,i)=>shimmer(event,i));
    (stages.sparkles||[]).forEach(event=>shimmer(event,event.note,true));
    let peak=0;for(let i=0;i<length;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
    if(peak>.8)for(let i=0;i<length;i++){left[i]*=.8/peak;right[i]*=.8/peak;}
    return {left,right,rate};
  }
  function create({duration,wind,cues,stages={},onUnavailable=()=>{}}){
    let ctx=null,buffer=null,source=null,voiceGain=null,master=null,enabled=true,offset=0,started=0,failed=false,generation=0;
    let starPrevious=null,starBuffers=[];const starVoices=new Set();
    function stopMain(){
      generation++;
      if(source){
        const old=source,gain=voiceGain;source=null;voiceGain=null;
        old.onended=()=>{old.disconnect();gain.disconnect();};
        gain.gain.cancelScheduledValues(ctx.currentTime);gain.gain.setTargetAtTime(0,ctx.currentTime,.004);
        try{old.stop(ctx.currentTime+.024);}catch{old.disconnect();gain.disconnect();}
      }
    }
    function stop(){
      stopMain();starPrevious=null;
      for(const voice of starVoices){
        voice.gain.gain.cancelScheduledValues(ctx.currentTime);
        voice.gain.gain.setTargetAtTime(0,ctx.currentTime,.004);
        try{voice.node.stop(ctx.currentTime+.024);}catch{}
      }
      starVoices.clear();
    }
    function makeBuffer(samples){
      const result=ctx.createBuffer(2,samples.left.length,samples.rate);
      result.getChannelData(0).set(samples.left);result.getChannelData(1).set(samples.right);return result;
    }
    function unavailable(){stop();failed=true;onUnavailable();}
    function prepare(){
      if(ctx)return;
      const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
      if(!Audio)throw new Error('此浏览器不支持音效');
      ctx=new Audio();master=ctx.createGain();master.gain.value=enabled?.8:0;master.connect(ctx.destination);
      buffer=makeBuffer(synthesize(duration,wind,cues,32000,stages));
      starBuffers=(stages.stars||[]).map(star=>makeBuffer(synthesize(.65,{start:1,end:2},[],32000,
        {sparkles:[{time:0,pan:star.pan,note:star.note}]})));
    }
    return {
      play(time){
        stop();if(failed||time>=duration)return;
        try{
          prepare();starPrevious=time;offset=time;started=ctx.currentTime+.025;
          source=ctx.createBufferSource();source.buffer=buffer;
          voiceGain=ctx.createGain();voiceGain.gain.value=0;
          voiceGain.gain.setTargetAtTime(1,started,.006);source.connect(voiceGain);voiceGain.connect(master);
          const current=source,gain=voiceGain,token=generation;
          source.onended=()=>{current.disconnect();gain.disconnect();if(source===current){source=null;voiceGain=null;}};
          source.start(started,time);
          const resume=ctx.resume();
          if(resume&&resume.catch)resume.catch(()=>{if(token===generation)unavailable();});
        }catch{unavailable();}
      },
      stop,
      finish:stopMain,
      tickStars(time){
        const previous=starPrevious;starPrevious=time;
        if(!ctx||failed||!enabled||ctx.state!=='running'||previous===null||time<previous||time-previous>.25)return;
        for(const [i,star] of (stages.stars||[]).entries()){
          const cycle=Math.floor((time-star.first)/star.period),at=star.first+cycle*star.period;
          if(cycle<0||at<=previous||at>time||starVoices.size>=7)continue;
          const node=ctx.createBufferSource(),gain=ctx.createGain(),voice={node,gain};
          gain.gain.value=smooth((at-18)/1.2);
          node.buffer=starBuffers[i];node.connect(gain);gain.connect(master);starVoices.add(voice);
          node.onended=()=>{node.disconnect();gain.disconnect();starVoices.delete(voice);};
          node.start(ctx.currentTime,Math.max(0,time-at));
        }
      },
      position(fallback){return source&&ctx.state==='running'?Math.min(duration,offset+Math.max(0,ctx.currentTime-started)):fallback;},
      setEnabled(value){enabled=value;if(master){master.gain.cancelScheduledValues(ctx.currentTime);master.gain.setTargetAtTime(enabled?.8:0,ctx.currentTime,.018);}},
      get enabled(){return enabled;}
    };
  }
  globalThis.NightTreeSound={create};
})();
