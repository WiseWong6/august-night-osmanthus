/* 表面微片的镜面反光。着色器内联，file:// 可直开；只创建一个 WebGL 画布。 */
'use strict';
(()=>{
  const TILE=64,COLUMNS=32,MAX_SURFACES=1024,STRIDE=17;
  const vertex=`
attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec2 a_origin;
attribute vec4 a_material;
attribute vec4 a_pose;
attribute vec3 a_glint;
varying vec2 v_uv;
varying vec2 v_origin;
varying vec4 v_material;
varying vec4 v_pose;
varying vec3 v_glint;
void main(){
  v_uv=a_uv;v_origin=a_origin;v_material=a_material;v_pose=a_pose;v_glint=a_glint;
  gl_Position=vec4(a_position.x*2.0-1.0,1.0-a_position.y*2.0,0.0,1.0);
}`;
  const fragment=`
#ifdef GL_ES
precision highp float;
#endif
uniform sampler2D u_mask;
uniform vec2 u_cell;
uniform float u_time;
varying vec2 v_uv;
varying vec2 v_origin;
varying vec4 v_material;
varying vec4 v_pose;
varying vec3 v_glint;
vec2 hash22(vec2 p){
  vec3 p3=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));
  p3+=dot(p3,p3.yzx+33.33);
  return fract((p3.xx+p3.yz)*p3.zy);
}
float coverage(vec2 q){
  if(q.x<0.01||q.y<0.01||q.x>0.99||q.y>0.99)return 0.0;
  vec2 uv=v_origin+q*u_cell;
  return texture2D(u_mask,vec2(uv.x,1.0-uv.y)).a;
}
float reflection(vec2 cell,vec2 q,float exponent,vec3 halfVector){
  vec2 grain=hash22(cell+v_material.x*0.173+19.7);
  vec2 ripple=vec2(sin(q.x*11.0+q.y*4.0+u_time*1.1+v_material.x),
                   cos(q.y*9.0-q.x*5.0+u_time*0.87+v_material.x*0.7))*0.16;
  vec2 slope=(grain-0.5)*1.35+ripple+v_pose.xy+(q-0.5)*v_material.w;
  vec3 normal=normalize(vec3(slope,1.0));
  return pow(max(dot(normal,halfVector),0.0),exponent);
}
void main(){
  vec3 halfVector=normalize(vec3(0.35,-0.5,2.2));
  float c=cos(v_pose.z),s=sin(v_pose.z);
  halfVector.xy=mat2(c,-s,s,c)*halfVector.xy;
  vec3 metal=mix(vec3(0.76,0.87,1.0),vec3(1.0,0.72,0.22),v_material.y);
  vec3 light=vec3(0.0);
  float surface=coverage(v_uv),grid=v_material.z;
  // 固定 Voronoi 微片：位置不漂移，变化的是每块微片的法线与迎光夹角。
  if(surface>0.001){
    vec2 p=v_uv*grid,base=floor(p),nearest=vec2(0.0),center=vec2(0.0);
    float distance2=100.0;
    for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
      vec2 cell=base+vec2(float(x),float(y));
      vec2 q=cell+0.15+0.7*hash22(cell+v_material.x);
      float d=dot(p-q,p-q);
      if(d<distance2){distance2=d;nearest=cell;center=q/grid;}
    }
    float spec=reflection(nearest,center,112.0,halfVector);
    // 微片与一个纹素的覆盖面积一起积分近似；放宽亮点时保留总能量，避免细节忽隐忽现。
    float variance=0.105+grid*grid/(6.0*${TILE}.0*${TILE}.0);
    float flake=exp(-distance2/variance)*0.105/variance;
    float energy=spec*smoothstep(0.10,0.62,spec)*flake*surface;
    light+=mix(metal,vec3(1.0,0.99,0.96),spec)*energy*3.1;
  }
  // 与主场景光芒共用一个真实表面上的反射峰；外围细芒由主场景按画面像素绘制。
  float peak=v_glint.z*coverage(v_glint.xy);
  vec2 d=v_uv-v_glint.xy;
  float coreVariance=0.00042+1.0/(6.0*${TILE}.0*${TILE}.0);
  float core=exp(-dot(d,d)/coreVariance)*0.00042/coreVariance;
  float soft=exp(-dot(d,d)/0.0022)*0.14;
  light+=peak*(vec3(1.0,0.995,0.975)*core*2.8*surface+mix(metal,vec3(1.0),0.72)*soft);
  float border=smoothstep(0.0,0.07,min(min(v_uv.x,v_uv.y),min(1.0-v_uv.x,1.0-v_uv.y)));
  light*=border*v_pose.w;
  float alpha=clamp(max(max(light.r,light.g),light.b),0.0,1.0);
  // 预乘透明度；透明区不携带黑色，叠到二维画布时不会变成方块。
  gl_FragColor=vec4(min(light,vec3(alpha)),alpha);
}`;
  const fract=x=>x-Math.floor(x);
  const random=x=>fract(Math.sin(x*12.9898+78.233)*43758.5453);
  const smooth=(from,to,value)=>{
    const x=Math.max(0,Math.min(1,(value-from)/(to-from)));return x*x*(3-2*x);
  };
  function pickAnchor(surface,slot,pixels,width){
    if(!pixels)return null; // 无像素的参数检查替身仍可验证原绘制接口。
    const [x,y,w,h]=surface.bounds,tx=slot%COLUMNS*TILE,ty=Math.floor(slot/COLUMNS)*TILE;
    const focus=surface.focus,fx=Array.isArray(focus)?focus[0]:focus?.x,fy=Array.isArray(focus)?focus[1]:focus?.y;
    const targeted=Number.isFinite(fx)&&Number.isFinite(fy),candidates=[];
    let maximum=0;
    for(let py=3;py<TILE-3;py++)for(let px=3;px<TILE-3;px++){
      const alpha=pixels[((ty+py)*width+tx+px)*4+3];
      if(alpha>0){candidates.push({px,py,alpha});maximum=Math.max(maximum,alpha);}
    }
    // 优先完整覆盖的纹素；很薄的空心描边仍可使用其覆盖最充分的位置。
    const covered=candidates.filter(point=>point.alpha>=Math.min(224,maximum));
    if(!covered.length)return null;
    let point=covered[Math.floor(random(surface.seed+17.3)*covered.length)];
    if(targeted){
      let distance=Infinity;
      for(const candidate of covered){
        const dx=x+(candidate.px+.5)/TILE*w-fx,dy=y+(candidate.py+.5)/TILE*h-fy;
        const next=dx*dx+dy*dy;
        if(next<distance){distance=next;point=candidate;}
      }
    }
    const u=(point.px+.5)/TILE,v=(point.py+.5)/TILE;
    return {u,v,x:x+u*w,y:y+v*h,coverage:point.alpha/255,
      slopeX:(random(surface.seed+31.7)-.5)*.38,slopeY:(random(surface.seed+67.1)-.5)*.38,
      phase:random(surface.seed+91.3)*Math.PI*2,speed:2.5+random(surface.seed+113.9)*1.1};
  }
  function reflectionPeak(surface,anchor,time,job){
    if(!anchor)return 0;
    // 同一小片的法线连续摆动；姿态改变迎光夹角，亮点没有独立的随机开关或闪烁时钟。
    const phase=anchor.phase,speed=anchor.speed;
    const x=anchor.slopeX+Math.sin(time*speed+phase)*.32+job.tiltX+(anchor.u-.5)*surface.curvature;
    const y=anchor.slopeY+Math.cos(time*speed*.83+phase*1.37)*.26+job.tiltY+(anchor.v-.5)*surface.curvature;
    const c=Math.cos(job.angle),s=Math.sin(job.angle),hx=.35*c-.5*s,hy=-.35*s-.5*c;
    const alignment=Math.max(0,(x*hx+y*hy+2.2)/(Math.hypot(x,y,1)*Math.hypot(.35,-.5,2.2)));
    const spec=Math.min(1,alignment)**190;
    return spec*smooth(.22,.86,spec);
  }
  function create(surfaces){
    if(!surfaces.length||surfaces.length>MAX_SURFACES)throw new Error('表面闪光数量超出上限');
    const canvas=document.createElement('canvas'),mask=document.createElement('canvas');
    canvas.width=mask.width=COLUMNS*TILE;
    canvas.height=mask.height=Math.ceil(surfaces.length/COLUMNS)*TILE;
    const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
    if(!gl)return null;
    const ctx=mask.getContext('2d');
    surfaces.forEach((surface,i)=>{
      const [x,y,w,h]=surface.bounds,tx=i%COLUMNS*TILE,ty=Math.floor(i/COLUMNS)*TILE;
      ctx.save();ctx.beginPath();ctx.rect(tx,ty,TILE,TILE);ctx.clip();
      ctx.translate(tx,ty);ctx.scale(TILE/w,TILE/h);ctx.translate(-x,-y);
      ctx.fillStyle=ctx.strokeStyle='#ffffff';surface.mask(ctx);ctx.restore();
    });
    // 整张遮罩只读取一次；初始化后不再读回显卡或二维像素。
    let pixels=ctx.getImageData?.(0,0,mask.width,mask.height)?.data;
    const anchors=surfaces.map((surface,i)=>pickAnchor(surface,i,pixels,mask.width));
    pixels=null;
    let program,buffer,texture,locations,lost=false,failed=false,lastTime=null,lastJobs=[],active=new Set();
    const vertices=new Float32Array(surfaces.length*6*STRIDE),highlights=new Map();
    function initialize(){
      const shaders=[];
      try{
        for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
          const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);
          if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader));
        }
        program=gl.createProgram();shaders.forEach(shader=>gl.attachShader(program,shader));gl.linkProgram(program);
        if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,vertices.byteLength,gl.DYNAMIC_DRAW);
        let offset=0;
        for(const [name,size] of [['a_position',2],['a_uv',2],['a_origin',2],['a_material',4],['a_pose',4],['a_glint',3]]){
          const index=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,size,gl.FLOAT,false,STRIDE*4,offset*4);offset+=size;
        }
        texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,mask);
        gl.uniform1i(gl.getUniformLocation(program,'u_mask'),0);
        gl.uniform2f(gl.getUniformLocation(program,'u_cell'),TILE/canvas.width,TILE/canvas.height);
        locations={time:gl.getUniformLocation(program,'u_time')};
        gl.viewport(0,0,canvas.width,canvas.height);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);
        lost=false;failed=false;lastTime=null;lastJobs=[];active.clear();highlights.clear();
      }finally{shaders.forEach(shader=>gl.deleteShader(shader));}
    }
    const fail=error=>{
      failed=true;active.clear();highlights.clear();
      if(texture)gl.deleteTexture(texture);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);
      texture=buffer=program=null;console.warn('表面反光未能启用，继续播放原画面。',error);
    };
    try{initialize();}catch(error){fail(error);return null;}
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;active.clear();highlights.clear();});
    canvas.addEventListener('webglcontextrestored',()=>{try{initialize();}catch(error){fail(error);}});
    return {
      get available(){return !lost&&!failed;},
      render(time,jobs){
        if(lost||failed)return;
        // 时间冻结时，系统仍可能切换“减少动态”；此时也必须清掉旧反光。
        if(time===lastTime&&jobs.length===lastJobs.length&&jobs.every((job,i)=>
          ['slot','gain','tiltX','tiltY','angle'].every(key=>job[key]===lastJobs[i][key])))return;
        lastTime=time;lastJobs=jobs.map(job=>({...job}));active.clear();highlights.clear();let at=0;
        for(const job of jobs){
          if(job.gain<=0)continue;
          const i=job.slot,surface=surfaces[i];if(!surface||active.has(i))continue;active.add(i);
          const anchor=anchors[i],peak=reflectionPeak(surface,anchor,time,job),energy=peak*(anchor?.coverage||0)*job.gain;
          if(energy>.025)highlights.set(i,[{x:anchor.x,y:anchor.y,energy,gold:surface.gold,seed:surface.seed}]);
          const ox=i%COLUMNS*TILE/canvas.width,oy=Math.floor(i/COLUMNS)*TILE/canvas.height;
          for(const [x,y] of [[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]]){
            vertices.set([ox+x*TILE/canvas.width,oy+y*TILE/canvas.height,x,y,ox,oy,
              surface.seed,surface.gold,surface.grain,surface.curvature,job.tiltX,job.tiltY,job.angle,job.gain,
              anchor?.u||0,anchor?.v||0,peak],at);at+=STRIDE;
          }
        }
        gl.clear(gl.COLOR_BUFFER_BIT);
        if(!at)return;
        gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices.subarray(0,at));gl.uniform1f(locations.time,time);gl.drawArrays(gl.TRIANGLES,0,at/STRIDE);
      },
      highlights(slot){return !lost&&!failed?highlights.get(slot)||[]:[];},
      paint(ctx,slot){
        if(lost||failed||!active.has(slot))return;
        const b=surfaces[slot].bounds;ctx.save();ctx.globalCompositeOperation='screen';
        ctx.drawImage(canvas,slot%COLUMNS*TILE,Math.floor(slot/COLUMNS)*TILE,TILE,TILE,...b);ctx.restore();
      }
    };
  }
  globalThis.NightGlitter={create};
})();
