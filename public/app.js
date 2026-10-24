import { initFarmTools } from './farm-tools.js';
import { initDataLayers } from './data-layers.js';
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const $ = (s) => document.querySelector(s);
const views = {
  aerial: {title:'See the whole picture.',description:'Explore the paddocks, shelterbelts and waterways from above.',caption:'Aerial imagery over measured terrain'},
  ground: {title:'Reveal the shape of the land.',description:'See the hollows, ridges and channels beneath the photographic view.',caption:'Measured bare-ground terrain · height colour and contours'},
  soil: {title:'Know the ground beneath.',description:'Explore the broad mapped soil groups beneath the farm.',caption:'Mapped soil groups · legacy national classification'},
  satellite: {title:'Watch the seasons change.',description:'Explore dated satellite photos and vegetation greenness.',caption:'Satellite history · dated observations'},
  water: {title:'Follow the lay of the land.',description:'Explore potential downhill surface flow across the measured terrain.',caption:'Illustrative water paths · not a flood prediction'}
};
// A texture's size is fixed once uploaded, so an image of another size needs a fresh texture.
const sameSize=(a,b)=>a&&b&&(a.width||a.naturalWidth)===(b.width||b.naturalWidth)&&(a.height||a.naturalHeight)===(b.height||b.naturalHeight);
let scene, camera, renderer, controls, terrain, terrainMaterial, aerialTexture, dataTexture, dataLayers, dataMaterial;
let dataset, parcel, root, waterGroup, boundaryGroup, pinGroup, marker, groundTexture;
let width, depth, centerX, centerY, datum, relief=2, currentView='aerial';
let selectedPoint=null, waterTraces=[], waterDots, frame=0, farmTools;
let dragging=false, downAt={x:0,y:0}, cameraGoal=null, targetGoal=null;
const world = (x,y,h,raise=0) => new THREE.Vector3(x-centerX,(h-datum)*relief+raise,centerY-y);
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const positions = new THREE.Vector3();

