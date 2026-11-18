// The set: a city construction yard at night. Wet asphalt that mirrors everything (a real planar reflection, blurred
// by how rough each patch is and streaked like a rainy street), sodium floodlight masts with beams in the haze,
// concrete barriers, stacked containers, a jumbotron, and a skyline of lit windows that melts into bokeh.
// The environment is cool and desaturated on purpose: the teams' towers are the only saturated colour in it.
import * as THREE from 'three';
import { HAZE_GLSL } from '../lib3d/engine.js';
import { Reflection } from '../lib3d/reflection.js';
import { Beacons } from '../lib3d/beacons.js';

const NOISE = `float gh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+vec2(1,1)),f.x),f.y);}
float gf(vec2 p){return gn(p)*.5+gn(p*2.03+3.1)*.25+gn(p*4.11+7.7)*.15+gn(p*8.3+1.3)*.1;}`;

const R = (a, b) => a + Math.random() * (b - a);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------------------------------------------------------------- wet ground with planar reflection
function groundMaterial(engine, refl) {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, envMapIntensity: 0.35 });
    const U = { tRefl: { value: refl.rt.texture }, uReflMat: { value: refl.texMat }, uTime: engine.time, uReflOn: { value: 1 } };
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
            .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW=(modelMatrix*vec4(transformed,1.)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tRefl;uniform mat4 uReflMat;uniform float uTime,uReflOn;varying vec3 vGW;
${NOISE}
float dPud,dDamp,dGrain;`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 P=vGW.xz;
  float n1=gf(P*.11),n2=gn(P*.5+7.);
  dGrain=gn(P*13.)*.5+gn(P*37.)*.3+gn(P*90.)*.2;
  dPud=smoothstep(.45,.49,n1+(n2-.5)*.12);
  dDamp=smoothstep(.2,.42,n1+(n2-.5)*.3);
  vec3 asphalt=vec3(.034,.035,.039)*(.7+.6*dGrain);
  // tar patches and tyre wear
  asphalt*=mix(1.,.72,smoothstep(.55,.75,gf(P*.05+11.)));
  // painted safety lines: a yellow line along the front of the plinths, a hatched no-go box by the crane
  float paint=0.;
  paint=max(paint,1.-smoothstep(.07,.09,abs(P.y-7.2)));
  paint=max(paint,(1.-smoothstep(.07,.09,abs(P.y+11.5)))*step(abs(P.x),18.));
  vec2 hb=P-vec2(0.,-15.);
  if(abs(hb.x)<4.5&&abs(hb.y)<3.){float edge=step(4.3,abs(hb.x))+step(2.8,abs(hb.y));float hat=step(.62,fract((hb.x+hb.y)*.7));paint=max(paint,clamp(edge+hat,0.,1.));}
  paint*=smoothstep(.25,.6,gn(P*3.1)+dGrain*.5);
  vec3 col=mix(asphalt,vec3(.36,.27,.05),paint*.85);
  col*=mix(1.,.5,dDamp);col*=mix(1.,.35,dPud);
  diffuseColor.rgb=col;
}`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor=mix(.86-dGrain*.12,.42,dDamp*.7);roughnessFactor=mix(roughnessFactor,.04,dPud);`)
            .replace('#include <opaque_fragment>', `
{
  vec4 rc=uReflMat*vec4(vGW,1.);vec2 ruv=rc.xy/rc.w;
  vec2 P=vGW.xz;
  vec2 rip=(vec2(gn(P*1.3+uTime*.25),gn(P*1.3+5.-uTime*.2))-.5)*.0035*dPud+(dGrain-.5)*.004*(1.-dPud);
  ruv+=rip;
  float lod=mix(3.6,.4,dPud);
  // street-light streaks: wet asphalt smears reflections vertically on screen
  vec3 rf=vec3(0.);float wsum=0.;float st=(1.-dPud)*.035+.004;
  for(int i=-3;i<=3;i++){float w=exp(-float(i*i)*.18);rf+=textureLod(tRefl,ruv+vec2(0.,float(i)*st),lod).rgb*w;wsum+=w;}
  rf/=wsum;
  vec3 V=normalize(cameraPosition-vGW);float F=.02+.98*pow(1.-max(V.y,0.),5.);
  float k=(dPud*(.4+.6*F)+dDamp*(1.-dPud)*(.12+.6*F))*uReflOn;
  outgoingLight=outgoingLight*(1.-k*.6)+rf*k;
}
#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'dground';
    return m;
}


