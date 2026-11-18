// The studio: a prime-time quiz set in the dark. Everything here is light or something that catches it:
//   - the floor: black glass with a planar reflection, radial light lines running in to the oche ring, concentric
//     light rings, and the oche line where the thrower stands (it doubles every light in the room)
//   - the stakes rig: a circular lighting truss over the stage with sixteen moving heads. It LOWERS and TIGHTENS as
//     the questions climb: question 1 a wide, bright wash; the million question near darkness and one shaft of light
//     on the board. This is the game's round tracker, the way the sky clock is Shanghai's
//   - the LED wall: a curved wall behind the ring, quiet navy with slow rays from the board
//   - the audience: dark stepped tiers either side with an LED strip on every step. No people
//   - lights: a key spot on the board, a violet and a blue wash, all made at load (adding one later recompiles
//     every shader)
import * as THREE from 'three';
import { Reflection } from '../lib3d/reflection.js';
import { BOARD_Y, canvasTex, glowMat, rng } from './common.js';

export const OCHE_Z = 9.0;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function floorMaterial(engine, refl) {
    const m = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.25, metalness: 0.1, envMapIntensity: 0.25 });
    const U = { tRefl: { value: refl.rt.texture }, uReflMat: { value: refl.texMat }, uTime: engine.time, uStakes: { value: 0 }, uFlash: { value: new THREE.Color(0, 0, 0) } };
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
            .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW=(modelMatrix*vec4(transformed,1.)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tRefl;uniform mat4 uReflMat;uniform float uTime,uStakes;uniform vec3 uFlash;varying vec3 vGW;`)
            .replace('#include <opaque_fragment>', `
{
  vec2 P=vGW.xz;float r=length(P);float a=atan(P.x,P.y);
  // radial light lines converging on the ring; concentric rings; the oche line
  float spokes=1.-smoothstep(.0,.035*max(r,1.)*.08,abs(fract(a/6.2831853*48.)-.5)*6.2831853/48.*r);
  spokes*=smoothstep(2.2,3.,r)*(1.-smoothstep(9.,22.,r));
  float rings=0.;for(int i=0;i<3;i++){float R=4.+float(i)*3.6;rings+=1.-smoothstep(.02,.06,abs(r-R));}
  float run=.5+.5*sin(r*1.4-uTime*2.2);
  float oche=(1.-smoothstep(.03,.07,abs(P.y-${OCHE_Z.toFixed(2)})))*step(abs(P.x),1.6);
  vec3 lineCol=mix(vec3(.18,.32,1.),vec3(.4,.2,1.),.5+.5*sin(a*3.));
  vec3 glow=lineCol*(spokes*.55*(.6+.4*run)+rings*.9)*(1.-.6*uStakes)+vec3(1.,.95,.85)*oche*1.6+uFlash*(rings+spokes*.5);
  // the reflection, sharpened at grazing angles
  vec4 rc=uReflMat*vec4(vGW,1.);
  // behind the mirrored lens (w ≤ 0) there is nothing to reflect: guard it, or Inf/NaN spreads through the bloom
  vec3 rf=vec3(0.);
  if(rc.w>.001){vec2 ruv=clamp(rc.xy/rc.w,0.,1.);rf=max(textureLod(tRefl,ruv,.8).rgb,vec3(0.));rf=min(rf,vec3(40.));}
  vec3 V=normalize(cameraPosition-vGW);float F=.06+.94*pow(clamp(1.-V.y,0.,1.),5.);
  outgoingLight=max(outgoingLight*.6+rf*(.35+.55*F)+glow,vec3(0.));
}
#include <opaque_fragment>`);
    };
    m.customProgramCacheKey = () => 'mpo-floor';
    m.userData.U = U;
    return m;
}

/** a volumetric beam: an open cone, brightest at the source, soft at the edges */
function beamMaterial(color) {
    return new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color(color) }, uK: { value: 1 } },
        vertexShader: `varying float vV;varying vec3 vN;varying vec3 vView;
void main(){vV=uv.y;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vView=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
        // every term clamped, and a NaN guard: one bad beam pixel spreads through the bloom as black blocks
        fragmentShader: `uniform vec3 uCol;uniform float uK;varying float vV;varying vec3 vN;varying vec3 vView;
