import { initFarmTools } from './farm-tools.js';
import { initDataLayers } from './data-layers.js';
// Canvas terrain renderer for devices without a WebGL2 context.
// Uses the same measured heights, projected coordinates and georeferenced texture.
export async function startSoftwareMap(data,parcel){
 const $=s=>document.querySelector(s),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:false});$('#scene').appendChild(canvas);
 const bounds=data.bounds,W=bounds.xmax-bounds.xmin,D=bounds.ymax-bounds.ymin,cx=(bounds.xmin+bounds.xmax)/2,cy=(bounds.ymin+bounds.ymax)/2;
 let picture=new Image();picture.src='./data/aerial.jpg';await picture.decode();
 let mode='aerial',relief=2,yaw=-.16,pitch=1.03,zoom=1,panX=0,panY=0,boundary=true,selected=null,needsDraw=true,lastFrame=0,triangles=[],frameCount=0;
 const pointers=new Map();let dragStart=null,moved=false,farmTools,dataLayers,layerPicture,drawingMode=false;
 function height(u,v){const x=Math.max(0,Math.min(1,u))*(data.cols-1),y=Math.max(0,Math.min(1,v))*(data.rows-1),c=Math.min(data.cols-2,Math.floor(x)),r=Math.min(data.rows-2,Math.floor(y)),fx=x-c,fy=y-r,h=data.heights;return h[r*data.cols+c]*(1-fx)*(1-fy)+h[r*data.cols+c+1]*fx*(1-fy)+h[(r+1)*data.cols+c]*(1-fx)*fy+h[(r+1)*data.cols+c+1]*fx*fy;}
 function inside(x,y){let ok=false;const p=parcel.coordinates;for(let i=0,j=p.length-1;i<p.length;j=i++){if((p[i][1]>y)!=(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])ok=!ok;}return ok;}
 function vertex(u,v){return{x:(u-.5)*W,z:(v-.5)*D,h:height(u,v),u,v};}
 const cellsX=48,cellsY=48,vertices=[];
 for(let r=0;r<=cellsY;r++)for(let c=0;c<=cellsX;c++)vertices.push(vertex(c/cellsX,r/cellsY));
 const faces=[];for(let r=0;r<cellsY;r++)for(let c=0;c<cellsX;c++){const a=r*(cellsX+1)+c;faces.push([a,a+cellsX+1,a+1],[a+1,a+cellsX+1,a+cellsX+2]);}
 const perimeter=[];for(let c=0;c<=cellsX;c++)perimeter.push(c);for(let r=1;r<=cellsY;r++)perimeter.push(r*(cellsX+1)+cellsX);for(let c=cellsX-1;c>=0;c--)perimeter.push(cellsY*(cellsX+1)+c);for(let r=cellsY-1;r>=0;r--)perimeter.push(r*(cellsX+1));perimeter.push(perimeter[0]);
 const ground=document.createElement('canvas');ground.width=1024;ground.height=1024;const gc=ground.getContext('2d'),im=gc.createImageData(1024,1024);
 const stops=[[0,[57,98,77]],[.3,[105,137,97]],[.6,[167,181,130]],[1,[224,219,177]]];
 for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const h=height(x/1023,y/1023),t=(h-data.min)/(data.max-data.min);let a=stops[0],b=stops[3];for(let q=1;q<stops.length;q++)if(t<=stops[q][0]){a=stops[q-1];b=stops[q];break;}const f=(t-a[0])/(b[0]-a[0]),i=(y*1024+x)*4,k=Math.abs(h/5-Math.round(h/5))<.027?.78:1;for(let j=0;j<3;j++)im.data[i+j]=(a[1][j]+(b[1][j]-a[1][j])*f)*k;im.data[i+3]=255;}gc.putImageData(im,0,0);
 const flowData=buildFlow();
 let screenW=innerWidth,screenH=innerHeight,dpr=Math.min(devicePixelRatio,1.6),scale=1,ox=0,oy=0;
 const surfaceCache=document.createElement('canvas'),surfaceContext=surfaceCache.getContext('2d',{alpha:false});
 function resize(){screenW=innerWidth;screenH=innerHeight;dpr=Math.min(devicePixelRatio,1.6);canvas.width=Math.round(screenW*dpr);canvas.height=Math.round(screenH*dpr);canvas.style.width=screenW+'px';canvas.style.height=screenH+'px';needsDraw=true;}resize();
 function setupProjection(){const mobile=screenW<650;baseScale();ox=screenW*(mobile?.51:.59)+panX;oy=screenH*(mobile?.45:.53)+panY;}
 function baseScale(){const mobile=screenW<650;scale=Math.min(screenW*(mobile?.9:.78)/(Math.abs(W*Math.cos(yaw))+Math.abs(D*Math.sin(yaw))),screenH*(mobile?.5:.79)/(Math.abs(W*Math.sin(yaw))*Math.sin(pitch)+Math.abs(D*Math.cos(yaw))*Math.sin(pitch)))*zoom;}
 function project(p){const x=p.x*Math.cos(yaw)+p.z*Math.sin(yaw),z=-p.x*Math.sin(yaw)+p.z*Math.cos(yaw),y=(p.h-data.min)*relief;return{x:ox+x*scale,y:oy+(z*Math.sin(pitch)-y*Math.cos(pitch))*scale,depth:z*Math.cos(pitch)+y*Math.sin(pitch),u:p.u,v:p.v,h:p.h};}
 function pxy(x,y,up=0){const p=vertex((x-bounds.xmin)/W,(bounds.ymax-y)/D);p.h+=up/relief;return project(p);}
 function triangle(image,a,b,c){const sw=image.width,sh=image.height,s0={x:a.u*sw,y:a.v*sh},s1={x:b.u*sw,y:b.v*sh},s2={x:c.u*sw,y:c.v*sh};
  const den=s0.x*(s1.y-s2.y)+s1.x*(s2.y-s0.y)+s2.x*(s0.y-s1.y);if(Math.abs(den)<.001)return;
  const m11=(a.x*(s1.y-s2.y)+b.x*(s2.y-s0.y)+c.x*(s0.y-s1.y))/den,m12=(a.y*(s1.y-s2.y)+b.y*(s2.y-s0.y)+c.y*(s0.y-s1.y))/den,m21=(a.x*(s2.x-s1.x)+b.x*(s0.x-s2.x)+c.x*(s1.x-s0.x))/den,m22=(a.y*(s2.x-s1.x)+b.y*(s0.x-s2.x)+c.y*(s1.x-s0.x))/den,tx=(a.x*(s1.x*s2.y-s2.x*s1.y)+b.x*(s2.x*s0.y-s0.x*s2.y)+c.x*(s0.x*s1.y-s1.x*s0.y))/den,ty=(a.y*(s1.x*s2.y-s2.x*s1.y)+b.y*(s2.x*s0.y-s0.x*s2.y)+c.y*(s0.x*s1.y-s1.x*s0.y))/den;
  const mx=(a.x+b.x+c.x)/3,my=(a.y+b.y+c.y)/3,expand=p=>{const d=Math.hypot(p.x-mx,p.y-my);return{x:p.x+(p.x-mx)/d*.7,y:p.y+(p.y-my)/d*.7};},aa=expand(a),bb=expand(b),cc=expand(c);
  ctx.save();ctx.beginPath();ctx.moveTo(aa.x,aa.y);ctx.lineTo(bb.x,bb.y);ctx.lineTo(cc.x,cc.y);ctx.closePath();ctx.clip();ctx.transform(m11,m12,m21,m22,tx,ty);ctx.drawImage(image,0,0);ctx.restore();
 }
 function draw(time){
  ctx.setTransform(dpr,0,0,dpr,0,0);setupProjection();
  if(needsDraw||surfaceCache.width!==canvas.width||surfaceCache.height!==canvas.height){
  const bg=ctx.createRadialGradient(screenW*.55,screenH*.4,50,screenW*.55,screenH*.4,screenW*.8);bg.addColorStop(0,'#e0e8da');bg.addColorStop(1,'#cbd8ca');ctx.fillStyle=bg;ctx.fillRect(0,0,screenW,screenH);setupProjection();
  const ps=vertices.map(project);triangles=faces.map(f=>{const p=f.map(i=>ps[i]);return{p,depth:p.reduce((s,v)=>s+v.depth,0)/3};}).sort((a,b)=>a.depth-b.depth);
  // Ground-model edge, kept subtle so it reads as a piece of the real landscape.
  ctx.fillStyle='#8d9f83';for(let n=0;n<perimeter.length-1;n++){const i=perimeter[n],j=perimeter[n+1],a=ps[i],b=ps[j],c=project({...vertices[j],h:data.min-10}),d=project({...vertices[i],h:data.min-10});ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();ctx.fill();}
  const tex=mode==='aerial'?picture:['soil','satellite'].includes(mode)?(layerPicture||ground):ground;
  for(const t of triangles){const[a,b,c]=t.p;if(Math.max(a.x,b.x,c.x)<0||Math.min(a.x,b.x,c.x)>screenW||Math.max(a.y,b.y,c.y)<0||Math.min(a.y,b.y,c.y)>screenH)continue;triangle(tex,a,b,c);}
  if(mode==='ground'||mode==='water'){
   // Slope lighting based on the measured 3D facets, not an invented relief image.
   for(const t of triangles){const[a,b,c]=t.p,va=vertex(a.u,a.v),vb=vertex(b.u,b.v),vc=vertex(c.u,c.v),ux=vb.x-va.x,uy=(vb.h-va.h)*relief,uz=vb.z-va.z,vx=vc.x-va.x,vy=(vc.h-va.h)*relief,vz=vc.z-va.z;let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const length=Math.hypot(nx,ny,nz);if(ny<0){nx=-nx;ny=-ny;nz=-nz;}const light=(nx*-.5+ny*.8+nz*.3)/length,shade=Math.max(0,.22-light*.2);if(shade>.01){ctx.fillStyle=`rgba(19,48,35,${shade})`;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.closePath();ctx.fill();}}
  }
  surfaceCache.width=canvas.width;surfaceCache.height=canvas.height;surfaceContext.drawImage(canvas,0,0);
  }else{ctx.drawImage(surfaceCache,0,0,screenW,screenH);}
  if(mode==='water')drawWater(time);
  if(boundary){ctx.strokeStyle='#f7dc8e';ctx.lineWidth=2;ctx.lineJoin='round';ctx.lineCap='round';ctx.shadowColor='#273c2977';ctx.shadowBlur=3;ctx.beginPath();parcel.coordinates.forEach(([x,y],i)=>{const p=pxy(x,y,3);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.stroke();ctx.shadowBlur=0;}
  const home=pxy(...parcel.home,6);ctx.fillStyle='#fff4c8';ctx.beginPath();ctx.arc(home.x,home.y,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#ffffff99';ctx.lineWidth=1;ctx.beginPath();ctx.arc(home.x,home.y,7,0,Math.PI*2);ctx.stroke();
  if(selected){const p=pxy(selected.x,selected.y,8);ctx.fillStyle='#fff9d7';ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();$('#point-label').style.left=Math.max(90,Math.min(screenW-90,p.x))+'px';$('#point-label').style.top=Math.max(200,Math.min(screenH-100,p.y))+'px';}
  $('#north svg').style.transform=`rotate(${yaw}rad)`;frameCount++;
 }
 function buildFlow(){const n=data.cols*data.rows,to=new Int32Array(n).fill(-1),acc=new Uint32Array(n).fill(1),h=data.heights,dx=W/(data.cols-1),dy=D/(data.rows-1);
  for(let r=1;r<data.rows-1;r++)for(let c=1;c<data.cols-1;c++){const i=r*data.cols+c;let best=0;for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc){const j=i+dr*data.cols+dc,s=(h[i]-h[j])/Math.hypot(dc*dx,dr*dy);if(s>best){best=s;to[i]=j;}}}
  const order=Array.from({length:n},(_,i)=>i).sort((a,b)=>h[b]-h[a]);for(const i of order)if(to[i]>=0)acc[to[i]]+=acc[i];
  const segments=[],traces=[];const v=i=>vertex((i%data.cols)/(data.cols-1),Math.floor(i/data.cols)/(data.rows-1));
  for(let i=0;i<n;i++){if(to[i]<0||acc[i]<22)continue;const p=v(i);if(inside(p.x+cx,cy-p.z))segments.push([p,v(to[i]),acc[i]]);}
  for(let r=5;r<data.rows-5;r+=9)for(let c=5;c<data.cols-5;c+=9){let i=r*data.cols+c;const p=v(i);if(!inside(p.x+cx,cy-p.z))continue;const points=[];for(let j=0;j<120&&i>=0;j++){points.push(v(i));i=to[i];}if(points.length>5)traces.push(points);}
  return{segments,traces};
 }
 function drawWater(time){ctx.lineCap='round';for(const[a,b,acc]of flowData.segments){const p=project(a),q=project(b);ctx.strokeStyle=acc>120?'#b3f1ff':'#57c9e0';ctx.lineWidth=acc>120?1.8:1;ctx.beginPath();ctx.moveTo(p.x,p.y-1);ctx.lineTo(q.x,q.y-1);ctx.stroke();}ctx.fillStyle='#d6fcff';flowData.traces.forEach((pts,i)=>{const f=((time*.00009+i*.618)%1)*(pts.length-1),j=Math.floor(f),a=project(pts[j]),b=project(pts[Math.min(j+1,pts.length-1)]);ctx.beginPath();ctx.arc(a.x+(b.x-a.x)*(f-j),a.y+(b.y-a.y)*(f-j)-2,1.8,0,Math.PI*2);ctx.fill();});}
 function setView(v){mode=v;document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===v;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});const cfg={aerial:['See the whole picture.','Explore the paddocks, shelterbelts and waterways from above.','Aerial imagery over measured terrain'],ground:['Reveal the shape of the land.','See the hollows, ridges and channels beneath the photographic view.','Measured bare-ground terrain · 5 m contours'],soil:['Know the ground beneath.','Explore the broad mapped soil groups beneath the farm.','Mapped soil groups · legacy national classification'],satellite:['Watch the seasons change.','Explore dated satellite photos and vegetation greenness.','Satellite history · dated observations'],water:['Follow the lay of the land.','Explore potential downhill surface flow across the measured terrain.','Illustrative water paths · not a flood prediction']}[v];$('#view-title').textContent=cfg[0];$('#view-description').textContent=cfg[1];$('#caption').textContent=cfg[2];$('#water-note').hidden=v!=='water';needsDraw=true;}
 function reset(){yaw=-.16;pitch=1.03;zoom=1;panX=0;panY=0;needsDraw=true;}
 document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
 $('#relief').addEventListener('input',e=>{relief=+e.target.value;$('#relief-value').textContent=relief+'×';e.target.style.background=`linear-gradient(to right,#638653 ${(relief-1)/3*100}%,#dfe7d8 ${(relief-1)/3*100}%)`;needsDraw=true;});
 $('#boundary-toggle').addEventListener('change',e=>{boundary=e.target.checked;needsDraw=true;});
 $('#zoom-in').addEventListener('click',()=>{zoom=Math.min(5,zoom*1.25);needsDraw=true;});$('#zoom-out').addEventListener('click',()=>{zoom=Math.max(.45,zoom/1.25);needsDraw=true;});$('#reset').addEventListener('click',reset);$('#north').addEventListener('click',()=>{yaw=0;needsDraw=true;});$('#top-down').addEventListener('click',()=>{pitch=Math.PI/2;needsDraw=true;});
 $('#details').addEventListener('click',()=>$('#about-dialog').showModal());$('#close-details').addEventListener('click',()=>$('#about-dialog').close());$('#point-close').addEventListener('click',()=>{selected=null;$('#point-label').hidden=true;needsDraw=true;});
 $('#terrain-source').textContent=data.sourceDescription;$('#aerial-source').textContent=data.aerialDescription;
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});dragStart={x:e.clientX,y:e.clientY};moved=false;});
 canvas.addEventListener('pointermove',e=>{const old=pointers.get(e.pointerId);if(!old)return;const dx=e.clientX-old.x,dy=e.clientY-old.y;if(Math.hypot(e.clientX-dragStart.x,e.clientY-dragStart.y)>5)moved=true;
  if(pointers.size===2){const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)[1];const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(e.clientX-other.x,e.clientY-other.y);if(before>4)zoom=Math.max(.45,Math.min(5,zoom*after/before));panX+=dx/2;panY+=dy/2;
  }else if(drawingMode||e.shiftKey||e.buttons===2){panX+=dx;panY+=dy;}else{yaw+=dx*.006;pitch=Math.max(.25,Math.min(Math.PI/2,pitch+dy*.004));}pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});needsDraw=true;});
 canvas.addEventListener('pointerup',e=>{const click=!moved&&pointers.size===1;pointers.delete(e.pointerId);if(click)pick(e.clientX,e.clientY);});canvas.addEventListener('pointercancel',e=>pointers.delete(e.pointerId));
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.45,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));needsDraw=true;},{passive:false});
 function pick(x,y){for(let i=triangles.length-1;i>=0;i--){const[a,b,c]=triangles[i].p,den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<.0001)continue;const f=((b.y-c.y)*(x-c.x)+(c.x-b.x)*(y-c.y))/den,g=((c.y-a.y)*(x-c.x)+(a.x-c.x)*(y-c.y))/den,k=1-f-g;if(f>=0&&g>=0&&k>=0){const u=a.u*f+b.u*g+c.u*k,v=a.v*f+b.v*g+c.v*k;const picked={x:bounds.xmin+u*W,y:bounds.ymax-v*D};if(farmTools?.handleTap(picked))return;if(dataLayers?.handleTap(picked))return;selected=picked;$('#point-elevation').textContent=height(u,v).toFixed(1)+' m';$('#point-label').hidden=false;needsDraw=true;break;}}}
 farmTools=initFarmTools({bounds,aerialImage:picture,project(x,y){return pxy(x,y,2);},overhead(){pitch=Math.PI/2;needsDraw=true;},interaction(active){drawingMode=active;if(active){selected=null;$('#point-label').hidden=true;}},setAerialImage(img){picture=img;needsDraw=true;}});
 dataLayers=initDataLayers({bounds,aerialImage:picture,getView:()=>mode,clearPick(){selected=null;$('#point-label').hidden=true;needsDraw=true;},setLayerImage(img){layerPicture=img;needsDraw=true;},overhead(){pitch=Math.PI/2;needsDraw=true;}});
 addEventListener('resize',resize);$('#loading').classList.add('loaded');setTimeout(()=>$('#loading').hidden=true,700);
 window.farmExplorer={ready:true,get state(){return{view:mode,relief,boundary,cols:data.cols,rows:data.rows,waterSegments:flowData.segments.length,renderer:'canvas',frameCount}},setView,resetView:reset};
 function loop(time){requestAnimationFrame(loop);if(needsDraw||(mode==='water'&&!$('#about-dialog').open&&time-lastFrame>100)){draw(time);needsDraw=false;lastFrame=time;}}requestAnimationFrame(loop);
}
