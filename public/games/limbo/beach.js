// The set: "Limbo Lagoon" at blue hour. A procedural dusk sky (cobalt → violet → a coral band where the sun went
// under, first stars, a crescent moon, lit cirrus strata), a glassy lagoon with a real planar reflection, pale sand
// in blue shadow with a mirror-wet band at the waterline, a wooden deck stage over the water, faceted palms, tiki
// torches, string lanterns and bunting, a thatched beach bar, an outrigger canoe, rocks, and far off an island with a
// volcano glow and a lighthouse whose beam sweeps the haze.
// The environment stays cool and quiet; fire, lanterns and the players' colours carry the frame.
import * as THREE from 'three';
import { HAZE_GLSL } from '../lib3d/engine.js';
import { Reflection } from '../lib3d/reflection.js';
import { Beacons } from '../lib3d/beacons.js';
import { NOISE, SHORE_GLSL, DECK_Y, POST_X, POST_H, shoreZ, sandH, merge, xf, rng, V, FONT } from './common.js';

// ---------------------------------------------------------------- sky
const SKY_FS = `uniform float uTime;uniform vec3 uGlow,uMoon;varying vec3 vD;
${NOISE}
void main(){
  vec3 d=normalize(vD);float h=d.y,hh=max(h,0.);
  vec2 dh=normalize(d.xz+1e-5),gh2=normalize(uGlow.xz);
  float g=max(dot(dh,gh2),0.);
  float g3=g*g*g*g*g,g8=g3*g3;
  vec3 zen=vec3(.003,.007,.03),mid=vec3(.014,.014,.05),hor=vec3(.04,.03,.07);
  vec3 col=mix(mid,zen,smoothstep(.04,.55,hh));
  col=mix(hor,col,smoothstep(0.,.16,hh));
  // the sunset: a hot coral band hugging the horizon, wide in azimuth, plus a broad rose lobe above it
  col+=vec3(1.25,.34,.1)*exp(-hh*22.)*g3*1.1+vec3(.3,.08,.08)*exp(-hh*6.)*g8*.45+vec3(1.7,.75,.22)*exp(-hh*70.)*g8;
  // cirrus strata: long thin streaks, lit coral underneath near the sunset, violet silhouettes away from it
  if(h>.0){
    vec2 cp=d.xz/(hh+.06);
    float n=gf(vec2(cp.x*.18+uTime*.004,cp.y*1.4)+vec2(3.,1.))*.9+gn(cp*vec2(.6,4.))*.25;
    float c=smoothstep(.55,.82,n)*smoothstep(.0,.05,hh)*(1.-smoothstep(.12,.32,hh));
    vec3 lit=mix(vec3(.05,.035,.08),vec3(.9,.3,.14),g3*(1.-smoothstep(.02,.2,hh)));
    col=mix(col,lit,c*.8);
    // stars, fading in with height and away from the glow
    vec2 sp=d.xz/(hh+.35)*140.;float s=gh(floor(sp));float tw=.65+.35*sin(uTime*1.7+s*60.);
    // round, tiny (so they stay points in bokeh, not squares)
    vec2 so=vec2(gh(floor(sp)+7.),gh(floor(sp)+3.))*.5+.25;
    float st=step(.9965,s)*(1.-smoothstep(.04,.13,length(fract(sp)-so)))*smoothstep(.12,.45,hh)*(1.-g3*.8)*(1.-c);
    col+=vec3(.85,.9,1.)*st*tw*(.5+3.*step(.9993,s));
  }
  // a thin crescent moon (the dark side faintly earthlit)
  float mc=dot(d,uMoon);
  if(mc>.999){
    vec3 mr=normalize(cross(uMoon,vec3(0.,1.,0.))),mu=cross(mr,uMoon);
    vec2 q=vec2(dot(d,mr),dot(d,mu))/.0125;
    float disc=1.-smoothstep(.94,1.,length(q));
    float cut=1.-smoothstep(.92,1.,length(q-vec2(-.34,.12)));
    col+=vec3(2.6,2.4,2.)*disc*(1.-cut)+vec3(.02,.025,.04)*disc*cut;
  }
  col+=vec3(.05,.06,.12)*exp(-max(1.-mc,0.)*900.)*.4;
  float hz=exp(-hh*28.);
  col=mix(col,dHazeCol(d),hz*.55);
  if(h<0.)col=dHazeCol(d);
  gl_FragColor=vec4(col,1.);
}`;
const SKY_VS = 'varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}';