void main(){float ln=length(vN),lv=length(vView);
float d=(ln>1e-5&&lv>1e-5)?abs(dot(vN/ln,vView/lv)):0.;
float edge=pow(clamp(d,0.,1.),1.6);float along=pow(clamp(vV,0.,1.),1.8);
vec3 c=max(uCol,vec3(0.))*clamp(uK,0.,8.)*edge*along*.22;
if(any(isnan(c))||any(isinf(c)))c=vec3(0.);
gl_FragColor=vec4(c,1.);}`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
}

function wallTexture() {
    return canvasTex(2048, 512, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#020311'); gr.addColorStop(0.55, '#081046'); gr.addColorStop(1, '#03051a');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        // slow rays from the board (centre of the wall), and a fine LED dot grid
        g.save(); g.translate(w / 2, h * 0.62);
        for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; g.rotate(Math.PI * 2 / 64); const lg = g.createLinearGradient(0, 0, w * 0.5, 0); lg.addColorStop(0, i % 2 ? 'rgba(80,110,255,0.22)' : 'rgba(140,80,255,0.14)'); lg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = lg; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.6, -6); g.lineTo(w * 0.6, 6); g.closePath(); g.fill(); void a; }
        g.restore();
        g.fillStyle = 'rgba(150,180,255,0.10)';
        for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) g.fillRect(x, y, 2, 2);
    });
}

export class Studio {
    constructor(engine) {
        this.engine = engine;
        const S = engine.scene;
        this.group = new THREE.Group(); S.add(this.group);
        this.stakes = 0; this.stakesT = 0; this.flash = 0; this.clock = 0;

        // ---- floor
        this.refl = new Reflection(engine, { height: 0, scale: engine.low ? 0.33 : 0.5 });
        this.floorMat = floorMaterial(engine, this.refl);
        const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 128).rotateX(-Math.PI / 2), this.floorMat);
        floor.receiveShadow = true; this.group.add(floor); this.refl.hide.push(floor);
        // a raised stage disc under the ring (a glossy black step with a light ring round its edge)
        const stage = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.3, 0.18, 96), new THREE.MeshPhysicalMaterial({ color: '#06070d', roughness: 0.2, metalness: 0.6, clearcoat: 0.8 }));
        stage.position.set(0, 0.09, 0); stage.receiveShadow = true; this.group.add(stage);
        const lip = new THREE.Mesh(new THREE.TorusGeometry(3.28, 0.025, 6, 160).rotateX(Math.PI / 2), glowMat('#5b7dff', 1)); lip.position.y = 0.17; this.group.add(lip);
        this.lip = lip;
        // the ring's stand: a slim chrome post behind the board
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, BOARD_Y, 24), new THREE.MeshStandardMaterial({ color: '#1a1d26', metalness: 1, roughness: 0.25 }));
        post.position.set(0, BOARD_Y / 2, -0.45); this.group.add(post);

        // ---- LED wall
        const wallTex = wallTexture();
        this.wallMat = new THREE.MeshStandardMaterial({ color: '#000000', emissive: new THREE.Color('#ffffff'), emissiveMap: wallTex, emissiveIntensity: 0.9, roughness: 0.9 });
        const wall = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 14, 96, 1, true, Math.PI - 0.9, 1.8), this.wallMat);
        wall.material.side = THREE.BackSide; wall.position.set(0, 7, 12); this.group.add(wall);

        // ---- audience tiers: dark steps either side, an LED strip on every step
        const tierMat = new THREE.MeshStandardMaterial({ color: '#07080e', roughness: 0.7 });
        this.stripMats = [];
        for (const s of [-1, 1]) {
            for (let k = 0; k < 7; k++) {
                const step = new THREE.Mesh(new THREE.BoxGeometry(5, 0.55, 16), tierMat);
                step.position.set(s * (13 + k * 1.3), 0.28 + k * 0.55, 6); step.receiveShadow = true; this.group.add(step);
                const sm = glowMat(k % 2 ? '#3355ff' : '#6a35ff', 0.9);
                const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 16), sm);
                strip.position.set(s * (13 + k * 1.3 - 2.48), 0.56 + k * 0.55, 6); this.group.add(strip);
                this.stripMats.push(sm);
            }
        }

        // ---- the stakes rig: a truss ring and sixteen moving heads with beams
        this.rig = new THREE.Group(); this.group.add(this.rig);
        const trussMat = new THREE.MeshStandardMaterial({ color: '#5a6070', metalness: 1, roughness: 0.35 });
        for (const r of [6.2, 6.6]) this.rig.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 8, 160).rotateX(Math.PI / 2), trussMat));
        for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), trussMat); b.position.set(Math.cos(a) * 6.4, 0, Math.sin(a) * 6.4); b.rotation.set(0.7 * Math.cos(i), a, 0.7); this.rig.add(b); }
        this.heads = [];
        const R = rng(31);
        const headMat = new THREE.MeshStandardMaterial({ color: '#15171d', metalness: 0.8, roughness: 0.4 });
        const beamGeo = new THREE.CylinderGeometry(0.06, 1.0, 1, 24, 1, true).translate(0, -0.5, 0);
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
            const head = new THREE.Group(); head.position.set(Math.cos(a) * 6.4, -0.25, Math.sin(a) * 6.4 + 1.5); this.rig.add(head);
            head.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), headMat));
            const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20).rotateX(Math.PI / 2), glowMat('#cfe0ff', 1)); lens.position.y = -0.16; head.add(lens);
            const col = i % 4 === 0 ? '#ffffff' : i % 2 ? '#4f6dff' : '#8a4dff';
            const beam = new THREE.Mesh(beamGeo, beamMaterial(col)); head.add(beam);
            this.heads.push({ head, lens, beam, a, phase: R() * 6.28, col: new THREE.Color(col), spin: 0.25 + R() * 0.35 });
        }
        // the shaft: one hard white beam straight down on the board, for the big questions
        // it lands on the oche, in front of the board, so it never washes the targets out
        this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.9, 1, 32, 1, true).translate(0, -0.5, 0), beamMaterial('#e8eeff'));
        this.group.add(this.shaft);

        // ---- lights (all made now)
        const key = new THREE.SpotLight('#dfe8ff', 120, 40, 0.38, 0.6, 1.6);
        key.position.set(0, 9.5, 11); key.target.position.set(0, BOARD_Y, 0); key.castShadow = true;
        key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02;
        S.add(key, key.target); this.key = key;
        this.washL = new THREE.PointLight('#6a3cff', 40, 26, 1.6); this.washL.position.set(-9, 6, 5); S.add(this.washL);
        this.washR = new THREE.PointLight('#2f6bff', 40, 26, 1.6); this.washR.position.set(9, 6, 5); S.add(this.washR);
        this.ringLight = new THREE.PointLight('#5b7dff', 8, 9, 1.8); this.ringLight.position.set(0, BOARD_Y, 1.6); S.add(this.ringLight);
        this.fxLight = new THREE.PointLight('#ffffff', 0, 14, 1.6); this.fxLight.position.set(0, BOARD_Y, 2.5); S.add(this.fxLight);
        this.setStakes(0, true);
    }

    /** 0 = question 1 (wide bright wash) … 1 = the million question (near darkness, one shaft on the board) */
    setStakes(s, snap = false) { this.stakesT = s; if (snap) this.stakes = s; }
    /** a burst of light through the room (a right answer, a pass, the million) */
    flashOf(color, k = 1) { this.flash = Math.max(this.flash, k); this.flashCol = new THREE.Color(color); }

    update(dt) {
        this.clock += dt;
        this.stakes += (this.stakesT - this.stakes) * (1 - Math.exp(-dt * 1.6));
        const s = this.stakes, c = this.clock;
        this.flash = Math.max(0, this.flash - dt * 1.3);
        const fc = this.flashCol || new THREE.Color(1, 1, 1);
        // the rig lowers (12 m → 8.5 m) and the wash dims as the stakes rise
        this.rig.position.y = 12 - 3.5 * s;
        this.floorMat.userData.U.uStakes.value = s;
        this.floorMat.userData.U.uFlash.value.copy(fc).multiplyScalar(this.flash * 0.6);
        const wash = 1 - 0.78 * s;
        this.washL.intensity = 40 * wash + 60 * this.flash; this.washR.intensity = 40 * wash + 60 * this.flash;
        this.key.intensity = 120 * (0.75 + 0.25 * (1 - s)) ;
        this.key.angle = 0.38 - 0.16 * s;
        this.wallMat.emissiveIntensity = 0.9 * (1 - 0.55 * s) + 0.8 * this.flash;
        this.fxLight.intensity = 160 * this.flash; this.fxLight.color.copy(fc);
        for (const m of this.stripMats) m.opacity = (0.75 + 0.25 * Math.sin(c * 1.3)) * (1 - 0.6 * s) + this.flash;
        // the heads sweep slowly; with the stakes they turn inward and most go dark
        const n = this.heads.length;
        this.heads.forEach((h, i) => {
            const on = s < 0.85 ? 1 - Math.max(0, (s - 0.25) / 0.6) * (i % 4 === 0 ? 0.4 : 1) : (i % 4 === 0 ? 0.35 : 0);
            const sweep = Math.sin(c * h.spin + h.phase) * (0.5 - 0.35 * s);
            const inward = 0.25 + 0.45 * s;
            const tx = -Math.cos(h.a) * inward + Math.sin(h.a) * sweep, tz = -Math.sin(h.a) * inward - Math.cos(h.a) * sweep;
            h.head.rotation.set(tz * 0.9, 0, -tx * 0.9);
            const len = this.rig.position.y + 0.3;
            h.beam.scale.set(1 + 0.6 * (1 - s), len, 1 + 0.6 * (1 - s));
            h.beam.material.uniforms.uK.value = on * (0.7 + 0.3 * Math.sin(c * 0.7 + i)) + this.flash * 2;
            h.beam.material.uniforms.uCol.value.copy(this.flash > 0.05 ? h.col.clone().lerp(fc, Math.min(1, this.flash)) : h.col);
            h.lens.material.opacity = 0.3 + 0.7 * on;
            void n;
        });
        // the shaft comes in for the last questions
        const sh = Math.max(0, (s - 0.55) / 0.45);
        this.shaft.position.set(0, this.rig.position.y, 4.2);
        this.shaft.scale.set(1, this.rig.position.y, 1);
        this.shaft.material.uniforms.uK.value = sh * 1.2 + this.flash * 0.5;
        this.shaft.visible = sh > 0.01 || this.flash > 0.01;
        this.lip.material.color.set('#5b7dff').multiplyScalar(1.2 - 0.5 * s + this.flash);
    }
}
export { V };
