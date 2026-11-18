// The building block every tower is made of: a chunky bevelled brick in the team's colour, glossy under a clear
// coat, with a strip of inset windows on each side. Everything about a block's look is in one material so the
// standing towers and the flying debris are the same object (instanced, with a per-instance colour and seed).
import * as THREE from 'three';

export const BLOCK = { w: 0.98, h: 0.58, d: 0.98, r: 0.075 };
export const FLOOR_H = 0.6, CELL = 1.0;

/**
 * Rounded box: a box grid whose vertices are pushed out from an inner box by the bevel radius. Grid lines are
 * placed at tan-spaced offsets so the bevel's arc gets even angular steps; normals are exact.
 */
export function roundedBox(sx, sy, sz, r, steps = 2) {
    const half = [sx / 2, sy / 2, sz / 2], inner = half.map((h) => h - r);
    const n = 2 * steps + 1;
    const samples = half.map((h, a) => {
        const s = [-h];
        for (let k = steps - 1; k >= 1; k--) s.push(-(inner[a] + r * Math.tan((k / steps) * Math.PI / 4)));
        s.push(-inner[a], inner[a]);
        for (let k = 1; k < steps; k++) s.push(inner[a] + r * Math.tan((k / steps) * Math.PI / 4));
        s.push(h);
        return s;
    });
    const g = new THREE.BoxGeometry(2, 2, 2, n, n, n);
    const P = g.attributes.position, N = g.attributes.normal;
    const p = new THREE.Vector3(), c = new THREE.Vector3(), d = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
        p.fromBufferAttribute(P, i);
        for (let a = 0; a < 3; a++) p.setComponent(a, samples[a][Math.round((p.getComponent(a) + 1) / 2 * n)]);
        c.set(THREE.MathUtils.clamp(p.x, -inner[0], inner[0]), THREE.MathUtils.clamp(p.y, -inner[1], inner[1]), THREE.MathUtils.clamp(p.z, -inner[2], inner[2]));
        d.subVectors(p, c).normalize();
        p.copy(c).addScaledVector(d, r);
        P.setXYZ(i, p.x, p.y, p.z); N.setXYZ(i, d.x, d.y, d.z);
    }
    g.deleteAttribute('uv');
    g.computeBoundingSphere();
    return g;
}

let sharedGeo = null;
export function blockGeometry() {
    if (!sharedGeo) sharedGeo = roundedBox(BLOCK.w, BLOCK.h, BLOCK.d, BLOCK.r, 2);
    return sharedGeo;
}

const HASH = 'float dHash(float n){return fract(sin(n*12.9898)*43758.5453);}';

/**
 * Block material. Per instance: colour (team) and aSeed (window pattern; negative = power cut, windows dark).
 * Shared uniforms: uPower (0..1 all windows), uUplight (strength of the plinth uplighting), uTime.
 */