async function main(){
  const [tr,br]=await Promise.all([fetch('./data/terrain.json'),fetch('./data/boundary.json')]);
  if(!tr.ok||!br.ok)throw new Error('The farm data is unavailable. Please refresh the page.');
  dataset=await tr.json(); parcel=await br.json();
  width=dataset.bounds.xmax-dataset.bounds.xmin;depth=dataset.bounds.ymax-dataset.bounds.ymin;
  centerX=(dataset.bounds.xmin+dataset.bounds.xmax)/2; centerY=(dataset.bounds.ymin+dataset.bounds.ymax)/2;
  datum=dataset.min;
  const probe=document.createElement('canvas');
  let hasWebGL=false;try{const gl=probe.getContext('webgl2');hasWebGL=!!gl;gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}
  if(!hasWebGL){const{startSoftwareMap}=await import('./software-map.js');await startSoftwareMap(dataset,parcel);return;}
  scene=new THREE.Scene();scene.background=new THREE.Color('#0b130f');scene.fog=new THREE.Fog('#0b130f',6500,15000);
  camera=new THREE.PerspectiveCamera(37,innerWidth/innerHeight,5,30000);
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.24;
  $('#scene').appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight('#fffdf0','#748e7c',2.4));
  const sun=new THREE.DirectionalLight('#fff8df',2.1);sun.position.set(-1800,3500,1500);scene.add(sun);
  const fill=new THREE.DirectionalLight('#d6e1ef',.7);fill.position.set(2000,1800,-1500);scene.add(fill);
  root=new THREE.Group();scene.add(root);
  const loader=new THREE.TextureLoader();aerialTexture=await loader.loadAsync('./data/aerial.jpg');
  aerialTexture.colorSpace=THREE.SRGBColorSpace;aerialTexture.anisotropy=renderer.capabilities.getMaxAnisotropy();
  dataTexture=new THREE.Texture(aerialTexture.image);dataTexture.colorSpace=THREE.SRGBColorSpace;dataTexture.anisotropy=aerialTexture.anisotropy;dataTexture.needsUpdate=true;
  dataMaterial=new THREE.MeshBasicMaterial({map:dataTexture,toneMapped:false});
  buildTerrain();buildBoundary();buildHome();buildWater();
  controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;
  controls.maxPolarAngle=Math.PI*.47;controls.minDistance=300;controls.maxDistance=10000;controls.screenSpacePanning=true;controls.zoomSpeed=.8;controls.panSpeed=.8;controls.rotateSpeed=.5;
  controls.addEventListener('start',()=>{cameraGoal=null;targetGoal=null;});
  resetView(false);
  bindUI();
  farmTools=initFarmTools({bounds:dataset.bounds,aerialImage:aerialTexture.image,
    project(x,y){const p=world(x,y,heightAt(x,y),2).project(camera);return{x:(p.x*.5+.5)*innerWidth,y:(-p.y*.5+.5)*innerHeight,hidden:p.z>1||p.z< -1};},
    overhead(){document.querySelector('#top-down').click();},
    interaction(active){controls.mouseButtons.LEFT=active?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;controls.touches.ONE=active?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;if(active){selectedPoint=null;document.querySelector('#point-label').hidden=true;if(marker)marker.visible=false;}},
    setAerialImage(img){if(sameSize(aerialTexture.image,img)){aerialTexture.image=img;aerialTexture.needsUpdate=true;return;}const old=aerialTexture;aerialTexture=new THREE.Texture(img);aerialTexture.colorSpace=old.colorSpace;aerialTexture.anisotropy=old.anisotropy;aerialTexture.needsUpdate=true;for(const m of [terrainMaterial,dataMaterial])if(m&&m.map===old){m.map=aerialTexture;m.needsUpdate=true;}old.dispose();}
  });
  dataLayers=initDataLayers({bounds:dataset.bounds,aerialImage:aerialTexture.image,getView:()=>currentView,clearPick(){selectedPoint=null;$('#point-label').hidden=true;if(marker)marker.visible=false;},setLayerImage(img){if(sameSize(dataTexture.image,img)){dataTexture.image=img;dataTexture.needsUpdate=true;return;}const old=dataTexture;dataTexture=new THREE.Texture(img);dataTexture.colorSpace=THREE.SRGBColorSpace;dataTexture.anisotropy=old.anisotropy;dataTexture.needsUpdate=true;for(const m of [terrainMaterial,dataMaterial])if(m&&m.map===old){m.map=dataTexture;m.needsUpdate=true;}old.dispose();},overhead(){document.querySelector('#top-down').click();}});
  const source=dataset.sourceDescription||'Horizons Regional Council / LINZ, Manawatū–Whanganui LiDAR 2015–2016. The mesh is sampled from the measured ground surface.';
  $('#terrain-source').textContent=source;
  if(dataset.aerialDescription)$('#aerial-source').textContent=dataset.aerialDescription;
  $('#loading').classList.add('loaded');setTimeout(()=>$('#loading').hidden=true,700);
  window.farmExplorer={ready:true,get state(){return{view:currentView,relief,boundary:boundaryGroup.visible,cols:dataset.cols,rows:dataset.rows,waterSegments:waterGroup.children[0]?.geometry.attributes.position.count/2}},setView,resetView};
  animate();
}