// ---------------------------------------------------------------- lagoon
function seaMaterial(engine, refl) {
    const m = new THREE.MeshStandardMaterial({ color: '#06141d', roughness: 0.05, metalness: 0, envMapIntensity: 0.6, transparent: true });
    const U = { tRefl: { value: refl.rt.texture }, uReflMat: { value: refl.texMat }, uTime: engine.time };
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
            .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW=(modelMatrix*vec4(transformed,1.)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tRefl;uniform mat4 uReflMat;uniform float uTime;varying vec3 vGW;
${NOISE}
${SHORE_GLSL}
float wv(vec2 p){return gn(p*.55+vec2(uTime*.11,uTime*.05))*.6+gn(p*1.35-vec2(uTime*.07,-uTime*.12))*.3+gn(p*3.7+vec2(0.,uTime*.3))*.1;}
float sDepth,sFoam,sFar;vec2 sSl;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 P=vGW.xz;
  float dist=length(vGW-cameraPosition);
  sFar=smoothstep(40.,260.,dist);
  // slope of a slow two-scale swell (finite differences), calming with distance so the far lagoon is glass
  float e=.12,w0=wv(P);
  sSl=vec2(wv(P+vec2(e,0.))-w0,wv(P+vec2(0.,e))-w0)/e*(1.-sFar*.85)*.11;
  // depth from the beach profile (the lagoon floor shelves gently away from the shore)
  float dz=shoreZ(P.x)-P.y;
  sDepth=max(dz,0.)*.12;
  // lapping foam: a thin band that breathes up and down the beach
  float lap=sin(uTime*.9+P.x*.21)*.5+.5;
  float fz=dz-.25-lap*.55;
  sFoam=(1.-smoothstep(0.,.35,abs(fz)))*smoothstep(.5,.85,gn(P*vec2(1.6,4.)+uTime*.3)*.7+gn(P*.35-uTime*.05)*.5)*(1.-smoothstep(1.4,2.2,dz));
  vec3 deep=vec3(.002,.008,.013),shallow=vec3(.02,.045,.045);
  diffuseColor.rgb=mix(shallow,deep,smoothstep(0.,.5,sDepth));
  diffuseColor.a=mix(.45,1.,smoothstep(0.,.35,sDepth));
}`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal=normalize((viewMatrix*vec4(normalize(vec3(-sSl.x,1.,-sSl.y)),0.)).xyz);`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor=mix(.05,.02,sFar);`)
            .replace('#include <opaque_fragment>', `
{
  vec4 rc=uReflMat*vec4(vGW,1.);vec2 ruv=rc.xy/rc.w+sSl*vec2(.9,.5);
  vec3 rf=textureLod(tRefl,ruv,.6+1.6*(1.-sFar)).rgb;
  vec3 Vv=normalize(cameraPosition-vGW);vec3 Nw=normalize(vec3(-sSl.x,1.,-sSl.y));
  float F=.02+.98*pow(clamp(1.-max(dot(Nw,Vv),0.),0.,1.),5.);
  F=mix(F,1.,.08);
  outgoingLight=outgoingLight*(1.-F)+rf*F;
  outgoingLight+=vec3(.5,.55,.62)*sFoam*.16;
  diffuseColor.a=max(diffuseColor.a,F);
  diffuseColor.a=max(diffuseColor.a,sFoam);
}
#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'limbo-sea';
    return m;
}

// ---------------------------------------------------------------- sand (wet and mirror-ish at the waterline)
function sandMaterial(engine, refl) {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0, envMapIntensity: 0.5 });
    const U = { tRefl: { value: refl.rt.texture }, uReflMat: { value: refl.texMat }, uTime: engine.time };
    refl.guard.push(U.tRefl);
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
            .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW=(modelMatrix*vec4(transformed,1.)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tRefl;uniform mat4 uReflMat;uniform float uTime;varying vec3 vGW;
${NOISE}
float sWet,sGrain;vec2 sRip;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 P=vGW.xz;
  sGrain=gn(P*9.)*.5+gn(P*31.)*.3+gn(P*83.)*.2;
  sWet=1.-smoothstep(.03,.34,vGW.y+(gn(P*.8)-.5)*.08);
  // wind ripples on the dry sand
  float r=sin(P.y*3.1+P.x*.6+gn(P*.4)*6.)*.5+.5;
  sRip=vec2(cos(P.y*3.1+P.x*.6),0.)*.04*(1.-sWet);
  vec3 dry=vec3(.27,.25,.22)*(.86+.28*sGrain)*(.94+.12*r);
  dry*=mix(1.,.82,smoothstep(.45,.75,gf(P*.07+4.)));
  vec3 wet=vec3(.1,.085,.07)*(.9+.2*sGrain);
  diffuseColor.rgb=mix(dry,wet,sWet);
}`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal=normalize(normal+(viewMatrix*vec4(-sRip.x,0.,-sRip.y,0.)).xyz);`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor=mix(.92-sGrain*.1,.16,sWet);`)
            .replace('#include <opaque_fragment>', `
{
  vec4 rc=uReflMat*vec4(vGW,1.);vec2 ruv=rc.xy/rc.w+(sGrain-.5)*.004;
  vec3 rf=textureLod(tRefl,ruv,1.8).rgb;
  vec3 Vv=normalize(cameraPosition-vGW);float F=.02+.98*pow(clamp(1.-max(Vv.y,0.),0.,1.),5.);
  float k=sWet*(.15+.6*F);
  outgoingLight=outgoingLight*(1.-k*.5)+rf*k;
}
#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'limbo-sand';
    return m;
}

