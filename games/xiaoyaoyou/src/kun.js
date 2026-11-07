import * as THREE from 'three';

export const SWIM = Object.freeze({ periodMs: 4200, bodyLength: 10.4,
  flukeAmpFrac: .10, headAmpFrac: .012, wavelength: 1.1, finLagRadians: .65 });

// All displacement is vertical. The same continuous field bends body, mouth,
// ridge and stock; fin-local UV weights add a small delay towards the tips.
const waveGLSL = `
uniform float kunCycle, kunEnabled, kunNose, kunTail;
attribute float kunSpan;
attribute vec3 kunSpanGradient;
float kunHeight(vec3 p, float span) {
  float t = clamp((kunNose-p.z)/(kunNose-kunTail),0.0,1.0);
  float a = ${SWIM.bodyLength.toFixed(4)} * (${SWIM.headAmpFrac.toFixed(4)} +
    ${(SWIM.flukeAmpFrac-SWIM.headAmpFrac).toFixed(4)}*t*t);
  return kunEnabled * a * sin(6.28318530718*(${SWIM.wavelength.toFixed(4)}*t-kunCycle)+${SWIM.finLagRadians.toFixed(4)}*span);
}
vec3 kunBentNormal(vec3 p, vec3 n, float span, vec3 spanGradient) {
  float e=.005;
  float h=kunHeight(p,span);
  vec3 d=vec3(
    kunHeight(p+vec3(e,0,0),span+e*spanGradient.x)-h,
    kunHeight(p+vec3(0,e,0),span+e*spanGradient.y)-h,
    kunHeight(p+vec3(0,0,e),span+e*spanGradient.z)-h)/e;
  float ny=n.y/(1.0+d.y);
  return normalize(vec3(n.x-d.x*ny,ny,n.z-d.z*ny));
}
`;

function finCoordinates(mesh) {
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position;
  const span = new Float32Array(positions.count);
  const gradients = new Float32Array(positions.count * 3);
  const root = mesh.userData.finRootUV, tip = mesh.userData.finTipUV;
  if (root && tip) {
    const uv = geometry.attributes.uv;
    const dx = tip[0]-root[0], dy = tip[1]-root[1], length2=dx*dx+dy*dy;
    for (let i=0;i<span.length;i++) span[i]=THREE.MathUtils.clamp(
      ((uv.getX(i)-root[0])*dx+(uv.getY(i)-root[1])*dy)/length2,0,1);
    const counts = new Uint32Array(span.length);
    const index = geometry.index;
    const p=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
    for (let i=0;i<index.count;i+=3) {
      const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];
      ids.forEach((id,j)=>p[j].fromBufferAttribute(positions,id));
      const a=p[1].clone().sub(p[0]), b=p[2].clone().sub(p[0]);
      const aa=a.dot(a), bb=b.dot(b), ab=a.dot(b), det=aa*bb-ab*ab;
      if(det<1e-14) continue;
      const da=span[ids[1]]-span[ids[0]], db=span[ids[2]]-span[ids[0]];
      const grad=a.multiplyScalar((da*bb-db*ab)/det).addScaledVector(b,(db*aa-da*ab)/det);
      for(const id of ids) { gradients[id*3]+=grad.x; gradients[id*3+1]+=grad.y; gradients[id*3+2]+=grad.z; counts[id]++; }
    }
    for(let i=0;i<span.length;i++) for(let j=0;j<3;j++) gradients[i*3+j]/=Math.max(1,counts[i]);
  }
  geometry.setAttribute('kunSpan',new THREE.BufferAttribute(span,1));
  geometry.setAttribute('kunSpanGradient',new THREE.BufferAttribute(gradients,3));
}

const DIFFUSE_FILL = [.12, .16, .19];
const SHEET_TRANSMISSION = .50;
// Sea look, off in the grey sheet views so they still compare with Blender.
// The warm key is the only warm light in the sea: a pool on the back under the shaft. Past it
// the top light is cold, and the belly falls into dark blue water, as sampled from the key art.
const LOOK = Object.freeze({ warm: [3.0, 2.08, 1.05], cool: [.5, .68, .78], shadow: [.03, .062, .085], sky: [.1, .155, .19], rim: [.86, .92, .9],
  rimPower: 3.2, rimGain: .22, caustic: 2.2, wrap: .34, poolCenter: .31, poolWidth: .3 });

// The sheet's ear-clipped slivers carry slightly different normals, so anything that must stay smooth
// across a fin reads the fin's mean normal.
function meanNormal(geometry) {
  const normals = geometry.attributes.normal, mean = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < normals.count; i++) mean.add(n.fromBufferAttribute(normals, i));
  return mean.normalize();
}