// ---------------------------------------------------------------- night sky
const SKY_FS = `uniform float uTime;uniform vec3 uFlash;varying vec3 vD;
${NOISE}
void main(){
  vec3 d=normalize(vD);float h=d.y,az=atan(d.x,-d.z);
  vec3 zen=vec3(.0035,.0055,.011);
  // sodium light pollution low over the city, strongest straight ahead where the skyline is densest
  vec3 glow=vec3(.05,.03,.026)*(.6+.4*cos(az*.9))+vec3(.008,.02,.03)*(.5+.5*sin(az*1.7+2.));
  vec3 col=mix(glow,zen,smoothstep(-.02,.2,h));
  // low cloud deck lit from beneath by the city
  if(h>0.){vec2 cp=d.xz/(h+.08)*.9+vec2(uTime*.006,0.);float c=gf(cp*.55);c=smoothstep(.42,.8,c)*smoothstep(.0,.2,h);
    vec3 cc=mix(glow*1.5,vec3(.012,.014,.02),smoothstep(.0,.5,h));col=mix(col,cc,c*.85);
    // a few stars through gaps
    vec2 sp=d.xz/(h+.3)*90.;float s=gh(floor(sp));float tw=.6+.4*sin(uTime*2.+s*40.);
    col+=vec3(.9,.95,1.)*step(.997,s)*(1.-c)*smoothstep(.15,.5,h)*.35*tw*(1.-smoothstep(.3,.5,length(fract(sp)-.5)));}
  col+=uFlash*exp(-max(h,0.)*6.)*.6;
  float hz=exp(-max(h,0.)*10.);
  col=mix(col,dHazeCol(d),hz*.4);
  if(h<0.)col=dHazeCol(d);
  gl_FragColor=vec4(col,1.);
}`;