// ---------------------------------------------------------------- wood with grain (deck, posts, poles)
export function woodMaterial(color, { rough = 0.62, grain = 0.35, scale = 1, axis = 'x' } = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
    m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
            .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;');
        const along = axis === 'x' ? 'vWP.x' : axis === 'y' ? 'vWP.y' : 'vWP.z';
        const across = axis === 'x' ? 'vWP.y+vWP.z' : axis === 'y' ? 'vWP.x+vWP.z' : 'vWP.x+vWP.y';
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWP;\n${NOISE}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{ float s=${scale.toFixed(3)};float g=gn(vec2(${along}*.6*s,(${across})*22.*s))*.6+gn(vec2(${along}*2.2*s,(${across})*60.*s))*.4;
  float k=gf(vec2(${along}*.35*s,(${across})*3.*s));
  diffuseColor.rgb*=1.-${grain.toFixed(3)}*(g-.5)-.18*smoothstep(.6,.85,k); }`);
    };
    m.customProgramCacheKey = () => 'limbo-wood-' + axis + scale + grain;
    return m;
}

// ---------------------------------------------------------------- palms
function frondGeometry(L, W, droop, seed) {
    const r = rng(seed), segs = 12, pos = [], idx = [], sway = [];
    for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const w = W * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.7) * (i % 2 ? 1 : 0.62) * (0.9 + r() * 0.2);
        const x = L * t, y = 0.55 * L * t - droop * L * t * t;
        const fold = 0.16 * w;
        pos.push(x, y - fold * 0.3, -w, x, y + fold, 0, x, y - fold * 0.3, w);
        sway.push(t, t, t);
        if (i) { const a = (i - 1) * 3, b = i * 3; idx.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
}
function palmParts(base, { h = 7, lean = [1.2, 0], seed = 1, fronds = 9 }) {
    const r = rng(seed * 97 + 3), trunk = [], crowns = [], nuts = [];
    const segs = 14, top = new THREE.Vector3(base.x + lean[0], base.y + h, base.z + lean[1]);
    const ctrl = new THREE.Vector3(base.x + lean[0] * 0.15, base.y + h * 0.55, base.z + lean[1] * 0.15);
    const curve = new THREE.QuadraticBezierCurve3(base.clone(), ctrl, top);
    for (let i = 0; i < segs; i++) {
        const t0 = i / segs, t1 = (i + 1) / segs, p0 = curve.getPoint(t0), p1 = curve.getPoint(t1);
        const len = p0.distanceTo(p1), rr = 0.24 - 0.09 * t0;
        const g = new THREE.CylinderGeometry(rr * 0.9, rr * 1.12, len * 1.02, 7, 1).translate(0, len / 2, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), p1.clone().sub(p0).normalize()));
        g.rotateY(0); g.translate(p0.x, p0.y, p0.z);
        trunk.push(g);
    }
    const ph = r() * 6.28;
    for (let k = 0; k < fronds; k++) {
        const a = (k / fronds) * Math.PI * 2 + r() * 0.4, L = 2.6 + r() * 1.1;
        const g = frondGeometry(L, 0.42 + r() * 0.1, 0.95 + r() * 0.45, seed * 31 + k);
        g.rotateZ(-0.15 + r() * 0.35); g.rotateY(a); g.translate(top.x, top.y, top.z);
        const n = g.attributes.position.count, phase = new Float32Array(n).fill(ph + k * 0.7);
        g.setAttribute('aPh', new THREE.BufferAttribute(phase, 1));
        crowns.push(g);
    }
    for (let k = 0; k < 3; k++) { const a = r() * 6.28; nuts.push(new THREE.Vector3(top.x + Math.cos(a) * 0.22, top.y - 0.25, top.z + Math.sin(a) * 0.22)); }
    return { trunk, crowns, nuts, top };
}
function palmMaterials(time) {
    const frond = new THREE.MeshStandardMaterial({ color: '#163b33', roughness: 0.72, metalness: 0, side: THREE.DoubleSide, flatShading: true });
    frond.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = time;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;attribute float aSway;attribute float aPh;varying float vT;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
vT=aSway;float sw=sin(uTime*1.1+aPh)*.09+sin(uTime*2.3+aPh*1.7)*.04;
transformed.y+=sw*aSway*aSway*1.4;transformed.x+=sw*aSway*.6;`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vT;')
            .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb*=.75+.5*vT;');
    };
    frond.customProgramCacheKey = () => 'limbo-frond';
    const trunk = woodMaterial('#4a3a2c', { rough: 0.85, grain: 0.5, axis: 'y', scale: 2 });
    return { frond, trunk };
}

