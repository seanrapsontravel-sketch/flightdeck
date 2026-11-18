// CPU-simulated particles drawn as sized point sprites. A Pool is one draw call: alpha-blended matter or additive
// light. Shared by the 3D games; each game's fx.js spawns into pools with its own recipes.
import * as THREE from 'three';

// aMisc: size, kind, rotation. kinds: 0 hard round, 1 soft puff, 2 confetti, 3 glow, 4 streak (stretched along its
// screen-space velocity: sparks, embers)
const VS = `attribute vec4 aCol;attribute vec3 aMisc;attribute vec3 aVel;uniform float uScale;uniform vec2 uRes;
varying vec4 vCol;varying vec3 vMisc;varying float vThin;
void main(){vCol=aCol;vMisc=aMisc;vThin=1.;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
  float s=aMisc.x*uScale/max(-mv.z,.1);
  if(aMisc.y>3.5){
    vec4 q=projectionMatrix*modelViewMatrix*vec4(position+aVel*.045,1.);
    vec2 d=(q.xy/q.w-gl_Position.xy/gl_Position.w)*uRes*.5;float L=length(d);
    vMisc.z=atan(d.y,d.x);float len=max(s,L*2.);vThin=clamp(s/len,.04,1.);s=len;}
  gl_PointSize=clamp(s,0.,512.);}`;
const FS = `uniform vec3 uLight;varying vec4 vCol;varying vec3 vMisc;varying float vThin;
void main(){vec2 p=gl_PointCoord*2.-1.;float k=vMisc.y;float a;vec3 c=vCol.rgb;
  if(k<.5){a=1.-smoothstep(.6,1.,dot(p,p));c*=uLight*(.75+.35*(1.-p.y));}
  else if(k<1.5){float r=dot(p,p);a=exp(-r*3.2)*(1.-smoothstep(.7,1.,r));c*=uLight;}
  else if(k<2.5){float cr=cos(vMisc.z),sr=sin(vMisc.z);vec2 q=vec2(cr*p.x-sr*p.y,sr*p.x+cr*p.y);float fl=abs(cos(vMisc.z*1.7));
    a=step(abs(q.x),.9)*step(abs(q.y),.38*fl+.06);c*=uLight*(.6+.9*fl);}
  else if(k<3.5){float r=dot(p,p);a=exp(-r*5.)+.4*exp(-r*40.);}
  else{p.y=-p.y;float cr=cos(vMisc.z),sr=sin(vMisc.z);vec2 q=vec2(cr*p.x+sr*p.y,-sr*p.x+cr*p.y);
    a=(1.-smoothstep(.55,1.,abs(q.x)))*exp(-q.y*q.y/(vThin*vThin*.18));}
  gl_FragColor=vec4(c,vCol.a*a);if(gl_FragColor.a<.004)discard;}`;

export class Pool {
    constructor(n, blending, scene, light) {
        this.n = n; this.count = 0;
        this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.c = new Float32Array(n * 4); this.m = new Float32Array(n * 3);
        this.life = new Float32Array(n); this.max = new Float32Array(n); this.drag = new Float32Array(n); this.grav = new Float32Array(n);
        this.grow = new Float32Array(n); this.a0 = new Float32Array(n); this.spin = new Float32Array(n); this.s0 = new Float32Array(n);
        this.floor = 0.02;
        const g = new THREE.BufferGeometry();
        this.ap = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
        this.av = new THREE.BufferAttribute(this.v, 3).setUsage(THREE.DynamicDrawUsage);
        this.ac = new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
        this.am = new THREE.BufferAttribute(this.m, 3).setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('position', this.ap); g.setAttribute('aVel', this.av); g.setAttribute('aCol', this.ac); g.setAttribute('aMisc', this.am);
        g.setDrawRange(0, 0);
        this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uScale: { value: 800 }, uRes: { value: new THREE.Vector2(1920, 1080) }, uLight: { value: light } }, transparent: true, depthWrite: false, blending });
        this.points = new THREE.Points(g, this.mat);
        this.points.frustumCulled = false;
        this.points.renderOrder = 5;
        this.geo = g;
        scene.add(this.points);
    }
    spawn(o) {
        let i = this.count < this.n ? this.count++ : (Math.random() * this.n) | 0;
        this.p.set(o.p, i * 3); this.v.set(o.v || [0, 0, 0], i * 3);
        this.c.set(o.c, i * 4); this.a0[i] = o.c[3];
        this.m[i * 3] = o.size; this.m[i * 3 + 1] = o.kind || 0; this.m[i * 3 + 2] = o.rot || 0;
        this.s0[i] = o.size; this.grow[i] = o.grow || 0; this.spin[i] = o.spin || 0;
        this.life[i] = 0; this.max[i] = o.life || 1; this.drag[i] = o.drag || 0; this.grav[i] = o.grav ?? 9.8;
    }
    update(dt) {
        let i = 0;
        const fl = this.floor;
        while (i < this.count) {
            this.life[i] += dt;
            if (this.life[i] >= this.max[i]) { this.kill(i); continue; }
            const k = i * 3, t = this.life[i] / this.max[i], d = Math.exp(-this.drag[i] * dt);
            this.v[k] *= d; this.v[k + 1] = this.v[k + 1] * d - this.grav[i] * dt; this.v[k + 2] *= d;
            this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
            if (this.p[k + 1] < fl && this.grav[i] > 0) { this.p[k + 1] = fl; this.v[k] *= 0.4; this.v[k + 2] *= 0.4; this.v[k + 1] = Math.abs(this.v[k + 1]) * 0.15; }
            this.m[k] = this.s0[i] * (1 + this.grow[i] * t);
            this.m[k + 2] += this.spin[i] * dt;
            this.c[i * 4 + 3] = this.a0[i] * (t < 0.08 ? t / 0.08 : 1) * (1 - Math.pow(t, 2.2));
            i++;
        }
        this.geo.setDrawRange(0, this.count);
        this.ap.needsUpdate = this.av.needsUpdate = this.ac.needsUpdate = this.am.needsUpdate = true;
    }
    kill(i) {
        const j = --this.count;
        if (i === j) return;
        for (let k = 0; k < 3; k++) { this.p[i * 3 + k] = this.p[j * 3 + k]; this.v[i * 3 + k] = this.v[j * 3 + k]; this.m[i * 3 + k] = this.m[j * 3 + k]; }
        for (let k = 0; k < 4; k++) this.c[i * 4 + k] = this.c[j * 4 + k];
        this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.drag[i] = this.drag[j]; this.grav[i] = this.grav[j];
        this.grow[i] = this.grow[j]; this.a0[i] = this.a0[j]; this.spin[i] = this.spin[j]; this.s0[i] = this.s0[j];
    }
    setScale(px, w, h) { this.mat.uniforms.uScale.value = px; if (w) this.mat.uniforms.uRes.value.set(w, h); }
}
