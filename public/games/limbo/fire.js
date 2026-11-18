// Fire. Every flame on the beach (the burning bar's tongues, every tiki torch) is one instance of a single draw
// call: an upright billboard that turns about the vertical to face the lens, so it reads from any angle the
// director takes. The shader advects a teardrop through scrolling fbm, then maps "temperature" to a black-body-ish
// ramp in HDR so the cores bloom. Each flame has a base, a size, a seed, an intensity and a lean (its tip offset).
//
// Flames are cheap; light is not. A handful of real point lights stand in for the fire (fire.js FireLight), the
// rest of the warmth is emissive + bloom.
import * as THREE from 'three';
import { NOISE } from './common.js';

const VS = `attribute vec3 aBase;attribute vec4 aSize;attribute vec4 aMisc;
uniform float uTime;varying vec2 vUv;varying float vSeed,vInt,vH;
void main(){
  vUv=uv;vSeed=aSize.z;vInt=aMisc.x;vH=aSize.y;
  vec3 to=cameraPosition-aBase;to.y=0.;float L=length(to);
  vec3 right=L>1e-4?vec3(to.z,0.,-to.x)/L:vec3(1.,0.,0.);
  float y=uv.y;
  // sway: two slow sines per flame; lean (aMisc.yz) bends the tip quadratically
  float sw=sin(uTime*(1.7+aSize.w)+aSize.z*31.)*.06+sin(uTime*3.1+aSize.z*17.)*.035;
  vec3 tip=vec3(aMisc.y+sw*aSize.y,0.,aMisc.z)*y*y;
  vec3 p=aBase+right*(uv.x-.5)*aSize.x+vec3(0.,y*aSize.y,0.)+tip;
  gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}`;
const FS = `uniform float uTime;varying vec2 vUv;varying float vSeed,vInt,vH;
${NOISE}
void main(){
  if(vInt<.002)discard;
  float y=vUv.y,x=(vUv.x-.5)*2.;
  float t=uTime*(1.05+.35*fract(vSeed*7.3));
  // a big slow noise wobbles the body sideways (more with height); a fast fine one licks the edges
  float n=gf(vec2(vUv.x*2.2+vSeed*9.1,y*1.5-t*1.7+vSeed*3.));
  float n2=gn(vec2(vUv.x*6.+vSeed*13.,y*5.-t*3.6));
  x+=(n-.5)*1.4*y+(n2-.5)*.32*y;
  // a round base tapering to a point; noise erodes it from the top down so every tongue tears differently
  float yy=clamp(y,0.,1.),w=.82*(1.-yy)*(1.-yy)+.14*(1.-yy);
  w*=.45+.55*smoothstep(-.05,.22,y);
  float d=abs(x)/max(w,.02);
  float body=1.-smoothstep(.5,1.,d);
  float er=smoothstep(.12,.92,y+(n-.5)*.95+(n2-.5)*.4);
  float f=body*(1.-er)*smoothstep(0.,.08,y);
  if(f<.003)discard;
  // temperature: hottest low in the middle; a yellow core, an orange body, dark red tips
  float T=clamp(f*1.35*(1.-y*.55)-d*.25,0.,1.);
  vec3 col=mix(vec3(.32,.025,.004),vec3(1.9,.46,.06),smoothstep(.04,.42,T));
  col=mix(col,vec3(2.9,1.45,.38),smoothstep(.56,.9,T));
  // a hint of blue at the very root
  col+=vec3(.04,.08,.4)*smoothstep(.1,0.,y)*body*.5;
  gl_FragColor=vec4(col*f*vInt*1.15,1.);
}`;

export class Flames {
    constructor(scene, time, max = 160) {
        this.max = max; this.n = 0; this.free = [];
        const g = new THREE.InstancedBufferGeometry();
        const base = new THREE.PlaneGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
        g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
        this.aBase = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
        this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
        this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('aBase', this.aBase); g.setAttribute('aSize', this.aSize); g.setAttribute('aMisc', this.aMisc);
        g.instanceCount = 0;
        this.mat = new THREE.ShaderMaterial({
            uniforms: { uTime: time }, vertexShader: VS, fragmentShader: FS,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        });
        this.mesh = new THREE.Mesh(g, this.mat);
        this.mesh.frustumCulled = false; this.mesh.renderOrder = 3;
        this.geo = g;
        scene.add(this.mesh);
    }
    /** add a flame; returns its handle (index). size: [w, h]; returns a live object you can mutate then call set() */
    add({ p, w = 0.5, h = 1, seed = Math.random(), speed = Math.random(), intensity = 1, lean = [0, 0] }) {
        const i = this.free.length ? this.free.pop() : this.n++;
        if (i >= this.max) { console.warn('[limbo] flame pool full'); this.n = this.max; return { i: this.max - 1, p: p.clone(), w, h, seed, speed, intensity: 0, lean: [0, 0], dead: true }; }
        const f = { i, p: p.clone(), w, h, seed, speed, intensity, lean: [...lean] };
        this.write(f);
        this.geo.instanceCount = this.n;
        return f;
    }
    /** retire a flame (its slot is reused by the next add) */
    remove(f) { if (f.dead) return; f.intensity = 0; this.write(f); f.dead = true; this.free.push(f.i); }
    write(f) {
        if (f.dead) return;
        const i = f.i;
        this.aBase.setXYZ(i, f.p.x, f.p.y, f.p.z);
        this.aSize.setXYZW(i, f.w, f.h, f.seed, f.speed);
        this.aMisc.setXYZW(i, f.intensity, f.lean[0], f.lean[1], 0);
        this.dirty = true;
    }
    flush() {
        if (!this.dirty) return;
        this.aBase.needsUpdate = this.aSize.needsUpdate = this.aMisc.needsUpdate = true;
        this.dirty = false;
    }
}

/** a real point light that flickers like a fire (several incommensurate sines, never in step with its neighbours) */
export class FireLight {
    constructor(scene, p, { color = '#ff8a3a', intensity = 40, distance = 0, decay = 2 } = {}) {
        this.light = new THREE.PointLight(color, intensity, distance, decay);
        this.light.position.copy(p);
        this.base = intensity; this.level = 1; this.ph = Math.random() * 100;
        scene.add(this.light);
    }
    update(t) {
        const f = 1 + Math.sin(t * 11.3 + this.ph) * 0.07 + Math.sin(t * 17.9 + this.ph * 2.1) * 0.05 + Math.sin(t * 5.3 + this.ph * 0.7) * 0.08;
        this.light.intensity = this.base * this.level * f;
    }
}
