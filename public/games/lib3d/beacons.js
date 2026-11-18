// Point lights drawn as glowing sprites in one draw call: aircraft warning lights, lanterns, fireflies. Each one
// can blink (`rate` Hz, `phase` 0..1) or burn steady (`steady` 1). Size is in world units, scaled by distance.
// Shared by the 3D games (Demolition's crane and skyline lights; Limbo's lanterns).
import * as THREE from 'three';

export class Beacons {
    constructor(scene, time) {
        this.list = [];
        this.time = time;
        this.scene = scene;
        this.points = null;
    }
    add(p, { color = '#ff2a1a', size = 0.5, rate = 1, phase = Math.random(), steady = 0 } = {}) { this.list.push({ p: p.clone(), color: new THREE.Color(color), size, rate, phase, steady }); }
    build() {
        const n = this.list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), misc = new Float32Array(n * 4);
        this.list.forEach((b, i) => { pos.set([b.p.x, b.p.y, b.p.z], i * 3); col.set([b.color.r, b.color.g, b.color.b], i * 3); misc.set([b.size, b.rate, b.phase, b.steady], i * 4); });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aMisc', new THREE.BufferAttribute(misc, 4));
        this.mat = new THREE.ShaderMaterial({
            uniforms: { uTime: this.time, uScale: { value: 800 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            vertexShader: `attribute vec3 aCol;attribute vec4 aMisc;uniform float uTime,uScale;varying vec3 vC;varying float vK;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
  float ph=fract(uTime*aMisc.y*.5+aMisc.z);float on=max(aMisc.w,smoothstep(0.,.04,ph)*(1.-smoothstep(.22,.42,ph)));
  vK=on;vC=aCol;gl_PointSize=clamp(aMisc.x*uScale/max(-mv.z,.1),2.5,96.);}`,
            fragmentShader: `varying vec3 vC;varying float vK;void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);
  float a=exp(-r*7.)*1.+exp(-r*60.)*3.;gl_FragColor=vec4(vC*a*vK*5.,1.);}`,
        });
        this.points = new THREE.Points(g, this.mat);
        this.points.frustumCulled = false; this.points.renderOrder = 6;
        this.scene.add(this.points);
    }
    setScale(px) { if (this.mat) this.mat.uniforms.uScale.value = px; }
}