// ---------------------------------------------------------------- skyline (instanced boxes with window grids)
function skylineMaterial(time) {
    const m = new THREE.MeshStandardMaterial({ color: '#06080b', roughness: 0.7, metalness: 0.1, envMapIntensity: 0.15 });
    const U = { uTime: time, uFlash: { value: new THREE.Color(0, 0, 0) } };
    m.userData.U = U;
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW;varying vec3 vSN;varying float vSI;')
            .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
{mat4 im=mat4(1.);
#ifdef USE_INSTANCING
im=instanceMatrix;
#endif
vSW=(modelMatrix*im*vec4(transformed,1.)).xyz;vSN=normalize(mat3(modelMatrix*im)*objectNormal);vSI=float(gl_InstanceID);}`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uTime;uniform vec3 uFlash;varying vec3 vSW;varying vec3 vSN;varying float vSI;
${NOISE}`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 n=normalize(vSN);
  if(abs(n.y)<.5){
    vec3 t=normalize(cross(vec3(0,1,0),n));
    float u=dot(vSW,t),v=vSW.y;
    float style=gh(vec2(vSI,3.));
    vec2 cell=style<.5?vec2(1.8,3.3):vec2(1.2,3.5);
    vec2 g=vec2(u,v)/cell,id=floor(g),f=fract(g);
    float win=step(.18,f.x)*step(f.x,.82)*step(.25,f.y)*step(f.y,.78);
    if(style>.8)win=step(.25,f.y)*step(f.y,.6);
    float r=gh(id+vec2(vSI*13.1,vSI*.7));
    float lit=step(.84-style*.08,r);
    vec3 wc=r>.95?vec3(.55,.75,1.):mix(vec3(1.,.55,.25),vec3(1.,.78,.5),fract(r*9.));
    // whole floors go dark together on some buildings
    lit*=step(.25,gh(vec2(id.y,vSI)));
    totalEmissiveRadiance+=win*lit*wc*(.4+1.2*fract(r*31.))*.6+win*uFlash*2.5*step(.3,r);
    diffuseColor.rgb*=1.-win*.6;
  }
}`);
    };
    m.customProgramCacheKey = () => 'dsky';
    return m;
}

// ---------------------------------------------------------------- props
function jerseyGeometry(len) {
    const s = new THREE.Shape();
    [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.13, 0.33], [0.1, 0.81], [-0.1, 0.81], [-0.13, 0.33], [-0.3, 0.08]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, steps: 1 });
    g.translate(0, 0, -len / 2);
    g.computeVertexNormals();
    return g;
}
function barrierMaterial() {
    const m = new THREE.MeshStandardMaterial({ color: '#8a8780', roughness: 0.88 });
    m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vBP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBP=position;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vBP;\n${NOISE}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
  float band=step(.44,vBP.y)*step(vBP.y,.64);
  float stripe=step(.5,fract((vBP.z*1.2+vBP.y*1.2)));
  vec3 hz=mix(vec3(.02),vec3(.55,.42,.04),stripe);
  float wear=smoothstep(.3,.7,gn(vBP.zy*vec2(3.,9.)));
  diffuseColor.rgb=mix(diffuseColor.rgb,hz,band*mix(1.,.6,wear));
  diffuseColor.rgb*=mix(.45,1.,smoothstep(0.,.35,vBP.y));
  diffuseColor.rgb*=.8+.35*gn(vBP.zy*vec2(1.3,4.));
}`);
    };
    m.customProgramCacheKey = () => 'dbarrier';
    return m;
}
function containerMaterial() {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.45 });
    m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCP;varying vec3 vCN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCP=position;vCN=normal;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vCP;varying vec3 vCN;\n${NOISE}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 an=abs(vCN);
  float u=an.z>.5?vCP.x:vCP.z;
  float rib=an.y<.5?.78+.22*sin(u*25.13):1.;
  float frame=step(1.2,abs(vCP.y))+step(an.z>.5?2.95:1.1,abs(u));
  diffuseColor.rgb*=rib;diffuseColor.rgb*=mix(1.,.5,clamp(frame,0.,1.));
  diffuseColor.rgb*=.75+.4*gn(vCP.xy*vec2(2.,6.)+vCP.z);
  // rust streaks down from the roof
  diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.09,.04,.02),smoothstep(.6,.9,gn(vec2(u*4.,vCP.y*.3)))*.5);
}`);
    };
    m.customProgramCacheKey = () => 'dcont';
    return m;
}

const BEAM_VS = `varying vec3 vW;varying vec3 vNW;varying float vT;uniform float uLen;
void main(){vT=clamp(-position.y/uLen,0.,1.);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vNW=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`;
const BEAM_FS = `uniform vec3 uCol;uniform float uI,uTime;varying vec3 vW;varying vec3 vNW;varying float vT;
${NOISE}
void main(){vec3 V=normalize(cameraPosition-vW);float e=pow(clamp(abs(dot(normalize(vNW),V)),0.,1.),2.2);
  float f=pow(clamp(1.-vT,0.,1.),1.3)*smoothstep(0.,.06,vT);
  float n=.6+.4*gn(vW.xz*.25+vW.y*.35-uTime*.25)*gn(vW.zy*.5+uTime*.15);
  float a=e*f*n*smoothstep(.2,3.5,vW.y)*uI;
  gl_FragColor=vec4(uCol*max(a,0.),1.);}`;

export class Yard {
    constructor(engine) {
        this.engine = engine;
        const S = engine.scene;
        this.beacons = new Beacons(S, engine.time);
        this.refl = new Reflection(engine);
        this.beams = []; this.lamps = []; this.motesIn = [];
        this.envBits = new THREE.Group();

        // ground
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700).rotateX(-Math.PI / 2), groundMaterial(engine, this.refl));
        ground.receiveShadow = true;
        S.add(ground); this.ground = ground; this.refl.hide.push(ground);

        // sky
        this.skyU = { uTime: engine.time, uFlash: { value: new THREE.Color(0, 0, 0) }, uFog: engine.U.uFog };
        const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 48, 24), new THREE.ShaderMaterial({
            side: THREE.BackSide, depthWrite: false, uniforms: this.skyU,
            vertexShader: 'varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
            fragmentShader: HAZE_GLSL + SKY_FS,
        }));
        sky.frustumCulled = false; sky.renderOrder = -10;
        S.add(sky); this.sky = sky;

        this.buildSkyline();
        this.buildFloodlights();
        this.buildBarriers();
        this.buildContainers();
        this.buildJumbotron();
    }

    buildSkyline() {
        const n = 120;
        const mat = skylineMaterial(this.engine.time);
        this.skylineU = mat.userData.U;
        const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
        const mesh = new THREE.InstancedMesh(geo, mat, n);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
        seed = 11;
        for (let i = 0; i < n; i++) {
            const a = (rnd() - 0.5) * 2.7, r = 230 + rnd() * 300;
            const x = Math.sin(a) * r, z = -Math.cos(a) * r + 10;
            // mostly low and mid-rise with a few landmark towers, so there's sky above the city
            const tall = rnd() < 0.12;
            const h = tall ? 70 + rnd() * 70 : 10 + Math.pow(rnd(), 1.8) * 38;
            const w = 14 + rnd() * 26, d = 14 + rnd() * 22;
            q.setFromEuler(e.set(0, -a + (rnd() - 0.5) * 0.4, 0));
            m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(w, h, d));
            mesh.setMatrixAt(i, m);
            if (h > 60 && rnd() < 0.85) this.beacons.add(new THREE.Vector3(x, h + 1.5, z), { size: 2.6, rate: 0.6 + rnd() * 0.3, phase: rnd() });
        }
        this.engine.scene.add(mesh); this.skyline = mesh;
    }

    /** a mast: lattice pole, a head of lamps, a beam in the haze and a real spot light on the towers */
    floodMast(base, aim, { color = '#ffad5a', height = 19, beam = 0.32, spot = 2600, lamps = 6, castBeam = true } = {}) {
        const S = this.engine.scene;
        const steel = new THREE.MeshStandardMaterial({ color: '#23262b', roughness: 0.5, metalness: 0.8 });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, height, 10), steel);
        pole.position.set(base.x, height / 2, base.z); pole.castShadow = true; S.add(pole);
        const head = new THREE.Group();
        head.position.set(base.x, height + 0.6, base.z);
        head.lookAt(aim);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.0, 0.3), steel); head.add(frame);
        const hot = new THREE.Color(color).multiplyScalar(40);
        const lampMat = new THREE.MeshBasicMaterial({ color: hot });
        const cols = 3, rows = Math.ceil(lamps / 3);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
            const l = new THREE.Mesh(new THREE.CircleGeometry(0.36, 20), lampMat);
            l.position.set((i - 1) * 1.0, (j - (rows - 1) / 2) * 0.9, 0.16); head.add(l);
        }
        S.add(head);
        // env bake stand-in: a bright card where the lamps are
        const card = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(60), side: THREE.DoubleSide }));
        card.position.copy(head.position); card.quaternion.copy(head.quaternion); this.envBits.add(card);
        const from = head.position.clone();
        if (castBeam) {
            const len = from.distanceTo(aim) * 1.25, rad = len * Math.tan(0.24);
            const U = { uCol: { value: new THREE.Color(color) }, uI: { value: beam }, uTime: this.engine.time, uLen: { value: len } };
            const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.9, rad, len, 40, 1, true).translate(0, -len / 2, 0), new THREE.ShaderMaterial({
                uniforms: U, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            }));
            cone.position.copy(from);
            cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), aim.clone().sub(from).normalize());
            cone.renderOrder = 4; cone.frustumCulled = false;
            S.add(cone); this.beams.push({ mesh: cone, U, from, dir: aim.clone().sub(from).normalize(), len, rad });
        }
        if (spot) {
            const sp = new THREE.SpotLight(color, spot, 0, 0.5, 0.75, 2);
            sp.position.copy(from); sp.target.position.copy(aim);
            S.add(sp, sp.target); this.lamps.push(sp);
        }
        this.beacons.add(new THREE.Vector3(base.x, height + 2, base.z), { size: 0.5, rate: 0.8 });
        return head;
    }

    buildFloodlights() {
        // two sodium masts behind the towers (backlight through the dust) and an LED rig front-left that matches
        // the engine's key light direction (it's what casts the hard shadows)
        const E = this.engine;
        this.floodMast(new THREE.Vector3(-27, 0, -16), new THREE.Vector3(-6, 0, 2), { color: '#ffa04d', spot: 3200, beam: 0.55 });
        this.floodMast(new THREE.Vector3(27, 0, -16), new THREE.Vector3(6, 0, 2), { color: '#ffa04d', spot: 3200, beam: 0.55 });
        const k = E.sunDir.clone().multiplyScalar(52); k.y = 0;
        this.floodMast(new THREE.Vector3(k.x, 0, k.z), new THREE.Vector3(0, 0, -2), { color: '#d8e4ff', height: 30, spot: 0, beam: 0.1, lamps: 9 });
        this.floodMast(new THREE.Vector3(36, 0, 22), new THREE.Vector3(8, 0, -4), { color: '#ffb768', height: 16, spot: 1400, beam: 0.5 });
    }

    buildBarriers() {
        const S = this.engine.scene;
        const geo = jerseyGeometry(3.6), mat = barrierMaterial();
        const spots = [];
        for (let x = -22; x <= 22; x += 3.75) if (Math.abs(x) > 2.5) spots.push([x + R(-0.15, 0.15), 11 + R(-0.2, 0.2), R(-0.05, 0.05)]);
        spots.push([-9, 15.5, 0.6], [11, 16.5, -0.4], [-30, 4, 1.4], [30, 2, 1.7]);
        const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion();
        spots.forEach(([x, z, r], i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 + r); m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(i, m); });
        mesh.castShadow = mesh.receiveShadow = true;
        S.add(mesh);
    }

    buildContainers() {
        const S = this.engine.scene;
        const cols = ['#6d3427', '#24484f', '#253048', '#4b4f55', '#7a6230', '#7d7d78', '#3d2a2a'];
        const stacks = [[-31, -2, 0.1, 3], [-31, 1.2, 0.08, 2], [-29.5, 9, 1.5, 1], [33, -6, -0.12, 2], [32, -2.6, -0.05, 3], [-38, -20, 0.3, 2], [40, -22, -0.4, 3]];
        const boxes = [];
        seed = 5;
        for (const [x, z, a, n] of stacks) for (let k = 0; k < n; k++) boxes.push([x + (rnd() - 0.5) * 0.3, z + (rnd() - 0.5) * 0.3, a + (rnd() - 0.5) * 0.06, k]);
        const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(6.06, 2.59, 2.44), containerMaterial(), boxes.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
        boxes.forEach(([x, z, a, k], i) => {
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 + a);
            m.compose(new THREE.Vector3(x, 1.295 + k * 2.6, z), q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(i, m);
            mesh.setColorAt(i, c.set(cols[(rnd() * cols.length) | 0]));
        });
        mesh.castShadow = mesh.receiveShadow = true;
        S.add(mesh);
    }

    buildJumbotron() {
        const S = this.engine.scene;
        const W = 12, H = 6.75, x = -19, z = -17;
        const g = new THREE.Group();
        g.position.set(x, 0, z);
        g.rotation.y = Math.atan2(-x, 40 - z);
        const steel = new THREE.MeshStandardMaterial({ color: '#1c1f24', roughness: 0.45, metalness: 0.8 });
        for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7.5, 0.5), steel); leg.position.set(s * W * 0.32, 3.75, -0.4); leg.castShadow = true; g.add(leg); }
        const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, H + 0.5, 0.6), steel); frame.position.set(0, 7.5 + H / 2, -0.35); frame.castShadow = true; g.add(frame);
        const c = document.createElement('canvas'); c.width = 1024; c.height = 576;
        this.jumboCanvas = c; this.jumboCtx = c.getContext('2d');
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
        this.jumboTex = tex;
        this.jumboU = { tMap: { value: tex }, uTime: this.engine.time, uBright: { value: 2.2 } };
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({
            uniforms: this.jumboU,
            vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
            fragmentShader: `uniform sampler2D tMap;uniform float uTime,uBright;varying vec2 vUv;
void main(){vec2 grid=vec2(256.,144.);vec2 cell=(floor(vUv*grid)+.5)/grid;vec2 f=fract(vUv*grid)-.5;
  vec3 c=texture2D(tMap,cell).rgb;c=pow(c,vec3(2.2));
  float px=(1.-smoothstep(.3,.5,abs(f.x)))*(1.-smoothstep(.3,.5,abs(f.y)));
  float scan=.94+.06*sin(vUv.y*900.-uTime*30.);
  gl_FragColor=vec4((c*px*scan+vec3(.004,.005,.007))*uBright,1.);}`,
        }));
        screen.position.set(0, 7.5 + H / 2, 0.0); g.add(screen);
        S.add(g);
        const card = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.4, 0.6) }));
        card.position.set(x, 7.5 + H / 2, z); card.rotation.y = g.rotation.y; this.envBits.add(card);
        this.jumbo = g; this.jumboScreen = screen;
    }

    /** draw the jumbotron's idle content: logo + standings in team colours */
    drawJumbo(teams) {
        const ctx = this.jumboCtx, W = 1024, H = 576;
        const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b1020'); bg.addColorStop(1, '#03050b');
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#f5b72c'; ctx.fillRect(0, 0, W, 14); ctx.fillRect(0, H - 14, W, 14);
        for (let i = 0; i < 40; i++) { ctx.fillStyle = i % 2 ? '#111' : '#f5b72c'; ctx.beginPath(); ctx.moveTo(i * 40, H - 14); ctx.lineTo(i * 40 + 20, H - 14); ctx.lineTo(i * 40 + 34, H); ctx.lineTo(i * 40 + 14, H); ctx.fill(); }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '900 112px "Avenir Next Condensed","DIN Condensed","Arial Narrow",Arial,sans-serif';
        ctx.fillStyle = '#fff'; ctx.fillText('DEMOLITION', W / 2, 108);
        ctx.font = '700 30px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif'; ctx.fillStyle = '#f5b72c';
        ctx.fillText('— 1 8 0   T O   Z E R O —', W / 2, 186);
        const n = teams.length, rowH = Math.min(70, 300 / n);
        teams.forEach((t, i) => {
            const y = 250 + i * rowH;
            ctx.fillStyle = t.color; ctx.fillRect(160, y, 14, rowH - 12);
            ctx.textAlign = 'left'; ctx.font = `800 ${Math.round(rowH * 0.62)}px "Avenir Next Condensed","Arial Narrow",Arial,sans-serif`; ctx.fillStyle = '#e8ecf4';
            ctx.fillText(t.name.toUpperCase(), 196, y + (rowH - 12) / 2);
            ctx.textAlign = 'right'; ctx.fillStyle = t.color; ctx.fillText(String(t.score), W - 160, y + (rowH - 12) / 2);
        });
        this.jumboTex.needsUpdate = true;
    }

    /** extra objects for the image-based light bake (lamps, screen, city glow) — call once before engine.bakeEnvironment */
    envScene() {
        const g = this.envBits;
        const skyClone = new THREE.Mesh(this.sky.geometry, this.sky.material.clone());
        skyClone.material.uniforms = this.skyU;
        g.add(skyClone);
        return g;
    }

    update(dt, t) { /* beams + skyline are shader-animated off engine.time */ }
}