function buildTerrain(){
  const {cols,rows,heights}=dataset;
  const verts=new Float32Array(cols*rows*3),uv=new Float32Array(cols*rows*2),indices=new Uint32Array((cols-1)*(rows-1)*6);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const i=r*cols+c;verts[i*3]=(c/(cols-1)-.5)*width;verts[i*3+1]=(heights[i]-datum)*relief;verts[i*3+2]=(r/(rows-1)-.5)*depth;
    uv[i*2]=c/(cols-1);uv[i*2+1]=1-r/(rows-1);
  }
  let k=0;for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){const a=r*cols+c;indices.set([a,a+cols,a+1,a+1,a+cols,a+cols+1],k);k+=6;}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(verts,3));geo.setAttribute('uv',new THREE.BufferAttribute(uv,2));geo.setIndex(new THREE.BufferAttribute(indices,1));geo.computeVertexNormals();
  terrainMaterial=new THREE.MeshStandardMaterial({map:aerialTexture,roughness:1,metalness:0});
  terrain=new THREE.Mesh(geo,terrainMaterial);root.add(terrain);
  groundTexture=createGroundTexture();
  const base=new THREE.Mesh(new THREE.PlaneGeometry(18000,18000),new THREE.MeshBasicMaterial({color:'#0b130f'}));base.rotation.x=-Math.PI/2;base.position.y=-9;scene.add(base);
  const skirtPoints=[];for(let c=0;c<cols;c++)skirtPoints.push([c,0]);for(let r=1;r<rows;r++)skirtPoints.push([cols-1,r]);for(let c=cols-2;c>=0;c--)skirtPoints.push([c,rows-1]);for(let r=rows-2;r>=0;r--)skirtPoints.push([0,r]);skirtPoints.push(skirtPoints[0]);
  const sv=[],si=[];for(let n=0;n<skirtPoints.length;n++){const[c,r]=skirtPoints[n],i=r*cols+c;sv.push(verts[i*3],verts[i*3+1],verts[i*3+2],verts[i*3],-7,verts[i*3+2]);if(n<skirtPoints.length-1){const a=n*2;si.push(a,a+1,a+2,a+2,a+1,a+3);}}
  const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(sv,3));sg.setIndex(si);sg.computeVertexNormals();
  const skirt=new THREE.Mesh(sg,new THREE.MeshStandardMaterial({color:'#839882',side:THREE.DoubleSide,roughness:1}));skirt.name='skirt';root.add(skirt);
}

function createGroundTexture(){
  const {cols,rows,heights}=dataset,scale=4,can=document.createElement('canvas');can.width=(cols-1)*scale;can.height=(rows-1)*scale;
  const ctx=can.getContext('2d'),im=ctx.createImageData(can.width,can.height);
  const lo=dataset.min,hi=dataset.max;
  for(let y=0;y<can.height;y++)for(let x=0;x<can.width;x++){
    const h=heightAtUV(x/(can.width-1),y/(can.height-1));const t=Math.max(0,Math.min(1,(h-lo)/(hi-lo)));
    const stops=[[0,[57,98,77]],[.3,[105,137,97]],[.6,[167,181,130]],[1,[224,219,177]]];let a=stops[0],b=stops[3];
    for(let q=1;q<stops.length;q++)if(t<=stops[q][0]){a=stops[q-1];b=stops[q];break;}
    const f=(t-a[0])/(b[0]-a[0]);const p=(y*can.width+x)*4;const contour=Math.abs(h/5-Math.round(h/5))<.025;
    for(let k=0;k<3;k++)im.data[p+k]=(a[1][k]+(b[1][k]-a[1][k])*f)*(contour?.79:1);
    im.data[p+3]=255;
  }
  ctx.putImageData(im,0,0);const tex=new THREE.CanvasTexture(can);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();return tex;
}

function heightAtUV(u,v){
  const{cols,rows,heights}=dataset;const x=THREE.MathUtils.clamp(u,0,1)*(cols-1),y=THREE.MathUtils.clamp(v,0,1)*(rows-1);
  const c=Math.min(cols-2,Math.floor(x)),r=Math.min(rows-2,Math.floor(y)),fx=x-c,fy=y-r;
  return heights[r*cols+c]*(1-fx)*(1-fy)+heights[r*cols+c+1]*fx*(1-fy)+heights[(r+1)*cols+c]*(1-fx)*fy+heights[(r+1)*cols+c+1]*fx*fy;
}
function heightAt(x,y){return heightAtUV((x-dataset.bounds.xmin)/width,(dataset.bounds.ymax-y)/depth);}
function inside(x,y){let ok=false;const p=parcel.coordinates;for(let i=0,j=p.length-1;i<p.length;j=i++){if((p[i][1]>y)!=(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])ok=!ok;}return ok;}
function parcelCenter(){return parcel.center||[centerX,centerY];}