export function blockMaterial(engine, { low = false } = {}) {
    const M = low ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
    const m = new M({ color: 0xffffff, roughness: 0.34, metalness: 0, ...(low ? {} : { clearcoat: 0.75, clearcoatRoughness: 0.14 }), envMapIntensity: 1.1 });
    const U = { uPower: { value: 1 }, uUplight: { value: 1 }, uTime: engine.time };
    m.userData.U = U;
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader
            .replace('#include <common>', `#include <common>
attribute float aSeed;varying vec3 vLoc;varying vec3 vLocN;varying float vSeed;varying float vWY;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
vLoc=position;vLocN=normal;vSeed=aSeed;
{vec4 w=modelMatrix*vec4(position,1.);
#ifdef USE_INSTANCING
w=modelMatrix*instanceMatrix*vec4(position,1.);
#endif
vWY=w.y;}`);
        sh.fragmentShader = sh.fragmentShader
            .replace('#include <common>', `#include <common>
uniform float uPower,uUplight,uTime;varying vec3 vLoc;varying vec3 vLocN;varying float vSeed;varying float vWY;
${HASH}
float dWin,dFrame;vec3 dWinE;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 an=abs(vLocN);float side=1.-smoothstep(.45,.7,an.y);
  bool xf=an.x>an.z;float u=xf?vLoc.z*sign(vLocN.x):-vLoc.x*sign(vLocN.z);
  float face=xf?(vLocN.x>0.?1.:2.):(vLocN.z>0.?3.:4.);
  // one slim strip window per face, split by a mullion
  float uu=(u+.49)/.98*2.,pane=clamp(floor(uu),0.,1.),fu=uu-pane,y=vLoc.y;
  vec2 aa=vec2(fwidth(uu),fwidth(y))*1.2+1e-4;
  float wx=smoothstep(pane<.5?.2:.04,(pane<.5?.2:.04)+aa.x,fu)*(1.-smoothstep((pane<.5?.96:.8)-aa.x,pane<.5?.96:.8,fu));
  float wy=smoothstep(-.03,-.03+aa.y,y)*(1.-smoothstep(.09-aa.y,.09,y));
  float fx=smoothstep(pane<.5?.15:0.,(pane<.5?.15:0.)+aa.x,fu)*(1.-smoothstep((pane<.5?1.:.85)-aa.x,pane<.5?1.:.85,fu));
  float fy=smoothstep(-.06,-.06+aa.y,y)*(1.-smoothstep(.12-aa.y,.12,y));
  dWin=side*wx*wy;dFrame=side*fx*fy*(1.-wx*wy);
  float id=dHash(abs(vSeed)*7.13+pane*1.71+face*3.37);
  float lit=step(.62,id)*uPower*step(0.,vSeed);
  vec3 wc=id>.9?vec3(.62,.8,1.):mix(vec3(1.,.62,.3),vec3(1.,.8,.55),fract(id*7.));
  // an occasional window flickers like a dying tube
  float fl=id>.86&&id<.9?step(.3,fract(sin(floor(uTime*9.+id*40.))*91.7)):1.;
  // glass: the room behind is lit from deeper inside, brighter toward the top of the pane
  float inner=.55+.45*smoothstep(-.1,.14,y);
  dWinE=dWin*lit*fl*wc*inner*(.9+1.3*fract(id*13.));
  diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*.42,dFrame);
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.006,.007,.01),dWin);
}`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor=mix(roughnessFactor,.05,dWin);roughnessFactor=mix(roughnessFactor,.6,dFrame);`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float side=1.-smoothstep(.45,.7,abs(vLocN.y));
  vec3 tc=vec3(1.);
  #if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
  tc=vColor.rgb;
  #endif
  // architectural uplight from the plinth: team-coloured wash fading up the facade
  float up=uUplight*side*exp(-max(vWY-.5,0.)*.42)*(1.-dWin)*(1.-.5*dFrame);
  totalEmissiveRadiance+=dWinE+tc*tc*up*.55;
}`)
            .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  // crevice under each brick + contact with the ground (blocks sit flush; fake the occlusion)
  float aoB=mix(.42,1.,smoothstep(-.29,-.1,vLoc.y))*mix(.75,1.,smoothstep(.29,.18,vLoc.y));
  float aoG=mix(.45,1.,smoothstep(.4,1.6,vWY));
  float k=aoB*aoG;
  reflectedLight.indirectDiffuse*=k;reflectedLight.indirectSpecular*=mix(.5,1.,k);
  reflectedLight.directDiffuse*=mix(.7,1.,aoB);
}`);
    };
    m.customProgramCacheKey = () => 'dblock' + (low ? 'L' : 'H');
    return m;
}

/** an InstancedMesh of blocks with colour + seed attributes allocated for `n` */
export function blockMesh(material, n) {
    const geo = blockGeometry().clone();
    const seed = new THREE.InstancedBufferAttribute(new Float32Array(n), 1);
    seed.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aSeed', seed);
    const mesh = new THREE.InstancedMesh(geo, material, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.userData.seed = seed;
    return mesh;
}