// The body comes first and the fins second. A fin's ink bleeds soft and lifts toward a mid wash,
// most on the undersides, and its sheet takes less of the key. The tail keeps its own look.
const FIN = Object.freeze({ bleed: 4.4, bleedMix: .86, wash: [.2, .29, .34], lift: .56, liftUnder: .86, under: [.42, .5, .53], underMix: .5, keep: .66, veil: .84, even: .55, evenAlpha: .66, edgeOn: [.08, .5] });

export function prepareKun(root, gobo, light, finEdge) {
  root.updateMatrixWorld(true);
  const meshes=[];
  root.traverse(object=>{if(object.isMesh) meshes.push(object);});
  // Meshopt's quantization may add node transforms. Bake those and the manifest
  // anchor into one entity space, so the shader field is continuous at joins.
  for(const mesh of meshes) {
    mesh.geometry=mesh.geometry.clone();
    // Quantized normalized integer buffers cannot store the world coordinates
    // produced by a matrix bake. Decode first, including transformed normals.
    for(const name of ['position','normal']) {
      const source=mesh.geometry.attributes[name];
      const values=new Float32Array(source.count*3);
      for(let i=0;i<source.count;i++) {
        values[i*3]=source.getX(i);values[i*3+1]=source.getY(i);values[i*3+2]=source.getZ(i);
      }
      mesh.geometry.setAttribute(name,new THREE.BufferAttribute(values,3));
    }
    mesh.geometry.applyMatrix4(mesh.matrixWorld);
    mesh.matrixAutoUpdate=true;
    mesh.position.set(0,0,0); mesh.rotation.set(0,0,0); mesh.scale.set(1,1,1);
  }
  root.clear();
  root.add(...meshes);
  root.updateMatrixWorld(true);
  const body=meshes.find(mesh=>mesh.name==='kun_body');
  const fluke=meshes.find(mesh=>mesh.name==='kun_fluke');
  body.geometry.computeBoundingBox(); fluke.geometry.computeBoundingBox();
  const uniforms={ kunCycle:{value:0},kunEnabled:{value:1},
    kunNose:{value:body.geometry.boundingBox.max.z},kunTail:{value:fluke.geometry.boundingBox.min.z},
    kunLook:{value:0},kunLight:{value:light},kunGobo:{value:gobo},kunTime:{value:0},kunSize:{value:1},
    kunWarm:{value:new THREE.Vector3(...LOOK.warm)},kunCool:{value:new THREE.Vector3(...LOOK.cool)},kunShadow:{value:new THREE.Vector3(...LOOK.shadow)},
    kunSky:{value:new THREE.Vector3(...LOOK.sky)},kunRim:{value:new THREE.Vector3(...LOOK.rim)},
    kunFinEdge:{value:finEdge},kunFinWash:{value:new THREE.Vector3(...FIN.wash)} };
  const materials=[];
  let finIndex=0;
  for(const mesh of meshes) {
    const old=mesh.material;
    const sheet=mesh.name.startsWith('kun_fin_')||mesh.name==='kun_fluke';
    if(old.map) old.map.anisotropy=8;
    // Pleats are about a pixel wide in play, so they blend in rather than alias.
    const pleat=old.name==='kun_pleat';
    const material=new THREE.MeshLambertMaterial({ name:old.name,
      color:old.color, map:old.map, transparent:sheet||pleat, opacity:old.opacity,
      side:sheet?THREE.DoubleSide:THREE.FrontSide, depthWrite:!sheet&&!pleat });
    // Lambert has no specular lobe, metalness, environment reflection or rim.
    // The traced sheet has coplanar triangles that overlap, and each overlap would blend twice,
    // as a fan of pale ribs. The stencil lets each fin draw a pixel once, with the mesh untouched.
    if(mesh.name.startsWith('kun_fin_')) Object.assign(material,{stencilWrite:true,stencilFunc:THREE.NotEqualStencilFunc,
      stencilRef:++finIndex,stencilZPass:THREE.ReplaceStencilOp});
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.uniforms.kunDiffuseFill={value:new THREE.Vector3(...DIFFUSE_FILL)};
      shader.uniforms.kunTransmission={value:sheet?SHEET_TRANSMISSION:0};
      shader.uniforms.kunSheet={value:sheet?1:0};
      shader.uniforms.kunFin={value:mesh.name.startsWith('kun_fin_')?1:0};
      shader.uniforms.kunFinNormal={value:meanNormal(mesh.geometry)};
      shader.uniforms.kunPleat={value:mesh.name.startsWith('kun_throat_pleat')?1:mesh.name.startsWith('kun_mouth')?.45:0};
      shader.uniforms.kunRidge={value:mesh.name==='kun_dorsal_ridge'?1:0};
      shader.fragmentShader=`uniform vec3 kunDiffuseFill,kunLight,kunWarm,kunCool,kunShadow,kunSky,kunRim,kunFinWash;
        uniform float kunTransmission,kunLook,kunTime,kunSize,kunSheet,kunPleat,kunRidge,kunFin;
        uniform sampler2D kunGobo,kunFinEdge;
        varying vec3 vKunWorld,vKunNormal,vKunFlat;
        varying float vKunAlong;
      `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>', `
        #include <lights_fragment_end>
        // Cool ambient diffuse wash lifts the paper without adding a highlight.
        reflectedLight.indirectDiffuse += diffuseColor.rgb * kunDiffuseFill;
        #if NUM_DIR_LIGHTS > 0
          // Thin-sheet back lighting is strongest in the translucent paper.
          // Dense ink blocks transmission; neither term is specular or a rim.
          float backLight=max(0.0,dot(-normal,directionalLights[0].direction));
          reflectedLight.directDiffuse += diffuseColor.rgb * directionalLights[0].color *
            (RECIPROCAL_PI * kunTransmission * (1.0-diffuseColor.a) * backLight);
        #endif
        // Pleats are about a pixel wide: they read as folds in the throat, in any view.
        diffuseColor.a*=1.-kunPleat*.72;
        if(kunLook>.5){
          // Soft wrapped top light, dappled by the same caustics that fall on the rocks.
          vec3 n=normalize(vKunNormal);
          #ifdef DOUBLE_SIDED
            n*=gl_FrontFacing?1.:-1.;
          #endif
          vec3 toEye=normalize(cameraPosition-vKunWorld);
          float ndl=dot(n,kunLight);
          float lit=clamp((ndl+${LOOK.wrap.toFixed(2)})/${(1+LOOK.wrap).toFixed(2)},0.,1.);
          lit*=lit;
          vec2 q=vKunWorld.xz/(kunSize*11.);
          float web=min(texture2D(kunGobo,q+vec2(kunTime*.011,kunTime*.007)).g+.2,
                        texture2D(kunGobo,q*.73-vec2(kunTime*.008,-kunTime*.012)).g+.2);
          float pool=exp(-pow((vKunAlong-${LOOK.poolCenter.toFixed(2)})/${LOOK.poolWidth.toFixed(2)},2.));
          vec3 kunKey=mix(kunCool,kunWarm,pool);
          // Sheets take the caustics softly: light through a membrane spreads, it never bands.
          float dapple=mix(web*web,.14+.3*web,kunSheet);
          vec3 key=kunKey*lit*(.62+${LOOK.caustic.toFixed(2)}*dapple);
          // Strong top light lifts the ink toward the paper, as it does in the key art.
          vec3 painted=mix(diffuseColor.rgb,mix(vec3(.94,.93,.89),vec3(.97,.9,.76),pool),lit*lit*.3*(1.-kunSheet*.8));
          float finVeil=diffuseColor.a;
          #ifdef USE_MAP
            if(kunFin>.5){
              // Low mips bleed the blotch edges as wet ink does; the darks then lift to a mid wash.
              vec4 bled=texture2D(map,vMapUv,${FIN.bleed.toFixed(2)});
              painted=mix(painted,bled.rgb,${FIN.bleedMix.toFixed(2)});
              // Alpha comes from the bled paint alone: sharp alpha turns the paint's fine rays into ribs.
              finVeil=mix(bled.a,${FIN.evenAlpha.toFixed(2)},${FIN.even.toFixed(2)});
              float ink=1.-smoothstep(.03,.4,dot(painted,vec3(.2126,.7152,.0722)));
              // Transparent double-sided sheets draw in two passes, so n keeps the mesh's own side.
              float under=smoothstep(.2,-.5,n.y*(dot(n,toEye)<0.?-1.:1.));
              painted=mix(painted,kunFinWash,ink*mix(${FIN.lift.toFixed(2)},${FIN.liftUnder.toFixed(2)},under));
              // Undersides see only the fill light, which keeps every value ratio, so narrow the paint itself.
              painted=mix(painted,vec3(${FIN.under.map(v=>v.toFixed(2)).join(',')}),under*${FIN.underMix.toFixed(2)});
            }
          #endif
          // Pleats read as soft grooves, and the ridge strip melts into the back.
          painted=mix(painted,vec3(.9,.92,.92),kunRidge*.72);
          vec3 fill=mix(kunShadow,kunSky,n.y*.5+.5);
          reflectedLight.directDiffuse=painted*key*(1.-kunSheet*.3)*(1.-kunPleat)*(1.-kunFin*${(1-FIN.keep).toFixed(2)});
          reflectedLight.indirectDiffuse=painted*fill;
          // A cream edge where the surface turns away; never a hard line.
          float facing=clamp(dot(n,toEye),0.,1.);
          float rim=pow(1.-facing,${LOOK.rimPower.toFixed(2)})*smoothstep(-.35,.75,n.y);
          totalEmissiveRadiance+=kunRim*rim*${LOOK.rimGain.toFixed(2)}*(1.-kunSheet*.55)*(1.-kunPleat);
          if(kunSheet>.5){
            // Thin sheets glow where light passes through them; dense ink stays dark.
            float paper=clamp((1.-diffuseColor.a)/.62,0.,1.);
            float through=abs(ndl)*.55+.7*pow(clamp(dot(toEye,-kunLight),0.,1.),2.);
            totalEmissiveRadiance+=painted*kunKey*(.3+.7*paper)*(.03+.17*through)*(.8+web*.5);
          }
          #ifdef USE_MAP
            // Last, so a fading edge never reads as thin paper and glows. The edge melts into the water.
            // Edge-on, a wide fade collapses into a hard line, so the veil thins out as it turns away.
            if(kunFin>.5) diffuseColor.a=finVeil*${FIN.veil.toFixed(2)}*texture2D(kunFinEdge,vMapUv).r*
              smoothstep(${FIN.edgeOn[0].toFixed(2)},${FIN.edgeOn[1].toFixed(2)},abs(dot(normalize(vKunFlat),toEye)));
          #endif
        }
      `);
      shader.vertexShader='uniform vec3 kunFinNormal;\nvarying vec3 vKunWorld,vKunNormal,vKunFlat;\nvarying float vKunAlong;\n'+waveGLSL+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\nobjectNormal=kunBentNormal(position,objectNormal,kunSpan,kunSpanGradient);');
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.y+=kunHeight(position,kunSpan);');
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\nvKunWorld=(modelMatrix*vec4(transformed,1.)).xyz;\nvKunNormal=mat3(modelMatrix)*objectNormal;\nvKunFlat=mat3(modelMatrix)*kunFinNormal;\nvKunAlong=clamp((kunNose-position.z)/(kunNose-kunTail),0.,1.);');
    };
    material.customProgramCacheKey=()=> `kun-vertical-swim-v1-matte-sheet-v7-${sheet?1:0}`;
    mesh.material=material; mesh.renderOrder=sheet?2:pleat?1:0;
    // Rest bounds do not include the shader's displacement.
    mesh.frustumCulled=false;
    finCoordinates(mesh);
    materials.push(material);
  }
  const restBox=new THREE.Box3().setFromObject(root);
  const bounds=restBox.clone();
  bounds.min.y-=SWIM.bodyLength*SWIM.flukeAmpFrac;
  bounds.max.y+=SWIM.bodyLength*SWIM.flukeAmpFrac;
  // The front of the body, where back, belly, rim and a fin root all fall inside one close-up.
  const bodyFocus=body.geometry.boundingBox.getCenter(new THREE.Vector3());
  bodyFocus.z+=SWIM.bodyLength*.14;
  return {root,bounds,restBox,materials,bodyFocus,
    update(gameMs,phase,rest,look=false,size=1) {
      uniforms.kunCycle.value=phase??gameMs/SWIM.periodMs; uniforms.kunEnabled.value=rest?0:1;
      uniforms.kunLook.value=look?1:0; uniforms.kunTime.value=gameMs/1000; uniforms.kunSize.value=size;
    },
    inspect:()=>({ ...SWIM, verticalAxis:'Y', sidewaysDisplacement:0,
      materials:materials.map(m=>({name:m.name,type:m.type,transparent:m.transparent,depthWrite:m.depthWrite,side:m.side,map:!!m.map,
        diffuseFill:DIFFUSE_FILL,transmissionStrength:m.transparent?SHEET_TRANSMISSION:0,specular:0})),
      finWeights:'normalized reference UV root-to-tip projection; independent of fin scale',
      normalDeformation:'inverse-transpose height-field Jacobian, including fin span gradient',
      nose:uniforms.kunNose.value,tail:uniforms.kunTail.value }),
    dispose() {for(const mesh of meshes) mesh.geometry.dispose(); for(const m of materials) {m.map?.dispose();m.dispose();} }
  };
}