// ---------------------------------------------------------------- tiki torch (pole + cup; the flame is fire.js)
export function torchGeometry(h = 1.9) {
    const pole = new THREE.CylinderGeometry(0.04, 0.05, h, 6).translate(0, h / 2, 0);
    const cup = new THREE.CylinderGeometry(0.12, 0.075, 0.28, 8).translate(0, h + 0.1, 0);
    const wrap = new THREE.CylinderGeometry(0.06, 0.06, 0.12, 6).translate(0, h * 0.62, 0);
    return merge([pole, cup, wrap].map((g) => g.toNonIndexed()));
}

// ---------------------------------------------------------------- beam (lighthouse) in the haze
const BEAM_VS = `varying vec3 vW;varying float vT;uniform float uLen;
void main(){vT=-position.y/uLen;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`;
const BEAM_FS = `uniform vec3 uCol;uniform float uI;varying vec3 vW;varying float vT;
void main(){float a=(1.-smoothstep(.0,1.,vT))*smoothstep(0.,.03,vT);gl_FragColor=vec4(uCol*a*uI,1.);}`;

export class Beach {
    constructor(engine, { reflScale } = {}) {
        this.engine = engine;
        const S = engine.scene;
        this.time = engine.time;
        this.refl = new Reflection(engine, { height: 0, clip: true, scale: reflScale });
        this.beacons = new Beacons(S, engine.time);
        this.envBits = new THREE.Group();
        this.torchSpots = [];           // ambient torches: positions of flame bases (fire.js lights them)
        this.props = [];                 // things the camera must ride over / avoid: {p, r}
        this.palms = [];

        // the sunset glow sits where the engine aims the haze's warm lobe, just under the horizon
        this.glowDir = engine.fogDir.clone().setY(-0.04).normalize();
        this.moonDir = new THREE.Vector3(Math.sin(-0.62) * Math.cos(0.42), Math.sin(0.42), -Math.cos(-0.62) * Math.cos(0.42)).normalize();
        this.skyU = { uTime: engine.time, uGlow: { value: this.glowDir }, uMoon: { value: this.moonDir }, uFog: engine.U.uFog };
        const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), new THREE.ShaderMaterial({
            side: THREE.BackSide, depthWrite: false, uniforms: this.skyU, vertexShader: SKY_VS, fragmentShader: HAZE_GLSL + SKY_FS,
        }));
        sky.frustumCulled = false; sky.renderOrder = -10;
        S.add(sky); this.sky = sky;

        // lagoon
        const sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2), seaMaterial(engine, this.refl));
        sea.receiveShadow = true; sea.renderOrder = 1;
        S.add(sea); this.sea = sea; this.refl.hide.push(sea);

        this.buildSand();
        this.buildDeck();
        this.buildPalms();
        this.buildTorches();
        this.buildLanterns();
        this.buildHut();
        this.buildCanoe();
        this.buildRocks();
        this.buildHorizon();
    }

    buildSand() {
        const W = 420, D = 230, g = new THREE.PlaneGeometry(W, D, 420, 230).rotateX(-Math.PI / 2).translate(0, 0, 60);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setY(i, sandH(p.getX(i), p.getZ(i)));
        g.computeVertexNormals();
        const sand = new THREE.Mesh(g, sandMaterial(this.engine, this.refl));
        sand.receiveShadow = true;
        this.engine.scene.add(sand); this.sand = sand;
    }

    buildDeck() {
        const S = this.engine.scene;
        // planks run across the stage; each one a slightly different board
        const x0 = -6.4, x1 = 6.4, z0 = -3.8, z1 = 2.9, pw = 0.3, gap = 0.025, th = 0.09;
        const n = Math.floor((z1 - z0) / (pw + gap));
        const plank = new THREE.BoxGeometry(x1 - x0, th, pw);
        const wood = woodMaterial('#7a6a58', { rough: 0.7, grain: 0.45, axis: 'x' });
        const planks = new THREE.InstancedMesh(plank, wood, n);
        const m = new THREE.Matrix4(), c = new THREE.Color(), r = rng(21);
        for (let i = 0; i < n; i++) {
            m.makeTranslation((r() - 0.5) * 0.08, DECK_Y - th / 2 - r() * 0.012, z0 + i * (pw + gap) + pw / 2);
            planks.setMatrixAt(i, m); planks.setColorAt(i, c.setHSL(0.07 + r() * 0.03, 0.18 + r() * 0.1, 0.5 + r() * 0.16));
        }
        planks.castShadow = planks.receiveShadow = true;
        S.add(planks);
        // frame, beams and pilings into the water
        const dark = woodMaterial('#3b2f25', { rough: 0.8, grain: 0.5, axis: 'y' });
        const parts = [];
        for (const z of [z0 + 0.05, z1 - 0.05]) parts.push(new THREE.BoxGeometry(x1 - x0 + 0.3, 0.3, 0.16).translate(0, DECK_Y - th - 0.15, z));
        for (const x of [x0, x1]) parts.push(new THREE.BoxGeometry(0.16, 0.3, z1 - z0 + 0.2).translate(x, DECK_Y - th - 0.15, (z0 + z1) / 2));
        for (let x = x0 + 0.1; x <= x1 + 0.01; x += (x1 - x0 - 0.2) / 4) for (const z of [z0 + 0.1, (z0 + z1) / 2, z1 - 0.1]) {
            const bot = Math.min(sandH(x, z), 0) - 0.6, hgt = DECK_Y - bot;
            parts.push(new THREE.CylinderGeometry(0.13, 0.15, hgt, 8).translate(x, bot + hgt / 2 - th, z));
        }
        // steps down to the sand at the front
        const sy = sandH(0, z1 + 1.2);
        const st = 3;
        for (let k = 0; k < st; k++) {
            const y = DECK_Y - (k + 1) * (DECK_Y - sy) / (st + 0.3);
            parts.push(new THREE.BoxGeometry(3.4, 0.08, 0.36).translate(0, y, z1 + 0.25 + k * 0.36));
        }
        const frame = new THREE.Mesh(merge(parts.map((g) => g.toNonIndexed())), dark);
        frame.castShadow = frame.receiveShadow = true;
        S.add(frame);
        this.deck = { x0, x1, z0, z1 };
    }

    buildPalms() {
        const S = this.engine.scene;
        const spots = [
            // [x, z, height, leanX, leanZ]
            [-12.6, 6.4, 7.4, 1.6, -0.8], [-13.8, -1.2, 8.6, 2.6, -1.4], [12.8, 0.6, 7.8, -1.8, -0.6], [14.6, 7.5, 9.2, -1.2, 0.8],
            [-18.5, 9, 8.2, 1.4, 1.2], [20.5, -0.5, 7.6, -2.4, -1.6], [-24, 2.5, 9.6, 1.8, -0.6], [26, 10, 8.8, -1.6, 0.4],
            [-11, 23, 6.8, 0.6, 1.2], [9, 15, 7.2, -0.8, 0.6],
            // a line of distant palms along the curving shore, silhouettes against the sunset
            [-38, -3, 10, 2, -1], [-46, -6, 9, 1, -2], [-58, -9, 11, 2.5, -1], [-75, -14, 10, 1, -1], [44, -4, 9.5, -2, -1], [55, -7, 11, -1, -2], [69, -12, 10, -2, -1], [86, -17, 12, -1, -1],
        ];
        const trunks = [], crowns = [], nuts = [];
        spots.forEach(([x, z, h, lx, lz], i) => {
            const base = V(x, sandH(x, z) - 0.1, z);
            const P = palmParts(base, { h, lean: [lx, lz], seed: i + 1, fronds: 9 + (i % 3) });
            trunks.push(...P.trunk); crowns.push(...P.crowns); nuts.push(...P.nuts);
            this.palms.push({ base, top: P.top, nuts: P.nuts });
            this.props.push({ p: base.clone().setY(base.y + 1), r: 1.2 });
        });
        const M = palmMaterials(this.time);
        const tm = new THREE.Mesh(merge(trunks.map((g) => g.toNonIndexed())), M.trunk);
        const fm = new THREE.Mesh(merge(crowns.map((g) => g.toNonIndexed())), M.frond);
        tm.castShadow = fm.castShadow = true; tm.receiveShadow = fm.receiveShadow = true;
        const nutMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.17, 1), new THREE.MeshStandardMaterial({ color: '#3a2a18', roughness: 0.6, flatShading: true }), nuts.length);
        nuts.forEach((p, i) => nutMesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)));
        nutMesh.castShadow = true;
        S.add(tm, fm, nutMesh);
        this.palmMeshes = { tm, fm, nutMesh };
    }

    buildTorches() {
        const S = this.engine.scene;
        // deck corners, the path to the beach bar, and a few along the shore
        const spots = [[-6.1, 2.6, 1], [6.1, 2.6, 1], [-6.1, -3.5, 1], [6.1, -3.5, 1], [-2.3, 4.9, 0], [2.3, 4.9, 0],
            [9.5, 6.5, 0], [12.5, 8.6, 0], [-9, 7, 0], [-13, 5.5, 0], [-16, 1.5, 0], [17.5, 3.5, 0], [-4.2, 9.5, 0], [5.4, 10.5, 0]];
        const geos = [];
        for (const [x, z, onDeck] of spots) {
            const y = onDeck ? DECK_Y : sandH(x, z) - 0.15, h = onDeck ? 1.7 : 2.0 + (x * 7 % 3) * 0.1;
            geos.push(torchGeometry(h).translate(x, y, z));
            this.torchSpots.push(V(x, y + h + 0.22, z));
            this.props.push({ p: V(x, y + h * 0.5, z), r: 0.5 });
        }
        const mesh = new THREE.Mesh(merge(geos), woodMaterial('#4d3b28', { rough: 0.8, grain: 0.5, axis: 'y', scale: 3 }));
        mesh.castShadow = true;
        S.add(mesh);
    }

    /** string lanterns on catenaries between palms and the rig, plus triangle bunting */
    buildLanterns() {
        const S = this.engine.scene, r = rng(5);
        const ptop = (i) => this.palms[i].top.clone().add(V(0, -1.1, 0));
        const postTop = (s) => V(s * POST_X, DECK_Y + POST_H - 0.4, 0);
        const lines = [[postTop(-1), ptop(0)], [postTop(1), ptop(2)], [ptop(0), ptop(4)], [ptop(2), ptop(3)], [ptop(3), ptop(7)]];
        const cols = ['#ffb35c', '#ff8a5c', '#ffd27a', '#ff9d6e'];
        const flagCols = ['#b9533f', '#d4a84a', '#3d7c78', '#d9cdb0', '#8e4a6a'];
        const flags = [];
        lines.forEach(([a, b], li) => {
            const L = a.distanceTo(b), sag = L * 0.09, n = Math.max(4, Math.round(L / 0.85));
            for (let i = 1; i < n; i++) {
                const t = i / n, p = a.clone().lerp(b, t); p.y -= sag * 4 * t * (1 - t);
                this.beacons.add(p, { color: cols[(i + li) % cols.length], size: 0.32, steady: 1, rate: 0 });
            }
            if (li < 2) {
                // bunting a little below the lanterns
                const nf = Math.round(L / 0.55);
                for (let i = 1; i < nf; i++) {
                    const t = i / nf, p = a.clone().lerp(b, t); p.y -= sag * 4 * t * (1 - t) + 0.35;
                    const d = b.clone().sub(a).setY(0).normalize();
                    flags.push({ p, yaw: Math.atan2(-d.z, d.x), c: flagCols[(i + li) % flagCols.length], tilt: (r() - 0.5) * 0.3 });
                }
            }
        });
        const tri = new THREE.BufferGeometry();
        tri.setAttribute('position', new THREE.Float32BufferAttribute([-0.17, 0, 0, 0.17, 0, 0, 0, -0.36, 0], 3));
        tri.computeVertexNormals();
        const fm = new THREE.InstancedMesh(tri, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8, side: THREE.DoubleSide }), flags.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
        flags.forEach((f, i) => { q.setFromEuler(new THREE.Euler(f.tilt, f.yaw, 0)); m.compose(f.p, q, V(1, 1, 1)); fm.setMatrixAt(i, m); fm.setColorAt(i, c.set(f.c)); });
        S.add(fm);
    }

    buildHut() {
        const S = this.engine.scene;
        const x = 18.5, z = 9.5, y = sandH(x, z) - 0.1;
        const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = -2.2;
        const wood = woodMaterial('#3c2e22', { rough: 0.8, grain: 0.5, axis: 'y' });
        const body = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 3.6).translate(0, 1.3, 0), wood);
        const counter = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.05, 0.7).translate(0, 0.52, 2.15), wood);
        const top = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.08, 0.9).translate(0, 1.09, 2.2), woodMaterial('#6a5644', { axis: 'x' }));
        const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffae5e').multiplyScalar(3.2) });
        const win = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1).translate(0, 1.75, 1.81), warm);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.05, 0.05).translate(0, 1.0, 2.52), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a4a').multiplyScalar(6) }));
        const straw = new THREE.MeshStandardMaterial({ color: '#6e5a3c', roughness: 0.95, flatShading: true });
        const roof = new THREE.Mesh(new THREE.ConeGeometry(4.9, 2.3, 8, 3).translate(0, 3.65, 0.2), straw);
        const roof2 = new THREE.Mesh(new THREE.ConeGeometry(5.3, 0.9, 8, 1, true).translate(0, 2.75, 0.2), straw);
        for (const o of [body, counter, top, roof, roof2]) { o.castShadow = o.receiveShadow = true; g.add(o); }
        g.add(win, strip);
        // a neon sign over the bar
        const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
        const ctx = c.getContext('2d');
        ctx.font = `italic 900 150px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ff6a8a'; ctx.shadowBlur = 24; ctx.fillStyle = '#ffd2dc'; ctx.fillText('LIMBO LAGOON', 512, 130);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(3, 3, 3), depthWrite: false, blending: THREE.AdditiveBlending }));
        sign.position.set(0, 3.1, 2.4); g.add(sign);
        S.add(g);
        const card = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffae5e').multiplyScalar(4), side: THREE.DoubleSide }));
        card.position.set(x, y + 1.8, z); card.rotation.y = g.rotation.y; this.envBits.add(card);
        this.props.push({ p: V(x, y + 1.3, z), r: 4.2 });
        this.hut = g;
    }

    buildCanoe() {
        const S = this.engine.scene;
        const x = -9.2, z = -1.4, y = sandH(x, z);
        const g = new THREE.Group(); g.position.set(x, Math.max(y, 0) + 0.12, z); g.rotation.y = 0.55; g.rotation.z = 0.04;
        const hullMat = woodMaterial('#5a2f22', { rough: 0.5, grain: 0.3 });
        const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58).scale(2.6, 0.62, 0.42), hullMat);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 5, 32).rotateX(Math.PI / 2).scale(2.55, 1, 0.4).translate(0, 0.2, 0), new THREE.MeshStandardMaterial({ color: '#c9b48a', roughness: 0.6 }));
        const fl = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8).scale(1.5, 0.12, 0.14).translate(0, -0.05, 1.5), hullMat);
        const sp1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5).rotateX(Math.PI / 2).translate(-0.6, 0.15, 0.75), hullMat);
        const sp2 = sp1.clone(); sp2.position.x = 1.2;
        for (const o of [hull, rim, fl, sp1, sp2]) { o.castShadow = true; g.add(o); }
        S.add(g);
        this.props.push({ p: g.position.clone(), r: 2.6 });
    }

    buildRocks() {
        const S = this.engine.scene, r = rng(13), list = [];
        const clusters = [[-7.4, -3.4, 4], [7.6, -2.6, 3], [-15, -4.5, 5], [16, -3.2, 4], [-28, -4.5, 3], [30, -3.5, 5]];
        for (const [cx, cz, n] of clusters) for (let i = 0; i < n; i++) {
            const x = cx + (r() - 0.5) * 3, z = cz + (r() - 0.5) * 1.8, s = 0.4 + r() * 0.9;
            list.push({ p: V(x, Math.min(sandH(x, z), 0.1) + s * 0.25, z), s, rot: r() * 6 });
        }
        const geo = new THREE.IcosahedronGeometry(1, 0);
        const pa = geo.attributes.position;
        for (let i = 0; i < pa.count; i++) pa.setXYZ(i, pa.getX(i) * (0.8 + r() * 0.4), pa.getY(i) * 0.65, pa.getZ(i) * (0.8 + r() * 0.4));
        geo.computeVertexNormals();
        const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#2a2a30', roughness: 0.55, flatShading: true }), list.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion();
        list.forEach((k, i) => { q.setFromEuler(new THREE.Euler(0, k.rot, 0)); m.compose(k.p, q, V(k.s * 1.3, k.s, k.s)); mesh.setMatrixAt(i, m); });
        mesh.castShadow = mesh.receiveShadow = true;
        S.add(mesh);
        for (const k of list) this.props.push({ p: k.p, r: k.s * 1.3 });
    }

    /** far away: an island with a smouldering volcano, a headland with a lighthouse */
    buildHorizon() {
        const S = this.engine.scene, r = rng(3);
        const isl = new THREE.ConeGeometry(260, 95, 22, 4);
        const pa = isl.attributes.position;
        for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); if (y < 47) { const k = 0.75 + r() * 0.5; pa.setX(i, pa.getX(i) * k); pa.setZ(i, pa.getZ(i) * k); pa.setY(i, y + (r() - 0.5) * 14); } }
        isl.computeVertexNormals();
        const islMat = new THREE.MeshStandardMaterial({ color: '#0e0f18', roughness: 0.9, flatShading: true });
        const island = new THREE.Mesh(isl, islMat);
        island.position.set(-620, 20, -1500); island.scale.set(1.7, 1, 0.8);
        const isl2 = new THREE.Mesh(isl.clone(), islMat); isl2.position.set(-300, 2, -1650); isl2.scale.set(1.1, 0.42, 0.6);
        S.add(island, isl2);
        // volcano glow: a hot ember lip and a soft plume of light in the haze
        this.beacons.add(V(-620, 64, -1500), { color: '#ff4a14', size: 14, steady: 1, rate: 0 });
        this.beacons.add(V(-622, 74, -1500), { color: '#a8280c', size: 34, steady: 1, rate: 0 });
        // headland + lighthouse
        const hl = new THREE.Mesh(new THREE.ConeGeometry(60, 24, 12, 2), new THREE.MeshStandardMaterial({ color: '#12131a', roughness: 0.9, flatShading: true }));
        hl.position.set(210, 4, -330); hl.scale.set(1.6, 1, 1); S.add(hl);
        const lh = new THREE.Group(); lh.position.set(205, 15, -330);
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.4, 16, 10).translate(0, 8, 0), new THREE.MeshStandardMaterial({ color: '#b9b4ad', roughness: 0.6 }));
        const band = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.05, 2.6, 10).translate(0, 6, 0), new THREE.MeshStandardMaterial({ color: '#7b2a24', roughness: 0.6 }));
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 8).translate(0, 17.2, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff2cf').multiplyScalar(30) }));
        lh.add(tower, band, lamp); S.add(lh);
        const len = 420, U = { uCol: { value: new THREE.Color('#ffe9c0') }, uI: { value: 0.02 }, uLen: { value: len } };
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.6, len * Math.tan(0.035), len, 24, 1, true).translate(0, -len / 2, 0).rotateZ(Math.PI / 2), new THREE.ShaderMaterial({
            uniforms: U, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        }));
        // rotateZ(π/2) points the cone's length along +x (its local −y): the beam sweeps by spinning about y
        cone.material.vertexShader = BEAM_VS.replace('vT=-position.y/uLen', 'vT=position.x/uLen');
        const pivot = new THREE.Group(); pivot.position.set(205, 32.2, -330); pivot.add(cone); S.add(pivot);
        this.beam = { pivot, U };
        this.beacons.add(V(205, 32.2, -330), { color: '#fff1c8', size: 9, steady: 1, rate: 0 });
    }

    /** extra objects for the image-based light bake — call once before engine.bakeEnvironment */
    envScene() {
        const g = this.envBits;
        const skyClone = new THREE.Mesh(this.sky.geometry, this.sky.material.clone());
        skyClone.material.uniforms = this.skyU;
        g.add(skyClone);
        // the burning bar and the torches, as warm cards, so lacquer and bronze pick up fire in their reflections
        const fire = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a3a').multiplyScalar(6), side: THREE.DoubleSide });
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.2), fire); bar.position.set(0, 7.5, -0.5); g.add(bar);
        return g;
    }

    update(dt, t) {
        // the lighthouse beam: one turn every 14 s, and it brightens as it swings toward the lens
        const B = this.beam;
        B.pivot.rotation.y = t * (Math.PI * 2 / 14);
        const dir = new THREE.Vector3(Math.cos(B.pivot.rotation.y), 0, -Math.sin(B.pivot.rotation.y));
        const to = this.engine.camera.position.clone().sub(B.pivot.position).setY(0).normalize();
        B.U.uI.value = 0.012 + 0.09 * Math.pow(Math.max(0, dir.dot(to)), 30);
    }
}