function buildBoundary(){
  boundaryGroup=new THREE.Group();boundaryGroup.name='boundary';root.add(boundaryGroup);
  const points=[];const p=parcel.coordinates;for(let i=0;i<p.length;i++){
    const a=p[i],b=p[(i+1)%p.length],steps=Math.max(2,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/10));
    for(let j=0;j<steps;j++){const x=a[0]+(b[0]-a[0])*j/steps,y=a[1]+(b[1]-a[1])*j/steps;points.push(world(x,y,heightAt(x,y),4));}
  }points.push(points[0].clone());
  const curve=new THREE.CatmullRomCurve3(points,false,'catmullrom',0);
  const tube=new THREE.TubeGeometry(curve,points.length,2.2,5,false);
  boundaryGroup.add(new THREE.Mesh(tube,new THREE.MeshBasicMaterial({color:'#f5d889',transparent:true,opacity:.98,depthTest:true})));
}
function buildHome(){
  pinGroup=new THREE.Group();root.add(pinGroup);const[x,y]=parcel.home||[1814006.992,5546370.285];
  pinGroup.position.copy(world(x,y,heightAt(x,y),9));
  const dot=new THREE.Mesh(new THREE.SphereGeometry(9,16,12),new THREE.MeshBasicMaterial({color:'#fff6d8'}));pinGroup.add(dot);
  const ring=new THREE.Mesh(new THREE.RingGeometry(12,17,36),new THREE.MeshBasicMaterial({color:'#f5d889',side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;pinGroup.add(ring);
}

function buildWater(){
  waterGroup=new THREE.Group();waterGroup.visible=false;root.add(waterGroup);waterTraces=[];
  const{cols,rows,heights}=dataset,n=cols*rows,dx=width/(cols-1),dz=depth/(rows-1),flow=new Int32Array(n).fill(-1),acc=new Uint32Array(n).fill(1);
  for(let r=1;r<rows-1;r++)for(let c=1;c<cols-1;c++){
    const i=r*cols+c;let best=0,bestJ=-1;
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc){const j=i+dr*cols+dc,s=(heights[i]-heights[j])/Math.hypot(dc*dx,dr*dz);if(s>best){best=s;bestJ=j;}}
    flow[i]=bestJ;
  }
  const order=Array.from({length:n},(_,i)=>i).sort((a,b)=>heights[b]-heights[a]);for(const i of order)if(flow[i]>=0)acc[flow[i]]+=acc[i];
  const pos=[],colors=[];const blue=new THREE.Color('#58cde1');const thickPos=[];
  function cell(i,up=3){const r=Math.floor(i/cols),c=i%cols;return new THREE.Vector3((c/(cols-1)-.5)*width,(heights[i]-datum)*relief+up,(r/(rows-1)-.5)*depth);}
  for(let i=0;i<n;i++){
    const j=flow[i];if(j<0||acc[i]<22)continue;
    const x=dataset.bounds.xmin+(i%cols)*dx,y=dataset.bounds.ymax-Math.floor(i/cols)*dz;
    if(!inside(x,y))continue;
    pos.push(...cell(i).toArray(),...cell(j).toArray());
    const t=Math.min(1,acc[i]/160),col=blue.clone().lerp(new THREE.Color('#b9f4ff'),t);colors.push(col.r,col.g,col.b,col.r,col.g,col.b);
    if(acc[i]>95)thickPos.push(...cell(i,4).toArray(),...cell(j,4).toArray());
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  waterGroup.add(new THREE.LineSegments(geo,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.83})));
  for(let r=5;r<rows-5;r+=7)for(let c=5;c<cols-5;c+=7){
    const start=r*cols+c,x=dataset.bounds.xmin+c*dx,y=dataset.bounds.ymax-r*dz;
    if(!inside(x,y)||flow[start]<0)continue;
    const pts=[];let i=start;for(let k=0;k<160&&i>=0;k++){pts.push(cell(i,6));i=flow[i];}
    if(pts.length>5)waterTraces.push({points:pts,offset:Math.random()});
  }
  const dpos=new Float32Array(waterTraces.length*3),dgeo=new THREE.BufferGeometry();dgeo.setAttribute('position',new THREE.BufferAttribute(dpos,3));
  waterDots=new THREE.Points(dgeo,new THREE.PointsMaterial({color:'#d6fcff',size:6,sizeAttenuation:false,transparent:true,opacity:.95,depthWrite:false}));waterGroup.add(waterDots);
}

function setRelief(value){
  relief=value;const a=terrain.geometry.attributes.position;for(let i=0;i<dataset.heights.length;i++)a.array[i*3+1]=(dataset.heights[i]-datum)*relief;a.needsUpdate=true;terrain.geometry.computeVertexNormals();
  const skirt=root.getObjectByName('skirt');root.remove(skirt);skirt.geometry.dispose();skirt.material.dispose();
  // Recreate the small edge skirt to keep the model sides attached to the terrain.
  const{cols,rows}=dataset;const perimeter=[];for(let c=0;c<cols;c++)perimeter.push(c);for(let r=1;r<rows;r++)perimeter.push(r*cols+cols-1);for(let c=cols-2;c>=0;c--)perimeter.push((rows-1)*cols+c);for(let r=rows-2;r>=0;r--)perimeter.push(r*cols);perimeter.push(perimeter[0]);
  const verts=[],inds=[];perimeter.forEach((i,k)=>{verts.push(a.array[i*3],a.array[i*3+1],a.array[i*3+2],a.array[i*3],-7,a.array[i*3+2]);if(k<perimeter.length-1){const q=k*2;inds.push(q,q+1,q+2,q+2,q+1,q+3);}});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setIndex(inds);g.computeVertexNormals();const s=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:'#839882',side:THREE.DoubleSide,roughness:1}));s.name='skirt';root.add(s);
  const show=boundaryGroup.visible;disposeGroup(boundaryGroup);buildBoundary();boundaryGroup.visible=show;
  disposeGroup(pinGroup);buildHome();disposeGroup(waterGroup);buildWater();waterGroup.visible=currentView==='water';
  if(selectedPoint)showElevation(selectedPoint.x,selectedPoint.y);
  $('#relief-value').textContent=`${relief}×`;
  $('#relief').style.background=`linear-gradient(to right,#638653 ${(relief-1)/3*100}%,#dfe7d8 ${(relief-1)/3*100}%)`;
}
function disposeGroup(group){root.remove(group);group.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}
function setView(v){
  currentView=v;document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===v;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
  const cfg=views[v];$('#view-title').textContent=cfg.title;$('#view-description').textContent=cfg.description;$('#caption').textContent=cfg.caption;$('#water-note').hidden=v!=='water';
  terrain.material=['soil','satellite'].includes(v)?dataMaterial:terrainMaterial;
  terrainMaterial.map=v==='aerial'?aerialTexture:['soil','satellite'].includes(v)?dataTexture:groundTexture;terrainMaterial.color.set(v==='water'?'#c4d9ce':'#ffffff');terrainMaterial.needsUpdate=true;waterGroup.visible=v==='water';
}
function flyTo(pos,target){cameraGoal=pos;targetGoal=target;}
function resetView(animate=true){
  const[cx,cy]=parcelCenter(),target=world(cx,cy,heightAt(cx,cy));
  const mobile=innerWidth<650,dist=Math.max(parcel.width||2100,parcel.height||2400)*(mobile?2.35:1.65);
  const pos=target.clone().add(new THREE.Vector3(dist*.25,dist*.71,dist*.69));
  if(animate)flyTo(pos,target);else{camera.position.copy(pos);controls.target.copy(target);controls.update();}
}
function bindUI(){
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  let reliefTimer;$('#relief').addEventListener('input',e=>{const v=+e.target.value;$('#relief-value').textContent=`${v}×`;clearTimeout(reliefTimer);reliefTimer=setTimeout(()=>setRelief(v),65);});
  $('#boundary-toggle').addEventListener('change',e=>boundaryGroup.visible=e.target.checked);
  $('#reset').addEventListener('click',()=>resetView());
  $('#top-down').addEventListener('click',()=>{const t=controls.target.clone(),d=camera.position.distanceTo(t);flyTo(t.clone().add(new THREE.Vector3(0,d,.1)),t);});
  $('#north').addEventListener('click',()=>{const t=controls.target.clone(),d=camera.position.distanceTo(t),phi=controls.getPolarAngle();flyTo(t.clone().add(new THREE.Vector3(0,Math.cos(phi)*d,Math.sin(phi)*d)),t);});
  $('#zoom-in').addEventListener('click',()=>{const t=controls.target.clone();flyTo(t.clone().add(camera.position.clone().sub(t).multiplyScalar(.78)),t);});
  $('#zoom-out').addEventListener('click',()=>{const t=controls.target.clone();flyTo(t.clone().add(camera.position.clone().sub(t).multiplyScalar(1.28)),t);});
  const dialog=$('#about-dialog');$('#details').addEventListener('click',()=>dialog.showModal());$('#close-details').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  $('#point-close').addEventListener('click',()=>{selectedPoint=null;$('#point-label').hidden=true;if(marker)marker.visible=false;});
  renderer.domElement.addEventListener('pointerdown',e=>{downAt={x:e.clientX,y:e.clientY};dragging=false;});
  renderer.domElement.addEventListener('pointermove',e=>{if(Math.hypot(e.clientX-downAt.x,e.clientY-downAt.y)>6)dragging=true;});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(dragging||e.button!==0)return;pointer.x=e.clientX/innerWidth*2-1;pointer.y=-e.clientY/innerHeight*2+1;raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObject(terrain);
    if(hits.length){const p=hits[0].point;if(farmTools?.handleTap({x:p.x+centerX,y:centerY-p.z}))return;if(dataLayers?.handleTap({x:p.x+centerX,y:centerY-p.z}))return;showElevation(p.x+centerX,centerY-p.z);}
  });
  addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
}
function showElevation(x,y){
  selectedPoint={x,y};const h=heightAt(x,y);$('#point-elevation').textContent=`${h.toFixed(1)} m`;
  if(!marker){marker=new THREE.Mesh(new THREE.SphereGeometry(8,16,12),new THREE.MeshBasicMaterial({color:'#fff9d7'}));root.add(marker);}
  marker.visible=true;marker.position.copy(world(x,y,h,8));$('#point-label').hidden=false;
}
// Fill each slider's track up to its thumb; buttons and playback move them without an input event.
function paintRanges(){document.querySelectorAll('input[type=range]').forEach(r=>{const min=+r.min||0,max=+r.max||100,pct=max>min?((+r.value-min)/(max-min))*100:0,bg=`linear-gradient(to right,#638653 ${pct}%,#1d2b24 ${pct}%)`;if(r.dataset.fill!==bg){r.dataset.fill=bg;r.style.background=bg;}});}
function animate(time=0){paintRanges();
  requestAnimationFrame(animate);frame++;
  if(cameraGoal){camera.position.lerp(cameraGoal,.075);controls.target.lerp(targetGoal,.075);if(camera.position.distanceTo(cameraGoal)<1){camera.position.copy(cameraGoal);controls.target.copy(targetGoal);cameraGoal=null;targetGoal=null;}}
  controls.update();$('#north svg').style.transform=`rotate(${-controls.getAzimuthalAngle()}rad)`;
  if(currentView==='water'&&waterDots){const a=waterDots.geometry.attributes.position;waterTraces.forEach((tr,i)=>{const f=((time*.00009+tr.offset)%1)*(tr.points.length-1),j=Math.floor(f);positions.lerpVectors(tr.points[j],tr.points[Math.min(j+1,tr.points.length-1)],f-j);a.setXYZ(i,positions.x,positions.y,positions.z);});a.needsUpdate=true;}
  if(selectedPoint){const p=world(selectedPoint.x,selectedPoint.y,heightAt(selectedPoint.x,selectedPoint.y),16).project(camera);const el=$('#point-label');el.style.left=`${THREE.MathUtils.clamp((p.x*.5+.5)*innerWidth,90,innerWidth-90)}px`;el.style.top=`${THREE.MathUtils.clamp((-p.y*.5+.5)*innerHeight,200,innerHeight-100)}px`;el.style.visibility=p.z>1?'hidden':'visible';}
  renderer.render(scene,camera);
}

main().catch(error=>{console.error(error);$('#loading').hidden=true;$('#error').hidden=false;$('#error-text').textContent=error.message.includes('WebGL')?'This device could not start the 3D view. Try a current version of Chrome or Safari with graphics acceleration enabled.':error.message;});
